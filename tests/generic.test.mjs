import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectVideo} from '../extension/recovery.mjs';

test('video inspection excludes CSS-hidden and unloaded elements without pausing',()=>{
  let paused=false;
  const video={readyState:4,getBoundingClientRect:()=>({width:640,height:360}),pause(){paused=true;},checkVisibility:()=>true};
  globalThis.location={href:'https://unknown.example/watch#video'};
  globalThis.document={querySelectorAll:()=>[video,{...video,checkVisibility:()=>false},{...video,readyState:0}]};
  assert.deepEqual(inspectVideo(),{count:1,frameUrl:location.href});
  assert.equal(paused,false);
});

test('generic capture handles main-page video, arbitrary players, multiple choices and document changes',async()=>{
  const handlers={},session={},local={config:{sites:['site.example'],dynamicStreams:true}};
  const tab={id:1,url:'https://site.example/watch#video',incognito:false};
  let frames=[{frameId:0,documentId:'main',url:tab.url},
    {frameId:7,documentId:'unknown',url:'https://new-player.example/custom/watch?id=7'},
    {frameId:8,documentId:'banner',url:'https://ads.example/display'}];
  const visible=new Map([['main',1],['unknown',0],['banner',0]]);
  let recovered=[],nativeMessage,pausedDocument;
  const area=data=>({async get(k){return structuredClone({[k]:data[k]});},async set(v){Object.assign(data,structuredClone(v));},async remove(k){delete data[k];}});
  const event=k=>({addListener:f=>{handlers[k]=f;}});
  globalThis.chrome={
    storage:{local:area(local),session:area(session)},
    tabs:{query:async()=>[{...tab}],get:async()=>({...tab}),onRemoved:event('removed')},
    alarms:{onAlarm:event('alarm'),create:async()=>{}},permissions:{contains:async()=>true},
    webNavigation:{getAllFrames:async()=>structuredClone(frames),onCommitted:event('committed')},
    webRequest:{onCompleted:event('completed'),onBeforeRedirect:event('redirect')},
    scripting:{async executeScript({target,func}){
      const f=frames.find(f=>f.documentId===target.documentIds[0]);assert.ok(f);
      const result=func.name==='inspectVideo'?{frameUrl:f.url,count:visible.get(f.documentId)||0}:
        func.name==='readLoadedPlaylists'?recovered.filter(r=>r.frameUrl===f.url):{ok:true,startSeconds:10};
      if(func.name==='pauseAndReadPosition')pausedDocument=f.documentId;
      return [{frameId:f.frameId,documentId:f.documentId,result}];
    }},
    runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:event('message'),connectNative(){
      let onMessage;
      return {onMessage:{addListener:f=>{onMessage=f;}},onDisconnect:{addListener(){}},disconnect(){},postMessage(m){
        nativeMessage=m;queueMicrotask(()=>onMessage({ok:true,dryRun:true}));
      }};
    }}
  };
  await import('../extension/worker.js');
  const send=(op,extra={})=>new Promise(resolve=>handlers.message({op,...extra},{id:'test',url:chrome.runtime.getURL('popup.html')},resolve));
  const request=(frame,url,extra={})=>handlers.completed({tabId:1,frameId:frame.frameId,documentId:frame.documentId,
    url,initiator:new URL(frame.url).origin,statusCode:200,timeStamp:Date.now(),...extra});
  request(frames[0],'https://cdn.example/main.mpd');
  let list=await send('list');assert.equal(list.items.length,1);assert.equal(list.items[0].frameId,0);
  assert.equal((await send('open',{id:list.items[0].id})).ok,true);
  assert.equal(pausedDocument,'main');assert.equal(nativeMessage.frame,'https://site.example/watch');
  request(frames[1],'https://cdn.example/a.m3u8');
  request(frames[2],'https://cdn.example/banner.m3u8');
  assert.equal((await send('list')).items.length,1,'requests without visible loaded video stay out of the list');
  visible.set('unknown',1);
  list=await send('list');assert.equal(list.items.length,2,'request before metadata is recovered when video becomes ready');
  request(frames[1],'https://cdn.example/b.mpd');
  request(frames[1],'https://cdn.example/b.mpd');
  list=await send('list');assert.equal(list.items.length,3,'same-frame alternatives retained and deduplicated');
  assert.equal(list.items[0].url,'https://cdn.example/b.mpd');
  const selected=list.items.find(i=>i.url.endsWith('a.m3u8'));
  delete session['capture:1'].lastLaunch;
  assert.equal((await send('open',{id:selected.id})).ok,true);
  assert.equal(pausedDocument,'unknown');assert.equal(nativeMessage.url,selected.url);
  request(frames[1],'https://cdn.example/forged.mpd',{initiator:'https://other.example'});
  request(frames[1],'https://cdn.example/old-document.mpd',{documentId:'replaced'});
  assert.equal((await send('list')).items.length,3);
  const oldId=selected.id;
  recovered=[{url:selected.url,frameUrl:frames[1].url,timeStamp:Date.now()-500}];
  list=await send('list');assert.equal(list.items.find(i=>i.url===selected.url).id,oldId,'recovery preserves IDs');
  assert.equal((await send('open',{id:oldId})).ok,false,'refresh does not bypass cooldown');
  recovered=[];frames[1]={...frames[1],documentId:'replacement'};
  assert.equal((await send('list')).items.length,1,'stale document candidates disappear');
  assert.equal((await send('open',{id:oldId})).ok,false);
  // Resource Timing may keep the original URL while webRequest reports the final CDN URL.
  await send('clear');
  const from='https://cdn.example/episode.m3u8?token=original',to='https://edge.cdn.example/episode.m3u8?token=final';
  const redirect={tabId:1,frameId:0,documentId:'main',url:from,redirectUrl:to,
    initiator:'https://site.example',timeStamp:Date.now(),statusCode:302};
  handlers.redirect(redirect);request(frames[0],to);
  recovered=[{url:from,frameUrl:frames[0].url,timeStamp:Date.now()-100}];
  list=await send('list');assert.equal(list.items.length,1,'original and final CDN URLs collapse');
  assert.equal(list.items[0].url,to,'launch uses the observed final URL');
  const stableId=list.items[0].id;
  assert.equal((await send('list')).items[0].id,stableId,'recovery does not recreate the alias');
  request(frames[0],'https://unrelated.example/episode.m3u8?token=other');
  assert.equal((await send('list')).items.length,2,'matching filenames alone never establish equivalence');
  await send('clear');recovered=[];
  handlers.redirect({...redirect,initiator:'https://outsider.example'});request(frames[0],to);
  recovered=[{url:from,frameUrl:frames[0].url,timeStamp:Date.now()-100}];
  assert.equal((await send('list')).items.length,2,'unrelated redirect cannot merge candidates');
  local.config.sites=[];
  assert.equal((await send('list')).items.length,0,'site restriction applies to existing sessions too');
});
