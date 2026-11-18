// READ ONLY: inspect the actual finalized GNS V2 name account and, if present,
// try to establish a complete transaction-history ownership epoch.
// This diagnostic NEVER authorizes a messaging device when proof is unavailable.
import {Connection,PublicKey} from '@solana/web3.js';
import {
  deriveV2Name,decodeNameRecordV2,verifyFinalizedV2Ownership,
  GNS_V2_PROGRAM_ID,EXPECTED_DEVNET_GENESIS
} from './gns-v2-finalized.mjs';

const domain='roadmap.gwap'; // User-supplied public name.
const endpoint=process.env.GNS_READONLY_DEVNET_RPC||'https://api.devnet.solana.com';
if(!/^https:\/\//i.test(endpoint))throw Error('HTTPS Solana RPC required');
const connection=new Connection(endpoint,{commitment:'finalized'});
const derived=deriveV2Name(domain);
const summary={
  test:'GWAP_MESSENGER_ROADMAP_GNS_V2_READ_ONLY',
  name:derived.name,
  expectedProgram:GNS_V2_PROGRAM_ID,
  expectedGenesis:EXPECTED_DEVNET_GENESIS,
  namePda:derived.pda.toBase58(),
  nameHashHex:derived.hash.toString('hex'),
  explorer:'https://explorer.solana.com/address/'+derived.pda.toBase58()+'?cluster=devnet',
  nameAccountStatus:'NOT_YET_QUERIED',
  historyProofStatus:'NOT_EVALUATED',
  canAuthorizeMessaging:false,
  noTransactionSubmitted:true
};
function finish(code=0){
  console.log(JSON.stringify(summary,null,2));
  process.exitCode=code;
}
try{
  const genesis=await connection.getGenesisHash();
  summary.genesisMatch=genesis===EXPECTED_DEVNET_GENESIS;
  if(!summary.genesisMatch)throw Error('RPC network genesis mismatch');
  const program=await connection.getAccountInfoAndContext(
    new PublicKey(GNS_V2_PROGRAM_ID),'finalized');
  summary.programExecutable=Boolean(program.value?.executable);
  summary.programFinalizedSlot=program.context?.slot??null;
  if(!summary.programExecutable)throw Error('Canonical A9SCN6 GNS V2 program not executable');
  const account=await connection.getAccountInfoAndContext(derived.pda,'finalized');
  summary.recordFinalizedSlot=account.context?.slot??null;
  if(!account.value){
    summary.nameAccountStatus='NOT_FOUND_AT_FINALIZED_GNS_V2_PDA';
    summary.historyProofStatus='NOT_APPLICABLE_NO_V2_RECORD';
    summary.nextAction='Check domain registration/network and the V2 registry source; do not assume ownership or enroll device';
  }else{
    summary.accountOwnerProgram=account.value.owner.toBase58();
    summary.accountLength=account.value.data.length;
    if(summary.accountOwnerProgram!==GNS_V2_PROGRAM_ID)
      throw Error('V2 name PDA owned by unexpected Solana program');
    const decoded=decodeNameRecordV2(account.value.data,derived);
    summary.nameAccountStatus='FOUND_VALID_V2_RECORD';
    summary.resolvedOwnerWallet=decoded.owner;
    summary.resolverTarget=decoded.resolver;
    summary.registeredAt=decoded.registeredAt;
    summary.expiresAt=decoded.expiresAt;
    summary.nameIsUnexpired=decoded.expiresAt>=Math.floor(Date.now()/1000);
    if(!summary.nameIsUnexpired){
      summary.historyProofStatus='NOT_APPLICABLE_EXPIRED';
    }else{
      try{
        const verified=await verifyFinalizedV2Ownership({
          name:domain,connection,maxHistory:500,historyPageSize:100
        });
        summary.historyProofStatus='HISTORY_CONTRACT_VERIFIED_ON_THIS_RPC';
        summary.ownershipVersion=verified.ownershipVersion;
        summary.creationSignature=verified.creationSignature;
        summary.transferCount=verified.transferCount;
        summary.historyEntries=verified.historyEntries;
        summary.historyFinalizedSlot=verified.finalizedSlot;
        // This audit does not enroll a device or validate app sessions/MLS.
        summary.canAuthorizeMessaging=false;
        summary.nextAction='Cross-check historical completeness on archive-grade independent RPC and bind real GwapOS/MLS credentials';
      }catch(err){
        summary.historyProofStatus='INCOMPLETE_OR_UNVERIFIABLE';
        summary.historyProofError=String(err?.message||err).slice(0,600);
        summary.nextAction='Use independent archive-grade finalized RPC to resolve missing history; fail closed';
      }
    }
  }
  finish(0);
}catch(err){
  summary.nameAccountStatus=summary.nameAccountStatus==='NOT_YET_QUERIED'
    ?'RPC_OR_PROGRAM_VERIFICATION_FAILED':summary.nameAccountStatus;
  summary.historyProofStatus='UNVERIFIED';
  summary.error=String(err?.message||err).slice(0,600);
  summary.nextAction='Inspect Solana devnet RPC reliability and canonical program; do not authorize any device';
  finish(1);
}
