// Executed in an already-approved player document, without fetching or playing media.
export function readLoadedPlaylists() {
  const roots=[document],allVideos=[];
  for(const root of roots) {
    allVideos.push(...root.querySelectorAll('video'));
    for(const element of root.querySelectorAll('*')) if(element.shadowRoot) roots.push(element.shadowRoot);
  }
  const videos=allVideos.filter(v=>{
    const r=v.getBoundingClientRect();
    return r.width>0 && r.height>0 && v.readyState>=1 && !v.ended &&
      (!v.checkVisibility || v.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  });
  if(!videos.length) return [];
  const entries=performance.getEntriesByType('resource').filter(e=>
    /\.(?:m3u8|mpd)(?:\?|$)/i.test(e.name) &&
    ['fetch','xmlhttprequest','video'].includes(e.initiatorType) &&
    Number.isFinite(e.startTime) && e.responseEnd>0 &&
    (!e.responseStatus || (e.responseStatus>=200 && e.responseStatus<300))
  ).sort((a,b)=>b.startTime-a.startTime);
  const seen=new Set();
  return entries.filter(e=>{if(seen.has(e.name))return false;seen.add(e.name);return true;}).slice(0,20)
    .map(entry=>({url:entry.name,timeStamp:performance.timeOrigin+entry.startTime,frameUrl:location.href}));
}

// A request can complete before video metadata arrives. Check again when listing.
export function inspectVideo() {
  const roots=[document],allVideos=[];
  for(const root of roots) {
    allVideos.push(...root.querySelectorAll('video'));
    for(const element of root.querySelectorAll('*')) if(element.shadowRoot) roots.push(element.shadowRoot);
  }
  const count=allVideos.filter(v=>{
    const r=v.getBoundingClientRect();
    return r.width>0 && r.height>0 && v.readyState>=1 && !v.ended &&
      (!v.checkVisibility || v.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  }).length;
  return {frameUrl:location.href,count};
}
