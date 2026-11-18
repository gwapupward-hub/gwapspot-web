// Read-only GNS V2 finalized ownership + transfer-history verifier.
// This is a TEST-ONLY security adapter: no live customer authorization or
// transaction submission. An archive-grade complete finalized history is
// mandatory. Owner-only lookups MUST NEVER be promoted to "finalized proof".
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';

export const GNS_V2_PROGRAM_ID='A9SCN6tgaoAEorFzY5ZPinruk8LCttmrAEU9JoAmUKUH';
export const RETIRED_GNS_PROGRAM_ID='6cDCrNYmasd1qmnvdLf8jyt9iFa3jW9VLzJhrb7X7SEH';
export const EXPECTED_DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const V2_NORMALIZATION_VERSION=1;
const sha=value=>createHash('sha256').update(value).digest();
const fail=(reason)=>{throw new Error('GNS_V2_FAIL_CLOSED: '+reason)};
const requireIt=(test,reason)=>{if(!test)fail(reason)};
const checkedInt=n=>Number.isSafeInteger(n)&&n>=0;
const DISCRIMINATOR=sha('account:NameRecordV2').subarray(0,8);
const anchorEvent=name=>sha('event:'+name).subarray(0,8);
const EVENT_NAMES=[
  'NameRegisteredV2','NameMigrated','NameTransferredV2','NameReclaimed',
  'NameMigrationRolledBack','NameRenewed','ResolverSet','ProfileUriUpdatedV2',
  'ResolutionAttested','NamePaymentRouted'
];
const DISCRIMINATORS=new Map(EVENT_NAMES.map(n=>[anchorEvent(n).toString('hex'),n]));
const PROGRAM=new PublicKey(GNS_V2_PROGRAM_ID);
const DEFAULT_OWNER='11111111111111111111111111111111';

export function canonicalNameV2(raw){
  requireIt(typeof raw==='string'&&raw.length<=128,'invalid name input');
  const lower=raw.trim().toLowerCase();
  const label=lower.endsWith('.gwap')?lower.slice(0,-5):lower;
  // Current GNS policy default is ASCII only; do not guess Unicode normalization.
  requireIt(label.length>=1&&label.length<=32&&
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(label) || /^[a-z0-9]$/.test(label),
    'unsupported or malformed name');
  requireIt(Buffer.byteLength(label)<=32,'name too long');
  return label+'.gwap';
}
export function deriveV2Name(raw){
  const fullName=canonicalNameV2(raw);
  const hash=sha(Buffer.concat([
    Buffer.from('gns:name:v1'),Buffer.from([V2_NORMALIZATION_VERSION]),
    Buffer.from(fullName,'utf8')
  ]));
  const [pda,bump]=PublicKey.findProgramAddressSync([
    Buffer.from('name_v2'),hash
  ],PROGRAM);
  return {name:fullName,hash,pda,bump,programId:PROGRAM};
}
class Cursor{
  constructor(raw){this.buf=Buffer.from(raw);this.at=0}
  take(n){
    requireIt(checkedInt(n)&&this.at+n<=this.buf.length,'truncated Borsh account or event');
    const out=this.buf.subarray(this.at,this.at+n);this.at+=n;return out;
  }
  pubkey(){return new PublicKey(this.take(32)).toBase58()}
  u8(){return this.take(1)[0]}
  bool(){const n=this.u8();requireIt(n===0||n===1,'bad Borsh boolean');return n===1}
  u32(){return this.take(4).readUInt32LE(0)}
  i64(){return Number(this.take(8).readBigInt64LE(0))}
  string(max){
    const n=this.u32();
    requireIt(n<=max,'Borsh string exceeds GNS field bound');
    return this.take(n).toString('utf8');
  }
}
export function decodeNameRecordV2(data,expected){
  const c=new Cursor(data);
  requireIt(c.take(8).equals(DISCRIMINATOR),'incorrect NameRecordV2 discriminator');
  const owner=c.pubkey(), resolver=c.pubkey(), hash=c.take(32);
  const fullName=c.string(37),version=c.u8(),registeredAt=c.i64();
  const expiresAt=c.i64(),uri=c.string(200),migrated=c.bool(),bump=c.u8();
  c.take(32); // reserved 32 bytes, with future changes requiring an explicit audit
  requireIt(owner!==DEFAULT_OWNER,'null name owner');
  requireIt(fullName===expected.name,'wrong canonical name on PDA');
  requireIt(hash.equals(expected.hash),'wrong name hash on PDA');
  requireIt(version===V2_NORMALIZATION_VERSION,'unsupported normalization version');
  requireIt(bump===expected.bump,'wrong PDA bump');
  requireIt(registeredAt>0&&expiresAt>=registeredAt,'invalid lifecycle timestamps');
  return {owner,resolver,fullName,registeredAt,expiresAt,
    normalizationVersion:version,migratedFromV1:migrated,profileUri:uri};
}
function decodeEvent(log){
  const encoded=/^Program data: ([A-Za-z0-9+/=]+)$/.exec(log);
  if(!encoded)return null;
  const bytes=Buffer.from(encoded[1],'base64');
  if(bytes.length<8)return null;
  const type=DISCRIMINATORS.get(bytes.subarray(0,8).toString('hex'));
  if(!type)return {type:'UNKNOWN_GNS_EVENT'};
  const c=new Cursor(bytes);c.take(8);
  if(type==='NameRegisteredV2'){
    const fullName=c.string(37),hash=c.take(32).toString('hex');
    const owner=c.pubkey();
    return {type,fullName,hash,owner};
  }
  if(type==='NameMigrated'||type==='NameMigrationRolledBack'){
    const fullName=c.string(37),hash=c.take(32).toString('hex');
    const owner=c.pubkey();
    return {type,fullName,hash,owner};
  }
  const hash=c.take(32).toString('hex');
  if(type==='NameTransferredV2'){
    return {type,hash,oldOwner:c.pubkey(),newOwner:c.pubkey()};
  }
  if(type==='NameReclaimed'){
    return {type,hash,oldOwner:c.pubkey(),newOwner:c.pubkey()};
  }
  if(type==='NameMigrationRolledBack')return {type,hash};
  return {type,hash};
}
// Parse events only while the canonical GNS program has the top invocation;
// Program-data emitted by another CPI must never authenticate a transfer.
export function nameEventsForTransaction(logMessages,hash){
  requireIt(Array.isArray(logMessages),'missing finalized transaction logs');
  const stack=[];
  const events=[];
  let entered=false;
  for(const log of logMessages){
    const inv=/^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[\d+\]$/.exec(log);
    if(inv){stack.push(inv[1]);if(inv[1]===GNS_V2_PROGRAM_ID)entered=true;continue}
    const done=/^Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed:.*)$/.exec(log);
    if(done){
      requireIt(stack.at(-1)===done[1],'inconsistent finalized invocation logs');
      stack.pop();continue;
    }
    if(stack.at(-1)!==GNS_V2_PROGRAM_ID)continue;
    const event=decodeEvent(log);
    if(event?.hash===hash.toString('hex'))events.push(event);
    if(event?.type==='UNKNOWN_GNS_EVENT')fail('unknown GNS event within name transaction');
  }
  return {events,entered};
}
function normalizeTx(result,accountAddress){
  requireIt(result&&result.meta&&result.transaction,
    'finalized signature transaction unavailable or pruned');
  requireIt(result.meta.err===null,'unexpected failed finalized transaction in history');
  const names=(result.transaction.message?.accountKeys||[]).map(k=>
    typeof k==='string'?k:(k?.pubkey?.toBase58?.()||k?.pubkey||k?.toBase58?.()));
  requireIt(names.includes(accountAddress),'transaction does not mention derived name account');
  return result;
}
export function buildOwnershipSequence(entries,currentOwner,expectedName,hash){
  requireIt(Array.isArray(entries)&&entries.length,'missing finalized name history');
  let creation=null,current=null,transfers=0;
  for(const entry of entries){
    for(const event of entry.events){
      if(event.type==='NameRegisteredV2'||event.type==='NameMigrated'){
        requireIt(event.fullName===expectedName,'creation event with wrong name');
        creation={signature:entry.signature,slot:entry.slot};
        current=event.owner;transfers=0;
      }else if(event.type==='NameMigrationRolledBack'||event.type==='NameReclaimed'){
        requireIt(creation!==null,'unanchored account closure');
        if(event.type==='NameReclaimed')
          requireIt(event.oldOwner===current,'reclaim event owner mismatch');
        creation=null;current=null;transfers=0;
      }else if(event.type==='NameTransferredV2'){
        requireIt(creation!==null,'transfer before account creation');
        requireIt(current===event.oldOwner,'disconnected owner transfer history');
        requireIt(event.newOwner!==DEFAULT_OWNER,'transfer to null owner');
        current=event.newOwner;transfers++;
      }else{
        requireIt(creation!==null,'name mutation before creation');
      }
    }
  }
  requireIt(creation&&current===currentOwner,'final owner does not match transfer history');
  return {creationSignature:creation.signature,creationSlot:creation.slot,
    transferCount:transfers,ownershipVersion:sha(
      Buffer.from([GNS_V2_PROGRAM_ID,expectedName,creation.signature,String(transfers)].join('|'))
    ).toString('hex')};
}
export async function verifyFinalizedV2Ownership({
  name,connection,clockSeconds=Math.floor(Date.now()/1000),
  maxHistory=2000,historyPageSize=100
}){
  requireIt(connection&&typeof connection.getGenesisHash==='function',
    'Solana RPC connection required');
  requireIt(checkedInt(clockSeconds),'invalid trusted clock');
  requireIt(checkedInt(maxHistory)&&maxHistory>0&&maxHistory<=20000,
    'invalid history bound');
  requireIt(checkedInt(historyPageSize)&&historyPageSize>=1&&historyPageSize<=1000,
    'invalid history page bound');
  const derived=deriveV2Name(name),accountAddress=derived.pda.toBase58();
  const genesis=await connection.getGenesisHash();
  requireIt(genesis===EXPECTED_DEVNET_GENESIS,'RPC is not expected Solana devnet');
  const deployed=await connection.getAccountInfoAndContext(PROGRAM,'finalized');
  requireIt(deployed?.value?.executable===true,'canonical GNS V2 program not executable');
  const first=await connection.getAccountInfoAndContext(derived.pda,'finalized');
  requireIt(first?.value,'V2 name record not found at finalized commitment');
  requireIt(first.value.owner?.toBase58?.()===GNS_V2_PROGRAM_ID,
    'name record has wrong onchain owner program');
  requireIt(checkedInt(first.context?.slot),'missing finalized context slot');
  const data=Buffer.from(first.value.data);
  const record=decodeNameRecordV2(data,derived);
  requireIt(clockSeconds<=record.expiresAt,'GNS name expired');
  const all=[];
  let before;
  for(;;){
    const options={limit:Math.min(historyPageSize,maxHistory-all.length)};
    if(before)options.before=before;
    const page=await connection.getSignaturesForAddress(
      derived.pda,options,'finalized');
    requireIt(Array.isArray(page),'finalized transfer history unavailable');
    if(!page.length)break;
    for(const sig of page){
      requireIt(typeof sig.signature==='string'&&checkedInt(sig.slot),
        'invalid historical signature');
      requireIt(!all.some(x=>x.signature===sig.signature),
        'repeated cursor or replayed signature');
      requireIt(sig.err===null,'non-success signature requires explicit audit');
      all.push(sig);
      requireIt(all.length<=maxHistory,'history bound exceeded');
    }
    const nextBefore=page.at(-1).signature;
    requireIt(nextBefore!==before,'nonprogressing history cursor');
    before=nextBefore;
    // Reaching exactly maxHistory is ambiguous: fail instead of assuming complete.
    requireIt(all.length<maxHistory,'history may be truncated at maxHistory');
  }
  requireIt(all.length>0,'no finalized GNS name transaction history');
  for(let i=1;i<all.length;i++){
    requireIt(all[i-1].slot>=all[i].slot,'out-of-order history signatures');
  }
  const evidence=[];
  for(const s of [...all].reverse()){
    const tx=normalizeTx(await connection.getTransaction(s.signature,{
      commitment:'finalized',maxSupportedTransactionVersion:0
    }),accountAddress);
    requireIt(tx.slot===s.slot,'signature and transaction slot mismatch');
    const {events,entered}=nameEventsForTransaction(tx.meta.logMessages,derived.hash);
    // Any program invocation touching this PDA without understood event => gap.
    // This can reject otherwise benign old transactions, by design (fail closed).
    if(entered)requireIt(events.length>0,'name transaction event missing or unknown');
    evidence.push({signature:s.signature,slot:s.slot,events});
  }
  const sequence=buildOwnershipSequence(evidence,record.owner,derived.name,derived.hash);
  const later=await connection.getAccountInfoAndContext(derived.pda,'finalized');
  requireIt(later?.value?.owner?.toBase58?.()===GNS_V2_PROGRAM_ID,
    'name account owner changed during verification');
  requireIt(Buffer.from(later.value.data).equals(data),
    'GNS record changed during verification, retry');
  requireIt(checkedInt(later.context?.slot)&&
    later.context.slot>=first.context.slot,'finalized RPC context moved backwards');
  const newest=await connection.getSignaturesForAddress(
    derived.pda,{limit:1},'finalized');
  requireIt(Array.isArray(newest)&&newest[0]?.signature===all[0].signature,
    'name history changed during verification, retry');
  return {
    network:'devnet',programId:GNS_V2_PROGRAM_ID,commitment:'finalized',
    name:derived.name,nameRecord:accountAddress,
    owner:record.owner,resolver:record.resolver,
    expiresAt:record.expiresAt,registeredAt:record.registeredAt,
    finalizedSlot:later.context.slot,
    ownershipVersion:sequence.ownershipVersion,
    creationSignature:sequence.creationSignature,
    transferCount:sequence.transferCount,
    historyComplete:true,historyEntries:all.length,
    proofScope:'finalized archive RPC complete event history (not an onchain counter)'
  };
}
// Safe adapter for the existing *test-only* device binding gate. NEVER pass
// current owner-only /resolve results here as if they were finalized proof.
export function asDeviceBindingResolver(connection){
  return async raw=>{
    const p=await verifyFinalizedV2Ownership({name:raw,connection});
    return {found:true,owner:p.owner,ownershipVersion:p.ownershipVersion,
      ownershipFinalized:true,finalizedSlot:p.finalizedSlot};
  };
}
