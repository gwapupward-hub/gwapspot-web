// GWAP Messenger: isolated Chromium OpenMLS WASM → PostgreSQL DS → signed recipient
// sync → actual OpenMLS decryption. TEST FIXTURE ONLY; no GNS or production app.
// Alice and Bob are artificially colocated in a single browser MemoryStorage snapshot.
import {chromium} from 'playwright-core';
import pg from 'pg';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,randomBytes,randomUUID,sign,verify} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PostgresCheckpointAuthority,advanceBytes,sha256Hex} from '../checkpoint/durable-checkpoint.mjs';
import {PostgresEnvelopeDS,authorizeEnvelopeBytes,submitEnvelopeBytes,
  pullEnvelopeBytes,grantReceiptBytes,envelopeHash} from '../checkpoint/pg-envelope-ds.mjs';

const testDb=process.env.CHECKPOINT_TEST_DATABASE_URL;
if(!testDb?.includes('gwap_checkpoint_test'))throw Error('Refusing non-isolated PostgreSQL URL');
const {Pool}=pg;
const pool=new Pool({connectionString:testDb,max:8,connectionTimeoutMillis:3000});
const webroot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const server=createServer(async(req,res)=>{
  try{
    const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(webroot,'.'+rel);
    if(!file.startsWith(webroot+sep)){res.writeHead(403).end();return;}
    const mime=file.endsWith('.wasm')?'application/wasm':
      file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream';
    res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});
    res.end(await readFile(file));
  }catch(e){res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port+'/browser-test/index.html';
const profile=await mkdtemp(join(tmpdir(),'gwap-pg-wasm-e2e-'));
let chrome,page;
const evidence=[];
const senderKeys=generateKeyPairSync('ed25519'),
  recipientKeys=generateKeyPairSync('ed25519'),
  outsiderKeys=generateKeyPairSync('ed25519'),
  serverKeys=generateKeyPairSync('ed25519');
const identifiers={
  sender:{deviceId:'alice_device',accountId:'gwap_alice'},
  recipient:{deviceId:'bob_device',accountId:'gwap_bob'},
  outsider:{deviceId:'eve_device',accountId:'gwap_eve'}
};
function signed(fields,makeBytes,key){return {...fields,
  signature:sign(null,makeBytes(fields),key).toString('base64')};}
async function openChrome(){
  chrome=await chromium.launchPersistentContext(profile,{
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    headless:true,args:['--no-sandbox']
  });
  page=chrome.pages()[0]||await chrome.newPage();
  page.on('pageerror',e=>console.error('pageerror',e.message));
  await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__fixtureReady!==undefined,{timeout:30000});
  assert.equal(await page.evaluate(()=>window.__fixtureReady),true,
    await page.evaluate(()=>window.__fixtureError));
}
async function execute(name,...params){
  return page.evaluate(async([n,args])=>window.__outbox[n](...args),[name,params]);
}
async function getSnapshot(){
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open('gwap-mls-atomic-outbox-spike-v1');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    try{return await new Promise((resolve,reject)=>{
      const r=db.transaction('records','readonly').objectStore('records').get('snapshot');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });}
    finally{db.close();}
  });
}
async function peek(){
  const o=await page.evaluate(async()=>{
    const v=await window.__outbox.peek();
    return {revision:v.revision,groupId:v.groupId,
      bytes:Array.from(v.ciphertext)};
  });
  return {...o,wire:Buffer.from(o.bytes)};
}
function authorize(snapshot,wire,round,groupId){
  return signed({
    ...identifiers.sender,bindingVersion:1,fence:1,
    expectedRevision:round-1,nextRevision:round,
    commitment:sha256Hex(JSON.stringify(snapshot)),
    idempotencyKey:'intent_message_000'+round,
    groupId,recipientDeviceId:identifiers.recipient.deviceId,
    messageId:'message_000000'+round,epoch:1,
    ciphertextHash:envelopeHash(wire)
  },authorizeEnvelopeBytes,senderKeys.privateKey);
}
function submit(grant,wire){
  return signed({
    ...identifiers.sender,bindingVersion:1,fence:1,
    revision:grant.nextRevision,commitment:grant.commitment,
    groupId:grant.groupId,recipientDeviceId:grant.recipientDeviceId,
    messageId:grant.messageId,epoch:grant.epoch,
    ciphertextHash:grant.ciphertextHash,ciphertextBase64:wire.toString('base64')
  },submitEnvelopeBytes,senderKeys.privateKey);
}
function pull(groupId,afterSeq=0,key=recipientKeys.privateKey,device=identifiers.recipient){
  return signed({
    ...device,bindingVersion:1,fence:1,groupId,afterSeq,
    nonce:'pull_'+randomUUID().replaceAll('-','')
  },pullEnvelopeBytes,key);
}
function advanceLocal(revBefore,revAfter,snapshot){
  return signed({
    ...identifiers.sender,bindingVersion:1,fence:1,
    expectedRevision:revBefore,nextRevision:revAfter,
    commitment:sha256Hex(JSON.stringify(snapshot)),
    idempotencyKey:'state_checkpoint_000'+revAfter
  },advanceBytes,senderKeys.privateKey);
}
async function enroll(ck,device,keys,rev1){
  return ck.provisionFixture({
    ...device,bindingVersion:1,
    publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}),
    revision:1,commitment:sha256Hex(JSON.stringify(rev1))
  });
}
async function expectReject(promise,re){
  await assert.rejects(promise,re);
}
try{
  const schemas=await Promise.all([
    readFile(new URL('../checkpoint/pg-schema.sql',import.meta.url),'utf8'),
    readFile(new URL('../checkpoint/pg-envelope-schema.sql',import.meta.url),'utf8')
  ]);
  for(const schema of schemas)await pool.query(schema);
  await pool.query('TRUNCATE messenger_test_recipient_pull_nonces,'+
    'messenger_opaque_deliveries,messenger_envelope_grants,'+
    'messenger_test_group_members,messenger_checkpoint_receipts,'+
    'messenger_checkpoint_devices RESTART IDENTITY CASCADE');
  const ck=new PostgresCheckpointAuthority({pool,serverSigningKey:serverKeys.privateKey,
    allowFixtureAdministration:true});
  const ds=new PostgresEnvelopeDS({pool,serverSigningKey:serverKeys.privateKey,
    allowFixtureAdministration:true});
  await openChrome();
  await execute('reset');
  assert.equal(await execute('initialize'),1);
  const snap1=await getSnapshot();
  assert.equal(snap1.revision,1);
  for(const [device,keys] of [
    [identifiers.sender,senderKeys],
    [identifiers.recipient,recipientKeys],
    [identifiers.outsider,outsiderKeys]
  ])await enroll(ck,device,keys,snap1);
  evidence.push('initialized MLS group and independently enrolled fixture signing devices');

  const firstSend=await execute('send',1,'GWAP end-to-end ciphertext roundtrip one',0);
  assert.equal(firstSend.revision,2);
  const first=await peek();
  assert.equal(first.revision,2);
  assert.equal(first.wire.includes(Buffer.from('GWAP end-to-end ciphertext')),false);
  await ds.addGroupMemberFixture(first.groupId,identifiers.sender.deviceId);
  await ds.addGroupMemberFixture(first.groupId,identifiers.recipient.deviceId);
  const snap2=await getSnapshot();
  const g2=authorize(snap2,first.wire,2,first.groupId);
  const s2=submit(g2,first.wire);
  await expectReject(ds.submitEnvelope(s2),/No independently committed envelope authorization/);
  const granted=await ds.authorizeEnvelope(g2);
  assert.equal(verify(null,grantReceiptBytes(granted),serverKeys.publicKey,
    Buffer.from(granted.signature,'base64')),true);
  const acceptance=await ds.submitEnvelope(s2);
  assert.equal(acceptance.duplicate,false);
  assert.equal((await ds.submitEnvelope(s2)).duplicate,true);
  evidence.push('actual OpenMLS PrivateMessage granted and stored in PostgreSQL only after state checkpoint');

  await expectReject(ds.fetchForRecipient(pull(first.groupId,0,outsiderKeys.privateKey)),
    /Invalid device signature/);
  await expectReject(ds.fetchForRecipient(pull(first.groupId,0,
    outsiderKeys.privateKey,identifiers.outsider)),/Unauthorized group member/);
  const inbox=await ds.fetchForRecipient(pull(first.groupId));
  assert.equal(inbox.messages.length,1);
  assert.equal(inbox.messages[0].ciphertextBase64,first.wire.toString('base64'));
  evidence.push('recipient Ed25519 signature and fixture group membership restrict opaque inbox fetch');

  const bytes=Buffer.from(inbox.messages[0].ciphertextBase64,'base64');
  const received=await execute('deliverFromDs',2,0,Array.from(bytes));
  assert.equal(received.plaintext,'GWAP end-to-end ciphertext roundtrip one');
  assert.equal(received.revision,3);
  await expectReject(execute('deliverFromDs',2,0,Array.from(bytes)),/Stale deliver caller revision/);
  evidence.push('actual DS-retrieved MLS ciphertext decrypted; retry rejected after local ratchet advanced');

  const snap3=await getSnapshot();
  const advancement=await ck.advance(advanceLocal(2,3,snap3));
  assert.equal(advancement.revision,3);

  await chrome.close();chrome=undefined;page=undefined;
  await openChrome();
  assert.deepEqual(await execute('status'),{revision:3,pending:0,delivered:1});
  const secondSend=await execute('send',3,'second GWAP ciphertext after browser restart',0);
  assert.equal(secondSend.revision,4);
  const second=await peek();
  assert.equal(second.groupId,first.groupId);
  const snap4=await getSnapshot();
  const g4=authorize(snap4,second.wire,4,second.groupId);
  await ds.authorizeEnvelope(g4);
  await ds.submitEnvelope(submit(g4,second.wire));
  const later=await ds.fetchForRecipient(pull(second.groupId,acceptance.seq));
  assert.equal(later.messages.length,1);
  assert.equal(later.messages[0].messageId,g4.messageId);
  const again=await execute('deliverFromDs',4,0,
    Array.from(Buffer.from(later.messages[0].ciphertextBase64,'base64')));
  assert.equal(again.plaintext,'second GWAP ciphertext after browser restart');
  evidence.push('browser process restart preserved sender/receiver MLS state and authenticated cursor sync');

  await ds.disableGroupMemberFixture(first.groupId,identifiers.recipient.deviceId);
  await expectReject(ds.fetchForRecipient(pull(first.groupId)),
    /Unauthorized group member/);
  await ck.revokeFixture(identifiers.sender.deviceId,2);
  await expectReject(ds.submitEnvelope(submit(g4,second.wire)),/Unknown or revoked device/);
  evidence.push('fixture recipient membership removal and sender revocation fail closed');

  const plaintextCols=await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name=$1",
    ['messenger_opaque_deliveries']);
  assert.equal(plaintextCols.rows.some(x=>/plaintext|private_key|group_secret|ratchet/.test(x.column_name)),false);
  console.log(JSON.stringify({result:'PASS',
    environment:'real Chromium OpenMLS WASM + ephemeral PostgreSQL 16',
    verified:evidence},null,2));
}finally{
  if(chrome)await chrome.close();
  server.close();
  await pool.end();
  await rm(profile,{recursive:true,force:true});
}
