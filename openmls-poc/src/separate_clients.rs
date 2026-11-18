//! Two independent browser-profile OpenMLS clients. TEST ONLY.
//! Each Chromium profile loads its own WASM module, provider, signer and MLS group.
//! No session exports a secret. No durable provider or live GNS credential verification.
//! No true production MLS delivery service; the network relay uses fixture identities.

#![cfg(target_arch = "wasm32")]

use std::cell::RefCell;
use openmls::prelude::*;
use openmls::prelude::tls_codec::*;
use openmls::key_packages::KeyPackageIn;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use wasm_bindgen::prelude::*;

thread_local! {
    static CLIENT: RefCell<Option<SeparateClient>> = RefCell::new(None);
}

struct SeparateClient {
    provider: OpenMlsRustCrypto,
    signer: SignatureKeyPair,
    credential: CredentialWithKey,
    group: Option<MlsGroup>,
}

fn error(message: impl AsRef<str>) -> JsValue {
    JsValue::from_str(message.as_ref())
}
fn with_client<T>(
    operation: impl FnOnce(&mut SeparateClient) -> Result<T, JsValue>,
) -> Result<T, JsValue> {
    CLIENT.with(|cell| {
        let mut borrowed = cell.borrow_mut();
        let client = borrowed.as_mut().ok_or_else(|| error("Client not initialized"))?;
        operation(client)
    })
}
fn group<'a>(client: &'a mut SeparateClient) -> Result<&'a mut MlsGroup, JsValue> {
    client.group.as_mut().ok_or_else(|| error("MLS group not joined"))
}
fn group_config(suite: Ciphersuite) -> MlsGroupCreateConfig {
    MlsGroupCreateConfig::builder()
        .ciphersuite(suite)
        .use_ratchet_tree_extension(true)
        .build()
}

#[wasm_bindgen]
pub fn separate_bootstrap(identity: String) -> Result<(), JsValue> {
    if identity != "alice.gwap:fixture-device" && identity != "bob.gwap:fixture-device" {
        return Err(error("Unexpected test fixture identity"));
    }
    let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
    let provider = OpenMlsRustCrypto::default();
    let signer = SignatureKeyPair::new(suite.signature_algorithm())
        .map_err(|e| error(format!("{e:?}")))?;
    signer.store(provider.storage()).map_err(|e| error(format!("{e:?}")))?;
    let credential = CredentialWithKey {
        credential: BasicCredential::new(identity.into_bytes()).into(),
        signature_key: signer.public().into(),
    };
    CLIENT.with(|cell| {
        *cell.borrow_mut() = Some(SeparateClient {
            provider, signer, credential, group: None,
        });
    });
    Ok(())
}

#[wasm_bindgen]
pub fn separate_keypackage() -> Result<Vec<u8>, JsValue> {
    with_client(|c| {
        if c.group.is_some() {
            return Err(error("KeyPackage must be published before joining"));
        }
        let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
        let bundle = KeyPackage::builder()
            .build(suite, &c.provider, &c.signer, c.credential.clone())
            .map_err(|e| error(format!("{e:?}")))?;
        bundle.key_package().tls_serialize_detached()
            .map_err(|e| error(format!("{e:?}")))
    })
}

#[wasm_bindgen]
pub fn separate_invite(keypackage_bytes: Vec<u8>) -> Result<JsValue, JsValue> {
    with_client(|c| {
        if c.group.is_some() {
            return Err(error("Group already exists"));
        }
        let incoming = KeyPackageIn::tls_deserialize_exact(&keypackage_bytes)
            .map_err(|e| error(format!("{e:?}")))?;
        let recipient_keypackage = incoming
            .validate(c.provider.crypto(), ProtocolVersion::Mls10)
            .map_err(|e| error(format!("{e:?}")))?;
        let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
        let mut new_group = MlsGroup::new(&c.provider, &c.signer,
            &group_config(suite), c.credential.clone())
            .map_err(|e| error(format!("{e:?}")))?;
        let (commit, welcome, _info) = new_group.add_members(
            &c.provider, &c.signer, std::slice::from_ref(&recipient_keypackage),
        ).map_err(|e| error(format!("{e:?}")))?;
        // This test relay represents the canonical accepted Add Commit for Alice.
        new_group.merge_pending_commit(&c.provider)
            .map_err(|e| error(format!("{e:?}")))?;
        let commit_wire = commit.to_bytes()
            .map_err(|e| error(format!("{e:?}")))?;
        let welcome_wire = welcome.to_bytes()
            .map_err(|e| error(format!("{e:?}")))?;
        c.group = Some(new_group);
        let response = js_sys::Object::new();
        js_sys::Reflect::set(&response, &JsValue::from_str("commit"),
            &js_sys::Uint8Array::from(commit_wire.as_slice()).into())?;
        js_sys::Reflect::set(&response, &JsValue::from_str("welcome"),
            &js_sys::Uint8Array::from(welcome_wire.as_slice()).into())?;
        Ok(response.into())
    })
}

#[wasm_bindgen]
pub fn separate_join(welcome_bytes: Vec<u8>) -> Result<(), JsValue> {
    with_client(|c| {
        if c.group.is_some() {
            return Err(error("Cannot join twice"));
        }
        let welcome_in = MlsMessageIn::tls_deserialize_exact(&welcome_bytes)
            .map_err(|e| error(format!("{e:?}")))?;
        let welcome = match welcome_in.extract() {
            MlsMessageBodyIn::Welcome(w) => w,
            _ => return Err(error("Expected Welcome wire message")),
        };
        let config = MlsGroupJoinConfig::builder()
            .use_ratchet_tree_extension(true).build();
        let staged = StagedWelcome::new_from_welcome(
            &c.provider, &config, welcome, None,
        ).map_err(|e| error(format!("{e:?}")))?;
        let joined = staged.into_group(&c.provider)
            .map_err(|e| error(format!("{e:?}")))?;
        if joined.members().count() != 2 {
            return Err(error("Unexpected member count"));
        }
        c.group = Some(joined);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn separate_encrypt(message: String) -> Result<Vec<u8>, JsValue> {
    with_client(|c| {
        if message.is_empty() || message.len() > 1024 {
            return Err(error("Message length invalid"));
        }
        let mut_group = c.group.as_mut()
            .ok_or_else(|| error("Group not joined"))?;
        let wire = mut_group.create_message(
            &c.provider, &c.signer, message.as_bytes(),
        ).map_err(|e| error(format!("{e:?}")))?;
        wire.to_bytes().map_err(|e| error(format!("{e:?}")))
    })
}

#[wasm_bindgen]
pub fn separate_receive(bytes: Vec<u8>) -> Result<JsValue, JsValue> {
    with_client(|c| {
        let parsed = MlsMessageIn::tls_deserialize_exact(bytes)
            .map_err(|e| error(format!("{e:?}")))?
            .try_into_protocol_message()
            .map_err(|e| error(format!("{e:?}")))?;
        let group = c.group.as_mut().ok_or_else(|| error("Group not joined"))?;
        let processed = group.process_message(&c.provider, parsed)
            .map_err(|e| error(format!("{e:?}")))?;
        let response = js_sys::Object::new();
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(app) => {
                let text = String::from_utf8(app.into_bytes())
                    .map_err(|e| error(format!("{e:?}")))?;
                js_sys::Reflect::set(&response,
                    &JsValue::from_str("kind"), &JsValue::from_str("application"))?;
                js_sys::Reflect::set(&response,
                    &JsValue::from_str("text"), &JsValue::from_str(&text))?;
            },
            ProcessedMessageContent::StagedCommitMessage(staged) => {
                group.merge_staged_commit(&c.provider, *staged)
                    .map_err(|e| error(format!("{e:?}")))?;
                js_sys::Reflect::set(&response,
                    &JsValue::from_str("kind"), &JsValue::from_str("commit"))?;
            },
            _ => return Err(error("Unexpected MLS message kind")),
        }
        Ok(response.into())
    })
}

#[wasm_bindgen]
pub fn separate_stage_update() -> Result<Vec<u8>, JsValue> {
    with_client(|c| {
        let group = c.group.as_mut()
            .ok_or_else(|| error("Group not joined"))?;
        let (commit, _welcome, _info) = group.self_update(
            &c.provider, &c.signer, LeafNodeParameters::default(),
        ).map_err(|e| error(format!("{e:?}")))?.into_contents();
        commit.to_bytes().map_err(|e| error(format!("{e:?}")))
    })
}

#[wasm_bindgen]
pub fn separate_finish_update() -> Result<(), JsValue> {
    with_client(|c| {
        let group = c.group.as_mut().ok_or_else(|| error("Group not joined"))?;
        group.merge_pending_commit(&c.provider)
            .map_err(|e| error(format!("{e:?}")))?;
        Ok(())
    })
}

#[wasm_bindgen]
pub fn separate_epoch_authenticator() -> Result<Vec<u8>, JsValue> {
    with_client(|c| {
        Ok(group(c)?.epoch_authenticator().as_slice().to_vec())
    })
}

#[wasm_bindgen]
pub fn separate_members_count() -> Result<u32, JsValue> {
    with_client(|c| {
        Ok(group(c)?.members().count() as u32)
    })
}
