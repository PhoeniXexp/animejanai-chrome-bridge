import {rejection, safeUrl, supportedPlayerFrame, safePageUrl, WINDOW_MS} from './core.mjs';
import {readLoadedPlaylist} from './recovery.mjs';
import {pauseAndReadPosition,restorePosition} from './playback.mjs';
import {openSynced} from './native-session.mjs';
const HOST = 'com.animejanai.chrome_bridge';
function publicError(error) {
  const message=String(error?.message || '');
  const native={
    'Specified native messaging host not found.':'Chrome не нашёл регистрацию локального хоста.',
    'Access to the specified native messaging host is forbidden.':'Chrome запретил доступ к хосту. Проверьте ID расширения.',
    'Native host has exited.':'Процесс хоста завершился без ответа Chrome.',
    'Error when communicating with the native messaging host.':'Ошибка обмена сообщениями Chrome с хостом.',
    'Failed to start native messaging host.':'Chrome не смог запустить локальный хост.'
  };
  if(native[message]) return native[message]+' ['+message+']';
  if(/^(Поиск истёк\.|Страница изменилась\.|Откройте |Сохраните домены|Неизвестная команда\.|Выбрана другая вкладка\.|Нужен новый поиск|Плеер сменился\.|Подождите 10 секунд)/.test(message)) return message;
  return 'Неизвестная ошибка операции. Проверьте хост отдельной кнопкой. ID расширения: '+chrome.runtime.id;
}
let queue = Promise.resolve();
function serial(fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; }
const activeId=async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id;
const captureKey=id=>`capture:${id}`;
const read=async(id)=>{id ??= await activeId();return (await chrome.storage.session.get(captureKey(id)))[captureKey(id)];};
const save=async(s)=>chrome.storage.session.set({[captureKey(s.tabId)]:s});
const drop=async(id)=>chrome.storage.session.remove(captureKey(id ?? await activeId()));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name.startsWith('capture-expiry:')) void serial(async () => {
    const id=Number(alarm.name.split(':')[1]);
    const s = await read(id);
    if (s && Date.now() - s.started >= WINDOW_MS) await drop(id);
  });
});
async function current(s) {
  if (!s || Date.now() - s.started > WINDOW_MS) throw Error('Поиск истёк. Начните заново.');
  const t = await chrome.tabs.get(s.tabId);
  if (safePageUrl(t.url)?.href !== safePageUrl(s.page)?.href) throw Error('Страница изменилась. Начните поиск заново.');
  return t;
}
async function recoverLoaded(tab) {
  const {config}=await chrome.storage.local.get('config');
  const page=safePageUrl(tab?.url);
  if(!page || tab.incognito || !config?.sites?.includes(page.hostname) || config.autoCapture===false) return null;
  const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});
  const items=[];
  for(const frame of (frames || []).filter(f=>f.frameId>0 && f.documentId && supportedPlayerFrame(f.url,config)).slice(0,20)) {
    try {
      const results=await chrome.scripting.executeScript({target:{tabId:tab.id,documentIds:[frame.documentId]},func:readLoadedPlaylist});
      const result=results.find(r=>r.frameId===frame.frameId && r.documentId===frame.documentId)?.result;
      const url=safeUrl(result?.url),now=Date.now();
      if(!url || !/\.(?:m3u8|mpd)$/i.test(url.pathname) || result.frameUrl!==frame.url ||
        !Number.isFinite(result.timeStamp) || result.timeStamp>now || now-result.timeStamp>WINDOW_MS ||
        (!config.dynamicStreams && !config.cdn?.includes(url.hostname))) continue;
      items.push({id:crypto.randomUUID(),url:result.url,frameId:frame.frameId,frameUrl:frame.url,documentId:frame.documentId,seen:result.timeStamp});
    } catch { /* A player may navigate or deny script access during recovery. */ }
  }
  // Do not attach old results to a replacement page or player document.
  const latest=await chrome.tabs.get(tab.id);
  if(safePageUrl(latest.url)?.href!==safePageUrl(tab.url)?.href || latest.incognito) return null;
  const live=await chrome.webNavigation.getAllFrames({tabId:tab.id});
  const valid=items.filter(i=>live?.some(f=>f.documentId===i.documentId && f.frameId===i.frameId && f.url===i.frameUrl));
  if(!valid.length) return null;
  const s={tabId:tab.id,page:tab.url,started:Math.min(...valid.map(i=>i.seen)),items:valid};
  await save(s);
  await chrome.alarms.create(`capture-expiry:${tab.id}`,{when:s.started+WINDOW_MS});
  return s;
}
function observe(d) {
  if (!/\.(?:m3u8|mpd)(?:\?|$)/i.test(d.url)) return;
  void serial(async () => {
    const {config} = await chrome.storage.local.get('config');
    try {
      if(d.tabId<0 || !config) return;
      let s=await read(d.tabId);
      if(!s || Date.now()-s.started>WINDOW_MS){
        if(config.autoCapture===false) return;
        const tab=await chrome.tabs.get(d.tabId),u=safePageUrl(tab.url);
        if(tab.id!==d.tabId || tab.incognito || !u || !config.sites.includes(u.hostname)) return;
        s={tabId:d.tabId,page:tab.url,started:Math.min(Date.now(),d.timeStamp),items:[]};
        await chrome.alarms.create(`capture-expiry:${d.tabId}`,{when:s.started+WINDOW_MS});
      }
      await current(s);
      const frames = await chrome.webNavigation.getAllFrames({tabId:s.tabId});
      if (rejection(d,s,frames || [],config)) return;
      // Store tokens in session memory only. No console, sync storage or disk logs.
      if (!s.items.some(x => x.url === d.url)) {
        // A new playlist in the same player supersedes the previous episode/quality.
        s.items=s.items.filter(x=>x.frameId!==d.frameId);
        if (s.items.length >= 20) { s.overflow = true; }
        else s.items.push({id:crypto.randomUUID(), url:d.url, frameId:d.frameId, frameUrl:frames.find(f=>f.frameId===d.frameId).url, seen:Date.now()});
        await save(s);
      }
    } catch { /* Closed tab or navigation: ignore. */ }
  });
}
chrome.webRequest.onCompleted.addListener(observe,{urls:['https://*/*']});
chrome.webNavigation.onCommitted.addListener(d => {
  void serial(async () => {
    const s = await read(d.tabId);
    if (s && (d.frameId === 0 || s.items.some(x=>x.frameId===d.frameId))) await drop(d.tabId);
  });
});
chrome.tabs.onRemoved.addListener(tabId => { void serial(()=>drop(tabId)); });
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  serial(async () => {
    if (msg.op === 'clear') { await drop(); return {}; }
    if (msg.op === 'resetAll') { await chrome.storage.session.clear(); return {}; }
    if (msg.op === 'ping') return chrome.runtime.sendNativeMessage(HOST,{op:'ping'});
    if (msg.op === 'arm') {
      const {config} = await chrome.storage.local.get('config');
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      const u = safePageUrl(tab?.url);
      if (!u || !config?.sites.includes(u.hostname) || tab.incognito) throw Error('Откройте настроенную страницу AnimeGo.');
      const origins = config.dynamicStreams ? ['https://*/*'] : [...config.sites,...config.kodik,...config.cdn].map(h=>`https://${h}/*`);
      if (!await chrome.permissions.contains({origins})) throw Error('Сохраните домены и разрешите доступ.');
      await save({tabId:tab.id,page:tab.url,started:Date.now(),items:[]});
      await chrome.alarms.create(`capture-expiry:${tab.id}`,{when:Date.now()+WINDOW_MS});
      return {};
    }
    let s = await read();
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (msg.op === 'list') {
      if (!s || s.tabId !== tab?.id || Date.now()-s.started > WINDOW_MS) { await drop(); s=null; }
      if(!s?.items.length && msg.recover!==false) s=(await recoverLoaded(tab)) || s;
      if(!s) return {items:[]};
      await current(s);
      return {items:s.items, overflow:s.overflow,syncStatus:(await chrome.storage.session.get(`return:${tab.id}`))[`return:${tab.id}`]};
    }
    if (msg.op !== 'open') throw Error('Неизвестная команда.');
    if (s?.tabId !== tab?.id) throw Error('Выбрана другая вкладка.');
    await current(s);
    const item = s.items.find(x=>x.id===msg.id);
    if (!item || s.overflow) throw Error('Нужен новый поиск без переполнения.');
    const frames = await chrome.webNavigation.getAllFrames({tabId:s.tabId});
    const playerFrame=frames?.find(f=>f.frameId===item.frameId && f.url===item.frameUrl && (!item.documentId || item.documentId===f.documentId));
    if (!playerFrame) throw Error('Плеер сменился. Повторите поиск.');
    let playback;
    try {
      const target=playerFrame.documentId ? {tabId:s.tabId,documentIds:[playerFrame.documentId]} : {tabId:s.tabId,frameIds:[item.frameId]};
      const results=await chrome.scripting.executeScript({target,func:pauseAndReadPosition});
      playback=results[0]?.result;
    }catch {return {ok:false,error:'Не удалось обратиться к видео плеера. Проверьте разрешение на домен плеера. Запуск отменён.'};}
    if(!playback?.ok) return {ok:false,error:playback?.error || 'Не удалось прочитать время видео. Запуск отменён.'};
    if (s.lastLaunch && Date.now()-s.lastLaunch < 10_000) throw Error('Подождите 10 секунд перед повторным запуском.');
    s.lastLaunch=Date.now(); await save(s);
    try {
      const result=await openSynced(HOST,{op:'open',url:item.url,page:safePageUrl(s.page).href,frame:item.frameUrl,startSeconds:playback.startSeconds},async event=>{
        const note=async text=>chrome.storage.session.set({[`return:${s.tabId}`]:text});
        if(event.eventType==='tracking'){await note('mpv подключён: после закрытия позиция вернётся в браузер.');return;}
        if(event.eventType!=='closed')return;
        if(!event.ok){await note(event.error);return;}
        try{
          const t=await chrome.tabs.get(s.tabId);
          const nowFrames=await chrome.webNavigation.getAllFrames({tabId:s.tabId});
          if(safePageUrl(t.url)?.href!==safePageUrl(s.page)?.href || !playerFrame.documentId || !nowFrames?.some(f=>f.documentId===playerFrame.documentId && f.url===item.frameUrl))throw Error('changed');
          const session=await read(s.tabId);
          if(!session?.items.some(x=>x.id===item.id))throw Error('changed');
          const results=await chrome.scripting.executeScript({target:{tabId:s.tabId,documentIds:[playerFrame.documentId]},func:restorePosition,args:[playback.videoToken,event.position]});
          const restored=results[0]?.result;
          await note(restored?.ok?`Позиция возвращена: ${Math.floor(restored.seconds/60)}:${String(Math.floor(restored.seconds%60)).padStart(2,'0')}. Браузер на паузе.`:'Возврат позиции пропущен: '+(restored?.reason || 'видео недоступно.'));
        }catch{await note('Возврат позиции пропущен: вкладка или серия изменилась.');}
      });
      if(!result?.ok) return {ok:false,error:'Браузер на паузе. '+(result?.error || 'Хост не подтвердил запуск.')};
      return {...result,startSeconds:playback.startSeconds,capturedSeconds:playback.capturedSeconds,browserPaused:true};
    }catch(error){return {ok:false,error:'Браузер на паузе. '+publicError(error)};}
  }).then(reply, error => reply({ok:false,error:publicError(error)}));
  return true;
});
