// GWAP Messenger isolated local TEST-ONLY SQLite checkpoint authority.
// Never deploy. Fixture enrollment/admin endpoints are not GNS-authenticated.
import { DatabaseSync } from 'node:sqlite';
import { createPublicKey, verify } from 'node:crypto';
import { canonicalIntent, canonicalResume, sha256Hex } from './monotonic-checkpoint.mjs';

function requireValue(ok, message) { if (!ok) throw new Error(message); }
const hash64 = /^[a-f0-9]{64}$/;
const version = n => Number.isSafeInteger(n) && n >= 0;
const label = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{3,128}$/.test(s);

export class SQLiteCheckpointAuthority {
  constructor(filename) {
    requireValue(typeof filename === 'string' && filename.length > 0, 'Database filename required');
    this.db = new DatabaseSync(filename, {timeout:5000});
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    this.db.exec('CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, binding_version INTEGER NOT NULL, public_spki_base64 TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0), commitment TEXT NOT NULL, fence INTEGER NOT NULL CHECK(fence>0), revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)))');
    this.db.exec('CREATE TABLE IF NOT EXISTS intents (device_id TEXT NOT NULL, token TEXT NOT NULL, digest TEXT NOT NULL, receipt_json TEXT NOT NULL, PRIMARY KEY(device_id, token), FOREIGN KEY(device_id) REFERENCES devices(device_id))');
    this.getDevice = this.db.prepare('SELECT * FROM devices WHERE device_id=?');
    this.getIntent = this.db.prepare('SELECT * FROM intents WHERE device_id=? AND token=?');
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value=fn(); this.db.exec('COMMIT'); return value; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  current(deviceId) {
    const d=this.getDevice.get(deviceId);
    requireValue(d && !d.revoked,'Unknown or revoked device');
    return d;
  }
  authenticate(d, req, canon) {
    requireValue(req.accountId===d.account_id,'Account mismatch');
    requireValue(req.bindingVersion===d.binding_version,'Old identity binding');
    requireValue(typeof req.signature==='string' && req.signature.length<512,
      'Invalid device signature encoding');
    const pub=createPublicKey({key:Buffer.from(d.public_spki_base64,'base64'),format:'der',type:'spki'});
    requireValue(verify(null,canon(req),pub,Buffer.from(req.signature,'base64')),
      'Invalid device Ed25519 signature');
  }
  // Fixture enrollment. A real endpoint must verify wallet and live GNS authority.
  register({deviceId,accountId,bindingVersion,publicSpkiBase64,revision,commitment}) {
    requireValue(label(deviceId)&&label(accountId)&&version(bindingVersion)&&bindingVersion>0
      &&version(revision)&&hash64.test(commitment),'Invalid initial checkpoint');
    const pub=createPublicKey({key:Buffer.from(publicSpkiBase64,'base64'),format:'der',type:'spki'});
    requireValue(pub.asymmetricKeyType==='ed25519','Only Ed25519 fixture keys supported');
    return this.transaction(()=>{
      requireValue(!this.getDevice.get(deviceId),'Duplicate device enrollment');
      this.db.prepare('INSERT INTO devices(device_id,account_id,binding_version,public_spki_base64,revision,commitment,fence,revoked) VALUES(?,?,?,?,?,?,1,0)')
        .run(deviceId,accountId,bindingVersion,publicSpkiBase64,revision,commitment);
      return {deviceId,revision,commitment,fence:1};
    });
  }
  advance(req) {
    requireValue(label(req.deviceId),'Invalid device ID');
    return this.transaction(()=>{
      const d=this.current(req.deviceId);
      this.authenticate(d,req,canonicalIntent);
      requireValue(req.fence===d.fence,'Stale writer fence');
      requireValue(version(req.expectedRevision)&&version(req.nextRevision)
        &&req.nextRevision===req.expectedRevision+1,'Invalid revision transition');
      requireValue(hash64.test(req.commitment),'Invalid ciphertext commitment');
      requireValue(label(req.idempotencyKey)&&req.idempotencyKey.length>=8,
        'Invalid idempotency token');
      const digest=sha256Hex(canonicalIntent(req));
      const seen=this.getIntent.get(req.deviceId,req.idempotencyKey);
      if(seen){
        requireValue(seen.digest===digest,'Idempotency token reused with different state');
        return {...JSON.parse(seen.receipt_json),duplicate:true};
      }
      requireValue(d.revision===req.expectedRevision,'Stale revision: CAS conflict');
      const changed=this.db.prepare('UPDATE devices SET revision=?,commitment=? WHERE device_id=? AND revision=? AND fence=? AND revoked=0')
        .run(req.nextRevision,req.commitment,req.deviceId,req.expectedRevision,req.fence);
      requireValue(changed.changes===1,'Checkpoint CAS failed');
      const receipt={deviceId:req.deviceId,revision:req.nextRevision,
        commitment:req.commitment,fence:req.fence,duplicate:false};
      this.db.prepare('INSERT INTO intents(device_id,token,digest,receipt_json) VALUES(?,?,?,?)')
        .run(req.deviceId,req.idempotencyKey,digest,JSON.stringify(receipt));
      return receipt;
    });
  }
  resume(req) {
    const d=this.current(req.deviceId);
    this.authenticate(d,req,canonicalResume);
    requireValue(version(req.localRevision),'Invalid local revision');
    requireValue(req.localRevision===d.revision,
      req.localRevision<d.revision
        ? 'Complete local state rollback detected: fail closed'
        : 'Unanchored local state: delivery prohibited');
    requireValue(req.localCommitment===d.commitment,
      'Local snapshot commitment mismatch: delivery prohibited');
    return {allowDelivery:true,revision:d.revision,fence:d.fence,
      commitment:d.commitment};
  }
  // Admin-only fixture controls, never authorized for a public API.
  rotateFence(deviceId) {
    return this.transaction(()=>{
      const d=this.current(deviceId);
      this.db.prepare('UPDATE devices SET fence=fence+1 WHERE device_id=?').run(deviceId);
      return {deviceId,fence:d.fence+1};
    });
  }
  revoke(deviceId,nextBindingVersion) {
    return this.transaction(()=>{
      const d=this.current(deviceId);
      requireValue(version(nextBindingVersion)&&nextBindingVersion>d.binding_version,
        'Binding version must advance');
      this.db.prepare('UPDATE devices SET revoked=1,binding_version=?,fence=fence+1 WHERE device_id=?')
        .run(nextBindingVersion,deviceId);
      return {revoked:true,deviceId};
    });
  }
}
