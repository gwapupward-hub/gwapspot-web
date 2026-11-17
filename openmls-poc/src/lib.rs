//! Real OpenMLS test-only smoke tests. No cryptographic primitives are implemented here.
//! Uses BasicCredential fixtures, NOT authenticated GNS identities.
//! Production verification must additionally bind device credentials to live .gwap control.

#[cfg(all(test, target_arch = "wasm32"))]
mod browser_persistence;


#[cfg(all(test, target_arch = "wasm32", feature = "browser-tests"))]
wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);

#[cfg(test)]
mod tests {
    use openmls::prelude::*;
    use openmls::prelude::tls_codec::*;
    use openmls_basic_credential::SignatureKeyPair;
    use openmls_rust_crypto::OpenMlsRustCrypto;

    fn new_credential(
        name: &[u8],
        suite: Ciphersuite,
        provider: &impl OpenMlsProvider,
    ) -> (CredentialWithKey, SignatureKeyPair) {
        let identity = BasicCredential::new(name.to_vec());
        let signer = SignatureKeyPair::new(suite.signature_algorithm())
            .expect("generate device signer");
        signer.store(provider.storage()).expect("store signing key");
        (
            CredentialWithKey {
                credential: identity.into(),
                signature_key: signer.public().into(),
            },
            signer,
        )
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen_test::wasm_bindgen_test)]
    #[cfg_attr(not(target_arch = "wasm32"), test)]
    fn two_member_welcome_private_messages_and_epoch_update() {
        let suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
        let alice_provider = OpenMlsRustCrypto::default();
        let bob_provider = OpenMlsRustCrypto::default();
        let (alice_cred, alice_signer) =
            new_credential(b"alice.gwap:device-test-1", suite, &alice_provider);
        let (bob_cred, bob_signer) =
            new_credential(b"bob.gwap:device-test-1", suite, &bob_provider);

        let bob_keypackage = KeyPackage::builder()
            .build(suite, &bob_provider, &bob_signer, bob_cred)
            .expect("Bob's MLS KeyPackage");

        let create_config = MlsGroupCreateConfig::builder()
            .ciphersuite(suite)
            .use_ratchet_tree_extension(true)
            .build();
        let mut alice_group = MlsGroup::new(
            &alice_provider, &alice_signer, &create_config, alice_cred,
        ).expect("Alice creates group");

        let (_commit, welcome, _info) = alice_group.add_members(
            &alice_provider, &alice_signer,
            std::slice::from_ref(bob_keypackage.key_package()),
        ).expect("Alice adds Bob");
        // The local POC assumes canonical acceptance. Production must use DS ordering.
        alice_group.merge_pending_commit(&alice_provider).expect("merge accepted Commit");

        assert_eq!(alice_group.members().count(), 2);
        let welcome_in = MlsMessageIn::tls_deserialize_exact(
            welcome.to_bytes().expect("serialize Welcome"),
        ).expect("deserialize Welcome");
        let welcome = match welcome_in.extract() {
            MlsMessageBodyIn::Welcome(value) => value,
            _ => panic!("expected Welcome"),
        };
        let join_config = MlsGroupJoinConfig::builder()
            .use_ratchet_tree_extension(true)
            .build();
        let staged_bob = StagedWelcome::new_from_welcome(
            &bob_provider, &join_config, welcome, None,
        ).expect("Bob stages Welcome");
        let mut bob_group = staged_bob.into_group(&bob_provider).expect("Bob joins");

        assert_eq!(bob_group.members().count(), 2);
        assert_eq!(
            alice_group.epoch_authenticator().as_slice(),
            bob_group.epoch_authenticator().as_slice()
        );

        let alice_message = alice_group.create_message(
            &alice_provider, &alice_signer, b"Hello Bob: encrypted under OpenMLS",
        ).expect("Alice encrypts");
        let wire = alice_message.to_bytes().expect("serialize");
        assert!(!wire.windows(b"Hello Bob".len()).any(|w| w == b"Hello Bob"));
        let parsed = MlsMessageIn::tls_deserialize_exact(wire.clone())
            .expect("deserialize").try_into_protocol_message().expect("protocol message");
        let processed = bob_group.process_message(&bob_provider, parsed)
            .expect("Bob decrypts and authenticates");
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(msg) =>
                assert_eq!(msg.into_bytes(), b"Hello Bob: encrypted under OpenMLS"),
            _ => panic!("unexpected content"),
        }

        // A consumed sender-generation key must not decrypt the same envelope twice.
        let replay = MlsMessageIn::tls_deserialize_exact(wire)
            .expect("parse replay").try_into_protocol_message().expect("replay protocol type");
        assert!(
            bob_group.process_message(&bob_provider, replay).is_err(),
            "replayed MLS application message must be rejected"
        );

        // Flip one bit of a fresh ciphertext/tag; preserve the original valid message.
        let integrity_message = alice_group.create_message(
            &alice_provider, &alice_signer, b"MAC integrity probe"
        ).expect("encrypt integrity probe");
        let original = integrity_message.to_bytes().expect("serialize integrity probe");
        let mut corrupted = original.clone();
        let last = corrupted.len() - 1;
        corrupted[last] ^= 0x01;
        let malformed = MlsMessageIn::tls_deserialize_exact(corrupted)
            .expect("ciphertext bit flip must leave the wire format parseable")
            .try_into_protocol_message().expect("ciphertext wire variant");
        assert!(
            bob_group.process_message(&bob_provider, malformed).is_err(),
            "tampered MLS ciphertext/tag must fail authentication"
        );
        let intact = MlsMessageIn::tls_deserialize_exact(original)
            .unwrap().try_into_protocol_message().unwrap();
        match bob_group.process_message(&bob_provider, intact)
            .expect("valid envelope survives invalid ciphertext attempt").into_content()
        {
            ProcessedMessageContent::ApplicationMessage(msg) =>
                assert_eq!(msg.into_bytes(), b"MAC integrity probe"),
            _ => panic!("expected a valid application message"),
        }

        let bob_message = bob_group.create_message(
            &bob_provider, &bob_signer, b"Bob response",
        ).expect("Bob encrypts");
        let parsed = MlsMessageIn::tls_deserialize_exact(bob_message.to_bytes().unwrap())
            .unwrap().try_into_protocol_message().unwrap();
        let processed = alice_group.process_message(&alice_provider, parsed).unwrap();
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(msg) =>
                assert_eq!(msg.into_bytes(), b"Bob response"),
            _ => panic!("unexpected response"),
        }

        let old_authenticator = alice_group.epoch_authenticator().as_slice().to_vec();
        let (update_commit, _welcome_option, _group_info) = bob_group.self_update(
            &bob_provider, &bob_signer, LeafNodeParameters::default(),
        ).expect("Bob stages update").into_contents();
        let parsed = MlsMessageIn::tls_deserialize_exact(
            update_commit.to_bytes().expect("serialize Commit")
        ).expect("deserialize Commit").try_into_protocol_message().expect("protocol Commit");
        let processed = alice_group.process_message(&alice_provider, parsed)
            .expect("Alice validates Commit");
        match processed.into_content() {
            ProcessedMessageContent::StagedCommitMessage(staged) =>
                alice_group.merge_staged_commit(&alice_provider, *staged)
                    .expect("Alice merges Commit"),
            _ => panic!("expected staged commit"),
        }
        bob_group.merge_pending_commit(&bob_provider).expect("Bob merges accepted Commit");

        assert_ne!(old_authenticator, alice_group.epoch_authenticator().as_slice());
        assert_eq!(
            alice_group.epoch_authenticator().as_slice(),
            bob_group.epoch_authenticator().as_slice()
        );

        // Reload serialized group data from the same in-memory provider.
        // This tests OpenMLS state persistence APIs, NOT browser durable storage.
        let bob_group_id = bob_group.group_id().clone();
        drop(bob_group);
        let mut bob_group = MlsGroup::load(bob_provider.storage(), &bob_group_id)
            .expect("load persisted group")
            .expect("group exists in provider storage");
        assert_eq!(
            alice_group.epoch_authenticator().as_slice(),
            bob_group.epoch_authenticator().as_slice()
        );

        let message = alice_group.create_message(
            &alice_provider, &alice_signer, b"New epoch is active",
        ).expect("encrypt in next epoch");
        let parsed = MlsMessageIn::tls_deserialize_exact(message.to_bytes().unwrap())
            .unwrap().try_into_protocol_message().unwrap();
        let processed = bob_group.process_message(&bob_provider, parsed)
            .expect("decrypt in next epoch");
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(msg) =>
                assert_eq!(msg.into_bytes(), b"New epoch is active"),
            _ => panic!("unexpected type"),
        }
    }
    // Validates required browser APIs; does not prove encrypted IndexedDB key storage.
    #[cfg(target_arch = "wasm32")]
    #[wasm_bindgen_test::wasm_bindgen_test]
    fn web_crypto_and_indexeddb_capability() {
        use wasm_bindgen::JsValue;
        let globals = js_sys::global();
        let win = js_sys::Reflect::get(&globals, &JsValue::from_str("window"))
            .expect("probe browser window");
        if win.is_undefined() || win.is_null() {
            // In Node, only the OpenMLS cryptographic smoke test runs.
            return;
        }
        for property in ["crypto", "indexedDB"] {
            let value = js_sys::Reflect::get(&win, &JsValue::from_str(property))
                .expect("browser security API query");
            assert!(!value.is_undefined() && !value.is_null(),
                "browser must expose {property}");
        }
    }
}
