// Test-only runner. Drives Chromium on localhost, then kills/relaunches it
// with the same profile to verify OpenMLS encrypted IndexedDB state recovery.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = createServer(async (req, res) => {
  try {
    const decoded = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const absolute = path.resolve(root, '.' + decoded);
    if (!absolute.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const mime = absolute.endsWith('.wasm') ? 'application/wasm' :
                 absolute.endsWith('.js') ? 'text/javascript; charset=utf-8' :
                 absolute.endsWith('.html') ? 'text/html; charset=utf-8' :
                 'application/octet-stream';
    const bytes = await readFile(absolute);
    res.writeHead(200, {'content-type':mime,'cache-control':'no-store'});
    res.end(bytes);
  } catch(err) {res.writeHead(404).end('Not found');}
});
await new Promise(resolve => serve.listen(0, '127.0.0.1', resolve));
const addr = serve.address();
const url = 'http://127.0.0.1:' + addr.port + '/browser-test/index.html';
const profile = await mkdtemp(path.join(os.tmpdir(), 'gwap-mls-profile-'));
let ctx;
const notes = [];
async function open() {
  ctx = await chromium.launchPersistentContext(profile,{
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', err => console.error('Browser pageerror:', err));
  await page.goto(url, {waitUntil:'load'});
  await page.waitForFunction(() => window.__fixtureReady !== undefined, {timeout:30000});
  const boot = await page.evaluate(() => ({
    ready:window.__fixtureReady,
    error:window.__fixtureError
  }));
  assert.equal(boot.ready,true, 'WebAssembly fixture failed to initialize: '+boot.error);
  return page;
}
async function call(page, name, ...params) {
  return page.evaluate(async ([fn,args]) => window.__fixture[fn](...args), [name,params]);
}
async function close() {
  if(ctx){await ctx.close();ctx=null;}
}
try {
  let page = await open();
  await call(page,'reset');
  assert.equal(await call(page,'initialize'),1);
  notes.push('initial MLS state encrypted and committed at revision 1');

  await page.reload({waitUntil:'load'});
  await page.waitForFunction(() => window.__fixtureReady === true, {timeout:30000});
  let result = await call(page,'resume',1);
  assert.equal(result.plaintext,'first after reload');
  assert.equal(result.revision,2);
  notes.push('full page reload: decrypt next MLS message; checkpoint revision 2');

  await close();
  page = await open(); // new Chromium process, same persistent profile
  result = await call(page,'resume',2);
  assert.equal(result.plaintext,'second after process restart');
  assert.equal(result.revision,3);
  notes.push('new Chromium process: decrypt next MLS message; checkpoint revision 3');

  await page.reload({waitUntil:'load'});
  await page.waitForFunction(() => window.__fixtureReady === true,{timeout:30000});
  result = await call(page,'resume',3);
  assert.equal(result.plaintext,'third after restart');
  assert.equal(result.revision,4);
  notes.push('second reload: decryption continued without reuse of consumed generation');

  assert.equal(await call(page,'staleWriterRejected'),true);
  notes.push('stale expected revision cannot overwrite newer local snapshot');

  await call(page,'tamper');
  let rejected = false;
  try { await call(page,'resume',4); }
  catch { rejected = true; }
  assert.equal(rejected,true,'tampered encrypted snapshot must not decrypt');
  notes.push('AES-GCM snapshot tamper rejected');
  console.log(JSON.stringify({result:'PASS',operations:notes},null,2));
} finally {
  await close();
  serve.close();
  await rm(profile,{recursive:true,force:true});
}
