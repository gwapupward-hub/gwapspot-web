import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {
  GNS_DEVNET_GENESIS,GNS_PROGRAM,GnsDeviceBindingGate,
  sha256,strictDomain,decodeSolanaWallet,
  enrollmentIntentBytes,authorizedActionBytes
} from './gns-device-binding.mjs';

const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes){
  let n=BigInt('0x'+Buffer.from(bytes).toString('hex'));
  let text='';
  while(n>0n){text=BASE58[Number(n%58n)]+text;n/=58n;}
  for(const b of bytes){if(b!==0)break;text='1'+text;}
  return text;
}
function signerWithAddress(){
  const pair=generateKeyPairSync('ed25519');
  const publicDer=pair.publicKey.export({type:'spki',format:'der'});
  assert.equal(publicDer.length,44);
  const address=base58Encode(publicDer.subarray(12));
  assert.deepEqual(decodeSolanaWallet(address),publicDer.subarray(12));
  return {...pair,address};
}
function transportSigner(){
  const pair=generateKeyPairSync('ed25519');
  return {...pair,spki:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')};
}
function setUp(){
  let now=Date.parse('2026-11-17T18:00:00Z');
  const wallets={alice:signerWithAddress(),bob:signerWithAddress(),
    buyer:signerWithAddress(),attacker:signerWithAddress()};
  const devices={alice:transportSigner(),bob:transportSigner(),
    buyer:transportSigner(),attacker:transportSigner()};
  const owners=new Map([['alice',wallets.alice.address],
    ['bob',wallets.bob.address]]);
  let outage=false;
  const resolver=async name=>{
    if(outage)throw Error('GNS unavailable');
    const wallet=owners.get(name);
    return wallet?{found:true,owner:wallet}:{found:false,owner:null};
  };
  const gate=new GnsDeviceBindingGate({resolver,now:()=>now});
  const kps={
    alice:Buffer.concat([randomBytes(160),Buffer.from('alice MLS KeyPackage fixture')]),
    bob:Buffer.concat([randomBytes(160),Buffer.from('bob MLS KeyPackage fixture')]),
    buyer:Buffer.concat([randomBytes(160),Buffer.from('buyer fresh MLS KeyPackage fixture')])
  };
  const enrollment=(who,{wallet=wallets[who],device=devices[who],
    name=who,accountId='gwap_'+who+'_001',
    deviceId='device_'+who+'_001',kp=kps[who]}={})=>{
    const {nonce,expiresAt}=gate.issueChallenge(name);
    const values={
      network:'devnet',genesisHash:GNS_DEVNET_GENESIS,programId:GNS_PROGRAM,
      name, wallet:wallet.address,accountId,deviceId,
      transportPublicSpkiBase64:device.spki,
      mlsKeyPackageHash:sha256(kp),nonce,expiresAt
    };
    return {...values,walletSignature:sign(null,enrollmentIntentBytes(values),
      wallet.privateKey).toString('base64')};
  };
  const authorize=(enrolled,{device=devices[enrolled.name],
    kind='send',payloadHash=sha256('opaque MLS ciphertext'),
    nonce=randomBytes(16).toString('hex'),...overrides}={})=>{
    const r={
      network:'devnet',name:enrolled.name,accountId:enrolled.accountId,
      deviceId:enrolled.deviceId,wallet:enrolled.wallet,
      bindingGeneration:enrolled.bindingGeneration,
      kind,payloadHash,nonce,...overrides
    };
    return {...r,signature:sign(null,authorizedActionBytes(r),
      device.privateKey).toString('base64')};
  };
  return {
    gate,wallets,devices,kps,owners,enrollment,authorize,
    outage:(value)=>{outage=value},clock:(delta)=>{now+=delta}
  };
}

test('accepts wallet-signed binding only when fresh resolver lists the same Solana owner',async()=>{
  const f=setUp();
  const proof=f.enrollment('alice');
  const enrolled=await f.gate.enroll(proof);
  assert.equal(enrolled.name,'alice');
  assert.equal(enrolled.wallet,f.wallets.alice.address);
  assert.equal(enrolled.accountId,'gwap_alice_001');
  assert.equal(enrolled.bindingGeneration,1);
  assert.deepEqual(await f.gate.checkKeyPackage('device_alice_001',f.kps.alice),
    {authorized:true,deviceId:'device_alice_001'});
  assert.equal((await f.gate.authorizeAction(f.authorize(enrolled))).authorized,true);
});

test('wrong owner, forged wallet signature and different transport public key fail enrollment',async()=>{
  const f=setUp();
  const attacker=f.enrollment('alice',{wallet:f.wallets.attacker});
  await assert.rejects(f.gate.enroll(attacker),/does not currently own/);
  const valid=f.enrollment('alice');
  const forged={...valid,walletSignature:sign(null,enrollmentIntentBytes(valid),
    f.wallets.attacker.privateKey).toString('base64')};
  await assert.rejects(f.gate.enroll(forged),/Invalid controlling-wallet/);
  const anotherTransport=f.devices.attacker.spki;
  await assert.rejects(f.gate.enroll({...valid,
    transportPublicSpkiBase64:anotherTransport}),/Invalid controlling-wallet/);
  assert.equal(f.gate.bindingCount,0);
});

test('replayed nonce, duplicate device enrollment and expired enrollment challenges fail',async()=>{
  const f=setUp();
  const proof=f.enrollment('alice');
  await f.gate.enroll(proof);
  await assert.rejects(f.gate.enroll(proof),/replayed or unsolicited|Device already enrolled/);
  const changedDevice={...proof,deviceId:'device_alice_other'};
  await assert.rejects(f.gate.enroll(changedDevice),/replayed or unsolicited/);
  const second=f.enrollment('bob');
  f.clock(120001);
  await assert.rejects(f.gate.enroll(second),/Expired, replayed or unsolicited/);
});

test('transport signature is separately tied to stable account, domain, generation and action',async()=>{
  const f=setUp();
  const e=await f.gate.enroll(f.enrollment('alice'));
  const intent=f.authorize(e);
  await f.gate.authorizeAction(intent);
  await assert.rejects(f.gate.authorizeAction(intent),/nonce replay/);
  const swappedDevice=f.authorize(e,{device:f.devices.attacker});
  await assert.rejects(f.gate.authorizeAction(swappedDevice),/Invalid enrolled-device/);
  const changedAccount=f.authorize(e,{accountId:'gwap_attacker_001'});
  await assert.rejects(f.gate.authorizeAction(changedAccount),/Stale \.gwap ownership/);
  const changedPayload=f.authorize(e);
  await assert.rejects(f.gate.authorizeAction({...changedPayload,
    payloadHash:sha256('different wire')}),/Invalid enrolled-device/);
  await assert.rejects(f.gate.authorizeAction(f.authorize(e,{network:'mainnet-beta'})),
    /Invalid action network/);
});

test('domain transfer revokes old device; new wallet needs new account, signature and KeyPackage',async()=>{
  const f=setUp();
  const old=await f.gate.enroll(f.enrollment('alice'));
  await f.gate.authorizeAction(f.authorize(old));
  f.owners.set('alice',f.wallets.buyer.address);
  await assert.rejects(f.gate.authorizeAction(f.authorize(old)),
    /Stale \.gwap ownership|revoked messaging device/);
  await assert.rejects(f.gate.checkKeyPackage('device_alice_001',f.kps.alice),
    /Device revoked/);
  // The buyer cannot adopt old account, key package or private history via alias.
  const newEnrollment=f.enrollment('alice',{
    wallet:f.wallets.buyer,device:f.devices.buyer,
    accountId:'gwap_buyer_001',deviceId:'device_buyer_001',kp:f.kps.buyer
  });
  const fresh=await f.gate.enroll(newEnrollment);
  assert.equal(fresh.bindingGeneration,2);
  assert.equal(fresh.accountId,'gwap_buyer_001');
  await assert.rejects(f.gate.authorizeAction(f.authorize(old)),
    /revoked messaging device/);
  assert.equal((await f.gate.authorizeAction(f.authorize(fresh,{
    device:f.devices.buyer}))).authorized,true);
  await assert.rejects(f.gate.checkKeyPackage('device_buyer_001',f.kps.alice),
    /KeyPackage differs/);
  assert.equal((await f.gate.checkKeyPackage('device_buyer_001',f.kps.buyer)).authorized,true);
});

test('GNS outage, not-found, missing owner and invalid owner public key fail closed',async()=>{
  const f=setUp();
  const enrolled=await f.gate.enroll(f.enrollment('bob'));
  f.outage(true);
  await assert.rejects(f.gate.authorizeAction(f.authorize(enrolled)),/resolver unavailable/);
  await assert.rejects(f.gate.enroll(f.enrollment('alice')),/resolver unavailable/);
  f.outage(false);
  f.owners.delete('bob');
  await assert.rejects(f.gate.authorizeAction(f.authorize(enrolled)),
    /Stale \.gwap ownership|revoked messaging device/);
  const noName=f.enrollment('alice');
  noName.name='not-an-owner'; // Signature invalid and different challenge identity.
  await assert.rejects(f.gate.enroll(noName),/Expired, replayed or unsolicited|Invalid controlling-wallet/);
});

test('binding never accepts wrong Solana network, program, name or malformed wallet',async()=>{
  const f=setUp();
  const valid=f.enrollment('alice');
  await assert.rejects(f.gate.enroll({...valid,network:'mainnet-beta'}),/Wrong GNS network/);
  await assert.rejects(f.gate.enroll({...valid,programId:'malicious'}),/Wrong GNS network/);
  await assert.rejects(f.gate.enroll({...valid,name:'alice.ton'}),/Invalid \.gwap domain|Name must be canonical/);
  await assert.rejects(f.gate.enroll({...valid,wallet:'not-a-wallet'}),/Invalid Solana wallet/);
  assert.equal(strictDomain(' ALICE.GWAP '),'alice');
  assert.throws(()=>strictDomain('a..gwap'),/Invalid \.gwap domain/);
});

test('stale bindings never revive when the old wallet reclaims the name later',async()=>{
  const f=setUp();
  const old=await f.gate.enroll(f.enrollment('alice'));
  f.owners.set('alice',f.wallets.buyer.address);
  await f.gate.revalidate('alice.gwap');
  f.owners.set('alice',f.wallets.alice.address);
  await f.gate.revalidate('alice.gwap');
  await assert.rejects(f.gate.authorizeAction(f.authorize(old)),
    /revoked messaging device/);
  const fresh=await f.gate.enroll(f.enrollment('alice',{
    accountId:'gwap_alice_reclaimed',deviceId:'device_alice_fresh',
    kp:randomBytes(250)
  }));
  assert.equal(fresh.bindingGeneration,3);
});

test('transfer does not authorize old ciphertext via the new wallet alias',async()=>{
  const f=setUp();
  const original=await f.gate.enroll(f.enrollment('alice'));
  // Historical encrypted records are scoped to immutable canonical IDs, not aliases.
  const oldInbox=new Map([['gwap_alice_001',['opaque MLS ciphertext for original Alice']]]);
  f.owners.set('alice',f.wallets.buyer.address);
  await f.gate.revalidate('alice');
  const replacement=await f.gate.enroll(f.enrollment('alice',{
    wallet:f.wallets.buyer,device:f.devices.buyer,
    accountId:'gwap_buyer_001',deviceId:'device_buyer_001',kp:f.kps.buyer
  }));
  assert.deepEqual(oldInbox.get(replacement.accountId)||[],[]);
  await assert.rejects(f.gate.authorizeAction(f.authorize(original)),
    /revoked messaging device/);
  assert.equal((await f.gate.authorizeAction(f.authorize(replacement,{device:f.devices.buyer}))).accountId,
    'gwap_buyer_001');
});
