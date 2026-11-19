import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveV2Name,GNS_V2_PROGRAM_ID} from './gns-v2-finalized.mjs';
import {compareFinalizedGnsEvidence} from './roadmap-archive-comparison.mjs';
const name='roadmap.gwap';
const actual={
  network:'devnet',programId:GNS_V2_PROGRAM_ID,commitment:'finalized',
  name,nameRecord:deriveV2Name(name).pda.toBase58(),
  owner:'58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV',
  ownershipVersion:'22a071adfb4b256e105401c219879199372d4a8b5e902fd28a1c80ccb5ce77b3',
  creationSignature:'4Ru9DcAj5xvFLD3yrsQbpREuLRjqXHzMF6hin2tEnwQvBhi26PzRha4FWZJiFfsFdjy4z46oCsndDR5AH9n62GiF',
  transferCount:0,historyEntries:1,finalizedSlot:523510820,historyComplete:true
};
const compare=(changes={},second={})=>compareFinalizedGnsEvidence(
  name,{...actual,...changes},{...actual,finalizedSlot:523510920,...second});
test('matching complete finalized evidence corroborates but never authorizes or claims archival certainty',()=>{
  const v=compare();
  assert.equal(v.independentRpcCorroboration,true);
  assert.equal(v.archiveCompletenessProven,false);
  assert.equal(v.result,'MATCHING_FINALIZED_RPC_RESPONSES');
});
test('one provider unavailable blocks',()=>{
  const v=compareFinalizedGnsEvidence(name,actual,null);
  assert.equal(v.result,'BLOCKED');
  assert.equal(v.reason,'MISSING_PROVIDER_EVIDENCE');
});
for(const [field,value] of [
  ['owner','DifferentWallet'],
  ['transferCount',2],
  ['historyEntries',3],
  ['creationSignature','another-registration-signature-000000000'],
  ['ownershipVersion','c'.repeat(64)],
  ['nameRecord','not-the-derived-pda']
]){
  test('disagreement in '+field+' blocks',()=>{
    const result=compare({}, {[field]:value});
    if(field==='nameRecord')assert.equal(result.reason,'SECONDARY_INCOMPLETE_OR_INVALID_PROOF');
    else assert.equal(result.reason,'INCONSISTENT_FINALIZED_HISTORY');
    assert.equal(result.independentRpcCorroboration,false);
  });
}
for(const [field,value] of [
  ['historyComplete',false],['programId','6cDCrNYmasd1qmnvdLf8jyt9iFa3jW9VLzJhrb7X7SEH'],
  ['commitment','confirmed'],['name','other.gwap'],['finalizedSlot',0],
  ['ownershipVersion','000'],['historyEntries',0],['network','mainnet-beta']
]){
  test('invalid secondary '+field+' rejects',()=>{
    const result=compare({}, {[field]:value});
    assert.equal(result.reason,'SECONDARY_INCOMPLETE_OR_INVALID_PROOF');
    assert.equal(result.result,'BLOCKED');
  });
}
test('different finalized slots are allowed when ownership epochs agree',()=>{
  const result=compare({finalizedSlot:523510123},{finalizedSlot:523511777});
  assert.equal(result.independentRpcCorroboration,true);
});
