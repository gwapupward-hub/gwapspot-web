// Read-only 2-provider corroboration of roadmap.gwap finalized GNS V2 history.
// A second RPC MUST independently provide the complete finalized registration
// and name history; a matching owner-only lookup is never enough.
// No wallet, secret, transaction or production authorization.
import {Connection} from '@solana/web3.js';
import {verifyFinalizedV2Ownership} from './gns-v2-finalized.mjs';

const name='roadmap.gwap';
const primary='https://api.devnet.solana.com';
const secondary=process.env.GNS_ARCHIVE_READONLY_DEVNET_RPC||
  'https://solana-devnet.drpc.org';
const out={
  name,network:'devnet',comparison:'UNVERIFIED',
  independentArchiveConfirmed:false,canAuthorizeMessaging:false,
  noTransactionSubmitted:true,results:{}
};
function host(raw){
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password)throw Error();
    return url.hostname;
  }catch{throw Error('Only HTTPS RPC endpoints are allowed');}
}
const primaryHost=host(primary),secondaryHost=host(secondary);
if(primaryHost===secondaryHost)throw Error('Second RPC must use a different hostname');
out.results.primaryHost=primaryHost;
out.results.secondaryHost=secondaryHost;
async function read(url,tag){
  const connection=new Connection(url,{commitment:'finalized',
    confirmTransactionInitialTimeout:10000});
  const stop=new Promise((_,reject)=>setTimeout(
    ()=>reject(Error('read-only audit deadline exceeded')),60000));
  return Promise.race([verifyFinalizedV2Ownership({
    name,connection,maxHistory:500,historyPageSize:100
  }),stop]).then(proof=>{
    out.results[tag]={
      status:'VERIFIED_ON_THIS_RPC',owner:proof.owner,
      namePda:proof.nameRecord,ownershipVersion:proof.ownershipVersion,
      creationSignature:proof.creationSignature,transferCount:proof.transferCount,
      historyEntries:proof.historyEntries,slot:proof.finalizedSlot
    };
    return proof;
  }).catch(err=>{
    out.results[tag]={status:'FAILED_CLOSED',
      error:String(err?.message||err).slice(0,350)};
    return null;
  });
}
const first=await read(primary,'primary');
const second=await read(secondary,'secondary');
if(first&&second){
  const keys=['network','programId','name','nameRecord','owner',
    'ownershipVersion','creationSignature','transferCount','historyEntries'];
  const mismatch=keys.filter(k=>first[k]!==second[k]);
  if(mismatch.length){
    out.results.mismatch=mismatch;
    out.comparison='DISAGREEMENT_FAIL_CLOSED';
  }else{
    out.comparison='MATCHING_FINALIZED_RPC_RESPONSES';
    out.independentArchiveConfirmed=true;
  }
}else{
  out.comparison='SECONDARY_ARCHIVE_EVIDENCE_UNAVAILABLE';
}
console.log(JSON.stringify(out,null,2));
// An absent/failed secondary provider is a BLOCKED security gate, not success.
if(!out.independentArchiveConfirmed)process.exitCode=2;
