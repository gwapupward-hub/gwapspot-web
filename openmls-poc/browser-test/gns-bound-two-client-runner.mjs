// Real OpenMLS WASM across two *independent Chromium processes* and private profiles.
// Fixture Ed25519 signing keys originate in each browser; loopback relay sees only
// public signing keys and serialized MLS bytes. Not a deployed DS or GNS binding.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {IsolatedRelay,relaySendBytes,relayPullBytes} from './isolated-relay.mjs';
import {GnsDeviceBindingGate,sha256} from '../gns-binding/gns-device-binding.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const relay=new IsolatedRelay();
const owners=new Map();
const previouslyEnrolledNames=new Set();
const gate=new GnsDeviceBindingGate({resolver:async name=>{
  const wallet=owners.get(name);
  return wallet?{found:true,owner:wallet}:{found:false,owner:null};
}});
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes){
  const buffer=Buffer.from(bytes);
  let n=BigInt('0x'+buffer.toString('hex'));
  let value='';
  while(n>0n){value=ALPHABET[Number(n%58n)]+value;n/=58n;}
  for(const b of buffer){if(b!==0)break;value='1'+value;}
  return value;
}
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.startsWith('/relay/')||pathname.startsWith('/gns/')){
      if(req.method!=='POST')throw Error('Only POST accepted');
      let data='';
      for await(const chunk of req){
        data+=chunk.toString();
        if(data.length>30000)throw Error('Too much input');
      }
      const request=JSON.parse(data);
      let result;
      if(pathname==='/gns/challenge'){
        result=gate.issueChallenge(request.name);
      }else if(pathname==='/gns/enroll'){
        const wire=Buffer.from(request.keyPackageBase64||'','base64');
        result=await gate.enroll(request);
        await gate.checkKeyPackage(result.deviceId,wire);
        // Old group is deliberately NOT rebound to a new owner after transfer.
        if(!previouslyEnrolledNames.has(result.name)){
          relay.enrollFixture(result.name,request.transportPublicSpkiBase64);
          previouslyEnrolledNames.add(result.name);
        }
      }else if(pathname==='/relay/send'||pathname==='/relay/pull'){
        const identity=request.authorization;
        if(!identity||identity.name!==(pathname==='/relay/send'?
          request.sender:request.requester))
          throw Error('Domain/relay role mismatch');
        const raw=pathname==='/relay/send'?relaySendBytes(request):relayPullBytes(request);
        if(identity.payloadHash!==sha256(raw))throw Error('Relay payload commitment mismatch');
        const checked=await gate.authorizeAction(identity);
        if(checked.name!==identity.name)throw Error('Incorrect identity binding');
        if(pathname==='/relay/send'){
          if(request.kind==='keypackage')
            await gate.checkKeyPackage(identity.deviceId,Buffer.from(request.wireBase64,'base64'));
          result=relay.send(request);
        }else{
          result=relay.pull(request);
        }
      }else{throw Error('Unexpected fixture route');}
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify(result));return;
    }
    const file=resolve(root,'.'+pathname);
    if(!file.startsWith(root+sep))throw Error('Forbidden static path');
    const content=await readFile(file);
    const mime=file.endsWith('.wasm')?'application/wasm':
      file.endsWith('.js')?'text/javascript; charset=utf-8':
      file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream';
    res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});
    res.end(content);
  }catch(err){
    if(!res.headersSent)res.writeHead(400,{'content-type':'application/json'});
    if(!res.writableEnded)res.end(JSON.stringify({error:String(err.message||err)}));
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/browser-test/gns-bound-client.html';
const aliceProfile=await mkdtemp(join(tmpdir(),'gwap-alice-mls-'));
const bobProfile=await mkdtemp(join(tmpdir(),'gwap-bob-mls-'));
let aliceContext,bobContext,newOwnerContext;
const newOwnerProfile=await mkdtemp(join(tmpdir(),'gwap-new-owner-mls-'));
const passed=[];

async function startContext(profile){
  const context=await chromium.launchPersistentContext(profile,{
    headless:true,
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    args:['--no-sandbox']
  });
  const page=context.pages()[0]||await context.newPage();
  page.on('pageerror',e=>console.error('Browser page error:',e.message));
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__independentReady!==undefined,{timeout:30000});
  const ready=await page.evaluate(()=>({
    status:window.__independentReady,error:window.__independentError
  }));
  assert.equal(ready.status,true,'WASM bootstrap failed: '+ready.error);
  return {context,page};
}
const invoke=(page,fn,...args)=>page.evaluate(
  async([method,params])=>window.__independent[method](...params),[fn,args]);
const same=(a,b)=>assert.deepEqual(a,b);
async function expectError(task,match){
  await assert.rejects(task,match);
}
try {
  const alice=await startContext(aliceProfile); aliceContext=alice.context;
  const bob=await startContext(bobProfile); bobContext=bob.context;
  assert.notEqual(aliceContext,bobContext,'Device profiles must be independent');
  const pubAlice=await invoke(alice.page,'bootstrap','alice');
  const pubBob=await invoke(bob.page,'bootstrap','bob');
  assert.notEqual(pubAlice.transportPublicSpkiBase64,pubBob.transportPublicSpkiBase64);
  const walletAlice=base58Encode(Buffer.from(pubAlice.walletPublicRawBase64,'base64'));
  const walletBob=base58Encode(Buffer.from(pubBob.walletPublicRawBase64,'base64'));
  owners.set('alice',walletAlice); owners.set('bob',walletBob);
  const aliceBinding=await invoke(alice.page,'enroll',{
    wallet:walletAlice,accountId:'gwap_alice_001',deviceId:'device_alice_001'
  });
  const bobBinding=await invoke(bob.page,'enroll',{
    wallet:walletBob,accountId:'gwap_bob_001',deviceId:'device_bob_001'
  });
  assert.equal(aliceBinding.bindingGeneration,1);
  assert.equal(bobBinding.bindingGeneration,1);
  assert.equal(await invoke(alice.page,'publicKeyExtractable'),false);
  assert.equal(await invoke(bob.page,'publicKeyExtractable'),false);
  passed.push('two independent browser wallets signed MLS KeyPackage/transport bindings against current GNS fixture owners');

  const packageBytes=await invoke(bob.page,'keypackage');
  assert.ok(packageBytes.length>100,'Expected genuine MLS KeyPackage wire');
  const postedKP=await invoke(bob.page,'send','alice','keypackage',packageBytes);
  assert.equal(postedKP.seq,1);
  const aliceKP=await invoke(alice.page,'pull',0);
  assert.equal(aliceKP.events.length,1);
  assert.equal(aliceKP.events[0].kind,'keypackage');
  same(aliceKP.events[0].wire,packageBytes);
  await expectError(invoke(bob.page,'unauthorizedPull','alice',0),/Domain\/relay role mismatch|Invalid relay signature/);
  passed.push('one-time Bob KeyPackage carried through signed relay; forged inbox request refused');

  const invite=await invoke(alice.page,'invite',aliceKP.events[0].wire);
  assert.ok(invite.welcome.length>100&&invite.commit.length>100);
  const add=await invoke(alice.page,'send','bob','commit-add',invite.commit);
  const welcome=await invoke(alice.page,'send','bob','welcome',invite.welcome);
  assert.equal(add.seq,2);
  assert.equal(welcome.seq,3);
  const bobInit=await invoke(bob.page,'pull',0);
  same(bobInit.events.map(e=>e.kind),['commit-add','welcome']);
  await expectError(invoke(bob.page,'receive',bobInit.events[0].wire),/Group not joined/);
  await invoke(bob.page,'join',bobInit.events[1].wire);
  assert.equal(await invoke(alice.page,'members'),2);
  assert.equal(await invoke(bob.page,'members'),2);
  same(await invoke(alice.page,'authenticator'),await invoke(bob.page,'authenticator'));
  await expectError(invoke(bob.page,'send','alice','keypackage',packageBytes),
    /No new KeyPackage\/Welcome replay/);
  passed.push('ordered Add Commit then Welcome across independent clients; group epoch authenticators equal');

  let aliceCursor=1, bobCursor=3;
  const ciphertext=await invoke(alice.page,'encrypt','Real separate-client OpenMLS hello');
  assert.ok(ciphertext.length>50);
  assert.equal(Buffer.from(ciphertext).includes(
    Buffer.from('Real separate-client OpenMLS hello')),false);
  const send1=await invoke(alice.page,'send','bob','application',ciphertext);
  assert.equal(send1.seq,4);
  const bobInbox=await invoke(bob.page,'pull',bobCursor);
  same(bobInbox.events.map(e=>e.kind),['application']);
  bobCursor=4;
  const invalidWire=[...bobInbox.events[0].wire];
  invalidWire[invalidWire.length-1]^=1;
  await expectError(invoke(bob.page,'receive',invalidWire),/.+/);
  const received=await invoke(bob.page,'receive',bobInbox.events[0].wire);
  same(received,{kind:'application',text:'Real separate-client OpenMLS hello'});
  await expectError(invoke(bob.page,'receive',bobInbox.events[0].wire),/.+/);
  passed.push('Alice to Bob encrypted PrivateMessage decrypted; tampering and replay rejected');

  const reply=await invoke(bob.page,'encrypt','Independent Bob replies');
  await invoke(bob.page,'send','alice','application',reply);
  const aliceInbox=await invoke(alice.page,'pull',aliceCursor);
  same(aliceInbox.events.map(e=>e.kind),['application']);
  same(await invoke(alice.page,'receive',aliceInbox.events[0].wire),
    {kind:'application',text:'Independent Bob replies'});
  aliceCursor=5;
  passed.push('Bob to Alice encrypted reply decrypted without sharing private MLS provider state');

  const oldEpoch=await invoke(alice.page,'authenticator');
  const update=await invoke(bob.page,'stageCommit');
  assert.ok(update.length>100);
  const acceptedCommit=await invoke(bob.page,'send','alice','commit-update',update);
  assert.equal(acceptedCommit.seq,6);
  const incomingCommit=await invoke(alice.page,'pull',aliceCursor);
  same(incomingCommit.events.map(e=>e.kind),['commit-update']);
  same(await invoke(alice.page,'receive',incomingCommit.events[0].wire),{kind:'commit'});
  await invoke(bob.page,'finishCommit');
  const newAliceEpoch=await invoke(alice.page,'authenticator');
  assert.notDeepEqual(newAliceEpoch,oldEpoch);
  same(newAliceEpoch,await invoke(bob.page,'authenticator'));
  aliceCursor=6;
  passed.push('Bob Commit transported/processed and canonical new MLS epoch reconciled across independent clients');

  const postCommit=await invoke(alice.page,'encrypt','After Commit across two processes');
  await invoke(alice.page,'send','bob','application',postCommit);
  const bobNewEpoch=await invoke(bob.page,'pull',bobCursor);
  // Bob sent the Commit, so it must not appear in Bob's inbox.
  same(bobNewEpoch.events.map(e=>e.kind),['application']);
  same(await invoke(bob.page,'receive',bobNewEpoch.events[0].wire),
    {kind:'application',text:'After Commit across two processes'});
  bobCursor=bobNewEpoch.events[0].seq;
  const bobAfter=await invoke(bob.page,'encrypt','Bob responds after epoch update');
  await invoke(bob.page,'send','alice','application',bobAfter);
  const finalAlice=await invoke(alice.page,'pull',aliceCursor);
  assert.equal(finalAlice.events.length,1);
  same(await invoke(alice.page,'receive',finalAlice.events[0].wire),
    {kind:'application',text:'Bob responds after epoch update'});
  passed.push('new-epoch bidirectional MLS ciphertext works after Commit and Welcome separation');

  await expectError(invoke(bob.page,'sendAsImposter','bob','application',reply),
    /Invalid relay signature|Domain\/relay role mismatch/);
  assert.equal(relay.eventCount,8);
  passed.push('relay prevents spoofing; eight ordered opaque events stored with no MLS private keys');

  // Simulate .gwap transfer in the injected owner resolver. Old device's
  // memory-only MLS cryptography still exists, but relay must reject it.
  const newAlice=await startContext(newOwnerProfile);
  newOwnerContext=newAlice.context;
  const newPub=await invoke(newAlice.page,'bootstrap','alice');
  const walletNew=base58Encode(Buffer.from(newPub.walletPublicRawBase64,'base64'));
  assert.notEqual(walletNew,walletAlice);
  owners.set('alice',walletNew);
  await expectError(invoke(alice.page,'pull',0),/revoked messaging device|Stale \.gwap/);
  await expectError(invoke(alice.page,'send','bob','application',postCommit),
    /revoked messaging device|Stale \.gwap/);
  const newBinding=await invoke(newAlice.page,'enroll',{
    wallet:walletNew,accountId:'gwap_newowner_001',deviceId:'device_newowner_001'
  });
  assert.equal(newBinding.bindingGeneration,2);
  assert.notEqual(newBinding.accountId,aliceBinding.accountId);
  await expectError(invoke(newAlice.page,'pull',0),/Invalid relay signature|Domain\/relay role mismatch/);
  passed.push('GNS fixture transfer invalidated previous owner; new wallet bound a fresh KeyPackage but cannot inherit the old MLS inbox');

  console.log(JSON.stringify({result:'PASS',environment:
    'two separate browser profiles + real OpenMLS + wallet-signed GNS fixture bindings and transfer revocation',
    assertions:passed},null,2));
}finally{
  if(aliceContext)await aliceContext.close();
  if(bobContext)await bobContext.close();
  if(newOwnerContext)await newOwnerContext.close();
  server.close();
  await rm(aliceProfile,{recursive:true,force:true});
  await rm(bobProfile,{recursive:true,force:true});
  await rm(newOwnerProfile,{recursive:true,force:true});
}
