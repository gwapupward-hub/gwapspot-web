// Test-only PostgreSQL envelope-granted DS acceptance and signed recipient sync.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,randomBytes,sign,verify} from 'node:crypto';
import pg from 'pg';
import {
 PostgresCheckpointAuthority,sha256Hex
} from './durable-checkpoint.mjs';
import {
 PostgresEnvelopeDS,authorizeEnvelopeBytes,submitEnvelopeBytes,
 pullEnvelopeBytes,grantReceiptBytes,envelopeHash
} from './pg-envelope-ds.mjs';
const url=process.env.CHECKPOINT_TEST_DATABASE_URL;
if(!url || !url.includes('gwap_checkpoint_test'))
 throw Error('Refusing tests without isolated gwap_checkpoint_test PostgreSQL');
const {Pool}=pg;
const pool=new Pool({connectionString:url,max:12,connectionTimeoutMillis:3000});
const server=generateKeyPairSync('ed25519');
before(async()=>{
 const schemas=await Promise.all([
  readFile(new URL('./pg-schema.sql',import.meta.url),'utf8'),
  readFile(new URL('./pg-envelope-schema.sql',import.meta.url),'utf8')]);
 for(const sql of schemas)await pool.query(sql);
});
beforeEach(async()=>{
 await pool.query('TRUNCATE messenger_test_recipient_pull_nonces,'+
   'messenger_opaque_deliveries,messenger_envelope_grants,'+
   'messenger_test_group_members,messenger_checkpoint_receipts,'+
   'messenger_checkpoint_devices RESTART IDENTITY CASCADE');
});
after(async()=>await pool.end());

async function fixture(){
 const sender=generateKeyPairSync('ed25519');
 const recipient=generateKeyPairSync('ed25519');
 const outsider=generateKeyPairSync('ed25519');
 const ck=new PostgresCheckpointAuthority({
   pool,serverSigningKey:server.privateKey,allowFixtureAdministration:true
 });
 const ds=new PostgresEnvelopeDS({
   pool,serverSigningKey:server.privateKey,allowFixtureAdministration:true
 });
 async function enroll(deviceId,accountId,keys){
   await ck.provisionFixture({
     deviceId,accountId,bindingVersion:1,
     publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),
     revision:1,commitment:sha256Hex('initial-sealed-state-'+deviceId)
   });
 }
 await enroll('alice_device','gwap_alice',sender);
 await enroll('bob_device','gwap_bob',recipient);
 await enroll('eve_device','gwap_eve',outsider);
 await ds.addGroupMemberFixture('mls_group_001','alice_device');
 await ds.addGroupMemberFixture('mls_group_001','bob_device');
 const initialWire=randomBytes(200);
 const originalCommit=sha256Hex('alice-after-committing-sender-ratchet');
 const signed=(body,bytes,key=sender.privateKey)=>({
   ...body,signature:sign(null,bytes(body),key).toString('base64')
 });
 function authorize(overrides={},key=sender.privateKey){
   const body={
     deviceId:'alice_device',accountId:'gwap_alice',bindingVersion:1,
     fence:1,expectedRevision:1,nextRevision:2,
     commitment:originalCommit,idempotencyKey:'commit_000001',
     groupId:'mls_group_001',recipientDeviceId:'bob_device',
     messageId:'msg_0000001',epoch:0,
     ciphertextHash:envelopeHash(initialWire),...overrides
   };
   return signed(body,authorizeEnvelopeBytes,key);
 }
 function submit(grant=authorize(),wire=initialWire,overrides={},key=sender.privateKey){
   const body={
     deviceId:grant.deviceId,accountId:grant.accountId,
     bindingVersion:grant.bindingVersion,fence:grant.fence,
     revision:grant.nextRevision,commitment:grant.commitment,
     groupId:grant.groupId,recipientDeviceId:grant.recipientDeviceId,
     messageId:grant.messageId,epoch:grant.epoch,
     ciphertextHash:grant.ciphertextHash,
     ciphertextBase64:wire.toString('base64'),...overrides
   };
   return signed(body,submitEnvelopeBytes,key);
 }
 function pull(overrides={},key=recipient.privateKey){
   const body={deviceId:'bob_device',accountId:'gwap_bob',bindingVersion:1,
     fence:1,groupId:'mls_group_001',afterSeq:0,
     nonce:'nonce_test_0000001',...overrides};
   return signed(body,pullEnvelopeBytes,key);
 }
 return {ck,ds,sender,recipient,outsider,initialWire,authorize,submit,pull,
   originalCommit};
}

test('grant atomically advances checkpoint and permits only exact signed ciphertext',async()=>{
 const f=await fixture();
 const grant=f.authorize();
 const receipt=await f.ds.authorizeEnvelope(grant);
 assert.equal(receipt.revision,2);
 assert.equal(receipt.duplicate,false);
 assert.equal(verify(null,grantReceiptBytes(receipt),server.publicKey,
   Buffer.from(receipt.signature,'base64')),true);
 const accepted=await f.ds.submitEnvelope(f.submit(grant));
 assert.equal(accepted.accepted,true);
 assert.equal(accepted.duplicate,false);
 const messages=await f.ds.fetchForRecipient(f.pull());
 assert.equal(messages.messages.length,1);
 assert.equal(messages.messages[0].ciphertextBase64,
   f.initialWire.toString('base64'));
 assert.equal(messages.messages[0].messageId,grant.messageId);
 const rec=await pool.query('SELECT revision,commitment FROM messenger_checkpoint_devices WHERE device_id=$1',
   ['alice_device']);
 assert.equal(Number(rec.rows[0].revision),2);
 assert.equal(rec.rows[0].commitment,grant.commitment);
});

test('reject ciphertext before signed outbox grant and without a committed revision',async()=>{
 const f=await fixture();
 await assert.rejects(f.ds.submitEnvelope(f.submit()),/No independently committed envelope authorization/);
 const counts=await pool.query('SELECT COUNT(*)::integer AS total FROM messenger_opaque_deliveries');
 assert.equal(counts.rows[0].total,0);
});

test('refuse grant for stranger or recipient not in the conversation',async()=>{
 const f=await fixture();
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({
   recipientDeviceId:'eve_device'
 })),/Unauthorized group member/);
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({
   deviceId:'eve_device',accountId:'gwap_eve'
 },f.outsider.privateKey)),/Unauthorized group member/);
 assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_envelope_grants')).rows[0].n,0);
});

test('the outbox authorization and state checkpoint are one atomic PG transaction',async()=>{
 const f=await fixture(),request=f.authorize();
 await assert.rejects(f.ds.authorizeEnvelope(request,{injectFailure:true}),/Injected rollback/);
 const state=await pool.query('SELECT revision FROM messenger_checkpoint_devices WHERE device_id=$1',['alice_device']);
 assert.equal(Number(state.rows[0].revision),1);
 const grants=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_envelope_grants');
 assert.equal(grants.rows[0].n,0);
 assert.equal((await f.ds.authorizeEnvelope(request)).revision,2);
});

test('grant and delivery are idempotent but conflicting reuse is rejected',async()=>{
 const f=await fixture(),a=f.authorize();
 await f.ds.authorizeEnvelope(a);
 assert.equal((await f.ds.authorizeEnvelope(a)).duplicate,true);
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({
   ciphertextHash:envelopeHash(randomBytes(128))
 })),/Idempotency collision/);
 const first=f.submit(a);
 assert.equal((await f.ds.submitEnvelope(first)).duplicate,false);
 assert.equal((await f.ds.submitEnvelope(first)).duplicate,true);
 const different=randomBytes(123);
 await assert.rejects(f.ds.submitEnvelope(f.submit(a,different)),/Ciphertext hash mismatch/);
 await assert.rejects(f.ds.submitEnvelope(f.submit(a,f.initialWire,{
   messageId:'msg_0000002'
 })),/No independently committed envelope authorization/);
 const n=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_opaque_deliveries');
 assert.equal(n.rows[0].n,1);
});

test('two competing checkpoint+grant requests cannot both advance one sender revision',async()=>{
 const f=await fixture();
 const a=f.authorize({idempotencyKey:'race_0000001'});
 const b=f.authorize({messageId:'msg_0000002',
   idempotencyKey:'race_0000002',ciphertextHash:envelopeHash(randomBytes(256))});
 const settled=await Promise.allSettled([f.ds.authorizeEnvelope(a),f.ds.authorizeEnvelope(b)]);
 assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(settled.filter(x=>x.status==='rejected').length,1);
 assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_envelope_grants')).rows[0].n,1);
});

test('old pending envelope can be delivered after later checkpoint; revoked device still fails',async()=>{
 const f=await fixture(),first=f.authorize();
 await f.ds.authorizeEnvelope(first);
 const wire2=randomBytes(300);
 const second=f.authorize({
   expectedRevision:2,nextRevision:3,commitment:sha256Hex('state-rev3'),
   idempotencyKey:'commit_000002',messageId:'msg_0000002',
   ciphertextHash:envelopeHash(wire2)
 });
 await f.ds.authorizeEnvelope(second);
 assert.equal((await f.ds.submitEnvelope(f.submit(first))).accepted,true);
 assert.equal((await f.ds.submitEnvelope(f.submit(second,wire2))).accepted,true);
 const got=await f.ds.fetchForRecipient(f.pull());
 assert.deepEqual(got.messages.map(m=>m.messageId),['msg_0000001','msg_0000002']);
 await f.ck.revokeFixture('alice_device',2);
 await assert.rejects(f.ds.submitEnvelope(f.submit(first)),/Unknown or revoked device/);
});

test('expired grant, stale writer fence, incorrect state and signature are refused',async()=>{
 const f=await fixture(),a=f.authorize();
 await f.ds.authorizeEnvelope(a);
 await assert.rejects(f.ds.submitEnvelope(f.submit(a,f.initialWire,{
   revision:1
 })),/Envelope not included in authorized checkpoint/);
 await assert.rejects(f.ds.submitEnvelope(f.submit(a,f.initialWire,{
   commitment:sha256Hex('not committed')
 })),/Envelope not included in authorized checkpoint/);
 const wrongSig=f.submit(a,f.initialWire,{},
   f.outsider.privateKey);
 await assert.rejects(f.ds.submitEnvelope(wrongSig),/Invalid device signature/);
 await pool.query('UPDATE messenger_envelope_grants SET expires_at=NOW()-$1::interval WHERE sender_device_id=$2',
   ['1 minute','alice_device']);
 await assert.rejects(f.ds.submitEnvelope(f.submit(a)),/authorization expired/);
 await f.ck.rotateFenceFixture('alice_device');
 await assert.rejects(f.ds.submitEnvelope(f.submit(a)),/Stale writer fence/);
});

test('recipient signed cursor sync cannot be used by outsider, replayed, or after revocation',async()=>{
 const f=await fixture(),a=f.authorize();
 await f.ds.authorizeEnvelope(a);
 await f.ds.submitEnvelope(f.submit(a));
 await assert.rejects(f.ds.fetchForRecipient(f.pull({},f.outsider.privateKey)),
   /Invalid device signature/);
 await assert.rejects(f.ds.fetchForRecipient(f.pull({
   deviceId:'eve_device',accountId:'gwap_eve'
 },f.outsider.privateKey)),/Unauthorized group member/);
 const first=await f.ds.fetchForRecipient(f.pull());
 assert.equal(first.messages.length,1);
 await assert.rejects(f.ds.fetchForRecipient(f.pull()),/duplicate key|unique constraint/i);
 const cursor=first.messages[0].seq;
 const later=await f.ds.fetchForRecipient(f.pull({afterSeq:cursor,nonce:'nonce_test_0000002'}));
 assert.equal(later.messages.length,0);
 await f.ck.revokeFixture('bob_device',2);
 await assert.rejects(f.ds.fetchForRecipient(f.pull({nonce:'nonce_test_0000003'})),
   /Unknown or revoked device/);
});

test('removing recipient from group blocks new sends and recipient sync',async()=>{
 const f=await fixture(),a=f.authorize();
 await f.ds.authorizeEnvelope(a);
 await f.ds.disableGroupMemberFixture('mls_group_001','bob_device');
 await assert.rejects(f.ds.submitEnvelope(f.submit(a)),/Unauthorized group member/);
 await assert.rejects(f.ds.fetchForRecipient(f.pull()),/Unauthorized group member/);
});

test('checkpoint/revision policy rejects forged grant and wrong account',async()=>{
 const f=await fixture();
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({},f.outsider.privateKey)),
   /Invalid device signature/);
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({accountId:'gwap_other'})),
   /Wrong account/);
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({fence:5})),
   /Stale writer fence/);
 await assert.rejects(f.ds.authorizeEnvelope(f.authorize({expectedRevision:2,nextRevision:3})),
   /Stale checkpoint CAS revision/);
});

test('signed grant receipt does not expose secret keys or plaintext in stored database schema',async()=>{
 const f=await fixture(),a=f.authorize();
 await f.ds.authorizeEnvelope(a);
 await f.ds.submitEnvelope(f.submit(a));
 const columns=await pool.query(
   "SELECT table_name,column_name FROM information_schema.columns WHERE table_name = ANY($1)",
   [['messenger_envelope_grants','messenger_opaque_deliveries']]);
 const names=columns.rows.map(x=>x.column_name);
 for(const field of ['plaintext','group_secret','sender_ratchet','private_key','mls_tree']){
   assert.ok(!names.includes(field),'Forbidden column '+field);
 }
 const wire=await pool.query('SELECT ciphertext FROM messenger_opaque_deliveries');
 assert.ok(Buffer.from(wire.rows[0].ciphertext).equals(f.initialWire));
});

test('a second independent PostgreSQL pool can resume queued DS delivery',async()=>{
 const f=await fixture(),a=f.authorize();
 await f.ds.authorizeEnvelope(a);
 const secondPool=new Pool({connectionString:url,max:2});
 try{
   const reloaded=new PostgresEnvelopeDS({pool:secondPool,serverSigningKey:server.privateKey});
   assert.equal((await reloaded.submitEnvelope(f.submit(a))).accepted,true);
   const inbox=await reloaded.fetchForRecipient(f.pull());
   assert.equal(inbox.messages.length,1);
 }finally{await secondPool.end()}
});

test('concurrent recipient membership removal cannot be bypassed during delivery',async()=>{
 const f=await fixture(),grant=f.authorize();
 await f.ds.authorizeEnvelope(grant);
 const db=await pool.connect();
 try{
   await db.query('BEGIN');
   await db.query('UPDATE messenger_test_group_members SET active=FALSE'+
     ' WHERE group_id=$1 AND device_id=$2',['mls_group_001','bob_device']);
   const concurrent=f.ds.submitEnvelope(f.submit(grant)).then(
     x=>({accepted:x.accepted}),e=>({error:String(e.message||e)}));
   await new Promise(resolve=>setTimeout(resolve,40));
   await db.query('COMMIT');
   const outcome=await concurrent;
   assert.match(outcome.error||'',/Unauthorized group member/);
   const rows=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_opaque_deliveries');
   assert.equal(rows.rows[0].n,0);
 }finally{
   try{await db.query('ROLLBACK')}catch{}
   db.release();
 }
});

test('concurrent device revocation cannot be bypassed during delivery',async()=>{
 const f=await fixture(),grant=f.authorize();
 await f.ds.authorizeEnvelope(grant);
 const db=await pool.connect();
 try{
   await db.query('BEGIN');
   await db.query('UPDATE messenger_checkpoint_devices SET revoked=TRUE,'+
     ' binding_version=2,fence=fence+1 WHERE device_id=$1',['bob_device']);
   const concurrent=f.ds.submitEnvelope(f.submit(grant)).then(
     x=>({accepted:x.accepted}),e=>({error:String(e.message||e)}));
   await new Promise(resolve=>setTimeout(resolve,40));
   await db.query('COMMIT');
   const outcome=await concurrent;
   assert.match(outcome.error||'',/Unknown or revoked device/);
   const rows=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_opaque_deliveries');
   assert.equal(rows.rows[0].n,0);
 }finally{
   try{await db.query('ROLLBACK')}catch{}
   db.release();
 }
});

test('fixture group-admin methods are disabled by default',async()=>{
 const f=await fixture();
 const service=new PostgresEnvelopeDS({pool,serverSigningKey:server.privateKey});
 await assert.rejects(service.addGroupMemberFixture('mls_group_001','eve_device'),/forbidden/);
 await assert.rejects(service.disableGroupMemberFixture('mls_group_001','bob_device'),/forbidden/);
});
