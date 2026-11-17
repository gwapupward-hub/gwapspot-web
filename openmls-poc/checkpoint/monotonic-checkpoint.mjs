// GWAP Messenger test-only reference checkpoint authority.
// In-memory and unauthenticated provisioning: NEVER deploy this as a server.
// Production needs persistent CAS, verified GNS binding, authenticated leases,
// audit review, availability strategy and a fenced durable delivery contract.
import { verify, createHash } from 'node:crypto';

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}
export function canonicalIntent(request) {
  // Domain separation and stable, typed ordering for the fixture Ed25519 signature.
  return Buffer.from(JSON.stringify([
    'GWAP_MESSENGER_TEST_CHECKPOINT_V1',
    request.deviceId, request.accountId, request.bindingVersion,
    request.fence, request.expectedRevision, request.nextRevision,
    request.commitment, request.idempotencyKey
  ]));
}
export function canonicalResume(request) {
  return Buffer.from(JSON.stringify([
    'GWAP_MESSENGER_TEST_RESUME_V1', request.deviceId,
    request.accountId, request.bindingVersion, request.localRevision,
    request.localCommitment
  ]));
}
export class InMemoryCheckpointAuthority {
  #devices = new Map();
  #available = true;

  setAvailable(flag) { this.#available=Boolean(flag); }
  #online() { ensure(this.#available, 'Trusted checkpoint authority unavailable'); }
  #device(deviceId) {
    this.#online();
    const d=this.#devices.get(deviceId);
    ensure(d && !d.revoked,'Unknown or revoked device');
    return d;
  }
  // Provisioning is TEST FIXTURE ONLY: a real endpoint needs GNS/wallet/device proof.
  register({deviceId,accountId,bindingVersion,publicKey,revision,commitment}) {
    this.#online();
    ensure(typeof deviceId==='string' && deviceId && !this.#devices.has(deviceId),
      'Device ID must be unique');
    ensure(typeof accountId==='string' && accountId && Number.isSafeInteger(bindingVersion)
      && bindingVersion>0, 'Invalid identity binding');
    ensure(Number.isSafeInteger(revision) && revision>=0
      && /^[a-f0-9]{64}$/.test(commitment),'Invalid initial checkpoint');
    this.#devices.set(deviceId,{accountId,bindingVersion,publicKey,revision,
      commitment,fence:1,revoked:false,ids:new Map()});
    return {deviceId,revision,commitment,fence:1};
  }
  // Test-only lease issuance. Production must authenticate this operation.
  rotateFence(deviceId) {
    const d=this.#device(deviceId);
    d.fence++;
    return d.fence;
  }
  revokeBinding(deviceId,newBindingVersion) {
    const d=this.#device(deviceId);
    ensure(newBindingVersion>d.bindingVersion,'Binding version must advance');
    d.bindingVersion=newBindingVersion;
    d.revoked=true;
    d.fence++;
  }
  #authenticate(d,request,canonical) {
    ensure(request.accountId===d.accountId,'Account mismatch');
    ensure(request.bindingVersion===d.bindingVersion,'Old identity binding');
    ensure(verify(null,canonical(request),d.publicKey,request.signature),
      'Invalid device Ed25519 signature');
  }
  advance(request) {
    const d=this.#device(request.deviceId);
    this.#authenticate(d,request,canonicalIntent);
    ensure(request.fence===d.fence,'Stale device writer fence');
    ensure(typeof request.idempotencyKey==='string' && request.idempotencyKey.length>=8,
      'Invalid idempotency token');
    ensure(Number.isSafeInteger(request.expectedRevision)
      && Number.isSafeInteger(request.nextRevision)
      && request.nextRevision===request.expectedRevision+1,'Invalid revision transition');
    ensure(/^[a-f0-9]{64}$/.test(request.commitment),'Invalid ciphertext commitment');
    const digest=sha256Hex(canonicalIntent(request));
    const seen=d.ids.get(request.idempotencyKey);
    if(seen){
      ensure(seen.digest===digest,'Idempotency token reused with different checkpoint');
      return {...seen.receipt,duplicate:true};
    }
    ensure(request.expectedRevision===d.revision,'Stale expected revision (CAS conflict)');
    d.revision=request.nextRevision;
    d.commitment=request.commitment;
    const receipt={deviceId:request.deviceId,revision:d.revision,
      commitment:d.commitment,fence:d.fence,duplicate:false};
    d.ids.set(request.idempotencyKey,{digest,receipt});
    return receipt;
  }
  resume(request) {
    const d=this.#device(request.deviceId);
    this.#authenticate(d,request,canonicalResume);
    ensure(request.localRevision===d.revision,
      request.localRevision<d.revision
        ? 'Complete local-state rollback detected; fail closed'
        : 'Unanchored local state; delivery prohibited');
    ensure(request.localCommitment===d.commitment,
      'Snapshot commitment mismatch; delivery prohibited');
    return {allowDelivery:true,revision:d.revision,fence:d.fence};
  }
}

// Signed by the sender device for a single opaque MLS envelope. Separate protocol
// domain prevents reusing checkpoint or resume signatures as delivery authorization.
export function canonicalDelivery(request) {
  return Buffer.from(JSON.stringify([
    'GWAP_MESSENGER_TEST_DELIVERY_V1',
    request.deviceId, request.accountId, request.bindingVersion,
    request.fence, request.revision, request.commitment,
    request.groupId, request.messageId, request.ciphertextHash
  ]));
}
