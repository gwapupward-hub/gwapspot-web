// Loopback-only TEST server. Must never be deployed.
// Bootstrap and administration are fixture-only, gated by a random test secret.
// No live wallet, GNS, user account, production DB or network delivery.
import {createServer} from 'node:http';
import {SQLiteCheckpointAuthority} from './sqlite-checkpoint.mjs';
import {SQLiteDeliveryGate} from './sqlite-delivery.mjs';

if(process.env.GWAP_TEST_ONLY!=='YES'
   || !process.env.GWAP_SQLITE_TEST_DB
   || !(process.env.GWAP_ADMIN_TEST_TOKEN?.length>=24)){
  throw new Error('Refusing to start outside explicitly isolated test environment');
}
const admin=process.env.GWAP_ADMIN_TEST_TOKEN;
const authority=new SQLiteCheckpointAuthority(process.env.GWAP_SQLITE_TEST_DB);
const delivery=new SQLiteDeliveryGate(authority);

async function json(req) {
  const chunks=[];
  let size=0;
  for await(const part of req){
    size+=part.length;
    if(size>32768) throw new Error('Request too large');
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function respond(res,status,payload){
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(payload));
}
const server=createServer(async(req,res)=>{
  try{
    if(req.method!=='POST') return respond(res,405,{error:'Method not allowed'});
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    const data=await json(req);
    let receipt;
    if(path==='/fixture/register'||path==='/fixture/rotate-fence'||path==='/fixture/revoke'||path==='/fixture/list-deliveries'){
      if(req.headers['x-fixture-admin']!==admin)
        return respond(res,403,{error:'Fixture admin token required'});
      receipt=path==='/fixture/register' ? authority.register(data) :
        path==='/fixture/rotate-fence' ? authority.rotateFence(data.deviceId) :
        path==='/fixture/revoke' ? authority.revoke(data.deviceId,data.nextBindingVersion) :
          {deliveries:delivery.listFixture(data.deviceId)};
    } else if(path==='/checkpoint/advance'){
      receipt=authority.advance(data);
      // Test-only deterministic SIGKILL AFTER SQLite COMMIT, BEFORE HTTP response.
      // Used to prove DB state survives true service process death.
      if(req.headers['x-fixture-kill-after-commit']===admin){
        process.kill(process.pid,'SIGKILL');
      }
     } else if(path==='/checkpoint/resume'){
      receipt=authority.resume(data);
    } else if(path==='/delivery/submit'){
      receipt=delivery.submit(data);
      // Test-only SIGKILL after durable envelope acceptance before HTTP receipt.
      if(req.headers['x-fixture-kill-after-commit']===admin){
        process.kill(process.pid,'SIGKILL');
      }
    } else {
      return respond(res,404,{error:'Unknown endpoint'});
    }
    return respond(res,200,receipt);
  }catch(err){
    return respond(res,409,{error:String(err?.message||err)});
  }
});
server.listen(0,'127.0.0.1',()=>{
  process.stdout.write(JSON.stringify({type:'ready',port:server.address().port})+'\n');
});
process.on('SIGTERM',()=>{
  server.close(()=>{authority.close();process.exit(0);});
});
