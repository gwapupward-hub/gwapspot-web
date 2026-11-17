// GWAP Messenger disposable PostgreSQL outbox-authorized DS reference.
// TEST ONLY. No live .gwap control, authentic group membership, MLS validation,
// protected client storage, deployment authorization or production API.
import {createHash,createPublicKey,verify,sign} from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/;
const LABEL=/^[A-Za-z0-9_.:-]{3,128}$/;
const ok=(condition,message)=>{if(!condition)throw Error(message)};
const safeNumber=n=>Number.isSafeInteger(n)&&n>=0;
const toNum=n=>{const v=Number(n);ok(safeNumber(v),'Invalid database integer');return v};
export const envelopeHash=value=>createHash('sha256').update(value).digest('hex');
const framed=(name,parts)=>Buffer.from(JSON.stringify([name,...parts]));
export const authorizeEnvelopeBytes=r=>framed('GWAP_MESSENGER_OUTBOX_AUTHORIZE_V1',[
 r.deviceId,r.accountId,r.bindingVersion,r.fence,r.expectedRevision,r.nextRevision,
 r.commitment,r.idempotencyKey,r.groupId,r.recipientDeviceId,r.messageId,
 r.epoch,r.ciphertextHash
]);
export const submitEnvelopeBytes=r=>framed('GWAP_MESSENGER_OUTBOX_SUBMIT_V1',[
 r.deviceId,r.accountId,r.bindingVersion,r.fence,r.revision,r.commitment,
 r.groupId,r.recipientDeviceId,r.messageId,r.epoch,r.ciphertextHash
]);
export const pullEnvelopeBytes=r=>framed('GWAP_MESSENGER_RECIPIENT_SYNC_V1',[
 r.deviceId,r.accountId,r.bindingVersion,r.fence,r.groupId,r.afterSeq,r.nonce
]);
export const grantReceiptBytes=r=>framed('GWAP_MESSENGER_GRANT_RECEIPT_V1',[
 r.deviceId,r.accountId,r.bindingVersion,r.fence,r.revision,r.commitment,
 r.messageId,r.groupId,r.recipientDeviceId,r.epoch,r.ciphertextHash,r.expiresAt
]);
function authenticate(row,request,bytes){
 ok(request.accountId===row.account_id,'Wrong account');
 ok(request.bindingVersion===toNum(row.binding_version),'Stale identity binding');
 ok(request.fence===toNum(row.fence),'Stale writer fence');
 ok(typeof request.signature==='string'&&request.signature.length<=256,'Invalid signature encoding');
 const raw=Buffer.from(request.signature,'base64');
 ok(raw.length===64 && verify(null,bytes,
   createPublicKey(row.public_key_spki),raw),'Invalid device signature');
}
function fixtureId(id){ok(typeof id==='string'&&LABEL.test(id),'Invalid identifier')}
function requestBasics(r){
 ok(r&&typeof r==='object','Invalid request');
 fixtureId(r.deviceId);fixtureId(r.accountId);
 ok(safeNumber(r.bindingVersion)&&r.bindingVersion>0&&
   safeNumber(r.fence)&&r.fence>0,'Invalid binding/fence');
}
function grantBasics(r){
 requestBasics(r);fixtureId(r.groupId);fixtureId(r.recipientDeviceId);
 fixtureId(r.messageId);fixtureId(r.idempotencyKey);
 ok(r.idempotencyKey.length>=8&&safeNumber(r.expectedRevision)&&
   safeNumber(r.nextRevision)&&r.nextRevision===r.expectedRevision+1&&
   safeNumber(r.epoch)&&HASH.test(r.commitment)&&HASH.test(r.ciphertextHash),
   'Invalid envelope authorization');
}
function submitBasics(r){
 requestBasics(r);fixtureId(r.groupId);fixtureId(r.recipientDeviceId);
 fixtureId(r.messageId);
 ok(safeNumber(r.epoch)&&safeNumber(r.revision)&&r.revision>0&&
   HASH.test(r.commitment)&&HASH.test(r.ciphertextHash),'Invalid envelope submit');
 ok(typeof r.ciphertextBase64==='string'&&r.ciphertextBase64.length<=22000,
   'Invalid ciphertext encoding');
 const bytes=Buffer.from(r.ciphertextBase64,'base64');
 ok(bytes.length>=16&&bytes.length<=16384&&
   bytes.toString('base64')===r.ciphertextBase64,
   'Invalid ciphertext size or encoding');
 ok(envelopeHash(bytes)===r.ciphertextHash,'Ciphertext hash mismatch');
 return bytes;
}

export class PostgresEnvelopeDS {
 #pool;#serverSigningKey;#fixtures;
 constructor({pool,serverSigningKey,allowFixtureAdministration=false}){
   ok(pool&&typeof pool.connect==='function','Postgres pool required');
   ok(serverSigningKey?.asymmetricKeyType==='ed25519','Server signing key required');
   this.#pool=pool;this.#serverSigningKey=serverSigningKey;
   this.#fixtures=allowFixtureAdministration;
 }
 async #tx(fn){
   const db=await this.#pool.connect();
   try{
     await db.query('BEGIN');
     await db.query('SET LOCAL synchronous_commit TO on');
     const result=await fn(db);
     await db.query('COMMIT');
     return result;
   }catch(e){
     try{await db.query('ROLLBACK')}catch{}
     throw e;
   }finally{db.release()}
 }
 async #device(db,deviceId,lock){
   const r=await db.query('SELECT * FROM messenger_checkpoint_devices WHERE device_id=$1'+
     (lock?' FOR UPDATE':''),[deviceId]);
   ok(r.rowCount===1&&!r.rows[0].revoked,'Unknown or revoked device');
   return r.rows[0];
 }
 async #member(db,groupId,deviceId){
   const r=await db.query(
    'SELECT active FROM messenger_test_group_members WHERE group_id=$1 AND device_id=$2',
    [groupId,deviceId]);
   ok(r.rowCount===1&&r.rows[0].active,'Unauthorized group member');
 }
 #grantReceipt(r,grant,duplicate){
   const receipt={
     deviceId:r.deviceId,accountId:r.accountId,bindingVersion:r.bindingVersion,
     fence:toNum(grant.fence),revision:toNum(grant.granted_revision),
     commitment:grant.snapshot_commitment,messageId:r.messageId,
     groupId:grant.group_id,recipientDeviceId:grant.recipient_device_id,
     epoch:toNum(grant.epoch),ciphertextHash:grant.ciphertext_hash,
     expiresAt:new Date(grant.expires_at).toISOString()
   };
   return {...receipt,
     signature:sign(null,grantReceiptBytes(receipt),this.#serverSigningKey).toString('base64'),
     duplicate
   };
 }
 async addGroupMemberFixture(groupId,deviceId){
   ok(this.#fixtures,'Fixture administration forbidden');
   fixtureId(groupId);fixtureId(deviceId);
   return this.#tx(async db=>{
     await this.#device(db,deviceId,true);
     await db.query(
       'INSERT INTO messenger_test_group_members(group_id,device_id,active)'+
       ' VALUES($1,$2,TRUE) ON CONFLICT(group_id,device_id)'+
       ' DO UPDATE SET active=TRUE',[groupId,deviceId]);
   });
 }
 async disableGroupMemberFixture(groupId,deviceId){
   ok(this.#fixtures,'Fixture administration forbidden');
   fixtureId(groupId);fixtureId(deviceId);
   return this.#tx(async db=>{
     const result=await db.query(
       'UPDATE messenger_test_group_members SET active=FALSE'+
       ' WHERE group_id=$1 AND device_id=$2',[groupId,deviceId]);
     ok(result.rowCount===1,'Unknown group member');
   });
 }
 async authorizeEnvelope(r,{injectFailure=false}={}){
   grantBasics(r);
   const digest=envelopeHash(authorizeEnvelopeBytes(r));
   return this.#tx(async db=>{
     const sender=await this.#device(db,r.deviceId,true);
     authenticate(sender,r,authorizeEnvelopeBytes(r));
     await this.#device(db,r.recipientDeviceId,false);
     await this.#member(db,r.groupId,r.deviceId);
     await this.#member(db,r.groupId,r.recipientDeviceId);
     const prior=await db.query(
       'SELECT * FROM messenger_envelope_grants'+
       ' WHERE sender_device_id=$1 AND idempotency_key=$2',
       [r.deviceId,r.idempotencyKey]);
     if(prior.rowCount){
       const saved=prior.rows[0];
       ok(saved.request_digest===digest,'Idempotency collision');
       return this.#grantReceipt(r,saved,true);
     }
     ok(toNum(sender.revision)===r.expectedRevision,'Stale checkpoint CAS revision');
     const updated=await db.query(
       'UPDATE messenger_checkpoint_devices SET revision=$2,commitment=$3,'+
       'updated_at=NOW() WHERE device_id=$1 AND revision=$4 AND fence=$5 AND revoked=FALSE',
       [r.deviceId,r.nextRevision,r.commitment,r.expectedRevision,r.fence]);
     ok(updated.rowCount===1,'Checkpoint CAS failed');
     await db.query(
      'INSERT INTO messenger_envelope_grants'+
      ' (sender_device_id,message_id,group_id,recipient_device_id,epoch,granted_revision,'+
      'binding_version,fence,snapshot_commitment,ciphertext_hash,idempotency_key,request_digest)'+
      ' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [r.deviceId,r.messageId,r.groupId,r.recipientDeviceId,r.epoch,
       r.nextRevision,r.bindingVersion,r.fence,r.commitment,r.ciphertextHash,
       r.idempotencyKey,digest]);
     if(injectFailure){
       ok(this.#fixtures,'Fixture administration forbidden');
       throw Error('Injected rollback after checkpoint write');
     }
     const saved=await db.query(
       'SELECT * FROM messenger_envelope_grants WHERE sender_device_id=$1 AND message_id=$2',
       [r.deviceId,r.messageId]);
     return this.#grantReceipt(r,saved.rows[0],false);
   });
 }
 async submitEnvelope(r){
   const wire=submitBasics(r);
   return this.#tx(async db=>{
     const sender=await this.#device(db,r.deviceId,true);
     authenticate(sender,r,submitEnvelopeBytes(r));
     await this.#device(db,r.recipientDeviceId,false);
     await this.#member(db,r.groupId,r.deviceId);
     await this.#member(db,r.groupId,r.recipientDeviceId);
     const g=await db.query(
       'SELECT * FROM messenger_envelope_grants'+
       ' WHERE sender_device_id=$1 AND message_id=$2',
       [r.deviceId,r.messageId]);
     ok(g.rowCount===1,'No independently committed envelope authorization');
     const grant=g.rows[0];
     ok(grant.group_id===r.groupId&&grant.recipient_device_id===r.recipientDeviceId&&
       toNum(grant.epoch)===r.epoch&&
       toNum(grant.granted_revision)===r.revision&&
       toNum(grant.binding_version)===r.bindingVersion&&
       toNum(grant.fence)===r.fence&&
       grant.snapshot_commitment===r.commitment&&
       grant.ciphertext_hash===r.ciphertextHash,
       'Envelope not included in authorized checkpoint');
     ok(new Date(grant.expires_at).getTime()>Date.now(),'Envelope authorization expired');
     // A queued envelope from an older, already authorized revision remains valid.
     ok(toNum(sender.revision)>=r.revision,'Unanchored sender state');
     const prior=await db.query(
       'SELECT ciphertext,seq FROM messenger_opaque_deliveries'+
       ' WHERE sender_device_id=$1 AND message_id=$2',
       [r.deviceId,r.messageId]);
     if(prior.rowCount){
       ok(Buffer.from(prior.rows[0].ciphertext).equals(wire),
         'Delivery idempotency conflict');
       return {accepted:true,duplicate:true,seq:toNum(prior.rows[0].seq),
         messageId:r.messageId};
     }
     const accepted=await db.query(
       'INSERT INTO messenger_opaque_deliveries'+
       ' (sender_device_id,message_id,group_id,recipient_device_id,'+
       'epoch,ciphertext_hash,ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7)'+
       ' RETURNING seq',
       [r.deviceId,r.messageId,r.groupId,r.recipientDeviceId,r.epoch,
        r.ciphertextHash,wire]);
     return {accepted:true,duplicate:false,seq:toNum(accepted.rows[0].seq),
       messageId:r.messageId};
   });
 }
 async fetchForRecipient(r){
   requestBasics(r);fixtureId(r.groupId);
   fixtureId(r.nonce);
   ok(r.nonce.length>=12&&safeNumber(r.afterSeq),'Invalid recipient cursor or nonce');
   return this.#tx(async db=>{
     const recipient=await this.#device(db,r.deviceId,true);
     authenticate(recipient,r,pullEnvelopeBytes(r));
     await this.#member(db,r.groupId,r.deviceId);
     // Keep consumed signed nonce and fetched bytes inside one serializable unit.
     await db.query(
       'INSERT INTO messenger_test_recipient_pull_nonces(recipient_device_id,nonce)'+
       ' VALUES($1,$2)',[r.deviceId,r.nonce]);
     const results=await db.query(
       'SELECT seq,sender_device_id,message_id,epoch,ciphertext_hash,ciphertext'+
       ' FROM messenger_opaque_deliveries'+
       ' WHERE recipient_device_id=$1 AND group_id=$2 AND seq>$3'+
       ' ORDER BY seq ASC LIMIT 50',
       [r.deviceId,r.groupId,r.afterSeq]);
     return {messages:results.rows.map(x=>({
       seq:toNum(x.seq),senderDeviceId:x.sender_device_id,
       messageId:x.message_id,epoch:toNum(x.epoch),
       ciphertextHash:x.ciphertext_hash,
       ciphertextBase64:Buffer.from(x.ciphertext).toString('base64')
     }))};
   });
 }
}
