import test from 'node:test';
import assert from 'node:assert/strict';
import {decideVerifiedMessengerSession} from './messenger-verified-session-core.ts';

const wallet='58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV';
const stranger='11111111111111111111111111111111';
const privy='did:privy:verified-owner';
const ready={status:'ready',identity:{
  userId:privy,verifiedWallet:wallet,embeddedWallet:null,
  walletProvider:'external',walletProviderLabel:'Phantom',displayName:'Fixture',email:''
}};
const account={
  id:'gwap_1234567890abcdefghijklmn',
  primaryWallet:wallet,privyUserIds:[privy],telegramUserId:null,
  wallets:[{address:wallet,kind:'external',linkedAt:'2026-11-18T00:00:00.000Z'}],
  primaryGnsIdentity:'roadmap',createdAt:'2026-11-18T00:00:00.000Z',
  updatedAt:'2026-11-18T00:00:00.000Z',schemaVersion:1
};
test('verified Privy session and stable Redis GWAP account are matched',()=>{
 const result=decideVerifiedMessengerSession(ready,account);
 assert.deepEqual(result,{
   status:'ready',authenticated:true,
   subject:privy,accountId:account.id,verifiedWallet:wallet
 });
});
test('missing/expired token, backend outage and missing account never create a session',()=>{
 assert.deepEqual(decideVerifiedMessengerSession({status:'unauthenticated'},account),
   {status:'unauthenticated'});
 assert.deepEqual(decideVerifiedMessengerSession({status:'unavailable'},account),
   {status:'unavailable'});
 assert.deepEqual(decideVerifiedMessengerSession(ready,null),{status:'account_mismatch'});
});
test('wallet changed in Privy authentication but old Redis account remains: deny',()=>{
 const mismatch={status:'ready',identity:{...ready.identity,verifiedWallet:stranger}};
 assert.deepEqual(decideVerifiedMessengerSession(mismatch,account),{status:'account_mismatch'});
});
test('same wallet but Privy user not mapped to canonical account: deny',()=>{
 const mismatch={status:'ready',identity:{...ready.identity,userId:'did:privy:attacker'}};
 assert.deepEqual(decideVerifiedMessengerSession(mismatch,account),{status:'account_mismatch'});
});
test('secondary wallet in record is not sufficient for a primary-wallet session',()=>{
 const secondary={...account,primaryWallet:stranger,
   wallets:[...account.wallets,{address:stranger,kind:'external',linkedAt:account.createdAt}]};
 assert.deepEqual(decideVerifiedMessengerSession(ready,secondary),
   {status:'account_mismatch'});
});
test('account wallet index stale/omitted, or account ID forged: deny',()=>{
 assert.deepEqual(decideVerifiedMessengerSession(ready,{...account,wallets:[]}),
   {status:'account_mismatch'});
 assert.deepEqual(decideVerifiedMessengerSession(ready,{...account,id:'gwap_short'}),
   {status:'account_mismatch'});
});
