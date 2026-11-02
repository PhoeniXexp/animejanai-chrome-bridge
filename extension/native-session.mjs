const livePorts=new Set();
export function openSynced(host,message,onEvent){
  return new Promise((resolve,reject)=>{
    const port=chrome.runtime.connectNative(host);livePorts.add(port);
    let acknowledged=false,finished=false;
    const timer=setTimeout(()=>{if(!acknowledged){finished=true;port.disconnect();livePorts.delete(port);reject(Error('Хост не ответил на запуск.'));}},15000);
    port.onMessage.addListener(reply=>{
      if(reply.eventType){
        if(reply.eventType==='closed'){finished=true;port.disconnect();livePorts.delete(port);}
        Promise.resolve(onEvent(reply)).catch(()=>{});
        return;
      }
      if(acknowledged)return;
      acknowledged=true;clearTimeout(timer);resolve(reply);
      if(!reply.ok || reply.dryRun){finished=true;port.disconnect();livePorts.delete(port);}
    });
    port.onDisconnect.addListener(()=>{
      const error=chrome.runtime.lastError?.message;
      clearTimeout(timer);livePorts.delete(port);
      if(!acknowledged){reject(Error(error || 'Native host has exited.'));return;}
      if(!finished)Promise.resolve(onEvent({eventType:'closed',ok:false,error:'Связь с mpv потеряна. Позиция браузера не изменена.'})).catch(()=>{});
    });
    port.postMessage({...message,sync:true});
  });
}
