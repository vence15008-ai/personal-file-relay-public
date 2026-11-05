using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using PersonalRelay;
class Test {
 [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint mods,uint key);
 [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
 const uint Mods=7; const int Base=0x7100;
 static bool Probe(uint key) { bool ok=RegisterHotKey(IntPtr.Zero,Base+(int)key,Mods,key); if(ok) UnregisterHotKey(IntPtr.Zero,Base+(int)key); return ok; }
 static void Require(bool b,string m) { if(!b) throw new Exception(m); Console.WriteLine("PASS "+m); }
 [STAThread] static int Main(string[] args) {
  if(args.Length>0) { if(!RegisterHotKey(IntPtr.Zero,77,Mods,(uint)Keys.F20)) {Console.WriteLine("BUSY");return 2;} Console.WriteLine("READY"); Console.Out.Flush(); Console.ReadLine(); UnregisterHotKey(IntPtr.Zero,77); return 0; }
  var build=Environment.GetEnvironmentVariable("RELAY_CLIENT_BUILD") ?? AppDomain.CurrentDomain.BaseDirectory;
  AppDomain.CurrentDomain.AssemblyResolve += (s,e) => { var p=Path.Combine(build,new AssemblyName(e.Name).Name+".dll"); return File.Exists(p)?Assembly.LoadFrom(p):null; };
  Process child=null; RelayWindow window=null;
  try {
   foreach(uint k in new uint[]{(uint)Keys.F17,(uint)Keys.F18,(uint)Keys.F19,(uint)Keys.F20,(uint)Keys.F21,(uint)Keys.F22}) Require(Probe(k),"initially available "+(Keys)k);
   child=Process.Start(new ProcessStartInfo(Application.ExecutablePath,"hold") { UseShellExecute=false, RedirectStandardInput=true, RedirectStandardOutput=true, CreateNoWindow=true });
   Require(child.StandardOutput.ReadLine()=="READY","external process holds F20");
   var old=new ClientConfig {ServerUrl="http://127.0.0.1:18475", ShowHotkey="Ctrl+Alt+Shift+F17", PasteHotkey="Ctrl+Alt+Shift+F18", UploadHotkey="Ctrl+Alt+Shift+F19"};
   window=new RelayWindow(old,true,Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"test-profile")); var handle=window.Handle;
   var apply=typeof(RelayWindow).GetMethod("ApplyHotkeys",BindingFlags.Instance|BindingFlags.NonPublic);
   apply.Invoke(window,new object[]{old});
   foreach(uint k in new uint[]{(uint)Keys.F17,(uint)Keys.F18,(uint)Keys.F19}) Require(!Probe(k),"initial binding registered "+(Keys)k);
   var candidate=new ClientConfig {ServerUrl=old.ServerUrl, ShowHotkey="Ctrl+Alt+Shift+F21", PasteHotkey="Ctrl+Alt+Shift+F22", UploadHotkey="Ctrl+Alt+Shift+F20"};
   bool rejected=false; try {apply.Invoke(window,new object[]{candidate});} catch(TargetInvocationException e) {rejected=e.InnerException is ArgumentException; Console.WriteLine("actual error: "+e.InnerException.Message);}
   Require(rejected,"external occupation rejected");
   foreach(uint k in new uint[]{(uint)Keys.F17,(uint)Keys.F18,(uint)Keys.F19}) Require(!Probe(k),"old binding restored "+(Keys)k);
   Require(Probe((uint)Keys.F21)&&Probe((uint)Keys.F22),"partial candidate registrations released");
   window.Dispose(); window=null;
   foreach(uint k in new uint[]{(uint)Keys.F17,(uint)Keys.F18,(uint)Keys.F19}) Require(Probe(k),"old binding released on dispose "+(Keys)k);
   child.StandardInput.WriteLine(); child.WaitForExit(); Require(child.ExitCode==0 && Probe((uint)Keys.F20),"external binding released"); child.Dispose(); child=null; return 0;
  } catch(Exception e) {Console.WriteLine("FAIL "+e); return 1;} finally { if(window!=null) window.Dispose(); if(child!=null) {try {child.StandardInput.WriteLine(); if(!child.WaitForExit(3000)) child.Kill();} catch {} child.Dispose();} }
 }
}
