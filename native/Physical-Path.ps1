function Get-BridgePhysicalPath([string]$FilePath) {
  if(-not ('BridgePhysicalPath' -as [type])){
    Add-Type -TypeDefinition 'using System;using System.Text;using System.Runtime.InteropServices; public class BridgePhysicalPath { [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint GetFinalPathNameByHandle(IntPtr h,StringBuilder s,uint n,uint flags); }'
  }
  $stream=[IO.File]::OpenRead($FilePath)
  try{
    $buffer=New-Object Text.StringBuilder 32768
    $length=[BridgePhysicalPath]::GetFinalPathNameByHandle($stream.SafeFileHandle.DangerousGetHandle(),$buffer,32768,0)
    if($length -eq 0 -or $length -ge 32768){throw 'Cannot resolve physical host path.'}
    $result=$buffer.ToString()
    if($result.StartsWith('\\?\UNC\')){return '\\'+$result.Substring(8)}
    if($result.StartsWith('\\?\')){return $result.Substring(4)}
    return $result
  }finally{$stream.Dispose()}
}
