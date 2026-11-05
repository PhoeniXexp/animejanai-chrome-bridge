import {host} from './core.mjs';
const $ = id=>document.getElementById(id);
const status = t=>{$('status').textContent=t;};
async function send(op,extra={}) {
  const r=await chrome.runtime.sendMessage({op,...extra});
  if (r?.ok===false) throw Error(r.error || 'Хост отклонил запрос.');
  return r;
}
function action(id,fn){$(id).onclick=async()=>{try{await fn();}catch(e){status(e.message);}};}
async function list(recover=true){
  const r=await send('list',{recover}); $('items').replaceChildren();
  status(r.syncStatus || '');
  if(r.overflow) status('Слишком много потоков. Запустите новый поиск.');
  for(const [index,x] of r.items.entries()){
    const row=document.createElement('div'); row.className='item';
    const url=new URL(x.url);
    const heading=document.createElement('strong');
    heading.textContent=`Вариант ${index+1} · ${/\.mpd$/i.test(url.pathname)?'DASH':'HLS'}`;
    const text=document.createElement('div'); text.textContent=url.hostname;
    const b=document.createElement('button'); b.textContent='Открыть в плеере'; b.disabled=!!r.overflow;
    b.onclick=async()=>{try{
      b.disabled=true;
      const result=await send('open',{id:x.id});
      const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
      const time=format(result.startSeconds);
      status(result.dryRun?'Тестовый режим: запуск отключён.':`Передано с ${time}. Браузер на паузе.`);
    }catch(e){status(e.message);}finally{b.disabled=!!r.overflow;}};
    row.append(heading,text,b); $('items').append(row);
  }
  if(r.items.length>1 && !r.overflow && !r.syncStatus) status('Выберите поток. Среди вариантов может быть реклама.');
  if(!r.items.length) status('Поток не найден. Запустите видео и обновите список.');
}
action('refresh',()=>list());
action('clear',async()=>{await send('clear');await list(false);});
action('save',async()=>{
  const sites=[...new Set($('sites').value.split(/\s+/).filter(Boolean).map(v=>host(new URL(v.includes('://')?v:'https://'+v).hostname)))];
  if(!sites.length || sites.length>10) throw Error('Укажите от 1 до 10 сайтов.');
  const cfg={sites,dynamicStreams:true};
  const origins=['https://*/*'];
  if(!await chrome.permissions.request({origins})) throw Error('Доступ не разрешён.');
  const old=await chrome.permissions.getAll();
  const removed=(old.origins||[]).filter(x=>!origins.includes(x));
  if(removed.length) await chrome.permissions.remove({origins:removed});
  cfg.autoCapture=$('autoCapture').checked;
  await chrome.storage.local.set({config:cfg});await send('resetAll');status('Сохранено.');
});
action('connection',async()=>{const r=await send('ping');status(`Хост ${r.version || '?'}: ${r.dryRun?'запуск отключён':'подключён'}.`);});
action('revoke',async()=>{const p=await chrome.permissions.getAll();if(p.origins?.length) await chrome.permissions.remove({origins:p.origins});await chrome.storage.local.clear();await send('resetAll');$('sites').value='';status('Доступ отозван.');});
const {config}=await chrome.storage.local.get('config');
$('sites').value=config?.sites?.join('\n') || 'https://animego.online';
if(config)$('autoCapture').checked=config.autoCapture!==false;
try{await list();}catch(e){status(e.message);}
