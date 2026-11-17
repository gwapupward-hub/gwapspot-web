// Isolated durable delivery-gate integration test. Only random opaque bytes,
// simulated device enrollment and loopback SQLite fixture, never user ciphertext.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {canonicalIntent,canonicalDelivery,sha256Hex} from './monotonic-checkpoint.mjs';

test('delivery gate enforces independent durable checkpoint, signer and fencing across process death',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'gwap-ds-checkpoint-'));
  const database=join(directory,'authority.sqlite');
  const admin=randomBytes(32).toString('hex');
  const keys=generateKeyPairSync('ed25519');
  const alien=generateKeyPairSync('ed25519');
  const deviceId='fixture_sender_a',accountId='gwap_fixture_sender',bindingVersion=1;
  const revision1=sha256Hex('sealed-mls-state-before-send');
  const revision2=sha256Hex('sealed-mls-state-and-outbox-after-send');
  const ciphertext=randomBytes(1024);
  let child,origin;
  const checks=[];
  async function start(){
    child=spawn(process.execPath,[new URL('./sqlite-server.mjs',import.meta.url).pathname],{
      env:{...process.env,GWAP_TEST_ONLY:'YES',
        GWAP_SQLITE_TEST_DB:database,GWAP_ADMIN_TEST_TOKEN:admin},
      stdio:['ignore','pipe','pipe']
    });
    let errors='';
    child.stderr.on('data',c=>errors+=c.toString());
    const ready=await new Promise((resolve,reject)=>{
      let output='';
      const timer=setTimeout(()=>reject(new Error('server startup timeout '+errors)),12000);
      child.stdout.on('data',chunk=>{
        output+=chunk.toString();
        if(output.includes('\n')){
          clearTimeout(timer);
          try{resolve(JSON.parse(output.split('\n')[0]));}catch(e){reject(e);}
        }
      });
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('early server exit '+code+errors));});
    });
    origin='http://127.0.0.1:'+ready.port;
  }
  async function stop(){
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    const done=once(child,'exit');
    child.kill('SIGTERM');
    await done;
  }
  async function post(route,payload,extra={}){
    const r=await fetch(origin+route,{method:'POST',
      headers:{'content-type':'application/json',...extra},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    return {status:r.status,body:await r.json()};
  }
  function advance(expected,next,commitment,token,fence=1){
    const intent={deviceId,accountId,bindingVersion,fence,
      expectedRevision:expected,nextRevision:next,commitment,idempotencyKey:token};
    return {...intent,signature:sign(null,canonicalIntent(intent),keys.privateKey).toString('base64')};
  }
  function delivery(options={}){
    const intent={deviceId,accountId,bindingVersion,fence:1,revision:2,commitment:revision2,
      groupId:'fixture_group_a',messageId:'fixture_message_001',
      ciphertextHash:sha256Hex(ciphertext),...options};
    const {ciphertextBase64= ciphertext.toString('base64'),...signedFields}=intent;
    return {...signedFields,ciphertextBase64,
      signature:sign(null,canonicalDelivery(signedFields),keys.privateKey).toString('base64')};
  }
  async function list(){
    const r=await post('/fixture/list-deliveries',{deviceId},{'x-fixture-admin':admin});
    assert.equal(r.status,200);
    return r.body.deliveries;
  }
  try {
    await start();
    const initial={deviceId,accountId,bindingVersion,revision:1,commitment:revision1,
      publicSpkiBase64:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')};
    assert.equal((await post('/fixture/register',initial)).status,403);
    assert.equal((await post('/fixture/register',initial,{'x-fixture-admin':admin})).status,200);
    assert.equal((await post('/fixture/list-deliveries',{deviceId})).status,403);
    assert.equal((await post('/delivery/submit',delivery())).status,409);
    assert.equal((await list()).length,0);
    checks.push('server rejected validly signed ciphertext before independent checkpoint reached claimed state');

    assert.equal((await post('/checkpoint/advance',advance(1,2,revision2,'intent_000002'))).status,200);
    const valid=delivery();
    const accepted=await post('/delivery/submit',valid);
    assert.equal(accepted.status,200);
    assert.equal(accepted.body.duplicate,false);
    assert.equal((await post('/delivery/submit',valid)).body.duplicate,true);
    assert.equal((await list()).length,1);
    assert.equal((await list())[0].ciphertextBase64,ciphertext.toString('base64'));
    checks.push('signed opaque envelope accepted once; exact signed replay idempotent; actual bytes persisted');

    const mutatedBytes=Buffer.from(ciphertext);
    mutatedBytes[5]^=1;
    const tampered={...valid,ciphertextBase64:mutatedBytes.toString('base64')};
    assert.match((await post('/delivery/submit',tampered)).body.error,/Ciphertext hash mismatch/);
    const alteredId=delivery({messageId:'fixture_message_002'});
    assert.match((await post('/delivery/submit',alteredId)).body.error,
      /Same MLS ciphertext already submitted/);
    const differentBuffer=randomBytes(1024);
    const collision=delivery({ciphertextHash:sha256Hex(differentBuffer),
      ciphertextBase64:differentBuffer.toString('base64')});
    assert.match((await post('/delivery/submit',collision)).body.error,/Message ID reused/);
    const spoof=delivery({messageId:'fixture_spoof_001'});
    spoof.signature=sign(null,canonicalDelivery(spoof),alien.privateKey).toString('base64');
    assert.match((await post('/delivery/submit',spoof)).body.error,/Invalid device Ed25519 signature/);
    checks.push('tampered bytes, altered idempotency, duplicate wire under new ID and wrong signing key denied');

    const rolledBack=delivery({revision:1,commitment:revision1,messageId:'fixture_rollback_01'});
    assert.match((await post('/delivery/submit',rolledBack)).body.error,/Rolled-back sender state/);
    const unanchored=delivery({revision:3,commitment:sha256Hex('unsaved'),
      messageId:'fixture_unanchored_01'});
    assert.match((await post('/delivery/submit',unanchored)).body.error,/Unanchored local state/);
    const mismatched=delivery({commitment:sha256Hex('wrong-commit'),
      messageId:'fixture_hash_wrong'});
    assert.match((await post('/delivery/submit',mismatched)).body.error,/Snapshot commitment mismatch/);
    assert.equal((await list()).length,1);
    checks.push('rolled-back, unanchored, and wrong-snapshot sender states denied by server itself');

    const rotated=await post('/fixture/rotate-fence',{deviceId},{'x-fixture-admin':admin});
    assert.equal(rotated.body.fence,2);
    assert.match((await post('/delivery/submit',delivery({
      messageId:'fixture_old_fence01'
    }))).body.error,/Stale writer fence/);
    const current=delivery({fence:2,messageId:'fixture_new_fence01'});
    // Different committed blob, so use fresh signed wire on the current state.
    const freshWire=randomBytes(768);
    const newest=delivery({fence:2,messageId:'fixture_new_fence01',
      ciphertextHash:sha256Hex(freshWire),
      ciphertextBase64:freshWire.toString('base64')});
    assert.equal((await post('/delivery/submit',newest)).status,200);
    checks.push('durably rotated fencing generation refused old writer and accepted current signature');

    // Commit, kill service before receipt, relaunch, verify same bytes+idempotent retry.
    const thirdWire=randomBytes(512);
    const killRequest=delivery({fence:2,messageId:'fixture_after_kill',
      ciphertextHash:sha256Hex(thirdWire),
      ciphertextBase64:thirdWire.toString('base64')});
    const serverExited=once(child,'exit');
    await assert.rejects(()=>post('/delivery/submit',killRequest,
      {'x-fixture-kill-after-commit':admin}));
    assert.equal((await serverExited)[1],'SIGKILL');
    await start();
    assert.equal((await list()).length,3);
    const recovered=await post('/delivery/submit',killRequest);
    assert.equal(recovered.status,200);
    assert.equal(recovered.body.duplicate,true);
    assert.equal((await list()).length,3);
    checks.push('real service SIGKILL after durable commit: restart recovered exact opaque wire and idempotent receipt');

    assert.equal((await post('/fixture/revoke',{deviceId,nextBindingVersion:2},
      {'x-fixture-admin':admin})).status,200);
    const revokedWire=randomBytes(64);
    const afterRevoke=delivery({fence:2,messageId:'fixture_revoked_01',
      ciphertextHash:sha256Hex(revokedWire),
      ciphertextBase64:revokedWire.toString('base64')});
    assert.match((await post('/delivery/submit',afterRevoke)).body.error,/revoked device/);
    assert.equal((await list()).length,3);
    checks.push('domain/device revocation fixture stopped sender even with a signed request');
    await stop();
    await assert.rejects(()=>post('/delivery/submit',newest));
    checks.push('checkpoint delivery authority offline: no ciphertext accepted');
    console.log(JSON.stringify({result:'PASS',kind:'loopback TEST ONLY signed SQLite DS',
      tests:checks},null,2));
  } finally {
    await stop();
    await rm(directory,{recursive:true,force:true});
  }
});
