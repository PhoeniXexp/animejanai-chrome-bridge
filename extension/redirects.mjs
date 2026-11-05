// Only browser-observed redirects in the same document establish equivalence.
export function canonicalPlaylist(url,frame,redirects=[]) {
  const visited=new Set();
  while(!visited.has(url)) {
    visited.add(url);
    const next=redirects.find(r=>r.from===url && r.frameId===frame.frameId && r.documentId===frame.documentId);
    if(!next) return url;
    url=next.to;
  }
  return null;
}
export function mergeRedirectedItems(items,redirects) {
  const result=[];
  for(const item of items) {
    const url=canonicalPlaylist(item.url,item,redirects);
    if(!url) continue;
    if(result.some(i=>i.url===url && i.frameId===item.frameId && i.documentId===item.documentId)) continue;
    // A changed URL needs a new identity so old launch/return state cannot target it.
    result.push(url===item.url?item:{...item,url,id:crypto.randomUUID()});
  }
  return result;
}
