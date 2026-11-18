// TEST-ONLY GNS ownership → Solana Ed25519 wallet → MLS KeyPackage hash
// and browser transport-device binding. The real GNS read-only adapter is
// injected; these tests use a mutable resolver fixture, NOT Solana RPC.
// Never deploy as a production enrollment service or claim chain finality.
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';

export const GNS_DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const GNS_PROGRAM='A9SCN6tgaoAEorFzY5ZPinruk8LCttmrAEU9JoAmUKUH';
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_SPKI_PREFIX=Buffer.from('302a300506032b6570032100','hex');
const namePattern=/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const idPattern=/^gwap_[A-Za-z0-9_-]{3,80}$/;
const devicePattern=/^device_[A-Za-z0-9_-]{3,80}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const must=(ok,why)=>{if(!ok)throw new Error(why)};
export const sha256=value=>createHash('sha256').update(value).digest('hex');

export function strictDomain(value){
  must(typeof value==='string','Invalid .gwap domain');
  const stripped=value.trim().toLowerCase();
  const name=stripped.endsWith('.gwap')?stripped.slice(0,-5):stripped;
  must(namePattern.test(name)&&name.length<=32,'Invalid .gwap domain');
  return name;
}

// Small test-only public-key decoder; production must use audited Solana APIs.
export function decodeSolanaWallet(address){
  must(typeof address==='string'&&address.length>=32&&address.length<=44,
    'Invalid Solana wallet address');
  let integer=0n;
  for(const char of address){
    const digit=ALPHABET.indexOf(char);
    must(digit>=0,'Invalid base58 wallet');
    integer=integer*58n+BigInt(digit);
  }
  const out=[];
  while(integer>0n){out.unshift(Number(integer&255n));integer>>=8n;}
  const leading=(address.match(/^1*/)||[''])[0].length;
  const bytes=Buffer.from([...new Array(leading).fill(0),...out]);
  must(bytes.length===32,'Invalid Solana wallet length');
  return bytes;
}
function walletPublicKey(address){
  return createPublicKey({key:Buffer.concat([ED25519_SPKI_PREFIX,decodeSolanaWallet(address)]),
    format:'der',type:'spki'});
}
function devicePublicKey(encoded){
  must(typeof encoded==='string'&&encoded.length<=200,'Invalid transport key');
  const der=Buffer.from(encoded,'base64');
  must(der.toString('base64')===encoded&&der.length===44&&
    der.subarray(0,12).equals(ED25519_SPKI_PREFIX),
    'Invalid Ed25519 transport public key');
  return createPublicKey({key:der,format:'der',type:'spki'});
}
function signatureBase64(text){
  must(typeof text==='string'&&text.length<=200,'Invalid signature');
  const b=Buffer.from(text,'base64');
  must(b.length===64&&b.toString('base64')===text,'Invalid Ed25519 signature length');
  return b;
}
function message(domain,items){
  return Buffer.from(JSON.stringify([domain,...items]));
}
export function enrollmentIntentBytes(data){
  return message('GWAP_MESSENGER_GNS_DEVICE_ENROLL_V1',[
    data.network,data.genesisHash,data.programId,data.name,
    data.wallet,data.accountId,data.deviceId,
    data.transportPublicSpkiBase64,data.mlsKeyPackageHash,
    data.nonce,data.expiresAt
  ]);
}
export function authorizedActionBytes(data){
  return message('GWAP_MESSENGER_GNS_DEVICE_ACTION_V1',[
    data.network,data.name,data.accountId,data.deviceId,
    data.wallet,data.bindingGeneration,data.kind,data.payloadHash,data.nonce
  ]);
}
function validateEnrollment(d){
  must(d&&d.network==='devnet'&&d.genesisHash===GNS_DEVNET_GENESIS&&
    d.programId===GNS_PROGRAM,'Wrong GNS network, genesis, or program');
  must(strictDomain(d.name)===d.name,'Name must be canonical');
  decodeSolanaWallet(d.wallet);
  must(idPattern.test(d.accountId)&&devicePattern.test(d.deviceId),
    'Invalid stable account or device ID');
  devicePublicKey(d.transportPublicSpkiBase64);
  must(hashPattern.test(d.mlsKeyPackageHash),'Invalid MLS KeyPackage digest');
  must(typeof d.nonce==='string'&&/^[a-f0-9]{32}$/.test(d.nonce),
    'Invalid enrollment challenge');
  must(Number.isSafeInteger(d.expiresAt),'Invalid expiration');
}
export class GnsDeviceBindingGate {
  #resolver;
  #names=new Map();
  #bindings=new Map();
  #stableAccountOwners=new Map();
  #nonces=new Map();
  #usedActions=new Set();
  #now;
  #requireFinalized;

  constructor({resolver,now=()=>Date.now(),requireFinalized=false}){
    must(typeof resolver==='function','Resolver required');
    this.#resolver=resolver;this.#now=now;
    this.#requireFinalized=Boolean(requireFinalized);
  }
  issueChallenge(name){
    name=strictDomain(name);
    const nonce=randomBytes(16).toString('hex');
    const expiresAt=this.#now()+120000;
    this.#nonces.set(nonce,{name,expiresAt});
    return {nonce,expiresAt};
  }
  async #observed(name){
    let answer;
    try{answer=await this.#resolver(name)}catch{}
    must(answer&&typeof answer==='object'&&typeof answer.found==='boolean',
      'GNS resolver unavailable; messaging locked');
    if(this.#requireFinalized){
      must(answer.found===true && answer.ownershipFinalized===true &&
        hashPattern.test(answer.ownershipVersion) &&
        Number.isSafeInteger(answer.finalizedSlot) && answer.finalizedSlot>0,
        'Finalized GNS history proof missing or incomplete; messaging locked');
    }
    let wallet=null;
    if(answer.found){
      must(typeof answer.owner==='string','GNS owner unresolved; messaging locked');
      decodeSolanaWallet(answer.owner);
      wallet=answer.owner;
    }
    const prior=this.#names.get(name);
    if(!prior){
      const value={wallet,generation:1,
        ownershipVersion:answer.ownershipVersion||null};
      this.#names.set(name,value);
      return value;
    }
    if(prior.wallet!==wallet ||
      (this.#requireFinalized&&prior.ownershipVersion!==answer.ownershipVersion)){
      const next={wallet,generation:prior.generation+1,
        ownershipVersion:answer.ownershipVersion||null};
      this.#names.set(name,next);
      for(const entry of this.#bindings.values()){
        if(entry.name===name)entry.revoked=true;
      }
      return next;
    }
    return prior;
  }
  async enroll(intent){
    validateEnrollment(intent);
    const clock=this.#now();
    const challenge=this.#nonces.get(intent.nonce);
    must(challenge&&challenge.name===intent.name&&
      challenge.expiresAt===intent.expiresAt&&clock<=challenge.expiresAt,
      'Expired, replayed or unsolicited enrollment challenge');
    must(!this.#bindings.has(intent.deviceId),'Device already enrolled');
    const live=await this.#observed(intent.name);
    must(live.wallet===intent.wallet,'Wallet does not currently own .gwap name');
    const priorAccountOwner=this.#stableAccountOwners.get(intent.accountId);
    must(!priorAccountOwner||priorAccountOwner===intent.wallet,
      'Stable GWAP account cannot transfer with a .gwap alias');
    must(intent.expiresAt-clock<=120000,'Excessive challenge validity');
    must(verify(null,enrollmentIntentBytes(intent),
      walletPublicKey(intent.wallet),signatureBase64(intent.walletSignature)),
      'Invalid controlling-wallet Ed25519 signature');
    must(!Array.from(this.#bindings.values()).some(e=>!e.revoked&&e.name===intent.name&&
      e.accountId===intent.accountId&&e.transportPublicSpkiBase64===intent.transportPublicSpkiBase64),
      'Duplicate active transport identity');
    this.#nonces.delete(intent.nonce);
    const result={
      name:intent.name,wallet:intent.wallet,accountId:intent.accountId,
      deviceId:intent.deviceId,generation:live.generation,
      transportPublicSpkiBase64:intent.transportPublicSpkiBase64,
      mlsKeyPackageHash:intent.mlsKeyPackageHash,revoked:false
    };
    this.#bindings.set(intent.deviceId,result);
    this.#stableAccountOwners.set(intent.accountId,intent.wallet);
    return {deviceId:result.deviceId,name:result.name,wallet:result.wallet,
      accountId:result.accountId,bindingGeneration:live.generation,
      keyPackageHash:result.mlsKeyPackageHash};
  }
  async authorizeAction(request){
    must(request&&typeof request==='object','Invalid action');
    const name=strictDomain(request.name);
    must(name===request.name&&request.network==='devnet','Invalid action network/name');
    must(typeof request.kind==='string'&&
      ['publish-keypackage','send','pull','grant','rotate','welcome'].includes(request.kind),
      'Unknown device operation');
    must(hashPattern.test(request.payloadHash),'Invalid signed action payload hash');
    must(typeof request.nonce==='string'&&/^[a-f0-9]{32}$/.test(request.nonce),
      'Invalid action nonce');
    const entry=this.#bindings.get(request.deviceId);
    must(entry&&!entry.revoked,'Unrecognized or revoked messaging device');
    const live=await this.#observed(name);
    must(entry.name===name&&entry.accountId===request.accountId&&
      entry.wallet===request.wallet&&entry.generation===request.bindingGeneration&&
      entry.generation===live.generation&&entry.wallet===live.wallet,
      'Stale .gwap ownership or device binding: re-enroll and rekey');
    const digest=entry.deviceId+':'+request.nonce;
    must(!this.#usedActions.has(digest),'Device request nonce replay');
    const signature=signatureBase64(request.signature);
    must(verify(null,authorizedActionBytes(request),
      devicePublicKey(entry.transportPublicSpkiBase64),signature),
      'Invalid enrolled-device Ed25519 signature');
    this.#usedActions.add(digest);
    return {authorized:true,accountId:entry.accountId,
      name:entry.name,generation:entry.generation,deviceId:entry.deviceId};
  }
  async checkKeyPackage(deviceId,keyPackageBytes){
    const entry=this.#bindings.get(deviceId);
    must(entry&&!entry.revoked,'Device revoked');
    const live=await this.#observed(entry.name);
    must(entry.wallet===live.wallet&&entry.generation===live.generation,
      'Stale binding: KeyPackage publication refused');
    must(Buffer.isBuffer(keyPackageBytes)||keyPackageBytes instanceof Uint8Array,
      'Invalid MLS KeyPackage bytes');
    must(keyPackageBytes.length>100&&keyPackageBytes.length<=16384&&
      sha256(keyPackageBytes)===entry.mlsKeyPackageHash,
      'MLS KeyPackage differs from wallet-authorized credential');
    // Does NOT independently verify MLS signature; separate OpenMLS client must
    // call KeyPackageIn::validate before trusting the sender.
    return {authorized:true,deviceId};
  }
  async revalidate(name){
    return this.#observed(strictDomain(name));
  }
  get bindingCount(){return this.#bindings.size}
}
