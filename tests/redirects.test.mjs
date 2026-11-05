import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPlaylist,mergeRedirectedItems} from '../extension/redirects.mjs';
test('redirect chains are document scoped, exact and cycle safe',()=>{
  const f={frameId:3,documentId:'player'};
  const a='https://cdn.example/a.m3u8?token=a',b='https://edge.example/a.m3u8?token=b',c='https://final.example/a.m3u8?token=c';
  const redirects=[{...f,from:a,to:b},{...f,from:b,to:c}];
  assert.equal(canonicalPlaylist(a,f,redirects),c);
  assert.equal(canonicalPlaylist(a,{...f,documentId:'other'},redirects),a);
  assert.equal(canonicalPlaylist(a,{...f,frameId:4},redirects),a);
  assert.equal(canonicalPlaylist(a+'x',f,redirects),a+'x');
  assert.equal(canonicalPlaylist(a,f,[...redirects,{...f,from:c,to:a}]),null);
  const items=[{...f,id:'final',url:c},{...f,id:'source',url:a},{...f,documentId:'other',id:'other',url:a}];
  const result=mergeRedirectedItems(items,redirects);
  assert.equal(result.length,2);assert.equal(result[0].id,'final');assert.equal(result[1].url,a);
});
