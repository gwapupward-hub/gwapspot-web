// TEST ONLY. A delivery-service authorization gate backed by the independently
// persisted SQLite monotonic checkpoint. NOT a production MLS Delivery Service.
// Device enrollment and group membership are fixture-only, with no live GNS.
import {createHash} from 'node:crypto';
import {canonicalDelivery,sha256Hex} from './monotonic-checkpoint.mjs';

const identifier = s => typeof s==='string' && /^[A-Za-z0-9_.:-]{3,128}$/.test(s);
const sha = s => typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const requireValue = (ok,message) => {if(!ok)throw new Error(message);};

export class SQLiteDeliveryGate {
  constructor(authority) {
    this.authority=authority;
    this.db=authority.db;
    this.db.exec([
      'CREATE TABLE IF NOT EXISTS encrypted_deliveries (',
      'device_id TEXT NOT NULL, message_id TEXT NOT NULL, group_id TEXT NOT NULL,',
      'revision INTEGER NOT NULL, fence INTEGER NOT NULL, request_digest TEXT NOT NULL,',
      'ciphertext_hash TEXT NOT NULL, ciphertext BLOB NOT NULL,',
      'accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      'PRIMARY KEY(device_id,message_id),',
      'FOREIGN KEY(device_id) REFERENCES devices(device_id))'
    ].join(' '));
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS one_mls_ciphertext_once ON encrypted_deliveries(device_id,group_id,ciphertext_hash)');
    this.getMessage=this.db.prepare('SELECT * FROM encrypted_deliveries WHERE device_id=? AND message_id=?');
    this.getWire=this.db.prepare('SELECT message_id FROM encrypted_deliveries WHERE device_id=? AND group_id=? AND ciphertext_hash=?');
    this.stats=this.db.prepare('SELECT message_id,group_id,ciphertext_hash,revision,fence,hex(ciphertext) AS wire_hex FROM encrypted_deliveries WHERE device_id=? ORDER BY accepted_at,message_id LIMIT 100');
  }

  submit(request){
    // Rejected inputs never mutate the persistent checkpoint or message store.
    requireValue(identifier(request?.deviceId)&&identifier(request?.accountId),
      'Invalid sender device/account identifiers');
    requireValue(identifier(request.groupId)&&identifier(request.messageId),
      'Invalid group/message identifiers');
    requireValue(sha(request.commitment)&&sha(request.ciphertextHash),
      'Invalid state or ciphertext hash');
    requireValue(Number.isSafeInteger(request.revision)&&request.revision>0
      &&Number.isSafeInteger(request.bindingVersion)&&request.bindingVersion>0
      &&Number.isSafeInteger(request.fence)&&request.fence>0,'Invalid binding/revision/fence');
    requireValue(typeof request.signature==='string'&&request.signature.length<512,
      'Missing signature');
    requireValue(typeof request.ciphertextBase64==='string'
      &&request.ciphertextBase64.length<=22000,'Invalid ciphertext encoding');
    const ciphertext=Buffer.from(request.ciphertextBase64,'base64');
    requireValue(ciphertext.length>=16&&ciphertext.length<=16384
      &&ciphertext.toString('base64')===request.ciphertextBase64,
      'Invalid ciphertext bytes');
    requireValue(sha256Hex(ciphertext)===request.ciphertextHash,
      'Ciphertext hash mismatch');
    const digest=createHash('sha256').update(canonicalDelivery(request)).digest('hex');
    return this.authority.transaction(()=>{
      const device=this.authority.current(request.deviceId);
      this.authority.authenticate(device,request,canonicalDelivery);
      requireValue(device.fence===request.fence,'Stale writer fence');
      requireValue(device.revision===request.revision,
        device.revision>request.revision
          ? 'Rolled-back sender state: delivery denied'
          : 'Unanchored local state: delivery denied');
      requireValue(device.commitment===request.commitment,
        'Snapshot commitment mismatch: delivery denied');
      const existing=this.getMessage.get(request.deviceId,request.messageId);
      if(existing){
        requireValue(existing.request_digest===digest
          &&existing.ciphertext_hash===request.ciphertextHash,
          'Message ID reused for different ciphertext or checkpoint');
        return {accepted:true,duplicate:true,deviceId:request.deviceId,
          messageId:request.messageId,ciphertextHash:request.ciphertextHash,
          revision:request.revision,fence:request.fence};
      }
      requireValue(!this.getWire.get(request.deviceId,request.groupId,request.ciphertextHash),
        'Same MLS ciphertext already submitted under another message ID');
      this.db.prepare([
        'INSERT INTO encrypted_deliveries',
        '(device_id,message_id,group_id,revision,fence,request_digest,ciphertext_hash,ciphertext)',
        'VALUES(?,?,?,?,?,?,?,?)'
      ].join(' ')).run(
        request.deviceId,request.messageId,request.groupId,request.revision,
        request.fence,digest,request.ciphertextHash,ciphertext);
      return {accepted:true,duplicate:false,deviceId:request.deviceId,
        messageId:request.messageId,ciphertextHash:request.ciphertextHash,
        revision:request.revision,fence:request.fence};
    });
  }

  // TEST ADMIN ONLY. Recipient authorization, queue sequencing and consent not implemented.
  listFixture(deviceId){
    requireValue(identifier(deviceId),'Invalid fixture device ID');
    return this.stats.all(deviceId).map(record=>({
      messageId:record.message_id,groupId:record.group_id,
      ciphertextHash:record.ciphertext_hash,revision:record.revision,
      fence:record.fence,ciphertextBase64:Buffer.from(record.wire_hex,'hex').toString('base64')
    }));
  }
}
