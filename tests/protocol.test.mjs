import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const id='a'.repeat(32), origin=`chrome-extension://${id}/`;
function frame(m){const b=Buffer.from(JSON.stringify(m));const h=Buffer.alloc(4);h.writeUInt32LE(b.length);return Buffer.concat([h,b]);}
async function run(exe,buf,caller=origin,env={}){
  return await new Promise((resolve,reject)=>{
    const p=spawn(exe,[caller],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,...env}});
    const output=[];const err=[];
    const timer=setTimeout(()=>{p.kill();reject(Error('Host timed out'));},10_000);
    p.on('error',reject);p.stdout.on('data',x=>output.push(x));p.stderr.on('data',x=>err.push(x));p.stdin.on('error',()=>{});
    p.on('close',()=>{clearTimeout(timer);try{
      assert.equal(Buffer.concat(err).length,0,'no logging to stderr');
      const data=Buffer.concat(output);const results=[];let off=0;
      while(off<data.length){assert.ok(off+4<=data.length);let n=data.readUInt32LE(off);off+=4;assert.ok(n<=1048576 && off+n<=data.length);results.push(JSON.parse(data.subarray(off,off+n)));off+=n;}
      resolve(results);
    }catch(e){reject(e);}});p.stdin.end(buf);
  });
}
test('native protocol, invalid input, dry-run, detached player and cooldown',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'animejanai-bridge-test-'));
  try{
    const exe=path.join(dir,'AnimeJaNaiBridge.exe'),player=path.join(dir,'PlayerProbe.exe'),marker=path.join(dir,'args.txt');
    await copyFile(path.join(root,'native','AnimeJaNaiBridge.exe'),exe);
    await copyFile(path.join(root,'tests','PlayerProbe.exe'),player);
    const cfg={extensionId:id,playerPath:player,sites:['anime.example'],kodik:['kodik.example'],cdn:['cdn.example'],enableLaunch:false};
    const save=()=>writeFile(path.join(dir,'config.json'),JSON.stringify(cfg));await save();
    const valid={op:'open',url:'https://cdn.example/720.m3u8?token=a&x=2',page:'https://anime.example/episode',frame:'https://kodik.example/serial/1',startSeconds:152.25};
    for(const value of [-1,86401,'152 --script=evil',null,true])assert.equal((await run(exe,frame({...valid,startSeconds:value})))[0].ok,false);
    const res=await run(exe,Buffer.concat([frame({op:'ping'}),frame(valid)]));
    assert.deepEqual(res.map(x=>x.dryRun),[true,true]);
    assert.equal((await run(exe,frame(valid),'chrome-extension://'+'b'.repeat(32)+'/'))[0].ok,false);
    for(const bad of [{...valid,url:'file:///C:/a.m3u8'},{...valid,url:'https://ads.example/a.m3u8'},{...valid,frame:'https://ads.example/ad'},{...valid,page:'https://untrusted.example/'},{...valid,args:['--script=x']},{op:'exec'}])assert.equal((await run(exe,frame(bad)))[0].ok,false);
    for(const bad of [Buffer.from([0,0,0,0]),Buffer.from([1,0,1,0]),Buffer.from([2,0]),Buffer.from([5,0,0,0,123])])assert.equal((await run(exe,bad))[0].ok,false);
    assert.equal((await run(exe,Buffer.from([1,0,0,0,255])))[0].ok,false);
    const denied=await run(exe,frame({...valid,url:'https://new-cdn.example/720.m3u8'}));
    assert.match(denied[0].error,/Домен потока/);
    cfg.dynamicStreams=true;await save();
    assert.equal((await run(exe,frame({...valid,url:'https://new-cdn.example/720.m3u8'})))[0].ok,true,'dynamic CDN accepted without editing native config');
    assert.equal((await run(exe,frame({...valid,url:'https://127.0.0.1/720.m3u8'})))[0].ok,false);
    cfg.enableLaunch=true;await save();
    assert.equal((await run(exe,frame(valid),origin,{ANIMEJANAI_TEST_MARKER:marker}))[0].ok,true);
    let args;for(let i=0;i<40;i++){try{args=await readFile(marker,'utf8');break;}catch{await new Promise(r=>setTimeout(r,50));}}
    assert.ok(args,'test player survived native host exit');
    assert.deepEqual(args.trim().split(/\r?\n/),['--start=152.25','--',valid.url]);
    assert.equal((await run(exe,frame(valid)))[0].ok,false,'cooldown across host processes');
    await rm(path.join(dir,'last-launch.txt'));
    const sync=await run(exe,frame({...valid,sync:true}));
    assert.equal(sync[0].ok,true);assert.equal(sync[1].eventType,'tracking');assert.deepEqual(sync[2],{eventType:'closed',ok:true,position:450.75});
    await rm(path.join(dir,'last-launch.txt'));
    const changed=await run(exe,frame({...valid,sync:true}),origin,{ANIMEJANAI_TEST_CHANGE_FILE:'1'});
    assert.equal(changed.at(-1).ok,false,'different mpv file must never update browser');
  }finally{await rm(dir,{recursive:true,force:true});}
});
