// TEST-ONLY native OpenMLS credential admission CLI.
// Usage: gwap-mls-keypackage fixture ACCOUNT DEVICE > keypackage.tls
//        gwap-mls-keypackage verify ACCOUNT DEVICE < keypackage.tls
// Only PUBLIC KeyPackage bytes are read from stdin/written to stdout.
// No private MLS key leaves the fixture generator's process.
use std::io::{Read, Write};
use gwap_messenger_openmls_poc::identity_validation::{
    generate_fixture_keypackage,verify_keypackage
};
fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len()!=4 {return Err("expected command, account ID and device ID".into())}
    match args[1].as_str() {
        "fixture" => {
            let package=generate_fixture_keypackage(&args[2],&args[3])?;
            std::io::stdout().write_all(&package).map_err(|_| "stdout write failed".to_string())
        }
        "verify" => {
            let mut wire=Vec::new();
            std::io::stdin().take(16_385).read_to_end(&mut wire)
                .map_err(|_| "stdin read failed".to_string())?;
            let v=verify_keypackage(&wire,&args[2],&args[3])?;
            let evidence=serde_json::json!({
                "credentialIdentity":v.credential_identity,
                "signaturePublicKeyHex":v.signature_public_key_hex,
                "ciphersuite":v.suite,
                "validated":true,
                "productionAuthorized":false
            });
            println!("{evidence}");
            Ok(())
        }
        _ => Err("unsupported subcommand".into()),
    }
}
fn main(){
    if let Err(err)=run(){
        eprintln!("GWAP_MLS_KEYPACKAGE_REJECTED: {err}");
        std::process::exit(2);
    }
}
