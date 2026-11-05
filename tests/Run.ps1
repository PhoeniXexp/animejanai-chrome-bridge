$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Encoding.Tests.ps1')
& (Join-Path $PSScriptRoot '..\native\Build.ps1')
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$hostExe=Join-Path $PSScriptRoot '..\native\AnimeJaNaiBridge.exe'
# Policy tests must resolve the referenced assembly next to themselves.
Copy-Item -LiteralPath $hostExe -Destination (Join-Path $PSScriptRoot 'AnimeJaNaiBridge.exe') -Force
& $compiler /nologo /target:exe "/reference:$hostExe" "/out:$(Join-Path $PSScriptRoot 'PolicyTests.exe')" (Join-Path $PSScriptRoot 'PolicyTests.cs')
if($LASTEXITCODE -ne 0){throw 'Policy test compilation failed'}
& (Join-Path $PSScriptRoot 'PolicyTests.exe')
if($LASTEXITCODE -ne 0){throw 'Policy tests failed'}
& $compiler /nologo /target:winexe /reference:System.Web.Extensions.dll "/out:$(Join-Path $PSScriptRoot 'PlayerProbe.exe')" (Join-Path $PSScriptRoot 'PlayerProbe.cs')
if($LASTEXITCODE -ne 0){throw 'Probe compilation failed'}
node --test (Join-Path $PSScriptRoot 'core.test.mjs') (Join-Path $PSScriptRoot 'generic.test.mjs') (Join-Path $PSScriptRoot 'shadow.test.mjs') (Join-Path $PSScriptRoot 'redirects.test.mjs') (Join-Path $PSScriptRoot 'recovery.test.mjs') (Join-Path $PSScriptRoot 'worker.test.mjs') (Join-Path $PSScriptRoot 'playback.test.mjs') (Join-Path $PSScriptRoot 'protocol.test.mjs')
if($LASTEXITCODE -ne 0){throw 'JS/protocol tests failed'}
