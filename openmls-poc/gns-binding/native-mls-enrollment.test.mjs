// Actual native OpenMLS 0.9.2 signed KeyPackage bytes through the
// simulated GwapOS wallet signMessage + disposable PostgreSQL enrollment
// boundary. NO real users/wallets/MLS group private keys/production DB.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import pg from 'pg';
import {DurableGnsDeviceDirectory} from './pg-gns-v2-directory.mjs';
import {TestOnlyMessengerWalletEnrollmentGateway,
  signMessengerChallenge} from './gwapos-wallet-mls-enrollment.mjs';
import {createNativeMlsKeyPackageVerifier}
  from './native-mls-keypackage-verifier.mjs';
import {GNS_PROGRAM} from './gns-device-binding.mjs';

const url=process.env.GNS_DIRECTORY_TEST_DATABASE_URL;
if(!url?.includes('gwap_gns_directory_test'))throw Error('Disposable test PostgreSQL only');
const binary=process.env.GWAP_MLS_VALIDATOR_BIN;
if(!binary)throw Error('Native Rust OpenMLS validator must be built before this test');
const pool=new pg.Pool({connectionString:url,max:4,connectionTimeoutMillis:3000});
before(async()=>pool.query(await readFile(new URL('./pg-gns-v2-schema.sql',import.meta.url),'utf8')));
after(async()=>pool.end());
const accountId='gwap_1234567890abcdefghijklmn';
const deviceId='device_iphone_001';
const otherAccount='gwap_otherabcdefghijklmnopqrst';
function makeSigner(){
 const keys=generateKeyPairSync('ed25519');
 return {...keys,
   wallet:new PublicKey(keys.publicKey.export({format:'der',type:'spki'}).subarray(12)).toBase58(),
   spki:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')
 };
}
function packageBytes(account,device){
 const proc=spawnSync(binary,['fixture',account,device],
   {timeout:8000,maxBuffer:100000,encoding:null,shell:false});
 assert.equal(proc.status,0,'Native OpenMLS fixture generator failed');
 return proc.stdout;
}
const nativeVerify=createNativeMlsKeyPackageVerifier(binary);

test('cryptographically authentic OpenMLS KeyPackage validates exact account and device',async()=>{
 const bytes=packageBytes(accountId,deviceId);
 const evidence=await nativeVerify({bytes,accountId,deviceId});
 assert.equal(evidence.validated,true);
 assert.equal(evidence.credentialIdentity,
   'GWAP-MLS-IDENTITY-V1|'+accountId+'|'+deviceId);
 assert.equal(evidence.signaturePublicKeyHex.length,64);
 await assert.rejects(nativeVerify({bytes,accountId:otherAccount,deviceId}),
   /signature or BasicCredential validation failed/);
 await assert.rejects(nativeVerify({bytes,accountId,deviceId:'device_imposter'}),
   /signature or BasicCredential validation failed/);
 await assert.rejects(nativeVerify({
   bytes:Buffer.concat([bytes,Buffer.from([0x12])]),accountId,deviceId
 }),/signature or BasicCredential validation failed/);
 const bad=Buffer.from(bytes);bad[bad.length-1]^=1;
 await assert.rejects(nativeVerify({bytes:bad,accountId,deviceId}),
   /signature or BasicCredential validation failed/);
});

test('actual signed MLS KeyPackage is wallet-attested and enrolled through PostgreSQL',async()=>{
 await pool.query('TRUNCATE messenger_gns_v2_action_nonces,'+
  'messenger_gns_v2_devices,messenger_gns_v2_challenges,'+
  'messenger_gns_v2_accounts,messenger_gns_v2_names RESTART IDENTITY CASCADE');
 const owner=makeSigner(),device=makeSigner(),bytes=packageBytes(accountId,deviceId);
 const now=1_800_000_000_000;
 const proof={
   name:'roadmap.gwap',owner:owner.wallet,network:'devnet',
   programId:GNS_PROGRAM,commitment:'finalized',
   creationSignature:'test_simulated_registration_transaction',
   transferCount:0,ownershipVersion:'a'.repeat(64),
   finalizedSlot:523600000,historyComplete:true,
   independentRpcCorroboration:true // fixture, NOT the actual live user session
 };
 const readFinalized=async name=>{
   assert.equal(name,'roadmap.gwap');return proof;
 };
 const directory=new DurableGnsDeviceDirectory({
   pool,readFinalized,clockMs:()=>now
 });
 const gateway=new TestOnlyMessengerWalletEnrollmentGateway({
   directory,readFinalized,
   verifyMlsKeyPackage:nativeVerify,
   verifySession:async token=>token==='test_privy_session_token'?
     {authenticated:true,subject:'did:privy:test-messenger',
      accountId,verifiedWallet:owner.wallet}:null,
   now:()=>now
 });
 const challenge=await gateway.issueChallenge({
   sessionToken:'test_privy_session_token',name:'roadmap.gwap',
   deviceId,transportPublicSpkiBase64:device.spki,
   mlsKeyPackageBytes:bytes
 });
 const signed=await signMessengerChallenge({
   challenge,signMessage:async data=>new Uint8Array(
     sign(null,Buffer.from(data),owner.privateKey))
 });
 const outcome=await gateway.complete({
   sessionToken:'test_privy_session_token',
   attempt:challenge.attempt,signedIntent:signed,mlsKeyPackageBytes:bytes
 });
 assert.equal(outcome.deviceId,deviceId);
 assert.equal(outcome.accountId,accountId);
 assert.equal(outcome.authorizedForProduction,false);
 assert.equal((await directory.checkKeyPackage(deviceId,bytes)).authorized,true);
 assert.equal((await pool.query(
   'SELECT count(*)::int AS n FROM messenger_gns_v2_devices'
 )).rows[0].n,1);
 await assert.rejects(gateway.complete({
   sessionToken:'test_privy_session_token',
   attempt:challenge.attempt,signedIntent:signed,mlsKeyPackageBytes:bytes
 }),/wallet challenge absent or already used/);
});
