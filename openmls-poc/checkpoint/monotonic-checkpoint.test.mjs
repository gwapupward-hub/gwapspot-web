import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  InMemoryCheckpointAuthority,sha256Hex,canonicalIntent,canonicalResume
} from './monotonic-checkpoint.mjs';

function fixture() {
  const keys=generateKeyPairSync('ed25519');
  const auth=new InMemoryCheckpointAuthority();
  const deviceId='deviceA';
  const accountId='gwap_example';
  const bindingVersion=1;
  const firstHash=sha256Hex('encrypted-state-v1');
  auth.register({deviceId,accountId,bindingVersion,
    publicKey:keys.publicKey,revision:1,commitment:firstHash});
  const advance=(fields={})=>{
    const request={
      deviceId,accountId,bindingVersion,fence:1,expectedRevision:1,nextRevision:2,
      commitment:sha256Hex('encrypted-state-v2'),
      idempotencyKey:'request-000001',...fields
    };
    return {...request,signature:sign(null,canonicalIntent(request),keys.privateKey)};
  };
  const resume=(fields={})=>{
    const request={deviceId,accountId,bindingVersion,localRevision:1,
      localCommitment:firstHash,...fields};
    return {...request,signature:sign(null,canonicalResume(request),keys.privateKey)};
  };
  return {auth,keys,advance,resume,deviceId,accountId,firstHash};
}

test('valid signed revision and snapshot commitment are accepted; identical retry is idempotent',()=>{
  const f=fixture();
  const req=f.advance();
  const accepted=f.auth.advance(req);
  assert.equal(accepted.revision,2);
  assert.equal(accepted.duplicate,false);
  const retry=f.auth.advance(req);
  assert.equal(retry.revision,2);
  assert.equal(retry.duplicate,true);
  assert.equal(f.auth.resume(f.resume({localRevision:2,localCommitment:req.commitment})).allowDelivery,true);
});

test('rolling back a fully valid old local snapshot is detected by independent authority',()=>{
  const f=fixture();
  f.auth.advance(f.advance());
  assert.throws(()=>f.auth.resume(f.resume()),/rollback detected/);
  assert.throws(()=>f.auth.resume(f.resume({
    localRevision:3,localCommitment:sha256Hex('local ahead')
  })),/Unanchored local state/);
});

test('same revision but different ciphertext commitment fails closed',()=>{
  const f=fixture();
  f.auth.advance(f.advance());
  assert.throws(()=>f.auth.resume(f.resume({
    localRevision:2,localCommitment:sha256Hex('attacker-changed-snapshot')
  })),/commitment mismatch/);
});

test('stale concurrent CAS writer cannot advance over already accepted revision',()=>{
  const f=fixture();
  const winner=f.auth.advance(f.advance());
  assert.equal(winner.revision,2);
  assert.throws(()=>f.auth.advance(f.advance({
    commitment:sha256Hex('competing-blob'),idempotencyKey:'request-000002'
  })),/CAS conflict/);
});

test('reusing idempotency key for a different ciphertext is rejected',()=>{
  const f=fixture();
  f.auth.advance(f.advance());
  assert.throws(()=>f.auth.advance(f.advance({
    commitment:sha256Hex('modified-ciphertext')
  })),/Idempotency token reused/);
});

test('rotated fencing token refuses old writer; accepts signed new fence only',()=>{
  const f=fixture();
  assert.equal(f.auth.rotateFence(f.deviceId),2);
  assert.throws(()=>f.auth.advance(f.advance()),/Stale device writer fence/);
  assert.equal(f.auth.advance(f.advance({fence:2})).revision,2);
});

test('wrong signature or changed account or binding version cannot advance',()=>{
  const f=fixture();
  const attacker=generateKeyPairSync('ed25519');
  const req=f.advance();
  assert.throws(()=>f.auth.advance({...req,
    signature:sign(null,canonicalIntent(req),attacker.privateKey)}),/Invalid device/);
  assert.throws(()=>f.auth.advance(f.advance({accountId:'gwap_other'})),/Account mismatch/);
  assert.throws(()=>f.auth.advance(f.advance({bindingVersion:9})),/Old identity binding/);
  assert.equal(f.auth.resume(f.resume()).allowDelivery,true);
});

test('revoked identity binding and authority outage prevent delivery',()=>{
  const f=fixture();
  f.auth.setAvailable(false);
  assert.throws(()=>f.auth.resume(f.resume()),/unavailable/);
  assert.throws(()=>f.auth.advance(f.advance()),/unavailable/);
  f.auth.setAvailable(true);
  f.auth.revokeBinding(f.deviceId,2);
  assert.throws(()=>f.auth.advance(f.advance()),/revoked device/);
  assert.throws(()=>f.auth.resume(f.resume()),/revoked device/);
});

test('signed resume assertions are domain-separated from checkpoint advance requests',()=>{
  const f=fixture();
  const signed=f.resume();
  const request=f.advance();
  assert.throws(()=>f.auth.advance({...request,signature:signed.signature}),
    /Invalid device/);
  assert.equal(f.auth.resume(signed).allowDelivery,true);
});

test('invalid initial snapshot and duplicated device enrollment are refused',()=>{
  const f=fixture();
  assert.throws(()=>f.auth.register({
    deviceId:f.deviceId,accountId:f.accountId,bindingVersion:1,
    publicKey:f.keys.publicKey,revision:1,commitment:f.firstHash
  }),/unique/);
  assert.throws(()=>f.auth.register({
    deviceId:'other',accountId:f.accountId,bindingVersion:1,
    publicKey:f.keys.publicKey,revision:1,commitment:'not-a-hash'
  }),/Invalid initial checkpoint/);
});
