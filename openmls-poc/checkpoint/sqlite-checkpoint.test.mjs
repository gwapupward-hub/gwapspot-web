import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {canonicalIntent,canonicalResume,sha256Hex} from './monotonic-checkpoint.mjs';

test('SQLite signed checkpoint survives SIGKILL and rejects browser-state rollback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gwap-checkpoint-ci-'));
  const filename=join(dir,'checkpoint.db');
  const admin=randomBytes(24).toString('hex');
  const keys=generateKeyPairSync('ed25519');
  const deviceId='device_A';
  const accountId='gwap_fixture_a';
  const bindingVersion=1;
  const hash1=sha256Hex('sealed-browser-state-1');
  let child,url;
  async function start(){
    child=spawn(process.execPath,
      [new URL('./sqlite-server.mjs',import.meta.url).pathname],{
        env:{...process.env,GWAP_TEST_ONLY:'YES',GWAP_SQLITE_TEST_DB:filename,
          GWAP_ADMIN_TEST_TOKEN:admin},stdio:['ignore','pipe','pipe']
      });
    let err='';
    child.stderr.on('data',b=>{err+=b.toString();});
    const ready=await new Promise((resolve,reject)=>{
      let output='';
      const timeout=setTimeout(()=>reject(new Error('Server startup timeout '+err)),15000);
      child.stdout.on('data',bytes=>{
        output+=bytes.toString();
        if(output.includes('\n')){
          clearTimeout(timeout);
          try {resolve(JSON.parse(output.split('\n')[0]));}
          catch(e){reject(e);}
        }
      });
      child.once('exit',(code)=>{clearTimeout(timeout);reject(new Error('Server exited '+code+' '+err));});
    });
    assert.equal(ready.type,'ready');
    url='http://127.0.0.1:'+ready.port;
  }
  async function stop(){
    if(!child||child.exitCode!==null) return;
    const done=once(child,'exit');
    child.kill('SIGTERM');
    await done;
  }
  async function post(route,payload,extra={}){
    const response=await fetch(url+route,{
      method:'POST',headers:{'content-type':'application/json',...extra},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
    });
    return {status:response.status,body:await response.json()};
  }
  function advance(opts={}){
    const request={deviceId,accountId,bindingVersion,fence:1,
      expectedRevision:1,nextRevision:2,commitment:sha256Hex('sealed-browser-state-2'),
      idempotencyKey:'send-000001',...opts};
    return {...request,signature:sign(null,canonicalIntent(request),keys.privateKey).toString('base64')};
  }
  function resume(opts={}){
    const request={deviceId,accountId,bindingVersion,
      localRevision:1,localCommitment:hash1,...opts};
    return {...request,signature:sign(null,canonicalResume(request),keys.privateKey).toString('base64')};
  }
  const history=[];
  try {
    await start();
    const record={deviceId,accountId,bindingVersion,revision:1,commitment:hash1,
      publicSpkiBase64:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')};
    assert.equal((await post('/fixture/register',record)).status,403);
    const enrolled=await post('/fixture/register',record,{'x-fixture-admin':admin});
    assert.equal(enrolled.status,200);
    assert.equal(enrolled.body.fence,1);
    assert.equal((await post('/checkpoint/resume',resume())).body.allowDelivery,true);
    history.push('bootstrapped test-only device and verified signed resume from revision 1');

    // Request is signed; authority commits revision+receipt to SQLite FULL WAL first.
    const signedAdvance=advance();
    const serverExited=once(child,'exit');
    let interrupted=false;
    try {
      const result=await post('/checkpoint/advance',signedAdvance,
        {'x-fixture-kill-after-commit':admin});
      assert.fail('Server must SIGKILL before replying, got '+JSON.stringify(result));
    }catch(error){interrupted=true;}
    assert.equal(interrupted,true);
    const [exitCode,exitSignal]=await serverExited;
    assert.equal(exitSignal,'SIGKILL');
    await start(); // independent Node process reading same SQLite DB
    history.push('sent signed advancement then SIGKILLed server immediately after committed transaction');

    assert.match((await post('/checkpoint/resume',resume())).body.error,/rollback detected/);
    const current=resume({localRevision:2,localCommitment:signedAdvance.commitment});
    assert.equal((await post('/checkpoint/resume',current)).body.allowDelivery,true);
    const duplicate=await post('/checkpoint/advance',signedAdvance);
    assert.equal(duplicate.status,200);
    assert.equal(duplicate.body.duplicate,true);
    assert.equal(duplicate.body.revision,2);
    history.push('after genuine server crash, persisted revision 2 rejected complete local rollback; exact request replay idempotent');

    const tokenCollision=advance({commitment:sha256Hex('tamper')});
    assert.match((await post('/checkpoint/advance',tokenCollision)).body.error,/Idempotency token reused/);
    assert.match((await post('/checkpoint/resume',
      resume({localRevision:2,localCommitment:sha256Hex('different valid-looking blob')}))).body.error,
      /commitment mismatch/);
    history.push('idempotency collision and same-revision different snapshot commitment rejected');

    const spoof=generateKeyPairSync('ed25519');
    const fake=advance({expectedRevision:2,nextRevision:3,idempotencyKey:'send-spoof01'});
    fake.signature=sign(null,canonicalIntent(fake),spoof.privateKey).toString('base64');
    assert.match((await post('/checkpoint/advance',fake)).body.error,/Invalid device/);

    // The server handles both requests under a single SQLite BEGIN IMMEDIATE CAS.
    const requestA=advance({expectedRevision:2,nextRevision:3,
      commitment:sha256Hex('concurrent-A'),idempotencyKey:'send-race-A'});
    const requestB=advance({expectedRevision:2,nextRevision:3,
      commitment:sha256Hex('concurrent-B'),idempotencyKey:'send-race-B'});
    const responses=await Promise.all([
      post('/checkpoint/advance',requestA),post('/checkpoint/advance',requestB)]);
    assert.equal(responses.filter(x=>x.status===200).length,1);
    assert.equal(responses.filter(x=>x.status===409).length,1);
    const winner=responses[0].status===200?requestA:requestB;
    assert.equal((await post('/checkpoint/resume',resume({
      localRevision:3,localCommitment:winner.commitment}))).status,200);
    history.push('concurrent signed CAS writes accepted exactly one checkpoint advancement');

    assert.equal((await post('/checkpoint/advance',
      advance({expectedRevision:3,nextRevision:4,idempotencyKey:'send-stale-fence'}))).status,200);
    const fence=await post('/fixture/rotate-fence',{deviceId},{'x-fixture-admin':admin});
    assert.equal(fence.body.fence,2);
    const staleFence=advance({expectedRevision:4,nextRevision:5,fence:1,
      idempotencyKey:'send-old-fence'});
    assert.match((await post('/checkpoint/advance',staleFence)).body.error,/Stale writer fence/);
    const newFence=advance({expectedRevision:4,nextRevision:5,fence:2,
      idempotencyKey:'send-new-fence'});
    assert.equal((await post('/checkpoint/advance',newFence)).status,200);
    history.push('rotated durable fencing generation: old signed writer rejected, new signed writer advanced');

    await stop(); await start();
    assert.equal((await post('/checkpoint/resume',resume({
      localRevision:5,localCommitment:newFence.commitment}))).body.allowDelivery,true);
    const revoke=await post('/fixture/revoke',{deviceId,nextBindingVersion:2},
      {'x-fixture-admin':admin});
    assert.equal(revoke.body.revoked,true);
    assert.match((await post('/checkpoint/resume',resume({
      localRevision:5,localCommitment:newFence.commitment}))).body.error,/revoked device/);
    history.push('checkpoint and fence persist through clean restart; simulated identity revocation fails closed');

    await stop();
    await assert.rejects(()=>post('/checkpoint/resume',resume({
      localRevision:5,localCommitment:newFence.commitment})));
    history.push('checkpoint authority unavailable: client cannot obtain a delivery authorization');
    console.log(JSON.stringify({result:'PASS',service:'loopback SQLite WAL FULL test-only',
      checks:history},null,2));
  }finally {
    await stop();
    await rm(dir,{recursive:true,force:true});
  }
});
