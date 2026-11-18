// TEST ONLY: transactional PostgreSQL device directory gated by an injected
// trusted finalized GNS V2 archive-history verifier. Never accept "proof"
// directly from a browser or GNS owner-only /resolve. Never deploy this fixture.
import {createPublicKey,randomBytes,verify} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {
  GNS_PROGRAM,GNS_DEVNET_GENESIS,enrollmentIntentBytes,
  authorizedActionBytes,sha256
} from './gns-device-binding.mjs';
import {canonicalNameV2} from './gns-v2-finalized.mjs';

const ED25519_PREFIX=Buffer.from('302a300506032b6570032100','hex');
const hash=/^[0-9a-f]{64}$/;
const sig=/^[A-Za-z0-9+/]+={0,2}$/;
const account=/^gwap_[a-zA-Z0-9_-]{3,80}$/;
const device=/^device_[a-zA-Z0-9_-]{3,80}$/;
const fail=msg=>{throw Error('GNS_DIRECTORY_FAIL_CLOSED: '+msg)};
const requireIt=(condition,msg)=>{if(!condition)fail(msg)};
const int=v=>Number.isSafeInteger(v)&&v>=0;
function walletKey(wallet){
  let key;
  try{key=new PublicKey(wallet)}
  catch{fail('invalid wallet public key')}
  return createPublicKey({key:Buffer.concat([ED25519_PREFIX,key.toBuffer()]),
    format:'der',type:'spki'});
}
function transportKey(value){
  requireIt(typeof value==='string'&&value.length<=200,'invalid transport public key');
  const der=Buffer.from(value,'base64');
  requireIt(der.length===44&&der.subarray(0,12).equals(ED25519_PREFIX)&&
    der.toString('base64')===value,'invalid device Ed25519 public key');
  return createPublicKey({key:der,format:'der',type:'spki'});
}
function checkedSignature(value,message,publicKey){
  requireIt(typeof value==='string'&&value.length<200&&sig.test(value),
    'invalid signature encoding');
  const s=Buffer.from(value,'base64');
  requireIt(s.length===64&&verify(null,message,publicKey,s),
    'invalid Ed25519 signature');
}
function assertProof(proof,name){
  requireIt(proof&&typeof proof==='object'&&
    proof.name===canonicalNameV2(name)&&proof.network==='devnet'&&
    proof.programId===GNS_PROGRAM&&proof.commitment==='finalized'&&
    proof.historyComplete===true&&hash.test(proof.ownershipVersion)&&
    int(proof.finalizedSlot)&&proof.finalizedSlot>0&&
    int(proof.transferCount)&&
    typeof proof.creationSignature==='string'&&proof.creationSignature.length>5,
    'missing trustworthy complete finalized GNS V2 proof');
  walletKey(proof.owner);
  return proof;
}
export class DurableGnsDeviceDirectory {
  #pool;#reader;#clock;
  constructor({pool,readFinalized,clockMs=()=>Date.now()}){
    requireIt(pool&&typeof pool.connect==='function','PostgreSQL pool required');
    requireIt(typeof readFinalized==='function','trusted finalized GNS reader required');
    this.#pool=pool;this.#reader=readFinalized;this.#clock=clockMs;
  }
  async #proof(name){
    let result;
    try{result=await this.#reader(name)}
    catch(e){fail('finalized GNS history unavailable; device authorization locked'+
      (process.env.GWAP_GNS_TEST_DIAGNOSTICS==='1'?' [fixture: '+String(e?.message||e)+']':''))}
    return assertProof(result,name);
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
  async #sync(db,name,proof){
    // Lock the domain row to serialize ownership changes and device action
    // authorization. Only proof produced by trusted server-side reader is used.
    await db.query('INSERT INTO messenger_gns_v2_names'+
      ' (name,owner_wallet,ownership_version,creation_signature,transfer_count,finalized_slot)'+
      ' VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(name) DO NOTHING',
      [name,proof.owner,proof.ownershipVersion,proof.creationSignature,
       proof.transferCount,proof.finalizedSlot]);
    const old=(await db.query(
      'SELECT * FROM messenger_gns_v2_names WHERE name=$1 FOR UPDATE',[name])).rows[0];
    requireIt(old,'missing locked GNS name record');
    requireIt(Number(old.finalized_slot)<=proof.finalizedSlot,
      'RPC finalized slot regressed below durable high water mark');
    const changed=old.ownership_version!==proof.ownershipVersion||
      old.owner_wallet!==proof.owner;
    if(changed){
      if(old.creation_signature===proof.creationSignature){
        requireIt(proof.transferCount>Number(old.transfer_count),
          'same-name owner epoch rollback or transfer-history contradiction');
      }else{
        requireIt(proof.finalizedSlot>Number(old.finalized_slot),
          're-created name requires strictly newer finalized slot');
      }
      await db.query('UPDATE messenger_gns_v2_devices SET revoked=TRUE'+
        ' WHERE name=$1 AND revoked=FALSE',[name]);
      await db.query('UPDATE messenger_gns_v2_names SET owner_wallet=$2,'+
        'ownership_version=$3,creation_signature=$4,transfer_count=$5,'+
        'finalized_slot=$6,binding_generation=binding_generation+1,'+
        'observed_at=NOW() WHERE name=$1',
        [name,proof.owner,proof.ownershipVersion,proof.creationSignature,
         proof.transferCount,proof.finalizedSlot]);
    }else if(Number(old.finalized_slot)<proof.finalizedSlot){
      await db.query('UPDATE messenger_gns_v2_names SET finalized_slot=$2,'+
        'observed_at=NOW() WHERE name=$1',[name,proof.finalizedSlot]);
    }
    const latest=await db.query(
      'SELECT binding_generation FROM messenger_gns_v2_names WHERE name=$1',[name]);
    return {changed,version:proof.ownershipVersion,
      generation:Number(latest.rows[0].binding_generation)};
  }
  async issueChallenge(rawName){
    const name=canonicalNameV2(rawName);
    const proof=await this.#proof(name);
    const nonce=randomBytes(16).toString('hex');
    const expiresAt=this.#clock()+120000;
    await this.#tx(async db=>{
      await this.#sync(db,name,proof);
      await db.query('INSERT INTO messenger_gns_v2_challenges'+
        ' (nonce,name,ownership_version,expires_at_ms) VALUES($1,$2,$3,$4)',
        [nonce,name,proof.ownershipVersion,expiresAt]);
    });
    return {nonce,expiresAt,name};
  }
  async enroll(input){
    requireIt(input&&input.network==='devnet'&&input.programId===GNS_PROGRAM&&
      input.genesisHash===GNS_DEVNET_GENESIS,'incorrect network/genesis/program');
    requireIt(input.name===canonicalNameV2(input.name).slice(0,-5),
      'noncanonical name label');
    requireIt(account.test(input.accountId)&&device.test(input.deviceId),
      'invalid immutable account/device identifier');
    requireIt(hash.test(input.mlsKeyPackageHash),'invalid MLS KeyPackage hash');
    transportKey(input.transportPublicSpkiBase64);
    // Enrollment signs a canonical label, whereas the finalized account
    // verifier indexes the canonical full ".gwap" name.
    const proof=await this.#proof(canonicalNameV2(input.name));
    requireIt(proof.owner===input.wallet,'wallet is not finalized owner');
    checkedSignature(input.walletSignature,enrollmentIntentBytes(input),
      walletKey(input.wallet));
    const now=this.#clock();
    requireIt(int(input.expiresAt)&&input.expiresAt>=now&&
      input.expiresAt-now<=120000,'expired/oversized device challenge');
    return this.#tx(async db=>{
      const epoch=await this.#sync(db,proof.name,proof);
      const r=await db.query('SELECT * FROM messenger_gns_v2_challenges'+
        ' WHERE nonce=$1 FOR UPDATE',[input.nonce]);
      const challenge=r.rows[0];
      requireIt(challenge&&challenge.name===proof.name&&!challenge.consumed&&
        challenge.ownership_version===proof.ownershipVersion&&
        Number(challenge.expires_at_ms)===input.expiresAt,
        'challenge stale, reused or issued under other owner epoch');
      const previous=await db.query(
        'SELECT original_wallet FROM messenger_gns_v2_accounts WHERE account_id=$1 FOR UPDATE',
        [input.accountId]);
      if(previous.rowCount)requireIt(
        previous.rows[0].original_wallet===input.wallet,
        'stable GWAP account cannot transfer with domain');
      else await db.query('INSERT INTO messenger_gns_v2_accounts'+
        ' (account_id,original_wallet) VALUES($1,$2)',[input.accountId,input.wallet]);
      await db.query('INSERT INTO messenger_gns_v2_devices'+
        ' (device_id,name,account_id,owner_wallet,ownership_version,'+
        'binding_generation,transport_public_spki_base64,mls_keypackage_hash)'+
        ' VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [input.deviceId,proof.name,input.accountId,input.wallet,
          proof.ownershipVersion,epoch.generation,input.transportPublicSpkiBase64,
          input.mlsKeyPackageHash]);
      await db.query('UPDATE messenger_gns_v2_challenges SET consumed=TRUE WHERE nonce=$1',
        [input.nonce]);
      return {deviceId:input.deviceId,accountId:input.accountId,
        name:input.name,wallet:input.wallet,ownershipVersion:proof.ownershipVersion,
        bindingGeneration:epoch.generation};
    });
  }
  async authorizeAction(request){
    requireIt(request&&request.network==='devnet'&&typeof request.name==='string',
      'incorrect device operation network/name');
    const name=canonicalNameV2(request.name);
    requireIt(name===request.name+'.gwap','noncanonical device action label');
    requireIt(['send','pull','grant','welcome','rotate','publish-keypackage'].includes(request.kind),
      'invalid device action');
    requireIt(hash.test(request.payloadHash)&&/^[a-f0-9]{32}$/.test(request.nonce),
      'invalid payload/nonce');
    const proof=await this.#proof(name);
    return this.#tx(async db=>{
      await this.#sync(db,name,proof);
      const r=await db.query('SELECT * FROM messenger_gns_v2_devices'+
        ' WHERE device_id=$1 FOR UPDATE',[request.deviceId]);
      const row=r.rows[0];
      requireIt(row&&!row.revoked,'device is missing or revoked');
      requireIt(row.name===name&&row.account_id===request.accountId&&
        row.owner_wallet===request.wallet&&row.owner_wallet===proof.owner&&
        row.ownership_version===proof.ownershipVersion,
        'stale .gwap owner/account/device binding');
      // Preserve existing client API: bindingGeneration identifies the name's
      // observed epoch; in this durable model, a fresh revision count is used.
      requireIt(request.bindingGeneration===Number(row.binding_generation),
        'stale durable device binding generation');
      checkedSignature(request.signature,authorizedActionBytes(request),
        transportKey(row.transport_public_spki_base64));
      const accepted=await db.query('INSERT INTO messenger_gns_v2_action_nonces'+
        ' (device_id,nonce) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [request.deviceId,request.nonce]);
      requireIt(accepted.rowCount===1,'device action nonce replay');
      return {authorized:true,deviceId:request.deviceId,
        accountId:row.account_id,name:request.name,
        ownershipVersion:proof.ownershipVersion};
    });
  }
  async checkKeyPackage(deviceId,bytes){
    requireIt(typeof deviceId==='string','invalid device id');
    requireIt(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array,
      'invalid MLS KeyPackage bytes');
    const db=await this.#pool.connect();
    let name;
    try{
      const r=await db.query('SELECT name FROM messenger_gns_v2_devices WHERE device_id=$1',
        [deviceId]);requireIt(r.rowCount===1,'unknown device');
      name=r.rows[0].name;
    }finally{db.release()}
    const proof=await this.#proof(name);
    return this.#tx(async db=>{
      await this.#sync(db,name,proof);
      const result=await db.query('SELECT * FROM messenger_gns_v2_devices'+
        ' WHERE device_id=$1 FOR UPDATE',[deviceId]);
      const row=result.rows[0];
      requireIt(row&&!row.revoked&&row.ownership_version===proof.ownershipVersion,
        'revoked/stale device KeyPackage');
      requireIt(sha256(bytes)===row.mls_keypackage_hash,
        'MLS KeyPackage mismatches wallet-authorized digest');
      // A real MLS library must validate the KeyPackage signature separately.
      return {authorized:true,deviceId};
    });
  }
}
