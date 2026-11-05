import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectVideo,readLoadedPlaylists} from '../extension/recovery.mjs';
import {pauseAndReadPosition,restorePosition} from '../extension/playback.mjs';

test('initial CVH-style video in nested open shadow roots can be found, paused and restored',async()=>{
  const original={document:globalThis.document,location:globalThis.location,performance:globalThis.performance};
  let time=35;
  const listeners={};
  const video={readyState:4,ended:false,duration:1400,seeking:false,paused:false,isConnected:true,currentSrc:'blob:episode',
    get currentTime(){return time;},set currentTime(v){time=v;queueMicrotask(()=>listeners.seeked?.());},
    getBoundingClientRect:()=>({width:640,height:360}),checkVisibility:()=>true,
    pause(){this.paused=true;},addEventListener(n,f){listeners[n]=f;},removeEventListener(n){delete listeners[n];}};
  const inner={querySelectorAll:selector=>selector==='video'?[video]:[video]};
  const middle={querySelectorAll:selector=>selector==='video'?[]:[{shadowRoot:inner}]};
  globalThis.document={querySelectorAll:selector=>selector==='video'?[]:[{shadowRoot:middle}]};
  globalThis.location={href:'https://player.example/frame/'};
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{timeOrigin:1000,getEntriesByType:()=>[
    {name:'https://cdn.example/episode.mpd',startTime:10,responseEnd:20,initiatorType:'fetch',responseStatus:200}
  ]}});
  try {
    assert.equal(document.querySelectorAll('video').length,0,'ordinary document query misses the first player');
    assert.deepEqual(inspectVideo(),{frameUrl:location.href,count:1});
    assert.equal(readLoadedPlaylists().length,1,'already loaded manifest recovered on first play');
    const playback=pauseAndReadPosition();
    assert.equal(playback.ok,true);assert.equal(playback.startSeconds,30);assert.equal(video.paused,true);
    const restored=await restorePosition(playback.videoToken,90);
    assert.equal(restored.ok,true);assert.equal(time,90);assert.equal(video.paused,true);
    video.checkVisibility=()=>false;
    assert.equal(inspectVideo().count,0);assert.deepEqual(readLoadedPlaylists(),[]);
    assert.equal(pauseAndReadPosition().ok,false,'hidden shadow video still rejected');
  } finally {
    globalThis.document=original.document;globalThis.location=original.location;
    Object.defineProperty(globalThis,'performance',{configurable:true,value:original.performance});
  }
});
