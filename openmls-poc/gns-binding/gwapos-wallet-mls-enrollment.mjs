// TEST ONLY: GwapOS wallet-signature enrollment boundary for GNS V2 Messenger.
// Does not talk to a live session issuer, wallet, GNS or Neon. A real
// GwapOS server must inject a genuine authenticated session verifier and
// independently trusted finalized GNS reader. No transaction signing.
import {randomBytes} from 'node:crypto';
import {canonicalNameV2} from './gns-v2-finalized.mjs';
import {sha256,enrollmentIntentBytes,
  GNS_PROGRAM,GNS_DEVNET_GENESIS} from './gns-device-binding.mjs';

const fail=why=>{throw Error('GWAPOS_MESSENGER_ENROLL_DENIED: '+why)};
const requireIt=(ok,why)=>{if(!ok)fail(why)};
const hash=/^[a-f0-9]{64}$/;
const account=/^gwap_[A-Za-z0-9_-]{3,80}$/;
const device=/^device_[A-Za-z0-9_-]{3,80}$/;

function validateSession(s){
  requireIt(s&&s.authenticated===true&&typeof s.subject==='string'&&
    s.subject.length>0&&account.test(s.accountId)&&
    typeof s.verifiedWallet==='string'&&s.verifiedWallet.length>=32&&
    typeof s.verifiedWallet==='string',
    'real authenticated GwapOS session and stable account required');
  return s;
}
// Only supports the server-issued challenge+one-time wallet signature.
// The signed envelope additionally binds device transport key and exact MLS
// KeyPackage hash, without exposing MLS private state to the server.
export class TestOnlyMessengerWalletEnrollmentGateway {
  #directory;#verifySession;#readFinalized;#clock;#pending=new Map();
  #verifyMlsKeyPackage;
  constructor({directory,verifySession,readFinalized,verifyMlsKeyPackage,
    now=()=>Date.now()}){
    requireIt(directory&&typeof directory.enroll==='function'&&
      typeof directory.issueChallenge==='function','directory required');
    requireIt(typeof verifySession==='function','session verifier required');
    requireIt(typeof readFinalized==='function','finalized GNS verifier required');
    // No optional bypass: the admission gate must validate the actual
    // OpenMLS KeyPackage cryptographic signature and credential identity.
    requireIt(typeof verifyMlsKeyPackage==='function',
      'trusted native OpenMLS credential verifier required');
    this.#verifyMlsKeyPackage=verifyMlsKeyPackage;
    this.#directory=directory;this.#verifySession=verifySession;
    this.#readFinalized=readFinalized;this.#clock=now;
  }
  async #session(token){
    requireIt(typeof token==='string'&&token.length>=12,'session bearer missing');
    let session;
    try{session=await this.#verifySession(token)}catch{}
    return validateSession(session);
  }
  async #live(name){
    let p;
    try{p=await this.#readFinalized(name)}catch{}
    requireIt(p&&p.name===name&&p.network==='devnet'&&
      p.historyComplete===true&&p.independentRpcCorroboration===true&&
      p.commitment==='finalized'&&p.programId===GNS_PROGRAM&&
      hash.test(p.ownershipVersion)&&
      Number.isSafeInteger(p.finalizedSlot)&&p.finalizedSlot>0&&
      Number.isSafeInteger(p.transferCount)&&p.transferCount>=0,
      'incomplete or uncorroborated finalized GNS V2 ownership evidence');
    return p;
  }
  async #assertMlsCredential(bytes,accountId,deviceId){
    let evidence;
    try{evidence=await this.#verifyMlsKeyPackage({
      bytes,accountId,deviceId});}catch{}
    const expected='GWAP-MLS-IDENTITY-V1|'+accountId+'|'+deviceId;
    requireIt(evidence?.validated===true&&
      evidence.credentialIdentity===expected&&
      typeof evidence.signaturePublicKeyHex==='string'&&
      /^[0-9a-f]{64}$/.test(evidence.signaturePublicKeyHex),
      'signed OpenMLS KeyPackage or credential identity invalid');
    return evidence;
  }
  async issueChallenge({sessionToken,name,deviceId,
      transportPublicSpkiBase64,mlsKeyPackageBytes}){
    const session=await this.#session(sessionToken);
    const full=canonicalNameV2(name);
    const live=await this.#live(full);
    requireIt(live.owner===session.verifiedWallet,
      'authenticated GwapOS wallet is not finalized .gwap owner');
    requireIt(device.test(deviceId)&&typeof transportPublicSpkiBase64==='string'&&
      transportPublicSpkiBase64.length<=200,'invalid new device');
    requireIt((mlsKeyPackageBytes instanceof Uint8Array||
      Buffer.isBuffer(mlsKeyPackageBytes))&&mlsKeyPackageBytes.length>100&&
      mlsKeyPackageBytes.length<=16384,'invalid serialized MLS KeyPackage');
    await this.#assertMlsCredential(mlsKeyPackageBytes,
      session.accountId,deviceId);
    const keyHash=sha256(mlsKeyPackageBytes);
    const challenge=await this.#directory.issueChallenge(full);
    // Bound test-only in-memory attempts; production must use a shared,
    // transactional one-time challenge store across all service replicas.
    for(const [id,pending] of this.#pending){
      if(pending.consumed||pending.expiresAt<this.#clock())this.#pending.delete(id);
    }
    requireIt(this.#pending.size<128,'too many outstanding enrollment attempts');
    const attempt=randomBytes(16).toString('hex');
    const expected={
      network:'devnet',genesisHash:GNS_DEVNET_GENESIS,
      programId:GNS_PROGRAM,
      name:full.slice(0,-5),
      wallet:session.verifiedWallet,accountId:session.accountId,
      deviceId,transportPublicSpkiBase64,mlsKeyPackageHash:keyHash,
      nonce:challenge.nonce,expiresAt:challenge.expiresAt
    };
    this.#pending.set(attempt,{
      ...expected,subject:session.subject,fullName:full,
      finalizedVersion:live.ownershipVersion,
      consumed:false
    });
    return {attempt,signable:expected,
      summary:'Authorize this specific GWAP Messenger device for '+full+
        ' with a message signature only; this cannot move tokens.',
      noTransaction:true};
  }
  async complete({sessionToken,attempt,signedIntent,mlsKeyPackageBytes}){
    const session=await this.#session(sessionToken);
    requireIt(typeof attempt==='string'&&/^[a-f0-9]{32}$/.test(attempt),
      'invalid wallet challenge identifier');
    const saved=this.#pending.get(attempt);
    requireIt(saved&&!saved.consumed,'wallet challenge absent or already used');
    saved.consumed=true; // fail closed; retry requires new challenge
    requireIt(saved.subject===session.subject&&
      saved.wallet===session.verifiedWallet&&
      saved.accountId===session.accountId,'authenticated session changed');
    requireIt(saved.expiresAt>=this.#clock(),'wallet challenge expired');
    const live=await this.#live(saved.fullName);
    requireIt(live.owner===saved.wallet&&
      live.ownershipVersion===saved.finalizedVersion,
      'name transferred or ownership proof changed before enrollment');
    requireIt(signedIntent&&typeof signedIntent==='object',
      'wallet signature envelope required');
    for(const [k,v] of Object.entries(saved)){
      if(['consumed','subject','fullName','finalizedVersion'].includes(k))continue;
      requireIt(signedIntent[k]===v,'signed challenge property mismatch: '+k);
    }
    requireIt(Buffer.isBuffer(mlsKeyPackageBytes)||
      mlsKeyPackageBytes instanceof Uint8Array,
      'MLS KeyPackage bytes missing');
    requireIt(sha256(mlsKeyPackageBytes)===saved.mlsKeyPackageHash,
      'MLS KeyPackage changed after signed wallet challenge');
    await this.#assertMlsCredential(mlsKeyPackageBytes,
      saved.accountId,saved.deviceId);
    const bound=await this.#directory.enroll(signedIntent);
    await this.#directory.checkKeyPackage(bound.deviceId,mlsKeyPackageBytes);
    return {deviceId:bound.deviceId,accountId:bound.accountId,
      name:saved.fullName,ownershipVersion:bound.ownershipVersion,
      bindingGeneration:bound.bindingGeneration,
      eligibleToTest:true,authorizedForProduction:false};
  }
}
// A wallet-adapter/Privy client can pass the verified wallet's signMessage
// capability. Only a signature over the exact server challenge is requested.
// The production UI must show this message and obtain explicit consent.
export async function signMessengerChallenge({challenge,signMessage}){
  requireIt(challenge&&challenge.noTransaction===true&&
    typeof signMessage==='function','wallet message-signing capability required');
  const message=enrollmentIntentBytes(challenge.signable);
  const signed=await signMessage(new Uint8Array(message));
  const raw=signed instanceof Uint8Array||Buffer.isBuffer(signed)?signed:
    signed?.signature;
  requireIt(raw instanceof Uint8Array||Buffer.isBuffer(raw),
    'wallet declined or could not sign');
  requireIt(raw.length===64,'wallet signature must be 64 bytes');
  return {...challenge.signable,
    walletSignature:Buffer.from(raw).toString('base64')};
}
