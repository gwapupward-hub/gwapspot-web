// TEST ONLY: PostgreSQL-backed monotonic MLS checkpoint reference.
// Registration is fixture-only. NO live GNS identity verification, deployed
// service, transport fencing, browser key protection or production approval.
import {createHash, sign, verify} from 'node:crypto';

const VALID_HASH=/^[0-9a-f]{64}$/;
const must=(condition,message)=>{if(!condition) throw new Error(message);};
const natural=n=>Number.isSafeInteger(n)&&n>=0;
const ident=s=>typeof s==='string'&&s.length>0&&s.length<=128;
const num=s=>{const n=Number(s);must(natural(n),'Unsafe DB integer');return n;};
export const sha256Hex=bytes=>createHash('sha256').update(bytes).digest('hex');
function sequence(label,values){return Buffer.from(JSON.stringify([label,...values]));}
export const advanceBytes=r=>sequence('GWAP_MESSENGER_ADVANCE_V2',[
  r.deviceId,r.accountId,r.bindingVersion,r.fence,r.expectedRevision,
  r.nextRevision,r.commitment,r.idempotencyKey
]);
export const resumeBytes=r=>sequence('GWAP_MESSENGER_RESUME_V2',[
  r.deviceId,r.accountId,r.bindingVersion,r.fence,r.localRevision,r.localCommitment
]);
export const receiptBytes=r=>sequence('GWAP_MESSENGER_RECEIPT_V2',[
  r.type,r.deviceId,r.accountId,r.bindingVersion,r.revision,
  r.commitment,r.fence,r.expiresAt
]);
export function verifyReceipt(r,serverPublicKey){
  if(typeof r?.signature!=='string') return false;
  const signature=Buffer.from(r.signature,'base64');
  return signature.length===64&&verify(null,receiptBytes(r),serverPublicKey,signature);
}
function checkSignature(request,bytes,pem){
  must(typeof request.signature==='string' &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(request.signature),'Invalid signature encoding');
  const signature=Buffer.from(request.signature,'base64');
  must(signature.length===64&&verify(null,bytes,pem,signature),
    'Invalid Ed25519 device signature');
}
export class PostgresCheckpointAuthority {
  #pool; #serverKey; #fixtures;
  constructor({pool,serverSigningKey,allowFixtureAdministration=false}){
    must(pool&&typeof pool.connect==='function','PostgreSQL pool required');
    must(serverSigningKey?.asymmetricKeyType==='ed25519','Server Ed25519 key required');
    this.#pool=pool;this.#serverKey=serverSigningKey;
    this.#fixtures=allowFixtureAdministration;
  }
  #fixture(){must(this.#fixtures,'Fixture administration forbidden');}
  #signed(record){
    return {...record,signature:sign(null,receiptBytes(record),this.#serverKey).toString('base64')};
  }
  #authorize(d,r,bytes){
    must(r.accountId===d.account_id,'Wrong account');
    must(natural(r.bindingVersion)&&r.bindingVersion===num(d.binding_version),
      'Stale identity binding');
    checkSignature(r,bytes,d.public_key_spki);
    must(natural(r.fence)&&r.fence===num(d.fence),'Stale writer fence');
  }
  async #device(db,id,lock=false){
    must(ident(id),'Invalid device ID');
    const sql='SELECT * FROM messenger_checkpoint_devices WHERE device_id=$1'+
      (lock?' FOR UPDATE':'');
    const result=await db.query(sql,[id]);
    must(result.rowCount===1 && !result.rows[0].revoked,
      'Unknown or revoked device');
    return result.rows[0];
  }
  async provisionFixture({deviceId,accountId,bindingVersion,publicKeyPem,revision,commitment}){
    this.#fixture();
    must(ident(deviceId)&&ident(accountId)&&natural(bindingVersion)&&bindingVersion>0&&
      natural(revision)&&VALID_HASH.test(commitment)&&
      typeof publicKeyPem==='string'&&publicKeyPem.includes('PUBLIC KEY'),
      'Invalid fixture enrollment');
    const x=await this.#pool.query(
      'INSERT INTO messenger_checkpoint_devices'+
      ' (device_id,account_id,binding_version,public_key_spki,revision,commitment,fence)'+
      ' VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING revision,fence',
      [deviceId,accountId,bindingVersion,publicKeyPem,revision,commitment]);
    return {deviceId,revision:num(x.rows[0].revision),fence:num(x.rows[0].fence)};
  }
  async rotateFenceFixture(id){
    this.#fixture();
    const x=await this.#pool.query(
      'UPDATE messenger_checkpoint_devices SET fence=fence+1,updated_at=NOW()'+
      ' WHERE device_id=$1 AND revoked=FALSE RETURNING fence',[id]);
    must(x.rowCount===1,'Cannot rotate unknown/revoked device');
    return num(x.rows[0].fence);
  }
  async revokeFixture(id,nextBinding){
    this.#fixture();must(natural(nextBinding)&&nextBinding>0,'Invalid binding');
    const x=await this.#pool.query(
      'UPDATE messenger_checkpoint_devices SET revoked=TRUE,binding_version=$2,'+
      ' fence=fence+1,updated_at=NOW()'+
      ' WHERE device_id=$1 AND revoked=FALSE AND binding_version<$2 RETURNING device_id',
      [id,nextBinding]);
    must(x.rowCount===1,'Cannot revoke or binding version not advanced');
  }
  async advance(r,{failAfterUpdate=false}={}){
    must(ident(r?.deviceId)&&ident(r?.accountId)&&ident(r?.idempotencyKey)&&
      r.idempotencyKey.length>=8&&VALID_HASH.test(r.commitment)&&
      natural(r.expectedRevision)&&natural(r.nextRevision)&&
      r.nextRevision===r.expectedRevision+1,'Invalid checkpoint intent');
    const bytes=advanceBytes(r),digest=sha256Hex(bytes);
    const db=await this.#pool.connect();
    try{
      await db.query('BEGIN');
      await db.query('SET LOCAL synchronous_commit TO on');
      const d=await this.#device(db,r.deviceId,true);
      this.#authorize(d,r,bytes);
      const prior=await db.query(
        'SELECT request_digest,revision,commitment,fence FROM messenger_checkpoint_receipts'+
        ' WHERE device_id=$1 AND idempotency_key=$2',[r.deviceId,r.idempotencyKey]);
      if(prior.rowCount){
        const p=prior.rows[0];
        must(p.request_digest===digest,'Idempotency collision with different intent');
        await db.query('COMMIT');
        return {...this.#signed({
          type:'advance',deviceId:r.deviceId,accountId:r.accountId,
          bindingVersion:r.bindingVersion,revision:num(p.revision),
          commitment:p.commitment,fence:num(p.fence),expiresAt:0
        }),duplicate:true};
      }
      must(r.expectedRevision===num(d.revision),'Stale checkpoint CAS revision');
      await db.query('UPDATE messenger_checkpoint_devices SET revision=$2,'+
        ' commitment=$3,updated_at=NOW() WHERE device_id=$1',
        [r.deviceId,r.nextRevision,r.commitment]);
      if(failAfterUpdate){
        this.#fixture();throw Error('Injected rollback after row update');
      }
      await db.query(
        'INSERT INTO messenger_checkpoint_receipts'+
        ' (device_id,idempotency_key,request_digest,revision,commitment,fence)'+
        ' VALUES ($1,$2,$3,$4,$5,$6)',
        [r.deviceId,r.idempotencyKey,digest,r.nextRevision,r.commitment,r.fence]);
      await db.query('COMMIT');
      return {...this.#signed({
        type:'advance',deviceId:r.deviceId,accountId:r.accountId,
        bindingVersion:r.bindingVersion,revision:r.nextRevision,
        commitment:r.commitment,fence:r.fence,expiresAt:0
      }),duplicate:false};
    }catch(err){
      try{await db.query('ROLLBACK');}catch{}
      throw err;
    }finally{db.release();}
  }
  async resume(r){
    must(ident(r?.deviceId)&&ident(r?.accountId)&&natural(r.localRevision)&&
      VALID_HASH.test(r.localCommitment),'Invalid resume assertion');
    const d=await this.#device(this.#pool,r.deviceId);
    this.#authorize(d,r,resumeBytes(r));
    const revision=num(d.revision);
    must(r.localRevision===revision,r.localRevision<revision
      ? 'Local-state rollback: fail closed'
      : 'Unanchored local state: fail closed');
    must(r.localCommitment===d.commitment,'Snapshot commitment mismatch');
    return this.#signed({
      type:'resume',deviceId:r.deviceId,accountId:r.accountId,
      bindingVersion:r.bindingVersion,revision,commitment:d.commitment,
      fence:num(d.fence),expiresAt:Date.now()+30000
    });
  }
}
