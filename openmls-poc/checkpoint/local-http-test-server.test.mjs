import test, {before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {
  PostgresCheckpointAuthority,advanceBytes,resumeBytes,verifyReceipt,sha256Hex
} from './durable-checkpoint.mjs';
import {createLocalCheckpointTestServer} from './local-http-test-server.mjs';

const {Pool}=pg;
const url=process.env.CHECKPOINT_TEST_DATABASE_URL;
if(!url || !url.includes('gwap_checkpoint_test')) throw Error('Isolated database required');
const pool=new Pool({connectionString:url,max:5});
const serverKey=generateKeyPairSync('ed25519');
let authority,server,origin;

before(async()=>{
  await pool.query(await readFile(new URL('./pg-schema.sql',import.meta.url),'utf8'));
  authority=new PostgresCheckpointAuthority({
    pool,serverSigningKey:serverKey.privateKey,allowFixtureAdministration:true
  });
  server=createLocalCheckpointTestServer(authority);
  origin=await server.listen();
  assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
});
beforeEach(async()=>{
  await pool.query('TRUNCATE messenger_checkpoint_receipts,messenger_checkpoint_devices CASCADE');
});
after(async()=>{await server?.close();await pool.end();});

async function fixture(){
  const deviceKey=generateKeyPairSync('ed25519');
  const accountId='gwap_http_fixture';
  const deviceId='device-http';
  await authority.provisionFixture({deviceId,accountId,bindingVersion:1,
    publicKeyPem:deviceKey.publicKey.export({format:'pem',type:'spki'}),
    revision:1,commitment:sha256Hex('http-state-v1')});
  const advance=(extras={})=>{
    const req={deviceId,accountId,bindingVersion:1,fence:1,
      expectedRevision:1,nextRevision:2,commitment:sha256Hex('http-state-v2'),
      idempotencyKey:'http-advance-0001',...extras};
    return {...req,signature:sign(null,advanceBytes(req),deviceKey.privateKey).toString('base64')};
  };
  const resume=(extras={})=>{
    const req={deviceId,accountId,bindingVersion:1,fence:1,
      localRevision:1,localCommitment:sha256Hex('http-state-v1'),...extras};
    return {...req,signature:sign(null,resumeBytes(req),deviceKey.privateKey).toString('base64')};
  };
  return {deviceId,advance,resume,deviceKey};
}
async function post(route,payload,contentType='application/json'){
  const response=await fetch(origin+route,{method:'POST',
    headers:{'Content-Type':contentType},
    body:contentType==='application/json'?JSON.stringify(payload):String(payload)});
  return {status:response.status,
    headers:response.headers,
    data:await response.json()};
}
test('localhost HTTP signed advance/resume returns verifiable receipts and no-store',async()=>{
  const f=await fixture(),r=f.advance();
  const result=await post('/v0/checkpoint/advance',r);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.data.revision,2);
  assert.equal(verifyReceipt(result.data,serverKey.publicKey),true);
  const resume=await post('/v0/checkpoint/resume',
    f.resume({localRevision:2,localCommitment:r.commitment}));
  assert.equal(resume.status,200);
  assert.equal(verifyReceipt(resume.data,serverKey.publicKey),true);
  assert.ok(resume.data.expiresAt>Date.now());
});
test('HTTP exact duplicate returns durable idempotent result',async()=>{
  const f=await fixture(),request=f.advance();
  assert.equal((await post('/v0/checkpoint/advance',request)).data.duplicate,false);
  const reply=await post('/v0/checkpoint/advance',request);
  assert.equal(reply.status,200);
  assert.equal(reply.data.duplicate,true);
  assert.equal(verifyReceipt(reply.data,serverKey.publicKey),true);
});
test('HTTP rejects forged signatures, rolled-back snapshots and revoked devices',async()=>{
  const f=await fixture(),payload=f.advance();
  const attacker=generateKeyPairSync('ed25519');
  const invalid={...payload,signature:sign(null,advanceBytes(payload),
    attacker.privateKey).toString('base64')};
  assert.equal((await post('/v0/checkpoint/advance',invalid)).status,403);
  assert.equal((await post('/v0/checkpoint/advance',payload)).status,200);
  assert.equal((await post('/v0/checkpoint/resume',f.resume())).status,409);
  await authority.revokeFixture(f.deviceId,2);
  assert.equal((await post('/v0/checkpoint/resume',
    f.resume({localRevision:2,localCommitment:payload.commitment}))).status,403);
});
test('HTTP rejects missing routes, public enrollment, malformed and oversized bodies',async()=>{
  await fixture();
  assert.equal((await post('/v0/checkpoint/enroll',{deviceId:'attacker'})).status,404);
  assert.equal((await post('/v0/checkpoint/advance',{},'text/plain')).status,415);
  const raw=await fetch(origin+'/v0/checkpoint/advance',{method:'POST',
    headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(raw.status,400);
  const large=await fetch(origin+'/v0/checkpoint/advance',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'x'.repeat(9000)})});
  assert.equal(large.status,413);
});
test('HTTP does not return a fabricated receipt during DB failure',async()=>{
  const f=await fixture();
  const unavailablePool=new Pool({connectionString:url});
  await unavailablePool.end();
  const unavailableAuthority=new PostgresCheckpointAuthority({
    pool:unavailablePool,serverSigningKey:serverKey.privateKey
  });
  const local=createLocalCheckpointTestServer(unavailableAuthority);
  const other=await local.listen();
  try{
    const resp=await fetch(other+'/v0/checkpoint/advance',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(f.advance())});
    assert.equal(resp.status,503);
    assert.deepEqual(await resp.json(),{error:'Checkpoint unavailable'});
  }finally{await local.close();}
});
test('health identifies test-only service without exposing identity information',async()=>{
  const r=await fetch(origin+'/health');
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{testOnly:true,status:'ok'});
});
