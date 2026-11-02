using System;
using System.IO;
using AnimeJaNaiBridge;
class PolicyTests {
  static int count;
  static void Check(bool condition) {count++;if(!condition)throw new Exception("Check failed #"+count);}
  static void Reject(Action action) {bool failed=false;try{action();}catch{failed=true;}Check(failed);}
  static int Main() {
    string[] hosts={"cdn.example"};
    Check(Policy.Url("https://cdn.example/a.m3u8?x=1&y=2",hosts,true).Host==hosts[0]);
    foreach(string raw in new[]{"--script=evil","http://cdn.example/a.m3u8","https://cdn.example/a.ts","https://cdn.example.evil.org/a.m3u8","https://u:p@cdn.example/a.m3u8","https://127.0.0.1/a.m3u8","https://[::1]/a.m3u8","https://cdn.example:81/a.m3u8","https://cdn.example/a.m3u8#fragment","https://cdn.example/a\n.m3u8","https://cdn.example/a\".m3u8"}) Reject(()=>Policy.Url(raw,hosts,true));
    Check(Policy.Quote("a b")=="\"a b\"");
    Check(Policy.Quote("a\\")=="\"a\\\\\"");
    Check(Policy.Quote("a\"b")=="\"a\\\"b\"");
    Check(Program.ReadFrame(new MemoryStream(new byte[]{2,0,0,0,123,125})).Length==2);
    Check(Program.ReadFrame(new MemoryStream())==null);
    foreach(byte[] b in new[]{new byte[]{1,0},new byte[]{0,0,0,0},new byte[]{1,0,1,0},new byte[]{4,0,0,0,1}}) Reject(()=>Program.ReadFrame(new MemoryStream(b)));
    Console.WriteLine("Native policy/framing: "+count+" checks passed.");return 0;
  }
}
