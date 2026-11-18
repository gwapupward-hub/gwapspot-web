// TEST ONLY: native OpenMLS 0.9.2 cryptographic identity-check bridge.
// The executable is a locally built trusted offline test binary. Never run
// untrusted user-controlled binaries or arbitrary shell commands.
import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';

const fail=reason=>{throw Error('MLS_KEYPACKAGE_ADMISSION_FAILED: '+reason)};
const identityPattern=/^GWAP-MLS-IDENTITY-V1\|gwap_[A-Za-z0-9_-]{20,64}\|device_[A-Za-z0-9_-]{3,80}$/;
export function createNativeMlsKeyPackageVerifier(executablePath){
  if(typeof executablePath!=='string'||!isAbsolute(executablePath)){
    fail('trusted absolute native validator path required');
  }
  return async function verifyMlsKeyPackage({bytes,accountId,deviceId}){
    if(!(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)||
      bytes.length<100||bytes.length>16384)fail('KeyPackage length invalid');
    if(typeof accountId!=='string'||typeof deviceId!=='string')fail('IDs required');
    const expected='GWAP-MLS-IDENTITY-V1|'+accountId+'|'+deviceId;
    if(!identityPattern.test(expected))fail('invalid canonical GWAP account/device identity');
    const result=spawnSync(executablePath,['verify',accountId,deviceId],{
      input:Buffer.from(bytes),encoding:'utf8',timeout:8000,maxBuffer:4096,
      stdio:['pipe','pipe','pipe'],shell:false
    });
    if(result.error||result.signal||result.status!==0){
      fail('OpenMLS signature or BasicCredential validation failed');
    }
    let out;
    try{out=JSON.parse(result.stdout)}catch{fail('validator output invalid')}
    if(out.validated!==true||out.productionAuthorized!==false||
      out.credentialIdentity!==expected||
      !/^[0-9a-f]{64}$/.test(out.signaturePublicKeyHex)||
      !/MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519/.test(out.ciphersuite||'')){
      fail('native OpenMLS verifier evidence invalid');
    }
    return {
      validated:true,credentialIdentity:out.credentialIdentity,
      signaturePublicKeyHex:out.signaturePublicKeyHex,
      ciphersuite:out.ciphersuite
    };
  };
}
