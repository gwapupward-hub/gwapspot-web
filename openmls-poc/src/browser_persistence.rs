//! Test-only encrypted browser persistence bridge. Not a production StorageProvider.
//! Important: snapshot contains ALL OpenMLS private storage values transiently in JS memory.
//! A same-origin XSS can use CryptoKey to decrypt it. No hardware-backed key claims.
#![cfg(all(test, target_arch = "wasm32"))]

use js_sys::{Reflect, Uint8Array};
use wasm_bindgen::prelude::*;
use openmls::prelude::*;
use openmls::prelude::tls_codec::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;

#[wasm_bindgen(inline_js = r#"
const DB_NAME = 'gwap-openmls-persistence-spike-v1';
function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('state'); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
function readKey(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const req = tx.objectStore('state').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function putKey(db, id, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function requireBrowser() {
  if (typeof window === 'undefined' || !window.crypto?.subtle || !window.indexedDB) {
    throw new Error('Requires secure browser context with WebCrypto and IndexedDB');
  }
}
export async function resetTestDatabase() {
  requireBrowser();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB deletion blocked'));
  });
}
export async function persistEncryptedSnapshot(bytes) {
  requireBrowser();
  const db = await openDatabase();
  try {
    // Single-tab TEST ONLY: no cross-tab lock or durable rollback anchor.
    let key = await readKey(db, 'crypto-key');
    if (!key) {
      key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
      if (key.extractable) throw new Error('Unexpected extractable key');
      await putKey(db, 'crypto-key', key);
    }
    const old = await readKey(db, 'encrypted-snapshot');
    const revision = (old?.revision || 0) + 1;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode('GWAP-POC|OpenMLS|snapshot-v1|' + revision);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad }, key, bytes));
    await putKey(db, 'encrypted-snapshot', {
      revision, iv: Array.from(iv), data: Array.from(ciphertext), version: 1
    });
    return revision;
  } finally { db.close(); }
}
export async function loadEncryptedSnapshot() {
  requireBrowser();
  const db = await openDatabase();
  try {
    const key = await readKey(db, 'crypto-key');
    const record = await readKey(db, 'encrypted-snapshot');
    if (!key || !record || record.version !== 1) throw new Error('Missing/invalid state');
    const aad = new TextEncoder().encode('GWAP-POC|OpenMLS|snapshot-v1|' + record.revision);
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: new Uint8Array(record.iv), additionalData: aad
    }, key, new Uint8Array(record.data));
    return new Uint8Array(plaintext);
  } finally { db.close(); }
}
export async function corruptCiphertextForTest() {
  requireBrowser();
  const db = await openDatabase();
  try {
    const record = await readKey(db, 'encrypted-snapshot');
    if (!record?.data?.length) throw new Error('No ciphertext to corrupt');
    record.data[record.data.length - 1] ^= 1;
    await putKey(db, 'encrypted-snapshot', record);
  } finally { db.close(); }
}
export async function readStoredMetadataOnly() {
  requireBrowser();
  const db = await openDatabase();
  try {
    const key = await readKey(db, 'crypto-key');
    const record = await readKey(db, 'encrypted-snapshot');
    return JSON.stringify({
      cryptoKeyNonextractable: key instanceof CryptoKey && !key.extractable,
      version: record?.version || 0,
      revision: record?.revision || 0,
      encryptedBytes: record?.data?.length || 0
    });
  } finally { db.close(); }
}
"#)]
extern "C" {
    #[wasm_bindgen(catch, js_name = resetTestDatabase)]
    async fn reset_test_database() -> Result<(), JsValue>;
    #[wasm_bindgen(catch, js_name = persistEncryptedSnapshot)]
    async fn persist_encrypted_snapshot(bytes: &[u8]) -> Result<u32, JsValue>;
    #[wasm_bindgen(catch, js_name = loadEncryptedSnapshot)]
    async fn load_encrypted_snapshot() -> Result<Uint8Array, JsValue>;
    #[wasm_bindgen(catch, js_name = corruptCiphertextForTest)]
    async fn corrupt_ciphertext_for_test() -> Result<(), JsValue>;
    #[wasm_bindgen(catch, js_name = readStoredMetadataOnly)]
    async fn read_stored_metadata_only() -> Result<String, JsValue>;
}

fn browser_ready() -> bool {
    let global = js_sys::global();
    match Reflect::get(&global, &JsValue::from_str("window")) {
        Ok(window) => !(window.is_undefined() || window.is_null()),
        Err(_) => false,
    }
}

fn credential(
    name: &[u8], provider: &OpenMlsRustCrypto, suite: Ciphersuite
) -> (CredentialWithKey, SignatureKeyPair) {
    let signer = SignatureKeyPair::new(suite.signature_algorithm()).unwrap();
    signer.store(provider.storage()).unwrap();
    (CredentialWithKey {
        credential: BasicCredential::new(name.to_vec()).into(),
        signature_key: signer.public().into(),
    }, signer)
}

fn capture(provider: &OpenMlsRustCrypto) -> Vec<u8> {
    // In-memory key/value schema is an OpenMLS test-provider detail, not a stable migration API.
    let guard = provider.storage().values.read().unwrap();
    let entries: Vec<(Vec<u8>, Vec<u8>)> = guard.iter()
        .map(|(k, v)| (k.clone(), v.clone())).collect();
    serde_json::to_vec(&entries).unwrap()
}

fn reconstruct(bytes: &[u8]) -> OpenMlsRustCrypto {
    let entries: Vec<(Vec<u8>, Vec<u8>)> = serde_json::from_slice(bytes).unwrap();
    let provider = OpenMlsRustCrypto::default();
    {
        let mut storage = provider.storage().values.write().unwrap();
        for (k, v) in entries {
            storage.insert(k, v);
        }
    }
    provider
}

#[wasm_bindgen_test::wasm_bindgen_test(async)]
async fn indexeddb_encrypted_snapshot_resumes_real_openmls_group() {
    // Node wasm test runner has no indexedDB; browser-only integration test.
    if !browser_ready() { return; }
    reset_test_database().await.expect("clear dedicated test database");

    let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
    let alice_provider = OpenMlsRustCrypto::default();
    let bob_provider = OpenMlsRustCrypto::default();
    let (alice_cred, alice_signer) = credential(b"alice.gwap:fixture", &alice_provider, suite);
    let (bob_cred, bob_signer) = credential(b"bob.gwap:fixture", &bob_provider, suite);
    let bob_package = KeyPackage::builder()
        .build(suite, &bob_provider, &bob_signer, bob_cred).unwrap();

    let cfg = MlsGroupCreateConfig::builder()
        .ciphersuite(suite).use_ratchet_tree_extension(true).build();
    let mut alice = MlsGroup::new(&alice_provider, &alice_signer, &cfg, alice_cred).unwrap();
    let (_, welcome, _) = alice.add_members(
        &alice_provider, &alice_signer,
        std::slice::from_ref(bob_package.key_package())
    ).unwrap();
    alice.merge_pending_commit(&alice_provider).unwrap();
    let welcome = match MlsMessageIn::tls_deserialize_exact(welcome.to_bytes().unwrap())
        .unwrap().extract() {
        MlsMessageBodyIn::Welcome(welcome) => welcome,
        _ => panic!("expected Welcome"),
    };
    let join_cfg = MlsGroupJoinConfig::builder()
        .use_ratchet_tree_extension(true).build();
    let bob = StagedWelcome::new_from_welcome(
        &bob_provider, &join_cfg, welcome, None,
    ).unwrap().into_group(&bob_provider).unwrap();
    let bob_group_id = bob.group_id().clone();
    let initial_epoch = bob.epoch_authenticator().as_slice().to_vec();

    let exported = capture(&bob_provider);
    assert!(exported.len() > 128, "expect real MLS key material in snapshot");
    let first_revision = persist_encrypted_snapshot(&exported).await
        .expect("encrypt and persist snapshot in browser IndexedDB");
    assert_eq!(first_revision, 1);
    let metadata = read_stored_metadata_only().await.unwrap();
    assert!(metadata.contains(r#"\"cryptoKeyNonextractable\":true"#),
        "the key stored in IndexedDB must not be exportable");
    assert!(metadata.contains("encryptedBytes"),
        "IndexedDB contains an encrypted blob, not individual plaintext MLS values");

    // Simulate a fresh Rust provider (dropping the original group and provider).
    drop(bob);
    drop(bob_provider);
    let ciphertext_snapshot = load_encrypted_snapshot().await
        .expect("authenticated decrypt from IndexedDB");
    let restored_provider = reconstruct(&ciphertext_snapshot.to_vec());
    let mut restored = MlsGroup::load(restored_provider.storage(), &bob_group_id)
        .unwrap().expect("reconstruct group from persistent encrypted snapshot");
    assert_eq!(initial_epoch, restored.epoch_authenticator().as_slice());

    let message = alice.create_message(
        &alice_provider, &alice_signer, b"delivered after encrypted IndexedDB restore"
    ).unwrap();
    let received = MlsMessageIn::tls_deserialize_exact(message.to_bytes().unwrap())
        .unwrap().try_into_protocol_message().unwrap();
    match restored.process_message(&restored_provider, received).unwrap().into_content() {
        ProcessedMessageContent::ApplicationMessage(app) =>
            assert_eq!(app.into_bytes(), b"delivered after encrypted IndexedDB restore"),
        _ => panic!("expected decrypted MLS PrivateMessage"),
    }

    // No successful decrypt after storage tampering.
    corrupt_ciphertext_for_test().await.unwrap();
    assert!(load_encrypted_snapshot().await.is_err(),
        "AES-GCM must detect tampering of the encrypted MLS storage snapshot");

    // Recovery by committing the known-good, now-updated in-memory state (fixture).
    let updated_snapshot = capture(&restored_provider);
    let second_revision = persist_encrypted_snapshot(&updated_snapshot).await.unwrap();
    assert_eq!(second_revision, 2);
    let updated_bytes = load_encrypted_snapshot().await.unwrap();
    let provider_again = reconstruct(&updated_bytes.to_vec());
    let restored_again = MlsGroup::load(provider_again.storage(), &bob_group_id)
        .unwrap().expect("new snapshot should be recoverable");
    assert_eq!(
        restored.epoch_authenticator().as_slice(),
        restored_again.epoch_authenticator().as_slice()
    );
    reset_test_database().await.expect("delete fixture and ephemeral CryptoKey");
}
