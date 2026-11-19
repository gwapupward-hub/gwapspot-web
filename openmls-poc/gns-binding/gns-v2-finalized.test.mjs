import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey,Keypair} from '@solana/web3.js';
import {
  GNS_V2_PROGRAM_ID,RETIRED_GNS_PROGRAM_ID,EXPECTED_DEVNET_GENESIS,
  deriveV2Name,decodeNameRecordV2,verifyFinalizedV2Ownership,
  nameEventsForTransaction,canonicalNameV2,asDeviceBindingResolver
} from './gns-v2-finalized.mjs';

const sha=v=>createHash('sha256').update(v).digest();
const program=new PublicKey(GNS_V2_PROGRAM_ID);
const char=n=>Buffer.from(n,'utf8');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b};
const i64=n=>{const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(n));return b};
const stretch=(...items)=>Buffer.concat(items);
const str=v=>stretch(u32(Buffer.byteLength(v)),char(v));
const wallet=()=>Keypair.generate().publicKey;
const ALICE=wallet(),BOB=wallet(),CAROL=wallet();
const DERIVED=deriveV2Name('papi.gwap');
const NOW=Date.parse('2026-11-17T20:00:00Z')/1000;

function record(owner=ALICE,{name=DERIVED.name,hash=DERIVED.hash,
  version=1,bump=DERIVED.bump,expiresAt=NOW+3600*24*300}={}){
  return stretch(
    sha('account:NameRecordV2').subarray(0,8),
    owner.toBuffer(),PublicKey.default.toBuffer(),hash,str(name),
    Buffer.from([version]),i64(NOW-3600*24),i64(expiresAt),
    str(''),Buffer.from([0,bump]),Buffer.alloc(32)
  );
}
function event(type,{owner=ALICE,old=ALICE,next=BOB,
  hash=DERIVED.hash,name=DERIVED.name}={}){
  const prefix=sha('event:'+type).subarray(0,8);
  if(type==='NameRegisteredV2')return stretch(prefix,str(name),hash,
    owner.toBuffer(),Buffer.from([1]),i64(NOW-3600*24),i64(NOW+3600*24*300),i64(0));
  if(type==='NameMigrated'||type==='NameMigrationRolledBack')
    return stretch(prefix,str(name),hash,owner.toBuffer(),ALICE.toBuffer());
  if(type==='NameTransferredV2')return stretch(prefix,hash,old.toBuffer(),next.toBuffer());
  if(type==='NameReclaimed')return stretch(prefix,hash,old.toBuffer(),next.toBuffer(),i64(NOW));
  if(type==='NameRenewed')return stretch(prefix,hash,owner.toBuffer(),Buffer.from([1]),i64(NOW+200000),i64(1));
  throw Error('Unknown test event');
}
function historyEntry(type,options={},slot){
  return {signature:'test-'+slot,slot,
    logs:[
      'Program '+GNS_V2_PROGRAM_ID+' invoke [1]',
      'Program log: Instruction: '+type,
      'Program data: '+event(type,options).toString('base64'),
      'Program '+GNS_V2_PROGRAM_ID+' success'
    ]};
}
function fixtures({owner=ALICE,entries=[
  historyEntry('NameRegisteredV2',{owner:ALICE},100)
],historyMissing=false,recordOverride,wrongProgram=false,genesis=EXPECTED_DEVNET_GENESIS,
mutateSecondRead=false,latestChanged=false,txMissing=false,failProgram=false}={}){
  const nameData=recordOverride||record(owner);
  const descending=[...entries].sort((a,b)=>b.slot-a.slot);
  let nameReads=0,signatureQueries=0;
  const methods=[];
  const rpc={
    async getGenesisHash(){methods.push('getGenesisHash');return genesis},
    async getAccountInfoAndContext(pubkey,commitment){
      assert.equal(commitment,'finalized');methods.push('getAccountInfoAndContext');
      if(pubkey.toBase58()===GNS_V2_PROGRAM_ID){
        return {context:{slot:250},value:failProgram?null:{
          executable:true,owner:PublicKey.default,data:Buffer.alloc(40)}};
      }
      assert.equal(pubkey.toBase58(),DERIVED.pda.toBase58());
      nameReads++;
      return {context:{slot:250+nameReads},value:{
        owner:wrongProgram?PublicKey.default:program,
        executable:false,
        data:mutateSecondRead&&nameReads>1?Buffer.concat([nameData,Buffer.from('new')]):nameData
      }};
    },
    async getSignaturesForAddress(pubkey,options,commitment){
      assert.equal(pubkey.toBase58(),DERIVED.pda.toBase58());
      assert.equal(commitment,'finalized');methods.push('getSignaturesForAddress');
      signatureQueries++;
      if(latestChanged&&signatureQueries>=3&&options.limit===1){
        return [{signature:'new-finalized-transfer',slot:255,err:null}];
      }
      if(historyMissing)return [];
      const before=options.before;
      const start=before?descending.findIndex(e=>e.signature===before)+1:0;
      assert.ok(start>=0);
      return descending.slice(start,start+options.limit)
        .map(e=>({signature:e.signature,slot:e.slot,err:null}));
    },
    async getTransaction(signature,params){
      assert.equal(params.commitment,'finalized');
      assert.equal(params.maxSupportedTransactionVersion,0);
      methods.push('getTransaction');
      if(txMissing)return null;
      const entry=entries.find(e=>e.signature===signature);
      assert.ok(entry);
      return {slot:entry.slot,transaction:{message:{
        accountKeys:[DERIVED.pda,program,ALICE]}},
        meta:{err:null,logMessages:entry.logs}};
    }
  };
  return {rpc,methods};
}
const verify=(f,other={})=>verifyFinalizedV2Ownership({
  name:'PAPI.GWAP',connection:f.rpc,clockSeconds:NOW,
  historyPageSize:1,...other
});

test('canonical V2 A9SCN6 program, fixed digest and PDA match source semantics',()=>{
  assert.equal(GNS_V2_PROGRAM_ID,'A9SCN6tgaoAEorFzY5ZPinruk8LCttmrAEU9JoAmUKUH');
  assert.notEqual(GNS_V2_PROGRAM_ID,RETIRED_GNS_PROGRAM_ID);
  assert.equal(DERIVED.hash.toString('hex'),
    '4721516c98a98966990f9ce7398316e003f1f50958ad25ef5822d506ba4770b9');
  assert.equal(DERIVED.pda.toBase58(),
    PublicKey.findProgramAddressSync([Buffer.from('name_v2'),DERIVED.hash],program)[0].toBase58());
  assert.equal(canonicalNameV2(' PaPi.GWAP '),'papi.gwap');
  for(const bad of ['pa..pi.gwap','-papi.gwap','pa_pi.gwap','pa pi.gwap','🔥.gwap']){
    assert.throws(()=>canonicalNameV2(bad),/GNS_V2_FAIL_CLOSED/);
  }
});

test('decodes correct Anchor V2 ownership and rejects wrong bump/name/hash/discriminator',()=>{
  const decoded=decodeNameRecordV2(record(ALICE),DERIVED);
  assert.equal(decoded.owner,ALICE.toBase58());
  assert.equal(decoded.fullName,'papi.gwap');
  assert.equal(decoded.expiresAt,NOW+3600*24*300);
  for(const bad of [
    record(ALICE,{bump:(DERIVED.bump+1)%256}),
    record(ALICE,{name:'other.gwap'}),
    record(ALICE,{hash:Buffer.alloc(32)}),
    Buffer.alloc(200)
  ])assert.throws(()=>decodeNameRecordV2(bad,DERIVED),/GNS_V2_FAIL_CLOSED/);
});

test('finalized RPC read and complete registered history yield verifiable owner epoch',async()=>{
  const f=fixtures();
  const out=await verify(f);
  assert.equal(out.owner,ALICE.toBase58());
  assert.equal(out.programId,GNS_V2_PROGRAM_ID);
  assert.equal(out.commitment,'finalized');
  assert.equal(out.transferCount,0);
  assert.equal(out.historyComplete,true);
  assert.ok(out.ownershipVersion.match(/^[0-9a-f]{64}$/));
  assert.equal(f.methods.filter(x=>x==='getTransaction').length,1);
  assert.equal(f.methods.filter(x=>x==='getAccountInfoAndContext').length,3);
});

test('complete A→B→A transfer history changes ownership version despite unchanged owner',async()=>{
  const f=fixtures({owner:ALICE,entries:[
    historyEntry('NameRegisteredV2',{owner:ALICE},100),
    historyEntry('NameTransferredV2',{old:ALICE,next:BOB},105),
    historyEntry('NameTransferredV2',{old:BOB,next:ALICE},110)
  ]});
  const first=await verify(fixtures());
  const current=await verify(f);
  assert.equal(current.owner,first.owner);
  assert.equal(current.transferCount,2);
  assert.notEqual(current.ownershipVersion,first.ownershipVersion);
  assert.equal(current.historyEntries,3);
});

test('a fresh transfer to a new wallet is proven by finalized sequential history',async()=>{
  const f=fixtures({owner:BOB,entries:[
    historyEntry('NameRegisteredV2',{owner:ALICE},100),
    historyEntry('NameTransferredV2',{old:ALICE,next:BOB},120)
  ]});
  const current=await verify(f);
  assert.equal(current.owner,BOB.toBase58());
  assert.equal(current.transferCount,1);
});

test('reclaim+re-register changes creation epoch even when final owner is original',async()=>{
  const original=await verify(fixtures());
  const f=fixtures({owner:ALICE,entries:[
    historyEntry('NameRegisteredV2',{owner:ALICE},100),
    historyEntry('NameReclaimed',{old:ALICE,next:BOB},110),
    historyEntry('NameRegisteredV2',{owner:ALICE},120)
  ]});
  const current=await verify(f);
  assert.equal(current.transferCount,0);
  assert.notEqual(current.creationSignature,original.creationSignature);
  assert.notEqual(current.ownershipVersion,original.ownershipVersion);
});

test('migration and migration rollback invalidate prior record incarnation',async()=>{
  const f=fixtures({owner:BOB,entries:[
    historyEntry('NameMigrated',{owner:ALICE},100),
    historyEntry('NameMigrationRolledBack',{owner:ALICE},105),
    historyEntry('NameRegisteredV2',{owner:BOB},110)
  ]});
  const current=await verify(f);
  assert.equal(current.owner,BOB.toBase58());
  assert.equal(current.creationSignature,'test-110');
});

test('reject truncated or pruned finalized history and missing creation anchor',async()=>{
  await assert.rejects(verify(fixtures({historyMissing:true})),/no finalized GNS name transaction history/);
  await assert.rejects(verify(fixtures({txMissing:true})),/unavailable or pruned/);
  await assert.rejects(verify(fixtures({entries:[
    historyEntry('NameTransferredV2',{old:ALICE,next:BOB},120)
  ],owner:BOB})),/transfer before account creation/);
  await assert.rejects(verify(fixtures(),{maxHistory:1}),/history may be truncated/);
});

test('reject mismatched transfer provenance and inconsistent current owner',async()=>{
  await assert.rejects(verify(fixtures({owner:CAROL})),/final owner does not match/);
  await assert.rejects(verify(fixtures({owner:BOB,entries:[
    historyEntry('NameRegisteredV2',{owner:ALICE},100),
    historyEntry('NameTransferredV2',{old:CAROL,next:BOB},101)
  ]})),/disconnected owner transfer history/);
});

test('reject incorrect genesis, missing executable V2, wrong account-owner program',async()=>{
  await assert.rejects(verify(fixtures({genesis:'not-devnet'})),/RPC is not expected Solana devnet/);
  await assert.rejects(verify(fixtures({failProgram:true})),/program not executable/);
  await assert.rejects(verify(fixtures({wrongProgram:true})),/wrong onchain owner program/);
});

test('reject expired name and unsupported normalization version',async()=>{
  await assert.rejects(verify(fixtures({recordOverride:record(ALICE,{
    expiresAt:NOW-1
  })})),/GNS name expired/);
  await assert.rejects(verify(fixtures({recordOverride:record(ALICE,{
    version:2
  })})),/unsupported normalization version/);
});

test('reject missing GNS program event and ignore forged CPI event',async()=>{
  const valid=historyEntry('NameRegisteredV2',{owner:ALICE},100);
  const missing=fixtures({entries:[{...valid,
    logs:['Program '+GNS_V2_PROGRAM_ID+' invoke [1]',
      'Program log: no trusted GNS event',
      'Program '+GNS_V2_PROGRAM_ID+' success']} ]});
  await assert.rejects(verify(missing),/name transaction event missing/);
  const forged=fixtures({entries:[{...valid,logs:[
    'Program '+GNS_V2_PROGRAM_ID+' invoke [1]',
    'Program '+PublicKey.default.toBase58()+' invoke [2]',
    'Program data: '+event('NameRegisteredV2',{owner:ALICE}).toString('base64'),
    'Program '+PublicKey.default.toBase58()+' success',
    'Program '+GNS_V2_PROGRAM_ID+' success'
  ]}]});
  await assert.rejects(verify(forged),/name transaction event missing/);
});

test('reject onchain record or history change during verification',async()=>{
  await assert.rejects(verify(fixtures({mutateSecondRead:true})),
    /GNS record changed during verification/);
  await assert.rejects(verify(fixtures({latestChanged:true})),
    /name history changed during verification/);
});

test('safe adapter includes a transfer version rather than owner-only shape',async()=>{
  const f=fixtures();
  const result=await asDeviceBindingResolver(f.rpc)('papi');
  assert.equal(result.found,true);
  assert.equal(result.ownershipFinalized,true);
  assert.equal(result.owner,ALICE.toBase58());
  assert.match(result.ownershipVersion,/^[0-9a-f]{64}$/);
  assert.ok(result.finalizedSlot>0);
});

test('finalized reader never performs RPC write operations',async()=>{
  const f=fixtures();
  Object.assign(f.rpc,{
    sendTransaction(){throw Error('unexpected write')},
    sendRawTransaction(){throw Error('unexpected write')},
    requestAirdrop(){throw Error('unexpected write')}
  });
  await verify(f);
  assert.deepEqual([...new Set(f.methods)].sort(),[
    'getAccountInfoAndContext','getGenesisHash','getSignaturesForAddress','getTransaction'
  ]);
});
