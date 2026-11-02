$ErrorActionPreference='Stop'
$defaultId='gjbheefcclbpfflemedindnmdmkbaein'
Write-Host "Default extension ID: $defaultId"
$entered=(Read-Host 'Extension ID (Enter = default)').Trim()
if($entered -eq ''){$entered=$defaultId}
if($entered -cnotmatch '^[a-p]{32}$'){throw 'Invalid ID: expected 32 lowercase letters a-p.'}
$player=Join-Path $env:LOCALAPPDATA 'Programs\mpv-AnimeJaNai\mpvnet.exe'
Write-Host "Default player: $player"
$playerEntered=(Read-Host 'Path to mpvnet.exe (Enter = default)').Trim().Trim('"')
if($playerEntered){$player=$playerEntered}
& (Join-Path $PSScriptRoot 'Install-AnimeGo.ps1') -ExtensionId $entered -PlayerPath $player
Write-Host 'Installed/updated. Player launch is enabled.'
