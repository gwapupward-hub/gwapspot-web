//! TEST ONLY: real OpenMLS sender ratchet + encrypted atomic outbox with browser locks.
//! Not a production StorageProvider, and not authenticated against GNS.
//! This intentionally snapshots sensitive OpenMLS MemoryStorage into WASM/JS memory.

#![cfg(target_arch = "wasm32")]

use js_sys::{Object, Reflect, Uint8Array};
use openmls::prelude::*;
use openmls::prelude::tls_codec::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(inline_js = r#"
const DB = 'gwap-mls-atomic-outbox-spike-v1';
const WRITER_LOCK = 'gwap-mls-atomic-outbox-device-owner';
const encoder = new TextEncoder();
let releaseLock = null;

function browserOnly() {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle ||
      !globalThis.indexedDB || !globalThis.navigator?.locks?.request) {
    throw new Error('Requires browser secure context, WebCrypto, IndexedDB and Web Locks');
  }
}
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('records');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function getRecord(db, id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('records', 'readonly').objectStore('records').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function atomicWrite(db, entries, abort) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
    tx.onabort = () => reject(tx.error || new Error('Injected IndexedDB transaction abort'));
    for (const [id, value] of entries) tx.objectStore('records').put(value, id);
    if (abort) tx.abort(); // Failure injection before durable state+outbox commit
  });
}
function guarded(task) {
  browserOnly();
  return navigator.locks.request(WRITER_LOCK, {mode:'exclusive',ifAvailable:true}, async lock => {
    if (!lock) throw new Error('Writer lock unavailable: another tab active');
    return task();
  });
}
export function holdOutboxLockForTest() {
  browserOnly();
  return navigator.locks.request(WRITER_LOCK, {mode:'exclusive'}, async lock => {
    if (!lock) throw new Error('Cannot obtain writer lock');
    globalThis.__outboxLockHeld = true;
    try {
      await new Promise(resolve => { releaseLock = resolve; });
    } finally {
      releaseLock = null;
      globalThis.__outboxLockHeld = false;
    }
  });
}
export function releaseOutboxLockForTest() {
  if (!releaseLock) throw new Error('No lock held');
  releaseLock();
}
export async function resetAtomicOutboxTest() {
  return guarded(async () => new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = () => resolve();
    r.onblocked = () => reject(new Error('Database is open in another tab'));
    r.onerror = () => reject(r.error);
  }));
}
export async function loadAtomicOutbox() {
  return guarded(async () => {
    const db = await openDb();
    try {
      const key = await getRecord(db, 'key');
      const snapshot = await getRecord(db, 'snapshot');
      if (!snapshot) return {revision:0,bytes:new Uint8Array(0)};
      if (!key || key.extractable || snapshot.version !== 1)
        throw new Error('Encrypted outbox missing its nonextractable key');
      const aad = encoder.encode('GWAP_TEST|ATOMIC_OUTBOX|REV:' + snapshot.revision);
      const bytes = new Uint8Array(await crypto.subtle.decrypt({
        name:'AES-GCM', iv:Uint8Array.from(snapshot.iv), additionalData:aad
      }, key, Uint8Array.from(snapshot.ciphertext)));
      return {revision:snapshot.revision,bytes};
    } finally { db.close(); }
  });
}
export async function saveAtomicOutbox(bytes, expectedRevision, mode) {
  // Shared lock spans reading revision, sealing full state+outbox and IDB commit.
  return guarded(async () => {
    const db = await openDb();
    try {
      const old = await getRecord(db, 'snapshot');
      const revision = old?.revision || 0;
      if (revision !== expectedRevision)
        throw new Error('Stale writer: expected ' + expectedRevision + ' current ' + revision);
      let key = await getRecord(db, 'key');
      if (!key) key = await crypto.subtle.generateKey(
        {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      if (key.extractable) throw new Error('Key must not be exportable');
      const next = revision + 1;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = encoder.encode('GWAP_TEST|ATOMIC_OUTBOX|REV:' + next);
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name:'AES-GCM',iv,additionalData:aad
      },key,bytes));
      await atomicWrite(db,[
        ['key',key],
        ['snapshot',{version:1,revision:next,iv:Array.from(iv),ciphertext:Array.from(ciphertext)}]
      ],mode===1);
      // Even if this reply is lost, the encrypted outbox+ratchet checkpoint exist.
      if (mode===2) throw new Error('Injected crash after commit, before caller receipt');
      return next;
    } finally { db.close(); }
  });
}
"#)]
extern "C" {
    #[wasm_bindgen(catch, js_name = holdOutboxLockForTest)]
    async fn hold_outbox_lock_js() -> Result<(), JsValue>;
    #[wasm_bindgen(js_name = releaseOutboxLockForTest)]
    fn release_outbox_lock_js();
    #[wasm_bindgen(catch, js_name = resetAtomicOutboxTest)]
    async fn reset_outbox_js() -> Result<(), JsValue>;
    #[wasm_bindgen(catch, js_name = loadAtomicOutbox)]
    async fn load_outbox_js() -> Result<JsValue, JsValue>;
    #[wasm_bindgen(catch, js_name = saveAtomicOutbox)]
    async fn save_outbox_js(bytes: &[u8], expected: u32, mode: u32) -> Result<u32, JsValue>;
}

type Store = Vec<(Vec<u8>, Vec<u8>)>;
type OutboxSnapshot = (Store, Store, Vec<u8>, Vec<u8>, Vec<Vec<u8>>, u32);

fn key_values(provider: &OpenMlsRustCrypto) -> Store {
    provider.storage().values.read().unwrap()
        .iter().map(|(k,v)| (k.clone(),v.clone())).collect()
}
fn restore(values: Store) -> OpenMlsRustCrypto {
    let provider = OpenMlsRustCrypto::default();
    {
        let mut data = provider.storage().values.write().unwrap();
        for (k,v) in values { data.insert(k,v); }
    }
    provider
}
fn signer(name: &[u8], provider: &OpenMlsRustCrypto, suite: Ciphersuite)
    -> (CredentialWithKey, SignatureKeyPair) {
    let key = SignatureKeyPair::new(suite.signature_algorithm()).unwrap();
    key.store(provider.storage()).unwrap();
    (CredentialWithKey {
        credential: BasicCredential::new(name.to_vec()).into(),
        signature_key: key.public().into(),
    },key)
}
fn jserr(value: impl AsRef<str>) -> JsValue { JsValue::from_str(value.as_ref()) }

async fn load() -> Result<(u32, OutboxSnapshot), JsValue> {
    let response = load_outbox_js().await?;
    let rev = Reflect::get(&response,&JsValue::from_str("revision"))?
        .as_f64().ok_or_else(|| jserr("Missing revision"))? as u32;
    let raw = Reflect::get(&response,&JsValue::from_str("bytes"))?;
    if rev == 0 {return Err(jserr("No outbox initialization"));}
    let bytes = Uint8Array::new(&raw).to_vec();
    let snapshot = serde_json::from_slice(&bytes)
        .map_err(|e| jserr(e.to_string()))?;
    Ok((rev,snapshot))
}
fn result(revision:u32,pending:usize,delivered:u32,text:Option<&str>) -> Result<JsValue,JsValue> {
    let out=Object::new();
    Reflect::set(&out,&JsValue::from_str("revision"),&JsValue::from_f64(revision as f64))?;
    Reflect::set(&out,&JsValue::from_str("pending"),&JsValue::from_f64(pending as f64))?;
    Reflect::set(&out,&JsValue::from_str("delivered"),&JsValue::from_f64(delivered as f64))?;
    if let Some(value)=text {
        Reflect::set(&out,&JsValue::from_str("plaintext"),&JsValue::from_str(value))?;
    }
    Ok(out.into())
}

#[wasm_bindgen]
pub async fn outbox_reset() -> Result<(),JsValue> { reset_outbox_js().await }

#[wasm_bindgen]
pub async fn outbox_init() -> Result<u32,JsValue> {
    let suite=Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
    let a=OpenMlsRustCrypto::default();
    let b=OpenMlsRustCrypto::default();
    let (cred_a,signer_a)=signer(b"alice.gwap:test-sender",&a,suite);
    let (cred_b,signer_b)=signer(b"bob.gwap:test-receiver",&b,suite);
    let kp=KeyPackage::builder().build(suite,&b,&signer_b,cred_b).unwrap();
    let config=MlsGroupCreateConfig::builder()
        .ciphersuite(suite).use_ratchet_tree_extension(true).build();
    let mut alice=MlsGroup::new(&a,&signer_a,&config,cred_a).unwrap();
    let (_,welcome,_)=alice.add_members(&a,&signer_a,
        std::slice::from_ref(kp.key_package())).unwrap();
    alice.merge_pending_commit(&a).unwrap();
    let welcome=match MlsMessageIn::tls_deserialize_exact(welcome.to_bytes().unwrap())
        .unwrap().extract() {
        MlsMessageBodyIn::Welcome(w)=>w,
        _=>return Err(jserr("Missing Welcome"))
    };
    let config=MlsGroupJoinConfig::builder().use_ratchet_tree_extension(true).build();
    let bob=StagedWelcome::new_from_welcome(&b,&config,welcome,None)
        .unwrap().into_group(&b).unwrap();
    let id=bob.group_id().as_slice().to_vec();
    if alice.epoch_authenticator().as_slice()!=bob.epoch_authenticator().as_slice(){
        return Err(jserr("Diverged group epoch"));
    }
    // Persist both fixture providers to enable true encrypt/decrypt assertions.
    let snapshot:OutboxSnapshot=(key_values(&a),key_values(&b),id,
        signer_a.public().to_vec(),Vec::new(),0);
    save_outbox_js(&serde_json::to_vec(&snapshot).unwrap(),0,0).await
}

#[wasm_bindgen]
pub async fn outbox_status() -> Result<JsValue,JsValue> {
    let (revision,(_,_,_,_,pending,delivered))=load().await?;
    result(revision,pending.len(),delivered,None)
}

// TEST ONLY: returns serialized MLS encrypted message bytes, never group keys.
#[wasm_bindgen]
pub async fn outbox_peek() -> Result<JsValue,JsValue> {
    let (revision,(_sender,_receiver,id,_public,pending,_delivered))=load().await?;
    let wire=pending.first().ok_or_else(||jserr("No queued MLS ciphertext"))?;
    let group_id=id.iter().map(|b|format!("{b:02x}")).collect::<String>();
    let result=Object::new();
    Reflect::set(&result,&JsValue::from_str("revision"),
        &JsValue::from_f64(revision as f64))?;
    Reflect::set(&result,&JsValue::from_str("groupId"),
        &JsValue::from_str(&group_id))?;
    Reflect::set(&result,&JsValue::from_str("ciphertext"),
        &Uint8Array::from(wire.as_slice()).into())?;
    Ok(result.into())
}

#[wasm_bindgen]
pub async fn outbox_send(expected_revision:u32,text:String,failure:u32)
    -> Result<JsValue,JsValue> {
    if text.len()>4096 || text.is_empty() { return Err(jserr("Invalid payload size")); }
    if failure>2{return Err(jserr("Invalid injection mode"));}
    let (revision,(sender,receiver,id,public,mut pending,delivered))=load().await?;
    if revision!=expected_revision{return Err(jserr("Stale outbox caller revision"));}
    let a=restore(sender);
    let group_id=GroupId::from_slice(&id);
    let mut alice=MlsGroup::load(a.storage(),&group_id)
        .map_err(|e| jserr(format!("{e:?}")))?
        .ok_or_else(|| jserr("Missing sender MLS group"))?;
    let signer=SignatureKeyPair::read(a.storage(),&public,
        Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519.signature_algorithm())
        .ok_or_else(|| jserr("Missing stored sender signing key"))?;
    let wire=alice.create_message(&a,&signer,text.as_bytes())
        .map_err(|e| jserr(format!("{e:?}")))?
        .to_bytes().map_err(|e| jserr(format!("{e:?}")))?;
    pending.push(wire);
    let new_snapshot:OutboxSnapshot=(key_values(&a),receiver,id,public,pending.clone(),delivered);
    let bytes=serde_json::to_vec(&new_snapshot).unwrap();
    // NO outbound message is returned unless the ratchet+outbox transaction completes.
    let committed=save_outbox_js(&bytes,revision,failure).await?;
    result(committed,pending.len(),delivered,None)
}

#[wasm_bindgen]
pub async fn outbox_deliver(expected_revision:u32,failure:u32)
    -> Result<JsValue,JsValue> {
    if failure>2{return Err(jserr("Invalid injection mode"));}
    let (revision,(sender,receiver,id,public,mut pending,delivered))=load().await?;
    if revision!=expected_revision{return Err(jserr("Stale deliver caller revision"));}
    if pending.is_empty(){return Err(jserr("No committed envelope pending delivery"));}
    let b=restore(receiver);
    let group_id=GroupId::from_slice(&id);
    let mut bob=MlsGroup::load(b.storage(),&group_id)
        .map_err(|e| jserr(format!("{e:?}")))?
        .ok_or_else(|| jserr("Missing receiver MLS group"))?;
    let wire=pending.remove(0);
    let parsed=MlsMessageIn::tls_deserialize_exact(wire)
        .map_err(|e| jserr(format!("{e:?}")))?
        .try_into_protocol_message()
        .map_err(|e| jserr(format!("{e:?}")))?;
    let msg=bob.process_message(&b,parsed)
        .map_err(|e| jserr(format!("{e:?}")))?;
    let content=match msg.into_content() {
        ProcessedMessageContent::ApplicationMessage(m)=>m.into_bytes(),
        _=>return Err(jserr("Expected encrypted MLS application message"))
    };
    let new_snapshot:OutboxSnapshot=(sender,key_values(&b),id,public,pending.clone(),delivered+1);
    let bytes=serde_json::to_vec(&new_snapshot).unwrap();
    // Commit receiver ratchet progress + removal from outbox before receipt.
    let committed=save_outbox_js(&bytes,revision,failure).await?;
    let text=String::from_utf8(content).map_err(|e|jserr(e.to_string()))?;
    result(committed,pending.len(),delivered+1,Some(&text))
}

#[wasm_bindgen]
pub async fn outbox_deliver_from_ds(expected_revision:u32,failure:u32, retrieved_wire:Vec<u8>)
    -> Result<JsValue,JsValue> {
    if failure>2{return Err(jserr("Invalid injection mode"));}
    let (revision,(sender,receiver,id,public,mut pending,delivered))=load().await?;
    if revision!=expected_revision{return Err(jserr("Stale deliver caller revision"));}
    if pending.is_empty(){return Err(jserr("No committed envelope pending delivery"));}
    let b=restore(receiver);
    let group_id=GroupId::from_slice(&id);
    let mut bob=MlsGroup::load(b.storage(),&group_id)
        .map_err(|e| jserr(format!("{e:?}")))?
        .ok_or_else(|| jserr("Missing receiver MLS group"))?;
    // This fixture happens to colocate both participants. Demand byte-for-byte
    // equality with the opaque DS-retrieved envelope before recipient decryption.
    let queued_wire=pending.remove(0);
    if queued_wire != retrieved_wire {
        return Err(jserr("Delivery ciphertext differs from committed sender outbox"));
    }
    let parsed=MlsMessageIn::tls_deserialize_exact(retrieved_wire)
        .map_err(|e| jserr(format!("{e:?}")))?
        .try_into_protocol_message()
        .map_err(|e| jserr(format!("{e:?}")))?;
    let msg=bob.process_message(&b,parsed)
        .map_err(|e| jserr(format!("{e:?}")))?;
    let content=match msg.into_content() {
        ProcessedMessageContent::ApplicationMessage(m)=>m.into_bytes(),
        _=>return Err(jserr("Expected encrypted MLS application message"))
    };
    let new_snapshot:OutboxSnapshot=(sender,key_values(&b),id,public,pending.clone(),delivered+1);
    let bytes=serde_json::to_vec(&new_snapshot).unwrap();
    // Commit receiver ratchet progress + removal from outbox before receipt.
    let committed=save_outbox_js(&bytes,revision,failure).await?;
    let text=String::from_utf8(content).map_err(|e|jserr(e.to_string()))?;
    result(committed,pending.len(),delivered+1,Some(&text))
}

#[wasm_bindgen]
pub async fn outbox_hold_lock() -> Result<(),JsValue> { hold_outbox_lock_js().await }
#[wasm_bindgen]
pub fn outbox_release_lock() { release_outbox_lock_js(); }
