[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework 4.x C# compiler not found.' }
$target = Join-Path $PSScriptRoot 'AnimeJaNaiBridge.exe'
& $compiler /nologo /target:winexe /optimize+ /reference:System.Web.Extensions.dll "/out:$target" (Join-Path $PSScriptRoot 'Host.cs') (Join-Path $PSScriptRoot 'PlaybackMonitor.cs')
if ($LASTEXITCODE -ne 0) { throw 'Host compilation failed.' }
Write-Host 'Native host built. No registry or player settings changed.'
