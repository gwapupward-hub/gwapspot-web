// TEST-ONLY security decision: compare two complete, independently fetched
// finalized GNS V2 proof objects. Same hostname is not independence; same
// hostname cannot be compared. Two matching RPCs are corroboration, NOT
// mathematical proof of no pruned history (GNS V2 has no transfer counter).
import {GNS_V2_PROGRAM_ID,deriveV2Name} from './gns-v2-finalized.mjs';
const mandatory=[
  'network','programId','commitment','name','nameRecord','owner',
  'ownershipVersion','creationSignature','transferCount','historyEntries'
];
const sha=/^[a-f0-9]{64}$/;
const isInt=n=>Number.isSafeInteger(n)&&n>=0;

export function compareFinalizedGnsEvidence(name,primary,secondary){
  const pda=deriveV2Name(name);
  const out={result:'BLOCKED',independentRpcCorroboration:false,
    archiveCompletenessProven:false,mismatches:[]};
  if(!primary||!secondary){
    out.reason='MISSING_PROVIDER_EVIDENCE';return out;
  }
  for(const [source,proof] of [['primary',primary],['secondary',secondary]]){
    if(proof.network!=='devnet'||proof.programId!==GNS_V2_PROGRAM_ID||
      proof.commitment!=='finalized'||proof.name!==pda.name||
      proof.nameRecord!==pda.pda.toBase58()||proof.historyComplete!==true||
      !sha.test(proof.ownershipVersion)||!isInt(proof.transferCount)||
      !Number.isSafeInteger(proof.historyEntries)||proof.historyEntries<1||
      !Number.isSafeInteger(proof.finalizedSlot)||proof.finalizedSlot<=0||
      typeof proof.creationSignature!=='string'||proof.creationSignature.length<20){
      out.reason=source.toUpperCase()+'_INCOMPLETE_OR_INVALID_PROOF';
      return out;
    }
  }
  out.mismatches=mandatory.filter(k=>primary[k]!==secondary[k]);
  if(out.mismatches.length){
    out.reason='INCONSISTENT_FINALIZED_HISTORY';return out;
  }
  out.result='MATCHING_FINALIZED_RPC_RESPONSES';
  out.reason='INDEPENDENT_RESPONSES_MATCH';
  out.independentRpcCorroboration=true;
  return out;
}
