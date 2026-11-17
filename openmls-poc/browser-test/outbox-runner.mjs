// Test-only two-tab adversarial GWAP Messenger OpenMLS outbox runner.
// Uses real OpenMLS WASM fixture and an isolated Chromium profile on localhost.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer(async (req,res) => {
  try {
    const filename = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.'+filename);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    const mime = file.endsWith('.wasm') ? 'application/wasm' :
                 file.endsWith('.js') ? 'text/javascript; charset=utf-8' :
                 file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    const body=await readFile(file);
    res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});
    res.end(body);
  } catch(err) {res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/browser-test/index.html';
const profile = await mkdtemp(path.join(os.tmpdir(),'gwap-outbox-'));
let browser;
const evidence=[];

async function openBrowser() {
  browser = await chromium.launchPersistentContext(profile,{
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless:true,
    args:['--no-sandbox']
  });
  return browser;
}
async function openPage() {
  const page=await browser.newPage();
  page.on('pageerror',e=>console.error('pageerror:',e));
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__fixtureReady!==undefined,{timeout:30000});
  const init=await page.evaluate(()=>({ready:window.__fixtureReady,error:window.__fixtureError}));
  assert.equal(init.ready,true,'WASM browser bootstrap: '+init.error);
  return page;
}
async function command(page, name, ...args) {
  return page.evaluate(async ([fn,params])=>window.__outbox[fn](...params),[name,args]);
}
async function rejects(fn,match) {
  let caught=false;
  try { await fn(); }
  catch(error) {
    caught=true;
    assert.match(String(error),match);
  }
  assert.equal(caught,true,'operation must reject');
}
try {
  await openBrowser();
  let alice=await openPage();
  let second=await openPage();
  await command(alice,'reset');
  assert.equal(await command(alice,'initialize'),1);
  assert.deepEqual(await command(alice,'status'),{revision:1,pending:0,delivered:0});
  evidence.push('real two-member OpenMLS group and ratchet state committed at revision 1');

  // Adversarial tab B cannot use a device state while tab A owns exclusive Web Lock.
  await alice.evaluate(()=>{window.__heldLock=window.__outbox.holdLock();return true;});
  await alice.waitForFunction(()=>window.__outboxLockHeld===true,{timeout:10000});
  await rejects(()=>command(second,'send',1,'blocked by other tab',0),/Writer lock unavailable/);
  alice.evaluate(()=>window.__outbox.releaseLock());
  await alice.evaluate(()=>window.__heldLock);
  assert.deepEqual(await command(second,'status'),{revision:1,pending:0,delivered:0});
  evidence.push('competing tab rejected by exclusive lock; no outbox envelope released');

  // Inject IndexedDB transaction abort: neither new ratchet state nor outbox is committed.
  await rejects(()=>command(alice,'send',1,'must abort safely',1),/transaction abort|transaction error|AbortError|Injected/i);
  assert.deepEqual(await command(second,'status'),{revision:1,pending:0,delivered:0});
  evidence.push('injected abort left state+outbox at revision 1 with zero queued envelopes');

  // Inject lost response AFTER atomic DB commit: encrypted envelope is recoverable.
  await rejects(()=>command(alice,'send',1,'committed, response lost',2),/Injected crash after commit/);
  assert.deepEqual(await command(second,'status'),{revision:2,pending:1,delivered:0});
  await rejects(()=>command(second,'send',1,'duplicate after lost reply',0),/Stale/);
  evidence.push('lost post-commit reply retained one durable encrypted outbox envelope; stale retry rejected');

  // Simulate full Chromium process closure and restart retaining encrypted IndexedDB.
  await browser.close(); browser=undefined;
  await openBrowser();
  alice=await openPage();
  second=await openPage();
  assert.deepEqual(await command(alice,'status'),{revision:2,pending:1,delivered:0});
  const first=await command(alice,'deliver',2,0);
  assert.equal(first.plaintext,'committed, response lost');
  assert.deepEqual(first,{revision:3,pending:0,delivered:1,plaintext:'committed, response lost'});
  evidence.push('after Chromium process restart, stored MLS ciphertext decrypted and acknowledged exactly once');

  // Concurrency: only one tab may commit a new message at a particular revision.
  const ops = await Promise.allSettled([
    command(alice,'send',3,'race A',0),
    command(second,'send',3,'race B',0)
  ]);
  const successes=ops.filter(x=>x.status==='fulfilled');
  const failures=ops.filter(x=>x.status==='rejected');
  assert.equal(successes.length,1,'exactly one competing sender must be accepted');
  assert.equal(failures.length,1,'the other competing sender must be rejected');
  const acceptedText=ops[0].status==='fulfilled'?'race A':'race B';
  assert.deepEqual(await command(second,'status'),{revision:4,pending:1,delivered:1});
  const secondDelivery=await command(alice,'deliver',4,0);
  assert.equal(secondDelivery.plaintext,acceptedText);
  assert.deepEqual(await command(second,'status'),{revision:5,pending:0,delivered:2});
  evidence.push('two competing tabs submitted one sender ratchet revision; only one envelope committed');

  // Receiver acknowledgement is also atomic: an injected abort keeps the envelope queued.
  assert.equal((await command(alice,'send',5,'retry after receiver abort',0)).revision,6);
  await rejects(()=>command(alice,'deliver',6,1),/transaction abort|transaction error|AbortError|Injected/i);
  assert.deepEqual(await command(second,'status'),{revision:6,pending:1,delivered:2});
  const retry=await command(second,'deliver',6,0);
  assert.equal(retry.plaintext,'retry after receiver abort');
  assert.deepEqual(await command(alice,'status'),{revision:7,pending:0,delivered:3});
  evidence.push('injected receiver transaction abort retained queued MLS ciphertext for safe retry');

  console.log(JSON.stringify({result:'PASS',tests:evidence,environment:'headless Chromium, real OpenMLS WASM'},null,2));
} finally {
  if(browser) await browser.close();
  server.close();
  await rm(profile,{recursive:true,force:true});
}
