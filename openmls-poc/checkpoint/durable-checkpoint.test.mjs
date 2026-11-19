// Uses an isolated disposable PostgreSQL service in GitHub Actions.
// NO live GNS, customer records, Neon or production credentials.
import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {
 PostgresCheckpointAuthority,advanceBytes,resumeBytes,
 verifyReceipt,sha256Hex
} from './durable-checkpoint.mjs';

const {Pool}=pg;
const url=process.env.CHECKPOINT_TEST_DATABASE_URL;
if(!url || !url.includes('gwap_checkpoint_test')) {
  throw Error('Refusing to execute without isolated gwap_checkpoint_test database');
}
const pool=new Pool({connectionString:url,max:8,connectionTimeoutMillis:3000});
const serverKey=generateKeyPairSync('ed25519');
before(async()=>{
  const sql=await readFile(new URL('./pg-schema.sql',import.meta.url),'utf8');
  await pool.query(sql);
});
beforeEach(async()=>{
  await pool.query('TRUNCATE messenger_checkpoint_receipts,messenger_checkpoint_devices CASCADE');
});
after(async()=>await pool.end());

async function fixture(opts={}){
  const clientKey=generateKeyPairSync('ed25519');
  const service= new PostgresCheckpointAuthority({
    pool,serverSigningKey:serverKey.privateKey,allowFixtureAdministration:true
  });
  const deviceId=opts.deviceId||'device-test';
  const accountId='gwap_account-test';
  const commitment=sha256Hex('encrypted-snapshot-rev-1');
  await service.provisionFixture({deviceId,accountId,bindingVersion:1,
    publicKeyPem:clientKey.publicKey.export({format:'pem',type:'spki'}),
    revision:1,commitment});
  const advance=(fields={})=>{
    const r={deviceId,accountId,bindingVersion:1,fence:1,expectedRevision:1,
      nextRevision:2,commitment:sha256Hex('encrypted-snapshot-rev-2'),
      idempotencyKey:'checkpoint-id-0001',...fields};
    return {...r,signature:sign(null,advanceBytes(r),clientKey.privateKey).toString('base64')};
  };
  const resume=(fields={})=>{
    const r={deviceId,accountId,bindingVersion:1,fence:1,localRevision:1,
      localCommitment:commitment,...fields};
    return {...r,signature:sign(null,resumeBytes(r),clientKey.privateKey).toString('base64')};
  };
  return {service,clientKey,advance,resume,commitment,deviceId,accountId};
}

test('durable Ed25519 signed advance returns verifiable signed receipt',async()=>{
  const f=await fixture(),request=f.advance();
  const receipt=await f.service.advance(request);
  assert.equal(receipt.revision,2);
  assert.equal(receipt.duplicate,false);
  assert.equal(verifyReceipt(receipt,serverKey.publicKey),true);
  assert.equal(verifyReceipt({...receipt,revision:500},serverKey.publicKey),false);
  assert.equal((await f.service.resume(f.resume({
    localRevision:2,localCommitment:request.commitment}))).type,'resume');
});

test('same signed request idempotently resumes after a NEW PostgreSQL connection pool',async()=>{
  const f=await fixture(),request=f.advance();
  await f.service.advance(request);
  const anotherPool=new Pool({connectionString:url,max:2});
  try{
    const recovered=new PostgresCheckpointAuthority({
      pool:anotherPool,serverSigningKey:serverKey.privateKey
    });
    const duplicated=await recovered.advance(request);
    assert.equal(duplicated.revision,2);
    assert.equal(duplicated.duplicate,true);
    assert.equal(verifyReceipt(duplicated,serverKey.publicKey),true);
  }finally{await anotherPool.end();}
});

test('full local rollback with valid old sealed state fails independent trusted check',async()=>{
  const f=await fixture();
  await f.service.advance(f.advance());
  await assert.rejects(f.service.resume(f.resume()),/rollback/);
  await assert.rejects(f.service.resume(f.resume({
    localRevision:3,localCommitment:sha256Hex('unanchored-future-state')
  })),/Unanchored/);
});

test('same revision but altered ciphertext commitment fails closed',async()=>{
  const f=await fixture(),advance=f.advance();
  await f.service.advance(advance);
  await assert.rejects(f.service.resume(f.resume({
    localRevision:2,localCommitment:sha256Hex('different-sealed-state')
  })),/commitment mismatch/);
});

test('two concurrent writers cannot both advance the same PostgreSQL revision',async()=>{
  const f=await fixture();
  const [a,b]=await Promise.allSettled([
    f.service.advance(f.advance({idempotencyKey:'concurrent-A-0001',
      commitment:sha256Hex('A')})),
    f.service.advance(f.advance({idempotencyKey:'concurrent-B-0001',
      commitment:sha256Hex('B')}))
  ]);
  assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
  assert.equal([a,b].filter(x=>x.status==='rejected').length,1);
  const row=await pool.query(
    'SELECT revision,commitment FROM messenger_checkpoint_devices WHERE device_id=$1',
    [f.deviceId]);
  assert.equal(Number(row.rows[0].revision),2);
  assert.ok([sha256Hex('A'),sha256Hex('B')].includes(row.rows[0].commitment));
  const receipts=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_checkpoint_receipts');
  assert.equal(receipts.rows[0].n,1);
});

test('idempotency collision with a different signed intent is denied',async()=>{
  const f=await fixture();await f.service.advance(f.advance());
  await assert.rejects(f.service.advance(f.advance({
    commitment:sha256Hex('bad-reused-key')
  })),/Idempotency collision/);
});

test('injected failure after row update rolls back checkpoint AND receipt',async()=>{
  const f=await fixture();
  await assert.rejects(
    f.service.advance(f.advance(),{failAfterUpdate:true}),/Injected rollback/);
  const row=await pool.query('SELECT revision FROM messenger_checkpoint_devices');
  assert.equal(Number(row.rows[0].revision),1);
  const receipt=await pool.query('SELECT COUNT(*)::integer AS n FROM messenger_checkpoint_receipts');
  assert.equal(receipt.rows[0].n,0);
  assert.equal((await f.service.advance(f.advance())).revision,2);
});

test('stale writer fence is denied after durable fence rotation',async()=>{
  const f=await fixture();
  const newFence=await f.service.rotateFenceFixture(f.deviceId);
  assert.equal(newFence,2);
  await assert.rejects(f.service.advance(f.advance()),/Stale writer fence/);
  const accepted=await f.service.advance(f.advance({fence:newFence}));
  assert.equal(accepted.fence,2);
});

test('revoked binding refuses both resume and advancing',async()=>{
  const f=await fixture();
  await f.service.revokeFixture(f.deviceId,2);
  await assert.rejects(f.service.advance(f.advance()),/revoked/);
  await assert.rejects(f.service.resume(f.resume()),/revoked/);
});

test('forged signature, stale identity binding and wrong account are rejected',async()=>{
  const f=await fixture();
  const attacker=generateKeyPairSync('ed25519'),payload=f.advance();
  await assert.rejects(f.service.advance({
    ...payload,signature:sign(null,advanceBytes(payload),attacker.privateKey).toString('base64')
  }),/Invalid Ed25519/);
  await assert.rejects(f.service.advance(f.advance({
    accountId:'other-account'
  })),/Wrong account/);
  await assert.rejects(f.service.advance(f.advance({
    bindingVersion:2
  })),/Stale identity binding/);
});

test('resume signature is domain separated from checkpoint mutation signature',async()=>{
  const f=await fixture(),r=f.resume(),a=f.advance();
  await assert.rejects(f.service.advance({...a,signature:r.signature}),/Invalid Ed25519/);
  assert.equal((await f.service.resume(r)).type,'resume');
});

test('fixture administration fails closed without explicit test flag',async()=>{
  const f=await fixture();
  const productionDefault=new PostgresCheckpointAuthority({
    pool,serverSigningKey:serverKey.privateKey
  });
  await assert.rejects(productionDefault.rotateFenceFixture(f.deviceId),/forbidden/);
  await assert.rejects(productionDefault.revokeFixture(f.deviceId,3),/forbidden/);
  await assert.rejects(productionDefault.provisionFixture({}),/forbidden/);
  await assert.rejects(productionDefault.advance(f.advance(),{
    failAfterUpdate:true
  }),/forbidden/);
});

test('checkpoint DB does not expose MLS message plaintext or raw private state columns',async()=>{
  await fixture();
  const columns=await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = ANY($1)",
    [['messenger_checkpoint_devices','messenger_checkpoint_receipts']]);
  const names=columns.rows.map(x=>x.column_name);
  for(const prohibited of ['plaintext','message','sender_ratchet','private_key','group_secret',
       'ciphertext_blob','mls_tree']) {
    assert.ok(!names.includes(prohibited),'Forbidden column '+prohibited);
  }
});

test('database unavailable means no fabricated checkpoint approval',async()=>{
  const f=await fixture();
  const closedPool=new Pool({connectionString:url,max:1});
  await closedPool.end();
  const service=new PostgresCheckpointAuthority({
    pool:closedPool,serverSigningKey:serverKey.privateKey
  });
  await assert.rejects(service.resume(f.resume()),/Cannot use a pool after calling end/);
  await assert.rejects(service.advance(f.advance()),/Cannot use a pool after calling end/);
});
