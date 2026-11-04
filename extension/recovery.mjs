// Executed in an already-approved player document, without fetching or playing media.
export function readLoadedPlaylist() {
  const videos=[...document.querySelectorAll('video')].filter(v=>{
    const r=v.getBoundingClientRect();
    return r.width>0 && r.height>0 && v.readyState>=1 && !v.ended;
  });
  if(videos.length!==1 || !Number.isFinite(videos[0].duration)) return null;
  const entries=performance.getEntriesByType('resource').filter(e=>
    /\.(?:m3u8|mpd)(?:\?|$)/i.test(e.name) &&
    ['fetch','xmlhttprequest','video'].includes(e.initiatorType) &&
    Number.isFinite(e.startTime) && e.responseEnd>0 &&
    (!e.responseStatus || (e.responseStatus>=200 && e.responseStatus<300))
  ).sort((a,b)=>b.startTime-a.startTime);
  const entry=entries[0];
  return entry ? {url:entry.name,timeStamp:performance.timeOrigin+entry.startTime,frameUrl:location.href} : null;
}
