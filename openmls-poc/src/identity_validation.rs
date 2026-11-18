//! TEST-ONLY OpenMLS 0.9.2 KeyPackage admission verifier.
 //! Verifies the actual MLS KeyPackage and LeafNode signatures, then ties
 //! the BasicCredential identity to the wallet-approved immutable GWAP
 //! account and device. The server never receives MLS private keys.
 //!
 //! This is an isolated reference validator; production must separately
 //! bind the device credential to a signed active GNS ownership epoch,
 //! enforce KeyPackage expiry/one-time use and audit storage/key lifecycle.

use openmls::key_packages::KeyPackageIn;
use openmls::prelude::*;
use openmls::prelude::tls_codec::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;

const MAX_WIRE: usize = 16_384;
const ID_PREFIX: &str = "GWAP-MLS-IDENTITY-V1";

fn suite() -> Ciphersuite {
    Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519
}
fn field_valid(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min
        && value.len() <= max
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn check_account_device(account: &str, device: &str) -> Result<(), String> {
    if !account.starts_with("gwap_") || !field_valid(&account[5..], 20, 64) {
        return Err("Invalid canonical GWAP account identifier".into());
    }
    if !device.starts_with("device_") || !field_valid(&device[7..], 3, 80) {
        return Err("Invalid messaging device identifier".into());
    }
    Ok(())
}
pub fn canonical_credential_identity(account: &str, device: &str) -> Result<String, String> {
    check_account_device(account, device)?;
    Ok(format!("{ID_PREFIX}|{account}|{device}"))
}
fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        encoded.push(DIGITS[(b >> 4) as usize] as char);
        encoded.push(DIGITS[(b & 0x0f) as usize] as char);
    }
    encoded
}
#[derive(Debug)]
pub struct VerifiedKeyPackage {
    pub credential_identity: String,
    pub signature_public_key_hex: String,
    pub suite: String,
}

/// Strict TLS-deserialize, cryptographically verify OpenMLS signature and
/// LeafNode signature, require exact credential-to-account/device match.
/// Does not allow caller-provided identity to override the signed credential.
pub fn verify_keypackage(
    bytes: &[u8], expected_account: &str, expected_device: &str,
) -> Result<VerifiedKeyPackage, String> {
    let expected = canonical_credential_identity(expected_account, expected_device)?;
    if bytes.len() < 100 || bytes.len() > MAX_WIRE {
        return Err("MLS KeyPackage wire length outside allowed limits".into());
    }
    let incoming = KeyPackageIn::tls_deserialize_exact(bytes)
        .map_err(|_| "Invalid MLS KeyPackage TLS encoding")?;
    let provider = OpenMlsRustCrypto::default();
    let package = incoming
        .validate(provider.crypto(), ProtocolVersion::Mls10)
        .map_err(|_| "Invalid MLS KeyPackage signature or leaf validation")?;
    if package.ciphersuite() != suite() {
        return Err("Unsupported MLS ciphersuite".into());
    }
    let identity_bytes = package.leaf_node().credential().serialized_content();
    let identity = std::str::from_utf8(identity_bytes)
        .map_err(|_| "Non-UTF8 MLS BasicCredential")?;
    if identity != expected {
        return Err("MLS credential not bound to requested GWAP account and device".into());
    }
    let key = package.leaf_node().signature_key().as_slice();
    if key.len() != 32 {
        return Err("Unexpected Ed25519 MLS identity-signing key".into());
    }
    Ok(VerifiedKeyPackage {
        credential_identity: identity.to_string(),
        signature_public_key_hex: hex(key),
        suite: format!("{:?}", package.ciphersuite()),
    })
}

/// Ephemeral test fixture ONLY; never export/save an MLS private signing key.
pub fn generate_fixture_keypackage(account: &str, device: &str) -> Result<Vec<u8>, String> {
    let identity = canonical_credential_identity(account, device)?;
    let provider = OpenMlsRustCrypto::default();
    let signer = SignatureKeyPair::new(suite().signature_algorithm())
        .map_err(|_| "Cannot create ephemeral MLS signing key")?;
    signer.store(provider.storage())
        .map_err(|_| "Cannot store ephemeral MLS signing key")?;
    let credential = CredentialWithKey {
        credential: BasicCredential::new(identity.into_bytes()).into(),
        signature_key: signer.public().into(),
    };
    let bundle = KeyPackage::builder().build(suite(), &provider, &signer, credential)
        .map_err(|_| "Cannot build real MLS KeyPackage fixture")?;
    bundle.key_package().tls_serialize_detached()
        .map_err(|_| "Cannot serialize MLS KeyPackage".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    const ACCOUNT: &str = "gwap_1234567890abcdefghijklmn";
    const DEVICE: &str = "device_phone_01";

    #[test]
    fn valid_signed_openmls_keypackage_matches_account_and_device() {
        let wire = generate_fixture_keypackage(ACCOUNT, DEVICE).unwrap();
        let verified = verify_keypackage(&wire, ACCOUNT, DEVICE).unwrap();
        assert_eq!(
            verified.credential_identity,
            canonical_credential_identity(ACCOUNT, DEVICE).unwrap(),
        );
        assert_eq!(verified.signature_public_key_hex.len(), 64);
    }
    #[test]
    fn different_wallet_account_or_device_is_not_authorized_by_same_package() {
        let wire = generate_fixture_keypackage(ACCOUNT, DEVICE).unwrap();
        let second_account = "gwap_otherabcdefghijklmnopqrst";
        assert!(verify_keypackage(&wire, second_account, DEVICE).is_err());
        assert!(verify_keypackage(&wire, ACCOUNT, "device_other_01").is_err());
    }
    #[test]
    fn modified_wire_bytes_are_not_accepted() {
        let mut wire = generate_fixture_keypackage(ACCOUNT, DEVICE).unwrap();
        let last = wire.len() - 1;
        wire[last] ^= 0x01;
        assert!(verify_keypackage(&wire, ACCOUNT, DEVICE).is_err());
    }
    #[test]
    fn strict_tls_encoding_rejects_trailing_bytes() {
        let mut wire = generate_fixture_keypackage(ACCOUNT, DEVICE).unwrap();
        wire.push(0x55);
        assert!(verify_keypackage(&wire, ACCOUNT, DEVICE).is_err());
    }
    #[test]
    fn invalid_identity_format_fails_before_cryptographic_validation() {
        assert!(generate_fixture_keypackage("gwap_ab", DEVICE).is_err());
        assert!(generate_fixture_keypackage(ACCOUNT, "other").is_err());
        assert!(canonical_credential_identity(ACCOUNT, "device_other|forged").is_err());
    }
}
