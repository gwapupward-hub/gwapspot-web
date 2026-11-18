import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {
 GnsDeviceBindingGate,GNS_PROGRAM,GNS_DEVNET_GENESIS,
 enrollmentIntentBytes,authorizedActionBytes,sha256
} from './gns-device-binding.mjs';
import {GNS_V2_PROGRAM_ID} from './gns-v2-finalized.mjs';

function keypair(){
  const keys=generateKeyPairSync('ed25519');
  return {...keys,
    base58:new PublicKey(keys.publicKey.export({
      format:'der',type:'spki'}).subarray(12)).toBase58(),
    spki:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')
  };
}
function fixture({finalized=true}={}){
  const w=keypair(),d=keypair();
  let version='a'.repeat(64),owner=w.base58,slot=200;
  const proof=()=>{
    if(!finalized)return {found:true,owner};
    return {found:true,owner,ownershipVersion:version,
      ownershipFinalized:true,finalizedSlot:slot};
  };
  const gate=new GnsDeviceBindingGate({resolver:async()=>proof(),
    now:()=>1_800_000_000_000,requireFinalized:true});
  const makeEnrollment=(id='device_test_001',account='gwap_test_001')=>{
    const {nonce,expiresAt}=gate.issueChallenge('papi.gwap');
    const fields={
      network:'devnet',genesisHash:GNS_DEVNET_GENESIS,
      programId:GNS_PROGRAM,
      name:'papi',wallet:w.base58,
      accountId:account,deviceId:id,
      transportPublicSpkiBase64:d.spki,mlsKeyPackageHash:sha256(
        randomBytes(200)),
      nonce,expiresAt
    };
    return {...fields,walletSignature:sign(null,enrollmentIntentBytes(fields),
      w.privateKey).toString('base64')};
  };
  const action=b=>{
    const fields={
      network:'devnet',name:'papi',accountId:b.accountId,
      deviceId:b.deviceId,wallet:w.base58,
      bindingGeneration:b.bindingGeneration,
      kind:'send',payloadHash:sha256('opaque wire'),
      nonce:randomBytes(16).toString('hex')
    };
    return {...fields,signature:sign(null,authorizedActionBytes(fields),
      d.privateKey).toString('base64')};
  };
  return {w,d,gate,makeEnrollment,action,
    changeVersion:newVersion=>{version=newVersion;slot++;},
    changeOwner:newOwner=>{owner=newOwner;version='c'.repeat(64);slot++}};
}

test('strict finalized mode rejects owner-only resolution and never enrolls',async()=>{
  const f=fixture({finalized:false});
  assert.equal(GNS_PROGRAM,GNS_V2_PROGRAM_ID);
  await assert.rejects(f.gate.enroll(f.makeEnrollment()),
    /Finalized GNS history proof missing or incomplete/);
  assert.equal(f.gate.bindingCount,0);
});
test('same owner A→B→A transfer history version revokes device before send',async()=>{
  const f=fixture();
  const b=await f.gate.enroll(f.makeEnrollment());
  assert.equal((await f.gate.authorizeAction(f.action(b))).authorized,true);
  f.changeVersion('b'.repeat(64));
  await assert.rejects(f.gate.authorizeAction(f.action(b)),
    /Stale \.gwap ownership|revoked messaging device/);
  await assert.rejects(f.gate.authorizeAction(f.action(b)),/revoked messaging device/);
  const next=await f.gate.enroll(f.makeEnrollment('device_test_002','gwap_test_002'));
  assert.equal(next.bindingGeneration,2);
  assert.equal((await f.gate.authorizeAction(f.action(next))).authorized,true);
});
test('strict binding fails closed if resolver history proof vanishes',async()=>{
  const f=fixture();
  const bound=await f.gate.enroll(f.makeEnrollment());
  assert.ok(bound.deviceId);
  // GNS verifier would throw whenever history is incomplete; unlike owner-only
  // resolver, the strict security path never silently promotes a cached owner.
  const unavailable=new GnsDeviceBindingGate({resolver:async()=>({
    found:true,owner:f.w.base58,ownershipFinalized:false,
    ownershipVersion:'a'.repeat(64),finalizedSlot:300
  }),requireFinalized:true});
  await assert.rejects(unavailable.enroll((()=>{
    const {nonce,expiresAt}=unavailable.issueChallenge('papi');
    const fields={
      network:'devnet',genesisHash:GNS_DEVNET_GENESIS,
      programId:GNS_PROGRAM,name:'papi',wallet:f.w.base58,
      accountId:'gwap_test_001',deviceId:'device_test_123',
      transportPublicSpkiBase64:f.d.spki,
      mlsKeyPackageHash:sha256(randomBytes(150)),nonce,expiresAt
    };
    return {...fields,walletSignature:sign(null,enrollmentIntentBytes(fields),
      f.w.privateKey).toString('base64')};
  })()),/Finalized GNS history proof missing or incomplete|Expired/);
});
