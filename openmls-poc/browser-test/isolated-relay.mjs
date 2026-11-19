// TEST-ONLY loopback relay for independently running Alice/Bob browser clients.
// NOT a production Delivery Service. Enrollment is controlled by test harness, not GNS.
// Stores only typed MLS wire bytes and fixture device public keys, never MLS private state.
import {createPublicKey,verify} from 'node:crypto';

const ids=['alice','bob'];
const must=(check,message)=>{if(!check)throw new Error(message)};
const tag='GWAP_TWO_BROWSER_RELAY_V1';
export function relaySendBytes(r){
  return Buffer.from(JSON.stringify([tag,'send',r.sender,r.recipient,r.kind,
    r.wireBase64,r.nonce]));
}
export function relayPullBytes(r){
  return Buffer.from(JSON.stringify([tag,'pull',r.requester,r.afterSeq,r.nonce]));
}
function decodeWire(s){
  must(typeof s==='string'&&s.length<30000,'Invalid wire');
  const b=Buffer.from(s,'base64');
  must(b.length>0&&b.length<=16384&&b.toString('base64')===s,'Invalid MLS byte encoding');
  return b;
}
function verifyEd25519(key,bytes,signature){
  must(typeof signature==='string'&&signature.length<512,'Missing device signature');
  const s=Buffer.from(signature,'base64');
  must(s.length===64&&verify(null,bytes,key,s),'Invalid relay signature');
}

export class IsolatedRelay {
  #devices=new Map();
  #events=[];
  #nonces=new Set();
  #step=0;
  #sequence=0;

  enrollFixture(name,publicSpkiBase64){
    must(ids.includes(name),'Unknown fixture device');
    must(!this.#devices.has(name),'Device already enrolled');
    const key=createPublicKey({
      key:Buffer.from(publicSpkiBase64,'base64'),format:'der',type:'spki'
    });
    must(key.asymmetricKeyType==='ed25519','Expected Ed25519 device key');
    for(const existing of this.#devices.values()){
      must(!existing.equals(key),'Devices must have distinct signing keys');
    }
    this.#devices.set(name,key);
  }

  #verify(name,raw,nonce,signature){
    const key=this.#devices.get(name);
    must(key,'Device not enrolled');
    must(typeof nonce==='string'&&nonce.length>=12&&nonce.length<=128,
      'Invalid request nonce');
    verifyEd25519(key,raw,signature);
    const stamp=name+':'+nonce;
    must(!this.#nonces.has(stamp),'Replay request nonce');
    return stamp;
  }

  send(request){
    const {sender,recipient,kind,wireBase64,nonce,signature}=request;
    must(ids.includes(sender)&&ids.includes(recipient)&&sender!==recipient,
      'Invalid sender/recipient');
    must(['keypackage','commit-add','welcome','application','commit-update'].includes(kind),
      'Unsupported MLS relay event type');
    const wire=decodeWire(wireBase64);
    const nonceKey=this.#verify(sender,relaySendBytes(request),nonce,signature);
    if(this.#step===0){
      must(kind==='keypackage'&&sender==='bob'&&recipient==='alice',
        'Expected Bob one-time KeyPackage before invitation');
      this.#step=1;
    }else if(this.#step===1){
      must(kind==='commit-add'&&sender==='alice'&&recipient==='bob',
        'Canonical Add Commit required before Welcome');
      this.#step=2;
    }else if(this.#step===2){
      must(kind==='welcome'&&sender==='alice'&&recipient==='bob',
        'Welcome cannot precede accepted Add Commit');
      this.#step=3;
    }else{
      must(kind==='application'||kind==='commit-update',
        'No new KeyPackage/Welcome replay in this fixture');
      if(kind==='commit-update'){
        must(sender==='bob'&&recipient==='alice',
          'Unexpected Commit author');
      }
    }
    this.#nonces.add(nonceKey);
    const event={seq:++this.#sequence,sender,recipient,kind,
      wireBase64:wire.toString('base64')};
    this.#events.push(event);
    return {accepted:true,seq:event.seq,kind};
  }

  pull(request){
    const {requester,afterSeq,nonce,signature}=request;
    must(ids.includes(requester)&&Number.isSafeInteger(afterSeq)&&afterSeq>=0,
      'Invalid recipient cursor');
    const nonceKey=this.#verify(requester,relayPullBytes(request),nonce,signature);
    this.#nonces.add(nonceKey);
    return {events:this.#events.filter(e=>e.recipient===requester&&e.seq>afterSeq)
      .slice(0,50)};
  }

  // No unauthenticated event listing or GNS identity discovery.
  get eventCount(){return this.#events.length;}
}
