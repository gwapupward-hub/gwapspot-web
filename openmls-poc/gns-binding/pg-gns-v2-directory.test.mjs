import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import pg from 'pg';
import {DurableGnsDeviceDirectory} from './pg-gns-v2-directory.mjs';
import {
  GNS_PROGRAM,GNS_DEVNET_GENESIS,enrollmentIntentBytes,
  authorizedActionBytes,sha256
} from './gns-device-binding.mjs';

const url=process.env.GNS_DIRECTORY_TEST_DATABASE_URL;
if(!url?.includes('gwap_gns_directory_test'))
  throw Error('Refusing non-isolated database. Use disposable gwap_gns_directory_test only');
const pool=new pg.Pool({connectionString:url,max:12,connectionTimeoutMillis:3000});
before(async()=>pool.query(await readFile(new URL('./pg-gns-v2-schema.sql',import.meta.url),'utf8')));
beforeEach(async()=>pool.query('TRUNCATE messenger_gns_v2_action_nonces,'+
  'messenger_gns_v2_devices,messenger_gns_v2_challenges,'+
  'messenger_gns_v2_accounts,messenger_gns_v2_names RESTART IDENTITY CASCADE'));
after(async()=>pool.end());
const identity=()=>{
 const keys=generateKeyPairSync('ed25519');
 return {...keys,
   wallet:new PublicKey(keys.publicKey.export({
     type:'spki',format:'der'}).subarray(12)).toBase58(),
   spki:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')
 };
};
const CREATION='creation_transaction_001';
const digest=tag=>sha256(tag);
function fixture(){
 const alice=identity(),buyer=identity(),aliceDevice=identity(),buyerDevice=identity();
 const now=1_800_000_000_000;
 const fullName='papi.gwap';
 const current={wallet:alice.wallet,version:digest('creation-000'),
   count:0,slot:523480350,signature:CREATION,available:true,finalized:true};
 let readCalls=0;
 async function readFinalized(name){
   readCalls++;
   if(!current.available)throw Error('RPC outage');
   if(name!==fullName)throw Error('wrong name: '+JSON.stringify(name)+' expected '+JSON.stringify(fullName));
   return {name:fullName,owner:current.wallet,network:'devnet',
     programId:GNS_PROGRAM,commitment:'finalized',
     ownershipVersion:current.version,
     creationSignature:current.signature,transferCount:current.count,
     finalizedSlot:current.slot,historyComplete:current.finalized};
 }
 function service(customPool=pool){
   return new DurableGnsDeviceDirectory({pool:customPool,
     readFinalized,clockMs:()=>now});
 }
 const app=service();
 const createEnrollment=async({
   signer=alice,transport=aliceDevice,
   accountId='gwap_alice_001',deviceId='device_alice_001',
   keyPackage=randomBytes(230)
 }={})=>{
   const challenge=await app.issueChallenge('papi');
   const data={network:'devnet',genesisHash:GNS_DEVNET_GENESIS,
     programId:GNS_PROGRAM,name:'papi',wallet:signer.wallet,
     accountId,deviceId,transportPublicSpkiBase64:transport.spki,
     mlsKeyPackageHash:sha256(keyPackage),
     nonce:challenge.nonce,expiresAt:challenge.expiresAt};
   return {input:{...data,walletSignature:sign(null,enrollmentIntentBytes(data),
     signer.privateKey).toString('base64')},keyPackage};
 };
 const action=(record,{transport=aliceDevice,
   nonce=randomBytes(16).toString('hex'),...changes}={})=>{
   const data={network:'devnet',name:'papi',
     accountId:record.accountId,deviceId:record.deviceId,
     wallet:record.wallet,bindingGeneration:record.bindingGeneration,
     kind:'send',payloadHash:sha256('opaque MLS PrivateMessage'),nonce,...changes};
   return {...data,signature:sign(null,authorizedActionBytes(data),
     transport.privateKey).toString('base64')};
 };
 return {alice,buyer,aliceDevice,buyerDevice,current,service,app,
   createEnrollment,action,get readCalls(){return readCalls}};
}
test('signed wallet + KeyPackage enrolled in durable PG and action nonce consumed',async()=>{
 const f=fixture();
 const e=await f.createEnrollment();
 const bound=await f.app.enroll(e.input);
 assert.equal(bound.bindingGeneration,1);
 assert.equal(bound.ownershipVersion,f.current.version);
 assert.deepEqual(await f.app.checkKeyPackage(bound.deviceId,e.keyPackage),
   {authorized:true,deviceId:bound.deviceId});
 const request=f.action(bound);
 assert.equal((await f.app.authorizeAction(request)).authorized,true);
 await assert.rejects(f.app.authorizeAction(request),/device action nonce replay/);
 assert.ok(f.readCalls>=4,'Each meaningful action must query trusted reader');
 const rows=await pool.query('SELECT * FROM messenger_gns_v2_names WHERE name=$1',
   ['papi.gwap']);
 assert.equal(Number(rows.rows[0].binding_generation),1);
});

test('A→B→A observed as onchain transfer version revokes old keys even if wallet unchanged',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 const bound=await f.app.enroll(e.input);
 await f.app.authorizeAction(f.action(bound));
 f.current.count=2;
 f.current.version=digest('two-finalized-transfers');
 f.current.slot+=10;
 await assert.rejects(f.app.authorizeAction(f.action(bound)),
   /device is missing or revoked/);
 const row=await pool.query('SELECT revoked FROM messenger_gns_v2_devices WHERE device_id=$1',
   [bound.deviceId]);
 assert.equal(row.rows[0].revoked,true);
 const replacement=await f.createEnrollment({deviceId:'device_alice_new',
   accountId:'gwap_alice_new'});
 const fresh=await f.app.enroll(replacement.input);
 assert.equal(fresh.bindingGeneration,2);
 await assert.rejects(f.app.checkKeyPackage(bound.deviceId,e.keyPackage),
   /revoked\/stale device KeyPackage/);
 assert.equal((await f.app.authorizeAction(f.action(fresh))).authorized,true);
});

test('new alias owner cannot inherit old canonical account nor old device history',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 const old=await f.app.enroll(e.input);
 f.current.wallet=f.buyer.wallet;
 f.current.version=digest('transfer-to-buyer');
 f.current.count=1;f.current.slot+=3;
 const attempted=await f.createEnrollment({signer:f.buyer,
   transport:f.buyerDevice,accountId:'gwap_alice_001',
   deviceId:'device_buyer_invalid'});
 await assert.rejects(f.app.enroll(attempted.input),
   /stable GWAP account cannot transfer with domain/);
 const purchase=await f.createEnrollment({signer:f.buyer,
   transport:f.buyerDevice,accountId:'gwap_buyer_001',
   deviceId:'device_buyer_001'});
 const newOwner=await f.app.enroll(purchase.input);
 assert.equal(newOwner.bindingGeneration,2);
 await assert.rejects(f.app.authorizeAction(f.action(old)),
   /device is missing or revoked/);
 assert.equal((await f.app.authorizeAction(f.action(newOwner,{
   transport:f.buyerDevice}))).authorized,true);
 const db=await pool.query('SELECT account_id,original_wallet FROM messenger_gns_v2_accounts');
 assert.equal(db.rowCount,2);
 assert.equal(db.rows.find(x=>x.account_id==='gwap_alice_001').original_wallet,
   f.alice.wallet);
});

test('finalized history outage/missing proof never issues challenge nor permits action',async()=>{
 const f=fixture();
 f.current.available=false;
 await assert.rejects(f.app.issueChallenge('papi'),/finalized GNS history unavailable/);
 f.current.available=true;
 const e=await f.createEnrollment(),bound=await f.app.enroll(e.input);
 f.current.finalized=false;
 await assert.rejects(f.app.authorizeAction(f.action(bound)),
   /missing trustworthy complete finalized GNS V2 proof/);
});

test('stale finalized slot cannot rewrite newer database observed state',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 await f.app.enroll(e.input);
 f.current.slot-=2;
 await assert.rejects(f.app.issueChallenge('papi'),
   /RPC finalized slot regressed below durable high water mark/);
});

test('missing or contradictory transfer progression fails closed',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 await f.app.enroll(e.input);
 f.current.version=digest('forged-old-transfer');
 // A different version from the same account incarnation may only increase
 // its verified transfer sequence.
 await assert.rejects(f.app.issueChallenge('papi'),
   /owner epoch rollback or transfer-history contradiction/);
});

test('wallet signature, challenge and MLS KeyPackage digest cannot be swapped',async()=>{
 const f=fixture();
 const e=await f.createEnrollment();
 const forged={...e.input,transportPublicSpkiBase64:f.buyerDevice.spki};
 await assert.rejects(f.app.enroll(forged),/invalid Ed25519 signature/);
 const bound=await f.app.enroll(e.input);
 await assert.rejects(f.app.enroll(e.input),/duplicate key value|unique constraint/i);
 await assert.rejects(f.app.checkKeyPackage(bound.deviceId,randomBytes(230)),
   /MLS KeyPackage mismatches/);
 await assert.rejects(f.app.authorizeAction(f.action(bound,{
   transport:f.buyerDevice})),/invalid Ed25519 signature/);
});

test('two concurrent enrollments against identical nonce produce one durable device',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 const outcomes=await Promise.allSettled([
   f.app.enroll(e.input),f.app.enroll(e.input)]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 const result=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_gns_v2_devices');
 assert.equal(result.rows[0].n,1);
});

test('second independently constructed PostgreSQL service sees revocations and replay nonces',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 const bound=await f.app.enroll(e.input);
 const action=f.action(bound);
 await f.app.authorizeAction(action);
 const otherPool=new pg.Pool({connectionString:url,max:2});
 try{
   const independent=f.service(otherPool);
   await assert.rejects(independent.authorizeAction(action),/device action nonce replay/);
   f.current.count=1;f.current.version=digest('transfer');f.current.slot+=2;
   await assert.rejects(independent.authorizeAction(f.action(bound)),
     /device is missing or revoked/);
 }finally{await otherPool.end()}
});

test('re-creation of a name creates a new durable generation even with reset transfer count',async()=>{
 const f=fixture(),e=await f.createEnrollment();
 const bound=await f.app.enroll(e.input);
 f.current.signature='new_creation_transaction_123';
 f.current.count=0;f.current.version=digest('re-created-name');
 f.current.slot+=100;
 const fresh=await f.createEnrollment({accountId:'gwap_alice_new',
   deviceId:'device_alice_new'});
 const approved=await f.app.enroll(fresh.input);
 assert.equal(approved.bindingGeneration,2);
 await assert.rejects(f.app.authorizeAction(f.action(bound)),
   /device is missing or revoked/);
});
