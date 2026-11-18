// Manual, READ-ONLY independent RPC verification of roadmap.gwap.
// Secondary endpoint is a GitHub Actions secret, NOT committed to source.
// Never print RPC URLs, query parameters, provider error objects or tokens.
// An unavailable provider MUST fail closed. No RPC transaction methods.
import {Connection} from '@solana/web3.js';
import {verifyFinalizedV2Ownership} from './gns-v2-finalized.mjs';
import {compareFinalizedGnsEvidence} from './roadmap-archive-comparison.mjs';

const name='roadmap.gwap';
const firstEndpoint='https://api.devnet.solana.com';
const secondEndpoint=process.env.GNS_ARCHIVE_READONLY_DEVNET_RPC;
const out={
  name,network:'devnet',
  comparison:'BLOCKED',independentRpcCorroboration:false,
  archiveCompletenessProven:false,canAuthorizeMessaging:false,
  noTransactionSubmitted:true,results:{}
};
function endpointOrigin(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash){
    throw Error('invalid secondary HTTPS endpoint configuration');
  }
  return url.origin;
}
if(!secondEndpoint){
  out.comparison='ARCHIVE_ENDPOINT_SECRET_NOT_CONFIGURED';
  console.log(JSON.stringify(out,null,2));
  process.exitCode=2;
}else{
  try{
    const firstOrigin=endpointOrigin(firstEndpoint);
    const secondOrigin=endpointOrigin(secondEndpoint);
    if(firstOrigin===secondOrigin)throw Error('SECOND_RPC_NOT_INDEPENDENT');
    // Never expose the secret-bearing URL: both hostnames and URL paths are omitted.
    out.results.primary={status:'UNVERIFIED'};
    out.results.secondary={status:'UNVERIFIED'};
    async function fetchEvidence(url,tag){
      let timer;
      const deadline=new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(Error('DEADLINE')),35000);
      });
      try{
        const conn=new Connection(url,{commitment:'finalized'});
        const proof=await Promise.race([verifyFinalizedV2Ownership({
          name,connection:conn,maxHistory:500,historyPageSize:100
        }),deadline]);
        out.results[tag]={
          status:'FINALIZED_HISTORY_READ_SUCCESS',owner:proof.owner,
          nameRecord:proof.nameRecord,creationSignature:proof.creationSignature,
          ownershipVersion:proof.ownershipVersion,
          transferCount:proof.transferCount,historyEntries:proof.historyEntries,
          finalizedSlot:proof.finalizedSlot
        };
        return proof;
      }catch{
        out.results[tag]={status:'FINALIZED_HISTORY_UNAVAILABLE_OR_INVALID'};
        return null;
      }finally{clearTimeout(timer)}
    }
    const primary=await fetchEvidence(firstEndpoint,'primary');
    const secondary=await fetchEvidence(secondEndpoint,'secondary');
    const verdict=compareFinalizedGnsEvidence(name,primary,secondary);
    out.comparison=verdict.result;
    out.independentRpcCorroboration=verdict.independentRpcCorroboration;
    out.archiveCompletenessProven=verdict.archiveCompletenessProven;
    out.reason=verdict.reason;
    if(verdict.mismatches.length)out.mismatchedFields=verdict.mismatches;
  }catch{
    out.comparison='ENDPOINT_CONFIGURATION_REJECTED';
  }
  console.log(JSON.stringify(out,null,2));
  if(!out.independentRpcCorroboration)process.exitCode=2;
}
