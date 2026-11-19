// Optional read-only public devnet preflight; never submits a transaction.
// Passing this does NOT authenticate a name or prove a transfer history.
import assert from 'node:assert/strict';
import {Connection,PublicKey} from '@solana/web3.js';
import {
  GNS_V2_PROGRAM_ID,EXPECTED_DEVNET_GENESIS
} from './gns-v2-finalized.mjs';

const url=process.env.GNS_READONLY_DEVNET_RPC || 'https://api.devnet.solana.com';
assert.ok(/^https:\/\//.test(url),'Only HTTPS public devnet RPC is permitted');
const conn=new Connection(url,{commitment:'finalized',
  confirmTransactionInitialTimeout:10000});
const genesis=await conn.getGenesisHash();
assert.equal(genesis,EXPECTED_DEVNET_GENESIS,
  'RPC endpoint does not match configured Solana devnet genesis');
const result=await conn.getAccountInfoAndContext(new PublicKey(GNS_V2_PROGRAM_ID),
  'finalized');
assert.ok(result?.value?.executable,
  'Canonical GNS V2 program is not executable at finalized commitment');
console.log(JSON.stringify({
  result:'PASS',
  scope:'read-only finalized GNS V2 program executable preflight ONLY',
  program:GNS_V2_PROGRAM_ID,finalizedSlot:result.context.slot,
  limitations:'No name account, owner, transfer history or wallet tested'
},null,2));
