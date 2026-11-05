import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readLoadedPlaylists} from '../extension/recovery.mjs';
import {safePageUrl,safeUrl,WINDOW_MS} from '../extension/core.mjs';

test('reads the latest loaded manifest, without treating chunks or failed loads as playlists',()=>{
  const original={document:globalThis.document,location:globalThis.location,performance:globalThis.performance};
  const video={readyState:4,ended:false,duration:1400,getBoundingClientRect:()=>({width:640,height:360})};
  let videos=[video];
  const entry={name:'https://cdn.example/old.mpd',startTime:10,responseEnd:20,initiatorType:'fetch',responseStatus:200};
  let entries=[entry,{...entry,name:'https://cdn.example/new.mpd?token=synthetic',startTime:30},
    {...entry,name:'https://cdn.example/chunk.m4s',startTime:40},
    {...entry,name:'https://cdn.example/failure.mpd',startTime:50,responseStatus:403}];
  globalThis.document={querySelectorAll:()=>videos};
  globalThis.location={href:'https://aniboom.one/embed/sample'};
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{timeOrigin:1000,getEntriesByType:()=>entries}});
  try {
    assert.deepEqual(readLoadedPlaylists()[0],{url:entries[1].name,timeStamp:1030,frameUrl:location.href});
    assert.equal(readLoadedPlaylists().length,2);
    videos=[video,video];assert.equal(readLoadedPlaylists().length,2,'candidates retained; launch handles ambiguous videos');
    videos=[{...video,readyState:0}];assert.deepEqual(readLoadedPlaylists(),[],'not loaded');
    videos=[video];entries=[{...entry,responseStatus:0}];
    assert.equal(readLoadedPlaylists()[0].url,entry.name,'cross-origin resource timing without exposed HTTP status');
    entries=[{...entry,responseEnd:0}];assert.deepEqual(readLoadedPlaylists(),[]);
    assert.equal(safePageUrl('https://animego.me/anime/sample#player').href,'https://animego.me/anime/sample');
    assert.equal(safeUrl('https://cdn.example/a.mpd#player'),null,'media fragment still rejected');
  } finally {
    globalThis.document=original.document;globalThis.location=original.location;
    Object.defineProperty(globalThis,'performance',{configurable:true,value:original.performance});
  }
});

test('recovers after lost capture, validates documents and keeps stream after native disconnect',async()=>{
  const handlers={},session={},local={config:{sites:['animego.me'],dynamicStreams:true}};
  const tab={id:4,url:'https://animego.me/anime/sample#player',incognito:false};
  let frames=[{frameId:8,documentId:'doc-1',url:'https://aniboom.one/embed/sample'}];
  let sample={url:'https://cdn.example/episode.mpd?token=synthetic',timeStamp:Date.now()-1000,frameUrl:frames[0].url};
  let scripts=0,navigate=false,disconnect;
  const event=k=>({addListener:f=>{handlers[k]=f;}});
  const area=data=>({async get(k){return structuredClone({[k]:data[k]});},async set(v){Object.assign(data,structuredClone(v));},async remove(k){delete data[k];}});
  globalThis.chrome={
    storage:{local:area(local),session:area(session)},
    tabs:{query:async()=>[{...tab}],get:async()=>({...tab}),onRemoved:event('removed')},
    alarms:{onAlarm:event('alarm'),create:async()=>{}},permissions:{contains:async()=>true},
    webNavigation:{getAllFrames:async()=>structuredClone(frames),onCommitted:event('committed')},
    webRequest:{onCompleted:event('completed'),onBeforeRedirect:event('redirect')},
    scripting:{async executeScript({target,func}){
      scripts++;assert.deepEqual(target,{tabId:4,documentIds:['doc-1']});
      if(func.name==='inspectVideo')return [{frameId:8,documentId:'doc-1',result:{frameUrl:frames[0].url,count:1}}];
      if(func.name==='pauseAndReadPosition')return [{result:{ok:true,startSeconds:20}}];
      if(navigate)frames=[{...frames[0],documentId:'doc-2'}];
      return [{frameId:8,documentId:'doc-1',result:[sample]}];
    }},
    runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:event('message'),connectNative(){
      let onMessage;
      return {onMessage:{addListener:f=>{onMessage=f;}},onDisconnect:{addListener:f=>{disconnect=f;}},disconnect(){},postMessage(m){
        assert.equal(m.page,'https://animego.me/anime/sample','native page excludes anchor');
        queueMicrotask(()=>onMessage({ok:true,dryRun:false}));
      }};
    }}
  };
  await import('../extension/worker.js');
  const send=(op,extra={})=>new Promise(resolve=>handlers.message({op,...extra},{id:'test',url:chrome.runtime.getURL('popup.html')},resolve));
  let list=await send('list');assert.equal(list.items.length,1,'recovers without a new network event');
  const item=list.items[0];
  assert.equal((await send('open',{id:item.id})).ok,true);
  disconnect();await Promise.resolve();
  assert.equal((await send('list')).items[0].id,item.id,'process loss does not clear capture');
  tab.url='https://animego.me/anime/sample';
  assert.equal((await send('list')).items.length,1,'anchor-only change keeps capture');
  await send('clear');assert.equal((await send('list',{recover:false})).items.length,0);
  let before=scripts;local.config.autoCapture=false;
  assert.equal((await send('list')).items.length,0);assert.equal(scripts,before);
  local.config.autoCapture=true;tab.incognito=true;
  assert.equal((await send('list')).items.length,0);assert.equal(scripts,before);
  tab.incognito=false;tab.url='https://unconfigured.example/';
  assert.equal((await send('list')).items.length,0);assert.equal(scripts,before);
  tab.url='https://animego.me/anime/sample#player';
  sample={...sample,timeStamp:Date.now()-WINDOW_MS-1000};
  assert.equal((await send('list')).items.length,0,'expired manifest rejected');
  sample={...sample,timeStamp:Date.now()-1000,url:'https://127.0.0.1/a.mpd'};
  assert.equal((await send('list')).items.length,0,'unsafe recovered URL rejected');
  sample={...sample,url:'https://cdn.example/episode.mpd'};navigate=true;
  assert.equal((await send('list')).items.length,0,'navigation during scan cannot attach old URL');
  navigate=false;frames=[{...frames[0],documentId:'doc-1'}];
  handlers.completed({tabId:4,frameId:8,url:sample.url,initiator:'https://aniboom.one',timeStamp:Date.now(),statusCode:200});
  assert.equal((await send('list',{recover:false})).items.length,1,'network capture works on #player page');
});
