// Isolated real Chromium + OpenMLS + independent SQLite checkpoint integration.
// Test controller, NOT an enforcement mechanism within the GWAP Messenger client.
// Uses fixture-generated Ed25519 identity; NO GNS account or actual DS.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { join,resolve,sep,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync,randomBytes,sign } from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalIntent,canonicalResume,canonicalDelivery,sha256Hex} from '../checkpoint/monotonic-checkpoint.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const site=createServer(async(req,res)=>{
  try {
    const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
    const body=await readFile(file);
    const mime=file.endsWith('.wasm')?'application/wasm':
      file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream';
    res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});
    res.end(body);
  } catch(e) {res.writeHead(404).end('Not found');}
});
await new Promise(r=>site.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+site.address().port+'/browser-test/index.html';
const dir=await mkdtemp(join(tmpdir(),'gwap-browser-checkpoint-'));
const profile=join(dir,'chrome');
const database=join(dir,'remote-anchor.db');
const admin=randomBytes(24).toString('hex');
const keys=generateKeyPairSync('ed25519');
const deviceId='fixture_device_A',accountId='gwap_fixture_A',bindingVersion=1;
let service,serviceUrl,browser,page;
const evidence=[];
async function startService(){
  service=spawn(process.execPath,[new URL('../checkpoint/sqlite-server.mjs',import.meta.url).pathname],{
    env:{...process.env,GWAP_TEST_ONLY:'YES',GWAP_SQLITE_TEST_DB:database,
      GWAP_ADMIN_TEST_TOKEN:admin},
    stdio:['ignore','pipe','pipe']
  });
  let stderr='';
  service.stderr.on('data',d=>{stderr+=d.toString();});
  const ready=await new Promise((resolveReady,reject)=>{
    let buf='';
    const timer=setTimeout(()=>reject(new Error('checkpoint service timeout '+stderr)),15000);
    service.stdout.on('data',b=>{
      buf+=b.toString();
      if(buf.includes('\n')){
        clearTimeout(timer);
        try {resolveReady(JSON.parse(buf.split('\n')[0]));}
        catch(e){reject(e);}
      }
    });
    service.once('exit',code=>{clearTimeout(timer);reject(new Error('early exit '+code+stderr));});
  });
  serviceUrl='http://127.0.0.1:'+ready.port;
}
async function post(route,body,headers={}){
  const r=await fetch(serviceUrl+route,{
    method:'POST',
    headers:{'content-type':'application/json',...headers},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(10000)
  });
  return {status:r.status,body:await r.json()};
}
async function startBrowser(){
  browser=await chromium.launchPersistentContext(profile,{
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  page=browser.pages()[0]||await browser.newPage();
  await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__fixtureReady!==undefined,{timeout:30000});
  assert.equal(await page.evaluate(()=>window.__fixtureReady),true,
    await page.evaluate(()=>window.__fixtureError));
}
async function wasm(name,...params){
  return page.evaluate(async([n,p])=>window.__outbox[n](...p),[name,params]);
}
async function snapshot(){
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('gwap-mls-atomic-outbox-spike-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try {
      return await new Promise((resolve,reject)=>{
        const request=db.transaction('records','readonly').objectStore('records').get('snapshot');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
    } finally {db.close();}
  });
}
async function setSnapshot(value){
  await page.evaluate(async(saved)=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('gwap-mls-atomic-outbox-spike-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try {
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('records','readwrite');
        tx.objectStore('records').put(saved,'snapshot');
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
    } finally {db.close();}
  },value);
}
function commitment(record) {
  assert.equal(record.version,1);
  return sha256Hex(JSON.stringify(record));
}
function signedAdvance(record,expected,token,fence=1){
  const intent={deviceId,accountId,bindingVersion,fence,
    expectedRevision:expected,nextRevision:record.revision,
    commitment:commitment(record),idempotencyKey:token};
  return {...intent,signature:sign(null,canonicalIntent(intent),keys.privateKey).toString('base64')};
}
function signedResume(record){
  const intent={deviceId,accountId,bindingVersion,
    localRevision:record.revision,localCommitment:commitment(record)};
  return {...intent,signature:sign(null,canonicalResume(intent),keys.privateKey).toString('base64')};
}
async function pendingWire(){
  return page.evaluate(async()=>{
    const item=await window.__outbox.peek();
    let ascii='';
    for(const byte of item.ciphertext)ascii+=String.fromCharCode(byte);
    return {revision:item.revision,groupId:item.groupId,ciphertextBase64:btoa(ascii)};
  });
}
function signedDelivery(record,pending,messageId,fence=1){
  const intent={deviceId,accountId,bindingVersion,fence,
    revision:record.revision,commitment:commitment(record),
    groupId:pending.groupId,messageId,
    ciphertextHash:sha256Hex(Buffer.from(pending.ciphertextBase64,'base64'))};
  return {...intent,ciphertextBase64:pending.ciphertextBase64,
    signature:sign(null,canonicalDelivery(intent),keys.privateKey).toString('base64')};
}
async function fixtureDelivered(){
  const r=await post('/fixture/list-deliveries',{deviceId},{'x-fixture-admin':admin});
  assert.equal(r.status,200);
  return r.body.deliveries;
}
async function gate(record){
  const check=await post('/checkpoint/resume',signedResume(record));
  if(check.status!==200||check.body.allowDelivery!==true)
    throw new Error('Checkpoint failed closed: '+JSON.stringify(check));
  return check;
}
try {
  await startService();
  await startBrowser();
  await wasm('reset');
  assert.equal(await wasm('initialize'),1);
  const rev1=await snapshot();
  assert.equal(rev1.revision,1);
  const bootstrap=await post('/fixture/register',{
    deviceId,accountId,bindingVersion,revision:1,
    publicSpkiBase64:keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),
    commitment:commitment(rev1)
  },{'x-fixture-admin':admin});
  assert.equal(bootstrap.status,200);
  assert.equal((await gate(rev1)).body.revision,1);
  evidence.push('signed fixture device enrolled against independently stored rev1 ciphertext commitment');

  // Generate a real OpenMLS sender message and atomically save its ratchet+outbox.
  const sent=await wasm('send',1,'first remote-checkpointed MLS message',0);
  assert.equal(sent.revision,2);
  const rev2=await snapshot();
  const wire2=await pendingWire();
  assert.equal(wire2.revision,2);
  const submit2=signedDelivery(rev2,wire2,'mls_ciphertext_000002');
  const premature=await post('/delivery/submit',submit2);
  assert.equal(premature.status,409);
  assert.match(premature.body.error,/Unanchored local state/);
  assert.equal((await fixtureDelivered()).length,0);
  evidence.push('delivery server refused real signed MLS ciphertext until independent checkpoint advanced');

  const advance2=signedAdvance(rev2,1,'intent-000002');
  const ack2=await post('/checkpoint/advance',advance2);
  assert.equal(ack2.status,200);
  assert.equal((await gate(rev2)).body.revision,2);
  const dsAccepted=await post('/delivery/submit',submit2);
  assert.equal(dsAccepted.status,200);
  assert.equal(dsAccepted.body.duplicate,false);
  assert.equal((await post('/delivery/submit',submit2)).body.duplicate,true);
  const acceptedWire=await fixtureDelivered();
  assert.equal(acceptedWire.length,1);
  assert.equal(acceptedWire[0].ciphertextBase64,wire2.ciphertextBase64);
  assert.equal(Buffer.from(acceptedWire[0].ciphertextBase64,'base64')
    .includes(Buffer.from('first remote-checkpointed MLS message')),false);
  evidence.push('actual MLS PrivateMessage passed signed server fence and was persisted once without plaintext');

  // Explicit hostile whole-local-snapshot rollback: same valid AES-GCM encrypted bytes
  // but an older revision. The remote checkpoint MUST deny delivery.
  await setSnapshot(rev1);
  let denied=false;
  try {await gate(await snapshot());}catch(e){denied=/rollback detected/.test(String(e));}
  assert.equal(denied,true,'old but authentic encrypted snapshot must fail closed');
  assert.equal((await wasm('status')).revision,1);
  const rolledBackSend=signedDelivery(rev1,wire2,'mls_rollback_attempt');
  const dsRejected=await post('/delivery/submit',rolledBackSend);
  assert.equal(dsRejected.status,409);
  assert.match(dsRejected.body.error,/Rolled-back sender state/);
  await setSnapshot(rev2);
  assert.equal((await gate(await snapshot())).body.revision,2);
  evidence.push('attacker-restored old valid encrypted browser snapshot rejected; restoring rev2 allowed');

  // Another outbound message stored locally, followed by actual checkpoint SIGKILL
  // after SQLite commit. Browser has not delivered message yet.
  assert.equal((await wasm('send',2,'second anchored MLS message',0)).revision,3);
  const rev3=await snapshot();
  const advance3=signedAdvance(rev3,2,'intent-000003');
  const processDead=once(service,'exit');
  let networkLost=false;
  try {await post('/checkpoint/advance',advance3,{'x-fixture-kill-after-commit':admin});}
  catch(e){networkLost=true;}
  assert.equal(networkLost,true);
  assert.equal((await processDead)[1],'SIGKILL');
  let checkpointUnavailable=false;
  try {await gate(rev3);}catch(e){checkpointUnavailable=true;}
  assert.equal(checkpointUnavailable,true);
  assert.equal((await wasm('status')).pending,2);
  evidence.push('server killed after committed rev3; no local delivery executed during authority outage');

  await browser.close();browser=undefined;page=undefined;
  await startService(); // same durable database, independent process
  await startBrowser(); // same browser profile, independent process
  const recovered=await snapshot();
  assert.equal(recovered.revision,3);
  assert.equal((await gate(recovered)).body.revision,3);
  const replay=await post('/checkpoint/advance',advance3);
  assert.equal(replay.status,200);
  assert.equal(replay.body.duplicate,true);
  evidence.push('browser and checkpoint processes restarted; rev3 independently verified and duplicate signed receipt recovered');

  const first=await wasm('deliver',3,0);
  assert.equal(first.plaintext,'first remote-checkpointed MLS message');
  const rev4=await snapshot();
  assert.equal((await post('/checkpoint/advance',
    signedAdvance(rev4,3,'intent-000004'))).status,200);
  await gate(rev4);
  const wire4=await pendingWire();
  assert.equal(wire4.revision,4);
  const submit4=signedDelivery(rev4,wire4,'mls_ciphertext_000004');
  const dsSecond=await post('/delivery/submit',submit4);
  assert.equal(dsSecond.status,200);
  assert.equal((await fixtureDelivered()).length,2);
  evidence.push('second real MLS ciphertext submitted through server gate after resumed checkpoint');
  const second=await wasm('deliver',4,0);
  assert.equal(second.plaintext,'second anchored MLS message');
  const rev5=await snapshot();
  assert.equal((await post('/checkpoint/advance',
    signedAdvance(rev5,4,'intent-000005'))).status,200);
  assert.equal((await gate(rev5)).body.revision,5);
  assert.deepEqual(await wasm('status'),{revision:5,pending:0,delivered:2});
  evidence.push('two real MLS ciphertexts decrypted after server-side delivery acceptance and checkpoint recovery');
  assert.equal((await post('/fixture/revoke',{deviceId,nextBindingVersion:2},
    {'x-fixture-admin':admin})).status,200);
  const revoked=await post('/delivery/submit',submit4);
  assert.equal(revoked.status,409);
  assert.match(revoked.body.error,/revoked device/);
  assert.equal((await fixtureDelivered()).length,2);
  evidence.push('test-only domain/device revocation immediately blocked new server delivery authorization');

  console.log(JSON.stringify({result:'PASS',environment:'Chromium OpenMLS WASM + separate SQLite checkpoint process',
    claims:evidence},null,2));
}finally {
  if(browser)await browser.close();
  if(service&&service.exitCode===null&&service.signalCode===null){
    const done=once(service,'exit');
    service.kill('SIGTERM');
    await done;
  }
  site.close();
  await rm(dir,{recursive:true,force:true});
}
