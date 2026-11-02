[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$PlayerPath = (Join-Path $env:LOCALAPPDATA 'Programs\mpv-AnimeJaNai\mpvnet.exe'),
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
if(-not (Test-Path -LiteralPath $PlayerPath -PathType Leaf) -or [IO.Path]::GetExtension($PlayerPath) -ne '.exe'){throw 'Player exe not found. Specify the path to mpvnet.exe.'}
$PlayerPath=(Resolve-Path -LiteralPath $PlayerPath).Path
$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.animejanai.chrome_bridge'
if(Test-Path -LiteralPath $key){
  $manifestFile=[string](Get-Item -LiteralPath $key).GetValue('')
  $dir=Split-Path $manifestFile -Parent
  $manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
  $exe=Join-Path $dir 'AnimeJaNaiBridge.exe'
  if($manifest.name -ne 'com.animejanai.chrome_bridge' -or $manifest.path -ne $exe){throw 'Registration belongs to another layout. No changes made.'}
  $built=Join-Path $PSScriptRoot 'AnimeJaNaiBridge.exe'
  if(-not (Test-Path -LiteralPath $built)){& (Join-Path $PSScriptRoot 'Build.ps1')}
  Copy-Item -LiteralPath $built -Destination $exe -Force
  $cfg=@{extensionId=$ExtensionId;playerPath=$PlayerPath;dynamicStreams=$true;enableLaunch=(-not $DryRun)}
  $manifest.allowed_origins=@("chrome-extension://$ExtensionId/")
  $utf8=New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText((Join-Path $dir 'config.json'),($cfg|ConvertTo-Json -Depth 5),$utf8)
  [IO.File]::WriteAllText($manifestFile,($manifest|ConvertTo-Json -Depth 5),$utf8)
  Write-Host 'Native host updated. No CDN configuration required.'
  return
}
& (Join-Path $PSScriptRoot 'Install.ps1') -ExtensionId $ExtensionId -PlayerPath $PlayerPath `
  -SiteHosts @('animego.online') -KodikHosts @('kodikplayer.com') -StreamHosts @('raven.cloud2.solodcdn.com')
& (Join-Path $PSScriptRoot 'Set-Launch.ps1') -Enabled (-not $DryRun)
