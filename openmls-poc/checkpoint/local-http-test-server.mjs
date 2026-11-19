// Localhost-only HTTP adapter for isolated checkpoint CI tests.
// DO NOT DEPLOY. No public enrollment, no GNS binding, no external listener.
// Requests are authenticated with device Ed25519 signatures by the authority.
// Transport TLS, browser CSRF protection, rate limits, production audit and
// DS co-transactional checks are deliberately OUT OF SCOPE.
import {createServer} from 'node:http';

function send(res,status,data) {
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  });
  res.end(JSON.stringify(data));
}
async function jsonBody(req) {
  if(!String(req.headers['content-type']||'').startsWith('application/json')) {
    const e=Error('Content-Type application/json required'); e.status=415; throw e;
  }
  const chunks=[];
  let size=0;
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>8192) {const e=Error('Body exceeds 8 KiB');e.status=413;throw e;}
    chunks.push(chunk);
  }
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!value||Array.isArray(value)||typeof value!=='object') throw Error();
    return value;
  } catch {
    const e=Error('Invalid JSON body');e.status=400;throw e;
  }
}
function failureCode(e) {
  if(e.status) return e.status;
  if(/Stale|rollback|Unanchored|commitment mismatch|Idempotency|CAS/.test(e.message))
    return 409;
  if(/Invalid|Wrong account|revoked|identity binding|fence|Unknown/.test(e.message))
    return 403;
  return 503; // database failure or unknown fault: fail closed
}
export function createLocalCheckpointTestServer(authority) {
  if(!authority || typeof authority.advance!=='function' ||
      typeof authority.resume!=='function') throw Error('Authority required');
  const server=createServer(async(req,res)=>{
    if(req.method==='GET' && req.url==='/health'){
      send(res,200,{testOnly:true,status:'ok'});return;
    }
    const routes={
      '/v0/checkpoint/advance':'advance',
      '/v0/checkpoint/resume':'resume'
    };
    const method=routes[req.url];
    if(req.method!=='POST' || !method) {
      send(res,404,{error:'Not found'});return;
    }
    try {
      const input=await jsonBody(req);
      // No user-supplied fixture-administration switches are passed through.
      const result=await authority[method](input);
      send(res,200,result);
    }catch(e) {
      const status=failureCode(e);
      // No private input, account identifiers, signed requests or key data in response.
      send(res,status,{error:status===503?'Checkpoint unavailable':'Request rejected'});
    }
  });
  return {
    async listen() {
      if(server.listening) throw Error('Already listening');
      await new Promise((resolve,reject)=>{
        server.once('error',reject);
        server.listen(0,'127.0.0.1',resolve);
      });
      return 'http://127.0.0.1:'+server.address().port;
    },
    async close() {
      if(server.listening) await new Promise(resolve=>server.close(resolve));
    }
  };
}
