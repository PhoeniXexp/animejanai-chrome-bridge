export const WINDOW_MS = 6 * 60 * 60 * 1000;
export function host(value) {
  const s = value.trim().toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) throw Error('Нужен домен без https, пути и порта.');
  if (/\.(local|localhost|internal|test|invalid)$/.test(s)) throw Error('Локальные домены запрещены.');
  return s;
}
export function safeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 8192 || /[\s\x00-\x1f\x7f\\]/.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.port) return null;
    host(u.hostname);
    return u;
  } catch { return null; }
}
// A page anchor selects a UI section, not a different media URL.
export function safePageUrl(raw) {
  if(typeof raw!=='string' || raw.length>8192) return null;
  return safeUrl(raw.split('#',1)[0]);
}
export function rejection(details, session, frames, cfg, now = Date.now()) {
  const u = safeUrl(details.url);
  if (!u || !/\.(?:m3u8|mpd)$/i.test(u.pathname)) return 'invalid-playlist-url';
  if (!cfg?.dynamicStreams && !cfg?.cdn?.includes(u.hostname)) return 'cdn-not-allowed';
  if (!session || session.tabId !== details.tabId) return 'wrong-tab';
  if (now - session.started > WINDOW_MS || now < session.started || details.timeStamp < session.started) return 'outside-search-window';
  if (details.frameId <= 0) return 'no-player-frame';
  if (details.statusCode < 200 || details.statusCode >= 300) return 'http-not-success';
  const f = frames.find(f => f.frameId === details.frameId);
  const fu = f && safeUrl(f.url);
  const initiator = safeUrl(details.initiator);
  // Exact frame + initiator: nested ad frames and unrelated playlists fail closed.
  if (!fu) return 'frame-not-kodik';
  if(cfg.dynamicStreams){
    if(!supportedPlayerFrame(f.url,cfg)) return 'frame-not-supported';
    if(!initiator || initiator.origin!==fu.origin) return 'initiator-not-kodik';
  }else{
    if(!cfg.kodik.includes(fu.hostname)) return 'frame-not-kodik';
    if(!initiator || !cfg.kodik.includes(initiator.hostname)) return 'initiator-not-kodik';
  }
  return null;
}
export function supportedPlayerFrame(raw,cfg) {
  const u=safeUrl(raw);
  if(!u) return false;
  if(!cfg?.dynamicStreams) return !!cfg?.kodik?.includes(u.hostname);
  return /(^|\.)kodikplayer\.com$/.test(u.hostname) || /^\/(serial|video)\//.test(u.pathname) ||
    (u.hostname==='aniboom.one' && /^\/embed\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname));
}
export function accept(details, session, frames, cfg, now = Date.now()) {
  return rejection(details, session, frames, cfg, now) === null;
}
export function label(raw) {
  const u = new URL(raw);
  return u.hostname + ' / … / ' + (u.pathname.split('/').pop() || 'playlist');
}
