//! Test-only browser restart fixture, not a production encrypted storage provider.
//! Encryption: OpenMLS (message) + WebCrypto AES-GCM (local snapshot).
//! IMPORTANT: no real GNS authentication, secure key recovery or rollback defense.

#![cfg(target_arch = "wasm32")]

use js_sys::{Reflect, Uint8Array};
use openmls::prelude::*;
use openmls::prelude::tls_codec::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(inline_js = r#"
const DB_NAME = 'gwap-mls-process-restart-fixture-v1';
const LOCK_NAME = 'gwap-mls-process-restart-fixture-writer';
async function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('records');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function getRecord(db, key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('records', 'readonly').objectStore('records').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function transactionalStore(db, updates) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
    tx.onerror = () => reject(tx.error);
    for (const [key, value] of updates) tx.objectStore('records').put(value, key);
  });
}
function assertEnvironment() {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle ||
      !globalThis.indexedDB || !globalThis.navigator?.locks?.request) {
    throw new Error('Needs secure browser context, WebCrypto, IndexedDB and Web Locks');
  }
}
async function guarded(task) {
  assertEnvironment();
  return navigator.locks.request(LOCK_NAME, {mode: 'exclusive', ifAvailable: true}, async lock => {
    if (!lock) throw new Error('Another tab owns the fixture writer lock');
    return task();
  });
}
export async function resetRestartFixture() {
  assertEnvironment();
  return guarded(async () => new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Close other fixture tabs before resetting'));
  }));
}
export async function saveRestartFixture(bytes, expectedRevision) {
  return guarded(async () => {
    const db = await openDb();
    try {
      const old = await getRecord(db, 'snapshot');
      const previousRevision = old?.revision || 0;
      if (previousRevision !== expectedRevision) {
        throw new Error('Conflict: expected revision ' + expectedRevision + ', got ' + previousRevision);
      }
      let key = await getRecord(db, 'key');
      if (!key) key = await crypto.subtle.generateKey(
          {name: 'AES-GCM', length: 256}, false, ['encrypt','decrypt']);
      if (key.extractable) throw new Error('Key must not be extractable');
      const revision = previousRevision + 1;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = new TextEncoder().encode('GWAP_TEST|MLS_PERSISTENCE|rev=' + revision);
      const sealed = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM', iv, additionalData: aad
      }, key, bytes));
      // Both key and ciphertext commit in one IndexedDB transaction.
      // The fixture does not expose an outgoing MLS message before this resolves.
      await transactionalStore(db, [
        ['key', key],
        ['snapshot', {revision, iv: Array.from(iv), ciphertext: Array.from(sealed), schema: 1}]
      ]);
      return revision;
    } finally { db.close(); }
  });
}
export async function loadRestartFixture(minRevision) {
  return guarded(async () => {
    const db = await openDb();
    try {
      const key = await getRecord(db, 'key');
      const rec = await getRecord(db, 'snapshot');
      if (!key || !rec || rec.schema !== 1) throw new Error('No compatible snapshot');
      // minRevision MUST originate from a trusted external checkpoint in a real app.
      // This only simulates a rollback tripwire; a whole-database rollback defeats it otherwise.
      if (rec.revision < minRevision) throw new Error('Old snapshot detected by external minimum revision');
      const aad = new TextEncoder().encode('GWAP_TEST|MLS_PERSISTENCE|rev=' + rec.revision);
      const bytes = await crypto.subtle.decrypt({
        name: 'AES-GCM', iv: Uint8Array.from(rec.iv), additionalData: aad
      }, key, Uint8Array.from(rec.ciphertext));
      return {revision: rec.revision, bytes: new Uint8Array(bytes)};
    } finally { db.close(); }
  });
}
export async function tamperRestartFixture() {
  return guarded(async () => {
    const db = await openDb();
    try {
      const rec = await getRecord(db, 'snapshot');
      rec.ciphertext[rec.ciphertext.length - 1] ^= 1;
      await transactionalStore(db, [['snapshot', rec]]);
    } finally { db.close(); }
  });
}
export async function runWriterConflictFixture() {
  assertEnvironment();
  // Check revision compare-and-swap fails, without exposing a network send.
  const a = await loadRestartFixture(0);
  try {
    await saveRestartFixture(a.bytes, a.revision - 1);
    throw new Error('Stale writer should have failed');
  } catch (error) {
    if (!String(error).includes('Conflict')) throw error;
  }
  return true;
}
"#)]
extern "C" {
    #[wasm_bindgen(catch, js_name=resetRestartFixture)]
    async fn reset_restart_fixture_js() -> Result<(), JsValue>;
    #[wasm_bindgen(catch, js_name=saveRestartFixture)]
    async fn save_restart_fixture_js(bytes: &[u8], expected_revision: u32) -> Result<u32, JsValue>;
    #[wasm_bindgen(catch, js_name=loadRestartFixture)]
    async fn load_restart_fixture_js(min_revision: u32) -> Result<JsValue, JsValue>;
    #[wasm_bindgen(catch, js_name=tamperRestartFixture)]
    async fn tamper_restart_fixture_js() -> Result<(), JsValue>;
    #[wasm_bindgen(catch, js_name=runWriterConflictFixture)]
    async fn run_writer_conflict_fixture_js() -> Result<bool, JsValue>;
}

type StoragePairs = Vec<(Vec<u8>, Vec<u8>)>;
type Snapshot = (StoragePairs, Vec<u8>, Vec<Vec<u8>>);

fn snapshot_storage(provider: &OpenMlsRustCrypto) -> StoragePairs {
    let values = provider.storage().values.read().unwrap();
    values.iter().map(|(k,v)| (k.clone(), v.clone())).collect()
}
fn from_snapshot(entries: StoragePairs) -> OpenMlsRustCrypto {
    let provider = OpenMlsRustCrypto::default();
    {
        let mut storage = provider.storage().values.write().unwrap();
        for (key, value) in entries { storage.insert(key, value); }
    }
    provider
}
fn sign(name: &[u8], provider: &OpenMlsRustCrypto, suite: Ciphersuite)
    -> (CredentialWithKey, SignatureKeyPair) {
    let s = SignatureKeyPair::new(suite.signature_algorithm()).unwrap();
    s.store(provider.storage()).unwrap();
    (CredentialWithKey {
        credential: BasicCredential::new(name.to_vec()).into(),
        signature_key: s.public().into(),
    }, s)
}
fn js_error(msg: impl AsRef<str>) -> JsValue {
    JsValue::from_str(msg.as_ref())
}

#[wasm_bindgen]
pub async fn fixture_reset() -> Result<(), JsValue> {
    reset_restart_fixture_js().await
}

#[wasm_bindgen]
pub async fn fixture_initialize() -> Result<u32, JsValue> {
    let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
    let alice_provider = OpenMlsRustCrypto::default();
    let bob_provider = OpenMlsRustCrypto::default();
    let (alice_cred, alice_signer) = sign(b"alice.gwap:restart-test", &alice_provider, suite);
    let (bob_cred, bob_signer) = sign(b"bob.gwap:restart-test", &bob_provider, suite);
    let bob_keypackage = KeyPackage::builder()
        .build(suite, &bob_provider, &bob_signer, bob_cred).unwrap();
    let cfg = MlsGroupCreateConfig::builder()
        .ciphersuite(suite).use_ratchet_tree_extension(true).build();
    let mut alice = MlsGroup::new(&alice_provider, &alice_signer, &cfg, alice_cred).unwrap();
    let (_, welcome, _) = alice.add_members(
        &alice_provider, &alice_signer,
        std::slice::from_ref(bob_keypackage.key_package())
    ).unwrap();
    alice.merge_pending_commit(&alice_provider).unwrap();
    let welcome = match MlsMessageIn::tls_deserialize_exact(welcome.to_bytes().unwrap())
        .unwrap().extract() {
        MlsMessageBodyIn::Welcome(value) => value,
        _ => panic!("Wrong wire message")
    };
    let join_cfg = MlsGroupJoinConfig::builder()
        .use_ratchet_tree_extension(true).build();
    let bob = StagedWelcome::new_from_welcome(&bob_provider, &join_cfg, welcome, None)
        .unwrap().into_group(&bob_provider).unwrap();
    let group_id = bob.group_id().as_slice().to_vec();

    let mut messages = Vec::new();
    for text in [b"first after reload".as_slice(),
                 b"second after process restart".as_slice(),
                 b"third after restart".as_slice()] {
        let msg = alice.create_message(&alice_provider, &alice_signer, text).unwrap();
        messages.push(msg.to_bytes().unwrap());
    }
    let blob = serde_json::to_vec(&(snapshot_storage(&bob_provider), group_id, messages))
        .unwrap();
    // The caller gets no ready-to-send ciphertext until this completes.
    save_restart_fixture_js(&blob, 0).await
}

#[wasm_bindgen]
pub async fn fixture_resume(min_revision: u32) -> Result<JsValue, JsValue> {
    let stored = load_restart_fixture_js(min_revision).await?;
    let revision = Reflect::get(&stored, &JsValue::from_str("revision"))?
        .as_f64().ok_or_else(|| js_error("Invalid revision"))? as u32;
    let bytes = Reflect::get(&stored, &JsValue::from_str("bytes"))?;
    let snapshot: Snapshot = serde_json::from_slice(
        &Uint8Array::new(&bytes).to_vec()
    ).map_err(|e| js_error(e.to_string()))?;
    let (provider_entries, group_id_bytes, mut messages) = snapshot;
    if messages.is_empty() { return Err(js_error("No pending test messages")); }
    let provider = from_snapshot(provider_entries);
    let group_id = GroupId::from_slice(&group_id_bytes);
    let mut group = MlsGroup::load(provider.storage(), &group_id)
        .map_err(|e| js_error(format!("{e:?}")))?
        .ok_or_else(|| js_error("No restored group"))?;
    let wire = messages.remove(0);
    let parsed = MlsMessageIn::tls_deserialize_exact(wire)
        .map_err(|e| js_error(format!("{e:?}")))?
        .try_into_protocol_message()
        .map_err(|e| js_error(format!("{e:?}")))?;
    let content = match group.process_message(&provider, parsed)
        .map_err(|e| js_error(format!("{e:?}")))?
        .into_content() {
        ProcessedMessageContent::ApplicationMessage(msg) => msg.into_bytes(),
        _ => return Err(js_error("Expected MLS application ciphertext"))
    };
    // Persist the newly advanced receive-ratchet state before disclosing success.
    let updated = serde_json::to_vec(&(
        snapshot_storage(&provider), group_id_bytes, messages
    )).unwrap();
    let saved_rev = save_restart_fixture_js(&updated, revision).await?;
    let result = js_sys::Object::new();
    Reflect::set(&result, &JsValue::from_str("revision"), &JsValue::from_f64(saved_rev as f64))?;
    Reflect::set(&result, &JsValue::from_str("plaintext"),
        &JsValue::from_str(&String::from_utf8_lossy(&content)))?;
    Ok(result.into())
}

#[wasm_bindgen]
pub async fn fixture_tamper() -> Result<(), JsValue> {
    tamper_restart_fixture_js().await
}
#[wasm_bindgen]
pub async fn fixture_stale_writer_rejected() -> Result<bool, JsValue> {
    run_writer_conflict_fixture_js().await
}
