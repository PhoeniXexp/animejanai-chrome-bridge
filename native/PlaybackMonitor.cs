using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;
namespace AnimeJaNaiBridge {
  public static class PlaybackMonitor {
    public static void Watch(string pipeName,string expectedUrl,Action<object> send) {
      double? position=null; bool matched=false,changed=false,connected=false;int timedOut=0;
      var json=new JavaScriptSerializer {MaxJsonLength=65536,RecursionLimit=12};
      using(var pipe=new NamedPipeClientStream(".",pipeName,PipeDirection.InOut,PipeOptions.Asynchronous)) {
        try {
          pipe.Connect(30000);connected=true;
          using(var limit=new Timer(_=>{Interlocked.Exchange(ref timedOut,1);try{pipe.Dispose();}catch{}},null,6*60*60*1000,Timeout.Infinite))
          using(var reader=new StreamReader(pipe,new UTF8Encoding(false),false,4096))
          using(var writer=new StreamWriter(pipe,new UTF8Encoding(false),4096)) {
            writer.AutoFlush=true;
            writer.WriteLine("{\"command\":[\"observe_property\",1,\"path\"]}");
            writer.WriteLine("{\"command\":[\"observe_property\",2,\"time-pos\"]}");
            send(new {eventType="tracking",ok=true});
            string line;
            while((line=reader.ReadLine())!=null){
              if(line.Length>65536)continue;
              Dictionary<string,object> m;
              try{m=json.Deserialize<Dictionary<string,object>>(line);}catch{continue;}
              object ev,name,data;
              if(!m.TryGetValue("event",out ev) || (ev as string)!="property-change" || !m.TryGetValue("name",out name))continue;
              m.TryGetValue("data",out data);
              if((name as string)=="path"){
                string path=data as string;
                if(path==expectedUrl && !changed)matched=true;
                else if(!String.IsNullOrEmpty(path)){changed=true;matched=false;position=null;}
              }
              if((name as string)=="time-pos" && matched && !changed && data!=null){
                double time;
                try{time=Convert.ToDouble(data,System.Globalization.CultureInfo.InvariantCulture);}catch{continue;}
                if(!Double.IsNaN(time) && !Double.IsInfinity(time) && time>=0 && time<=86400)position=time;
              }
            }
          }
        }catch{ /* A closed pipe is expected when the player quits. */ }
      }
      if(connected && position.HasValue && !changed && timedOut==0)send(new {eventType="closed",ok=true,position=position.Value});
      else send(new {eventType="closed",ok=false,error=changed?"В mpv открыто другое видео; синхронизация пропущена.":"Не удалось получить позицию mpv. Браузер остался на паузе."});
    }
  }
}
