// End-to-end test-only wallet signMessage + server session binding +
// disposable PostgreSQL device directory using synthetic finalized GNS proofs.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import pg from 'pg';
import {DurableGnsDeviceDirectory} from './pg-gns-v2-directory.mjs';
import {
  TestOnlyMessengerWalletEnrollmentGateway,signMessengerChallenge
} from './gwapos-wallet-mls-enrollment.mjs';
import {GNS_V2_PROGRAM_ID} from './gns-v2-finalized.mjs';

const url=process.env.GNS_DIRECTORY_TEST_DATABASE_URL;
if(!url?.includes('gwap_gns_directory_test'))
  throw Error('Refusing non-isolated PostgreSQL URL');
const pool=new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:4000});
before(async()=>pool.query(await readFile(new URL('./pg-gns-v2-schema.sql',import.meta.url),'utf8')));
beforeEach(async()=>pool.query('TRUNCATE messenger_gns_v2_action_nonces,'+
  'messenger_gns_v2_devices,messenger_gns_v2_challenges,'+
  'messenger_gns_v2_accounts,messenger_gns_v2_names RESTART IDENTITY CASCADE'));
after(async()=>pool.end());
function identity(){
 const keys=generateKeyPairSync('ed25519');
 return {...keys,address:new PublicKey(
   keys.publicKey.export({format:'der',type:'spki'}).subarray(12)).toBase58(),
   spki:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')
 };
}
function fixture(){
 const original=identity(),newOwner=identity(),device=identity();
 const now=1_800_000_000_000;
 let currentOwner=original.address;
 let version='a'.repeat(64),historyComplete=true,outage=false,
     independentRpcCorroboration=true,network='devnet';
 const sessions=new Map([
   ['session_verified_001',{authenticated:true,subject:'privy:owner',
     accountId:'gwap_roadmap_001',verifiedWallet:original.address}],
   ['session_alt_user_001',{authenticated:true,subject:'privy:other',
     accountId:'gwap_other_001',verifiedWallet:newOwner.address}],
   ['session_duplicate_001',{authenticated:true,subject:'privy:another',
     accountId:'gwap_roadmap_001',verifiedWallet:original.address}]
 ]);
 const proof=async name=>{
   if(outage)throw Error('archive RPC unavailable');
   assert.equal(name,'roadmap.gwap');
   return {name,network,commitment:'finalized',
     programId:GNS_V2_PROGRAM_ID,historyComplete,
     independentRpcCorroboration,owner:currentOwner,
     creationSignature:'test-creation-sig',transferCount:0,
     ownershipVersion:version,finalizedSlot:523505900};
 };
 const directory=new DurableGnsDeviceDirectory({
   pool,readFinalized:proof,clockMs:()=>now
 });
 const gateway=new TestOnlyMessengerWalletEnrollmentGateway({
   directory,readFinalized:proof,
   verifySession:async token=>sessions.get(token),
   now:()=>now
 });
 const kp=randomBytes(440);
 const input={
   sessionToken:'session_verified_001',name:'roadmap.gwap',
   deviceId:'device_mls_001',mlsKeyPackageBytes:kp,
   transportPublicSpkiBase64:device.spki
 };
 async function signChallenge(challenge,signer=original){
   return signMessengerChallenge({challenge,signMessage:async bytes=>
     new Uint8Array(sign(null,Buffer.from(bytes),signer.privateKey))});
 }
 return {original,newOwner,device,kp,input,directory,gateway,sessions,proof,
   signChallenge,
   transfer:newWallet=>{currentOwner=newWallet;version='b'.repeat(64)},
   rollback:()=>{currentOwner=original.address;version='c'.repeat(64)},
   outage:v=>{outage=v},
   completeness:v=>{historyComplete=v},
   corroboration:v=>{independentRpcCorroboration=v},
   networkChange:v=>{network=v}
 };
}
test('verified OS session + explicit signMessage enrolls exact MLS KeyPackage',async()=>{
 const f=fixture();
 const challenge=await f.gateway.issueChallenge(f.input);
 assert.equal(challenge.signable.wallet,f.original.address);
 assert.equal(challenge.signable.accountId,'gwap_roadmap_001');
 assert.equal(challenge.signable.programId,GNS_V2_PROGRAM_ID);
 assert.equal(challenge.noTransaction,true);
 const signed=await f.signChallenge(challenge);
 const result=await f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:f.kp
 });
 assert.equal(result.deviceId,'device_mls_001');
 assert.equal(result.name,'roadmap.gwap');
 assert.equal(result.authorizedForProduction,false);
 assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_gns_v2_devices')).rows[0].n,1);
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:f.kp
 }),/already used/);
});
test('unverified, missing or alternate wallet OS session cannot issue challenge',async()=>{
 const f=fixture();
 await assert.rejects(f.gateway.issueChallenge({...f.input,
   sessionToken:'session_undefined_001'}),/authenticated GwapOS session/);
 await assert.rejects(f.gateway.issueChallenge({...f.input,
   sessionToken:'session_alt_user_001'}),/not finalized .gwap owner/);
});
test('wallet that does not own the record cannot forge the signature',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signature=await f.signChallenge(challenge,f.newOwner);
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signature,mlsKeyPackageBytes:f.kp
 }),/invalid Ed25519 signature/);
 assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_gns_v2_devices')).rows[0].n,0);
});
test('challenge binds authenticated session subject even if wallet/account match',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 await assert.rejects(f.gateway.complete({
   sessionToken:'session_duplicate_001',attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:f.kp
 }),/session changed/);
});
test('changing device transport key after signing denies enrollment',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 const another=identity();
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:{...signed,transportPublicSpkiBase64:another.spki},
   mlsKeyPackageBytes:f.kp
 }),/signed challenge property mismatch/);
});
test('different OpenMLS KeyPackage bytes fail even with correct signature',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:randomBytes(f.kp.length)
 }),/KeyPackage changed/);
});
test('observed transfer to new wallet blocks previous owner challenge',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 f.transfer(f.newOwner.address);
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:f.kp
 }),/name transferred|ownership proof changed/);
});
test('unobserved A→B→A with changed ownership version blocks challenge',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 f.transfer(f.newOwner.address);f.rollback();
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:f.kp
 }),/ownership proof changed/);
});
test('RPC outage and missing archive completeness block enrollment',async()=>{
 const f=fixture();
 f.outage(true);
 await assert.rejects(f.gateway.issueChallenge(f.input),
   /incomplete or uncorroborated finalized GNS V2 ownership evidence/);
 f.outage(false);f.completeness(false);
 await assert.rejects(f.gateway.issueChallenge(f.input),
   /incomplete or uncorroborated finalized GNS V2 ownership evidence/);
});
test('client wallet decline cannot fabricate enrollment signature',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 await assert.rejects(signMessengerChallenge({challenge,
   signMessage:async()=>{throw Error('User rejected signing')}
 }),/User rejected signing/);
 await assert.rejects(signMessengerChallenge({challenge,
   signMessage:async()=>new Uint8Array(8)
 }),/wallet signature must be 64 bytes/);
});
test('wallet signature cannot be moved to another nonce or GWAP account',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:{...signed,accountId:'gwap_attacker_001'},
   mlsKeyPackageBytes:f.kp
 }),/signed challenge property mismatch/);
});

test('single-RPC evidence cannot start wallet enrollment despite correct current owner',async()=>{
 const f=fixture();
 f.corroboration(false);
 await assert.rejects(f.gateway.issueChallenge(f.input),
   /incomplete or uncorroborated finalized/);
 const n=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_gns_v2_challenges');
 assert.equal(n.rows[0].n,0);
});
test('archive corroboration lost between challenge and completion denies device',async()=>{
 const f=fixture(),challenge=await f.gateway.issueChallenge(f.input);
 const signed=await f.signChallenge(challenge);
 f.corroboration(false);
 await assert.rejects(f.gateway.complete({
   sessionToken:f.input.sessionToken,attempt:challenge.attempt,
   signedIntent:signed,mlsKeyPackageBytes:f.kp
 }),/incomplete or uncorroborated finalized/);
 assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_gns_v2_devices')).rows[0].n,0);
});
test('wrong network from injected finalized source never opens enrollment',async()=>{
 const f=fixture();f.networkChange('mainnet-beta');
 await assert.rejects(f.gateway.issueChallenge(f.input),
   /incomplete or uncorroborated finalized/);
});
