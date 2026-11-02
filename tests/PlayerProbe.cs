using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Web.Script.Serialization;
class PlayerProbe {
  static void Main(string[] args) {
    string file=Environment.GetEnvironmentVariable("ANIMEJANAI_TEST_MARKER");
    if(file!=null)File.WriteAllLines(file,args);
    string pipe=null;foreach(string arg in args)if(arg.StartsWith("--input-ipc-server="))pipe=arg.Substring("--input-ipc-server=".Length);
    if(pipe!=null){
      using(var server=new NamedPipeServerStream(pipe,PipeDirection.InOut,1)){
        server.WaitForConnection();
        using(var reader=new StreamReader(server))using(var writer=new StreamWriter(server,new UTF8Encoding(false))){
          reader.ReadLine();reader.ReadLine();writer.AutoFlush=true;var json=new JavaScriptSerializer();
          writer.WriteLine(json.Serialize(new { @event="property-change",name="path",data=args[args.Length-1]}));
          writer.WriteLine("{\"event\":\"property-change\",\"name\":\"time-pos\",\"data\":450.75}");
          if(Environment.GetEnvironmentVariable("ANIMEJANAI_TEST_CHANGE_FILE")=="1")writer.WriteLine("{\"event\":\"property-change\",\"name\":\"path\",\"data\":\"other-video.mp4\"}");
        }
      }
    }
  }
}
