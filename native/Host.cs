using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Threading;
using System.Security.Cryptography;
using System.Globalization;

namespace AnimeJaNaiBridge {
  public sealed class Config {
    public string extensionId { get; set; }
    public string playerPath { get; set; }
    public string[] sites { get; set; }
    public string[] kodik { get; set; }
    public string[] cdn { get; set; }
    public bool enableLaunch { get; set; }
    public bool dynamicStreams { get; set; }
  }
  public static class Policy {
    public static bool Host(string h) {
      return h != null && Regex.IsMatch(h, @"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$") && !Regex.IsMatch(h, @"\.(local|localhost|internal|test|invalid)$");
    }
    public static Uri Url(string raw, string[] hosts, bool playlist) {
      if (raw == null || raw.Length > 8192 || Regex.IsMatch(raw, "[\\s\\x00-\\x1f\\x7f\\\\\"]")) throw new Exception("url");
      Uri u;
      if (!Uri.TryCreate(raw, UriKind.Absolute, out u) || u.Scheme != "https" || !u.IsDefaultPort || u.UserInfo != "" || u.Fragment != "" || !Host(u.DnsSafeHost)) throw new Exception("url");
      if(hosts!=null && Array.IndexOf(hosts,u.DnsSafeHost)<0)throw new Exception("domain");
      if (playlist && !u.AbsolutePath.EndsWith(".m3u8",StringComparison.OrdinalIgnoreCase)) throw new Exception("playlist");
      return u;
    }
    public static string Quote(string value) {
      // CommandLineToArgvW quoting. No shell is involved.
      StringBuilder b = new StringBuilder("\""); int slashes = 0;
      foreach (char c in value) {
        if (c == '\\') { slashes++; continue; }
        if (c == '"') b.Append('\\',slashes*2+1); else b.Append('\\',slashes);
        b.Append(c); slashes=0;
      }
      b.Append('\\',slashes*2); b.Append('"'); return b.ToString();
    }
  }
  public static class Program {
    static string pendingPipe,pendingUrl;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 12 };
    static string Root { get { return AppDomain.CurrentDomain.BaseDirectory; } }
    static byte[] ReadExact(Stream input,int n,bool allowEof) {
      byte[] b=new byte[n]; int i=0;
      while(i<n) { int r=input.Read(b,i,n-i); if(r==0){if(i==0 && allowEof)return null;throw new Exception("truncated");} i+=r; } return b;
    }
    public static byte[] ReadFrame(Stream input) {
      byte[] h=ReadExact(input,4,true); if(h==null)return null;
      uint n=(uint)(h[0] | h[1]<<8 | h[2]<<16 | h[3]<<24);
      if(n==0 || n>65536)throw new Exception("size"); return ReadExact(input,(int)n,false);
    }
    static void WriteFrame(Stream output,object obj) {
      byte[] b=Encoding.UTF8.GetBytes(Json.Serialize(obj)); int n=b.Length;
      output.Write(new byte[]{(byte)n,(byte)(n>>8),(byte)(n>>16),(byte)(n>>24)},0,4);output.Write(b,0,n);output.Flush();
    }
    static string Get(Dictionary<string,object> m,string key) { object v;return m.TryGetValue(key,out v)?v as string:null; }
    static Config Load() {
      Config c=Json.Deserialize<Config>(File.ReadAllText(Path.Combine(Root,"config.json"),Encoding.UTF8));
      if(c==null || c.extensionId==null || !Regex.IsMatch(c.extensionId,"^[a-p]{32}$"))throw new Exception("config");
      if(!c.dynamicStreams) foreach(string[] list in new[]{c.sites,c.kodik,c.cdn}) {
        if(list==null || list.Length==0 || list.Length>10)throw new Exception("config");
        foreach(string h in list)if(!Policy.Host(h))throw new Exception("config");
      }
      if(!Path.IsPathRooted(c.playerPath) || !File.Exists(c.playerPath) || !c.playerPath.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))throw new Exception("player");
      return c;
    }
    static object Handle(Dictionary<string,object> m,Config c) {
      string op=Get(m,"op");
      if(op=="ping") return new {ok=true,dryRun=!c.enableLaunch,version="0.5.0"};
      object syncValue; bool sync=m.TryGetValue("sync",out syncValue) && syncValue is bool && (bool)syncValue;
      if(op!="open" || (m.Count!=4 && m.Count!=5 && !(m.Count==6 && sync)))throw new Exception("message");
      if(m.ContainsKey("sync") && (!sync || m.Count!=6))throw new Exception("message");
      object position; double start=0;
      if(m.TryGetValue("startSeconds",out position)){
        if(!(position is int || position is long || position is double || position is decimal))throw new Exception("position");
        start=Convert.ToDouble(position,CultureInfo.InvariantCulture);
        if(Double.IsNaN(start) || Double.IsInfinity(start) || start<0 || start>86400)throw new Exception("position");
      }else if(m.Count!=4)throw new Exception("message");
      string url=Get(m,"url");
      Policy.Url(url,c.dynamicStreams?null:c.cdn,true);Policy.Url(Get(m,"page"),c.dynamicStreams?null:c.sites,false);Policy.Url(Get(m,"frame"),c.dynamicStreams?null:c.kodik,false);
      if(!c.enableLaunch)return new {ok=true,dryRun=true};
      string lockId;
      using(SHA256 sha=SHA256.Create())lockId=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Root))).Replace("-","").Substring(0,24);
      using(Mutex mutex=new Mutex(false,"Local\\AnimeJaNaiBridge_"+lockId)) {
        bool owns=false;
        try {
          try { owns=mutex.WaitOne(2000); }catch(AbandonedMutexException){owns=true;}
          if(!owns)throw new Exception("busy");
          string stamp=Path.Combine(Root,"last-launch.txt"); long ticks;
          if(File.Exists(stamp) && Int64.TryParse(File.ReadAllText(stamp),out ticks) && DateTime.UtcNow.Ticks-ticks < TimeSpan.FromSeconds(10).Ticks)throw new Exception("duplicate");
          string pipe=sync?"animejanai-"+Guid.NewGuid().ToString("N"):null;
          Launch(c.playerPath,url,start,pipe);
          pendingPipe=pipe;pendingUrl=url;
          File.WriteAllText(stamp,DateTime.UtcNow.Ticks.ToString()); // Timestamp only; no URL or episode history.
        } finally {if(owns)mutex.ReleaseMutex();}
      }
      return new {ok=true,dryRun=false};
    }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO {
      public int cb; public string reserved,desktop,title; public int x,y,xSize,ySize,xCountChars,yCountChars,fillAttribute,flags; public short showWindow,cbReserved2; public IntPtr reserved2,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {public IntPtr process,thread;public int processId,threadId;}
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder args,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    static void Launch(string exe,string url,double start,string pipe) {
      STARTUPINFO si=new STARTUPINFO();si.cb=Marshal.SizeOf(typeof(STARTUPINFO));PROCESS_INFORMATION pi;
      // Break away from Chrome's job so player survives native host shutdown.
      // Fail closed if Chrome/OS policy does not permit breakaway.
      string extra=pipe==null?"":" --input-ipc-server="+pipe;
      if(pipe!=null && Path.GetFileName(exe).Equals("mpvnet.exe",StringComparison.OrdinalIgnoreCase))extra+=" --process-instance=multi";
      if(!CreateProcess(exe,new StringBuilder(Policy.Quote(exe)+extra+" --start="+start.ToString("0.###",CultureInfo.InvariantCulture)+" -- "+Policy.Quote(url)),IntPtr.Zero,IntPtr.Zero,false,0x01000200,IntPtr.Zero,Path.GetDirectoryName(exe),ref si,out pi))throw new Exception("launch:"+Marshal.GetLastWin32Error());
      CloseHandle(pi.thread);CloseHandle(pi.process);
    }
    [STAThread] public static int Main(string[] args) {
      Stream output=Console.OpenStandardOutput();
      try {
        Config c=Load();
        if(args.Length<1 || args[0]!="chrome-extension://"+c.extensionId+"/")throw new Exception("origin");
        Stream input=Console.OpenStandardInput();byte[] b;
        while((b=ReadFrame(input))!=null) {
          try {
            var m=Json.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(b));
            if(m==null)throw new Exception("message");WriteFrame(output,Handle(m,c));
            if(pendingPipe!=null){PlaybackMonitor.Watch(pendingPipe,pendingUrl,o=>WriteFrame(output,o));return 0;}
          }catch(Exception e) {WriteFrame(output,new {ok=false,error=ErrorText(e)});}
        }
        return 0;
      }catch(Exception e) {try{WriteFrame(output,new {ok=false,error=ErrorText(e)});}catch{}return 1;}
    }
    static string ErrorText(Exception e){
      switch(e.Message){
        case "domain":return "Домен потока отклонён старым списком хоста. Обновите локальный хост через install.cmd.";
        case "duplicate":return "Повторный запуск: подождите 10 секунд.";
        case "player":return "Не найден exe плеера. Запустите install.cmd и укажите путь к mpvnet.exe.";
        case "origin":return "ID расширения не совпадает с регистрацией хоста.";
        case "url":case "playlist":return "Недопустимый URL: требуется HTTPS HLS без локальных адресов.";
        case "position":return "Недопустимое время воспроизведения.";
        case "config":return "Некорректная настройка хоста. Повторите install.cmd.";
        case "message":return "Версии расширения и хоста несовместимы. Обновите оба компонента.";
      }
      if(e.Message.StartsWith("launch:"))return "Windows не запустила плеер. Код ошибки: "+e.Message.Substring(7);
      return "Ошибка хоста ("+e.GetType().Name+"). Проверьте доступ к файлам установки.";
    }
  }
}
