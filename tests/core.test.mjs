import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accept,host,safeUrl,WINDOW_MS} from '../extension/core.mjs';
import {animeGoProfile} from '../extension/profile.mjs';
const cfg={sites:['anime.example'],kodik:['kodik.example'],cdn:['cdn.example']};
const now=1_000_000;
const s={tabId:4,started:now-100};
const f=[{frameId:2,url:'https://kodik.example/serial/episode'}];
const d={url:'https://cdn.example/episode/720.m3u8?token=private',tabId:4,frameId:2,initiator:'https://kodik.example',timeStamp:now,statusCode:200};
test('accepts only fresh allowed HLS in the armed Kodik frame',()=>assert.equal(accept(d,s,f,cfg,now),true));
test('site-only setup accepts a new CDN and discovers serial iframe while rejecting ad frames',()=>{
  const dynamic={sites:['anime.example'],dynamicStreams:true};
  const frames=[{frameId:2,url:'https://player-new.example/serial/123/720'}];
  const request={...d,url:'https://new-cdn.example/720.mp4:hls:manifest.m3u8',initiator:'https://player-new.example'};
  assert.equal(accept(request,s,frames,dynamic,now),true);
  assert.equal(accept({...request,initiator:'https://ads.example'},s,frames,dynamic,now),false);
  assert.equal(accept(request,s,[{frameId:2,url:'https://player-new.example/ads'}],dynamic,now),false);
  assert.equal(accept({...request,url:'https://127.0.0.1/a.m3u8'},s,frames,dynamic,now),false);
});
test('AnimeGo profile accepts colon-separated HLS paths, not posters or ads',()=>{
  const request={...d,url:'https://raven.cloud2.solodcdn.com/synthetic/720.mp4:hls:manifest.m3u8',initiator:'https://kodikplayer.com'};
  const frames=[{frameId:2,url:'https://kodikplayer.com/serial/synthetic/720?auto_resume=true'}];
  assert.equal(accept(request,s,frames,animeGoProfile,now),true);
  assert.equal(accept({...request,url:'https://ani5.top/player-poster.webp'},s,frames,animeGoProfile,now),false);
  assert.equal(accept({...request,initiator:'https://ads.example'},s,frames,animeGoProfile,now),false);
});
test('rejects unrelated tab/frame, failed responses, old and non-HLS requests',()=>{
  for(const change of [{tabId:5},{frameId:0},{frameId:3},{initiator:'https://ads.example'},{statusCode:403},{statusCode:302},{url:'https://cdn.example/a.ts'},{url:'https://untrusted.example/a.m3u8'},{timeStamp:now-101}]) assert.equal(accept({...d,...change},s,f,cfg,now),false,JSON.stringify(change));
  assert.equal(accept(d,s,[{frameId:2,url:'https://ads.example/ad'}],cfg,now),false);
  assert.equal(accept(d,s,f,cfg,now+WINDOW_MS+1),false);
  assert.equal(accept(d,null,f,cfg,now),false);
});
test('URL and hostname validation reject local addresses, credentials and options',()=>{
  for(const raw of ['http://cdn.example/a.m3u8','file:///C:/a.m3u8','https://localhost/a.m3u8','https://127.0.0.1/a.m3u8','https://[::1]/a.m3u8','https://u:p@cdn.example/a.m3u8','https://cdn.example:8443/a.m3u8','https://cdn.example/a.m3u8#x','--script=evil','https://cdn.example/a\n.m3u8','https://cdn.example\\a.m3u8']) assert.equal(safeUrl(raw),null,raw);
  for(const h of ['*.example.com','example.com/path','localhost','192.168.1.1','x.local','x..com'])assert.throws(()=>host(h));
  assert.equal(host('CDN.EXAMPLE'),'cdn.example');
});
