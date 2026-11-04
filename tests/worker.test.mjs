import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
globalThis.crypto ??= webcrypto;
test('worker capture, tab isolation, safe launch, cooldown, navigation and expiry',async()=>{
  const handlers={};const local={config:{sites:['anime.example'],kodik:['kodik.example'],cdn:['cdn.example']}};const session={};
  let active=4,nativeCalls=0;
  const tab={id:4,url:'https://anime.example/episode',incognito:false};
  const area=data=>({async get(k){return structuredClone({[k]:data[k]});},async set(x){Object.assign(data,structuredClone(x));},async remove(k){delete data[k];}});
  const event=key=>({addListener(fn){handlers[key]=fn;}});
  const sender={id:'test-id',url:'chrome-extension://test-id/popup.html'};
  globalThis.chrome={
    scripting:{async executeScript(){return [{result:{ok:true,startSeconds:152.25}}];}},
    storage:{local:area(local),session:area(session)},
    tabs:{async get(){return tab;},async query(){return [{...tab,id:active}];},onRemoved:event('removed')},
    webNavigation:{async getAllFrames(){return [{frameId:2,parentFrameId:0,url:'https://kodik.example/episode?token=do-not-export'}];},onCommitted:event('committed')},
    webRequest:{onBeforeRequest:event('started'),onBeforeRedirect:event('redirect'),onErrorOccurred:event('network-error'),onCompleted:event('completed')},alarms:{onAlarm:event('alarm'),async create(){}},
    permissions:{async contains(){return true;}},
    runtime:{id:'test-id',getURL:p=>`chrome-extension://test-id/${p}`,onMessage:event('message'),async sendNativeMessage(_host,msg){nativeCalls++;return {ok:true,dryRun:true};}}
  };
  chrome.runtime.connectNative=()=>{
    let message,disconnect;
    return {onMessage:{addListener(f){message=f;}},onDisconnect:{addListener(f){disconnect=f;}},disconnect(){disconnect?.();},
      postMessage(m){chrome.runtime.sendNativeMessage('host',m).then(r=>message(r),e=>{chrome.runtime.lastError={message:e.message};disconnect();delete chrome.runtime.lastError;});}};
  };
  await import('../extension/worker.js');
  const send=(op,extra={})=>new Promise(resolve=>handlers.message({op,...extra},sender,resolve));
  assert.deepEqual(await send('arm'),{});
  const d={tabId:4,frameId:2,initiator:'https://kodik.example',timeStamp:Date.now()+1,statusCode:200,url:'https://cdn.example/720.m3u8?t=secret'};
  handlers.completed({...d,tabId:5});assert.equal((await send('list')).items.length,0);
  handlers.completed(d);handlers.completed(d);
  let list=await send('list');assert.equal(list.items.length,1,'dedup');
  assert.equal((await send('open',{id:'invented',url:d.url})).ok,false);assert.equal(nativeCalls,0);
  active=5;assert.equal((await send('open',{id:list.items[0].id})).ok,false);assert.equal(nativeCalls,0);
  active=4;assert.equal((await send('open',{id:list.items[0].id})).ok,true);assert.equal(nativeCalls,1);
  assert.equal((await send('open',{id:list.items[0].id})).ok,false);assert.equal(nativeCalls,1);
  handlers.committed({tabId:4,frameId:2});assert.equal((await send('list')).items.length,0);
  await send('arm');session['capture:4'].started-=6*60*60*1000+1;
  handlers.alarm({name:'capture-expiry:4'});assert.equal((await send('list')).items.length,0);assert.equal(session['capture:4'],undefined);
  await send('arm');tab.url='https://anime.example/another';assert.equal((await send('list')).ok,false);
  tab.url='https://anime.example/episode';handlers.removed(4);assert.equal((await send('list')).items.length,0);
  assert.equal(handlers.message({op:'arm'},{id:'outsider',url:sender.url},()=>{}),false);
  chrome.runtime.sendNativeMessage=async()=>{throw Error('Specified native messaging host not found.');};
  assert.match((await send('ping')).error,/Chrome не нашёл/);
  chrome.runtime.sendNativeMessage=async()=>{throw Error('Unexpected https://secret.example/a?token=private');};
  assert.equal((await send('ping')).error.includes('private'),false);
  await send('arm');handlers.completed({...d,timeStamp:Date.now()+1});
  const fresh=(await send('list')).items[0];
  let paused=false;
  chrome.scripting.executeScript=async()=>{paused=true;return [{result:{ok:true,startSeconds:152.25}}];};
  chrome.runtime.sendNativeMessage=async(_h,m)=>{assert.equal(paused,true);assert.equal(m.startSeconds,152.25);throw Error('Native host has exited.');};
  assert.match((await send('open',{id:fresh.id})).error,/Браузер на паузе/);
  await send('clear');
  handlers.completed({...d,timeStamp:Date.now()+1});
  assert.equal((await send('list')).items.length,1,'automatic capture needs no arm');
  session['capture:4'].started-=10*60*1000;
  assert.equal((await send('list')).items.length,1,'available ten minutes into playback');
  chrome.tabs.get=async id=>({...tab,id});
  handlers.completed({...d,tabId:5,timeStamp:Date.now()+1,url:'https://cdn.example/second.m3u8'});
  assert.equal((await send('list')).items[0].url,d.url,'another tab cannot replace current stream');
  active=5;assert.match((await send('list')).items[0].url,/second/);
  active=4;handlers.completed({...d,timeStamp:Date.now()+1,url:'https://cdn.example/new-episode.m3u8'});
  const replaced=await send('list');assert.equal(replaced.items.length,1);assert.match(replaced.items[0].url,/new-episode/);
  await send('clear');local.config.autoCapture=false;handlers.completed({...d,timeStamp:Date.now()+1});
  assert.equal((await send('list')).items.length,0,'auto capture can be disabled');
  local.config.autoCapture=true;tab.url='https://unrelated.example/';handlers.completed({...d,timeStamp:Date.now()+1});
  assert.equal((await send('list')).items.length,0,'unconfigured top-level page is ignored');
  local.config={sites:['animego.me'],dynamicStreams:true};
  tab.url='https://animego.me/anime/sample';
  const aniboomFrame={frameId:8,parentFrameId:0,documentId:'aniboom-doc',url:'https://aniboom.one/embed/sample?episode=1'};
  chrome.webNavigation.getAllFrames=async()=>[aniboomFrame];
  const dash={...d,frameId:8,initiator:'https://aniboom.one',timeStamp:Date.now()+1,url:'https://cdn.example/episode.mpd?token=synthetic'};
  handlers.completed({...dash,url:'https://cdn.example/chunk.m4s'});
  assert.equal((await send('list')).items.length,0,'DASH segments are not playlists');
  handlers.completed({...dash,initiator:'https://ads.example'});
  assert.equal((await send('list')).items.length,0,'unrelated initiator rejected');
  handlers.completed(dash);handlers.completed(dash);
  const dashList=await send('list');assert.equal(dashList.items.length,1,'DASH captured and deduplicated');
  paused=false;
  chrome.scripting.executeScript=async({target})=>{
    assert.deepEqual(target,{tabId:4,documentIds:['aniboom-doc']});
    paused=true;return [{result:{ok:true,startSeconds:152.25}}];
  };
  chrome.runtime.sendNativeMessage=async(_h,m)=>{
    assert.equal(paused,true);assert.equal(m.url,dash.url);assert.equal(m.frame,aniboomFrame.url);
    assert.equal(m.startSeconds,152.25);return {ok:true,dryRun:true};
  };
  assert.equal((await send('open',{id:dashList.items[0].id})).ok,true,'DASH launch targets the captured player document');
  handlers.committed({tabId:4,frameId:8});
  assert.equal((await send('list')).items.length,0,'AniBoom episode navigation invalidates captured stream');
});

