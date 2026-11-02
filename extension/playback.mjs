// Runs only in the selected Kodik document, in Chrome's isolated world.
export function pauseAndReadPosition() {
  const videos=[...document.querySelectorAll('video')].filter(v=>{
    const r=v.getBoundingClientRect();
    return r.width>0 && r.height>0 && v.readyState>=1 && !v.ended;
  });
  // Snapshot before pause handlers can modify the player's state.
  const v=videos.length===1 ? videos[0] : null;
  const time=v?.currentTime, duration=v?.duration, seeking=v?.seeking;
  // On an ambiguous page pause all visible videos, but do not guess which time to send.
  for(const v of videos) v.pause();
  if(videos.length!==1) return {ok:false,error:'Не удалось однозначно выбрать видео Kodik. Видимые видео поставлены на паузу.'};
  if(!Number.isFinite(time) || time<0 || time>86400 || !Number.isFinite(duration) || seeking)
    return {ok:false,error:'Видео на паузе, но время пока недоступно. Дождитесь завершения перемотки и повторите.'};
  const token=crypto.randomUUID();
  globalThis.__animejanaiReturn={token,video:v,source:v.currentSrc,time,valid:true};
  const invalidate=()=>{if(globalThis.__animejanaiReturn?.token===token)globalThis.__animejanaiReturn.valid=false;};
  v.addEventListener?.('emptied',invalidate,{once:true});
  v.addEventListener?.('play',invalidate,{once:true});
  return {ok:true,videoToken:token,capturedSeconds:Math.round(time*1000)/1000,startSeconds:Math.max(0,Math.round((time-5)*1000)/1000)};
}

export async function restorePosition(token,seconds) {
  const state=globalThis.__animejanaiReturn;
  if(!state || state.token!==token || !state.valid || !Number.isFinite(seconds) || seconds<0 || seconds>86400)
    return {ok:false,reason:'Просмотр в браузере изменился.'};
  const v=state.video;
  if(!v.isConnected || v.currentSrc!==state.source || !v.paused || v.seeking || Math.abs(v.currentTime-state.time)>1.5)
    return {ok:false,reason:'Видео сменилось или вы уже продолжили просмотр в браузере.'};
  state.valid=false;
  v.pause();
  const destination=Math.max(0,Math.min(seconds,Number.isFinite(v.duration)?Math.max(0,v.duration-0.1):seconds));
  return await new Promise(resolve=>{
    let timer;
    const finish=(ok)=>{clearTimeout(timer);v.removeEventListener('seeked',onSeek);v.pause();resolve({ok,seconds:v.currentTime,reason:ok?'':'Плеер не подтвердил перемотку.'});};
    const onSeek=()=>finish(v.currentSrc===state.source && Math.abs(v.currentTime-destination)<2);
    if(Math.abs(v.currentTime-destination)<0.1){finish(true);return;}
    v.addEventListener('seeked',onSeek,{once:true});
    timer=setTimeout(()=>finish(false),8000);
    try{v.currentTime=destination;}catch{finish(false);}
  });
}
