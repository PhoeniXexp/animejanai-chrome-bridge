import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pauseAndReadPosition,restorePosition} from '../extension/playback.mjs';
test('reads live time before pause, subtracts five seconds and rejects ambiguous/seeking video',()=>{
  const video=()=>({readyState:4,ended:false,currentTime:152.2534,duration:1400,seeking:false,paused:false,getBoundingClientRect(){return {width:640,height:360};},pause(){this.paused=true;}});
  const a=video();globalThis.document={querySelectorAll:()=>[a]};
  let result=pauseAndReadPosition();assert.equal(typeof result.videoToken,'string');assert.equal(result.capturedSeconds,152.253);assert.equal(result.startSeconds,147.253);assert.equal(a.paused,true);
  a.currentTime=3;assert.equal(pauseAndReadPosition().startSeconds,0);
  a.currentTime=200;a.pause=function(){this.paused=true;this.currentTime=33;};
  result=pauseAndReadPosition();assert.equal(result.capturedSeconds,200);assert.equal(result.startSeconds,195);
  a.paused=false;a.seeking=true;assert.equal(pauseAndReadPosition().ok,false);assert.equal(a.paused,true);
  const b=video();a.paused=false;globalThis.document.querySelectorAll=()=>[a,b];assert.equal(pauseAndReadPosition().ok,false);assert.ok(a.paused&&b.paused);
  globalThis.document.querySelectorAll=()=>[];assert.equal(pauseAndReadPosition().ok,false);
});
test('return seeks same paused video and refuses a replaced source or resumed browser',async()=>{
  let time=100;const events={};
  const v={readyState:4,ended:false,duration:1500,seeking:false,paused:true,isConnected:true,currentSrc:'blob:episode1',
    get currentTime(){return time;},set currentTime(t){time=t;queueMicrotask(()=>events.seeked?.());},
    getBoundingClientRect(){return {width:640,height:360};},pause(){this.paused=true;},
    addEventListener(n,f){events[n]=f;},removeEventListener(n){delete events[n];}};
  globalThis.document={querySelectorAll:()=>[v]};
  let snap=pauseAndReadPosition();assert.equal((await restorePosition(snap.videoToken,450)).ok,true);assert.equal(time,450);assert.equal(v.paused,true);
  snap=pauseAndReadPosition();v.currentSrc='blob:episode2';assert.equal((await restorePosition(snap.videoToken,600)).ok,false);assert.equal(time,450);
  snap=pauseAndReadPosition();v.paused=false;assert.equal((await restorePosition(snap.videoToken,600)).ok,false);
  v.paused=true;snap=pauseAndReadPosition();events.play();v.paused=true;assert.equal((await restorePosition(snap.videoToken,600)).ok,false);
});
