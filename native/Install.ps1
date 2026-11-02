[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$PlayerPath = (Join-Path $env:LOCALAPPDATA 'Programs\mpv-AnimeJaNai\mpvnet.exe'),
  [Parameter(Mandatory)][string[]]$SiteHosts,
  [Parameter(Mandatory)][string[]]$KodikHosts,
  [Parameter(Mandatory)][string[]]$StreamHosts,
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AnimeJaNaiChromeBridge')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PlayerPath -PathType Leaf) -or [IO.Path]::GetExtension($PlayerPath) -ne '.exe') { throw 'Player executable not found.' }
$PlayerPath = (Resolve-Path -LiteralPath $PlayerPath).Path
foreach ($list in @($SiteHosts,$KodikHosts,$StreamHosts)) {
  if ($list.Count -lt 1 -or $list.Count -gt 10) { throw 'Use 1-10 exact domains per group.' }
  foreach ($domain in $list) {
    if ($domain -cnotmatch '^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' -or $domain -match '\.(local|localhost|internal|test|invalid)$') { throw 'Invalid domain: use lowercase exact public DNS names.' }
  }
}
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if (Test-Path -LiteralPath $InstallDir) { throw 'Install directory already exists. Refusing to overwrite it.' }
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.animejanai.chrome_bridge'
if (Test-Path -LiteralPath $key) { throw 'Native host registry key already exists. Refusing to overwrite it.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'AnimeJaNaiBridge.exe'))) { & (Join-Path $PSScriptRoot 'Build.ps1') }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$created = $false
try {
  New-Item -ItemType Directory -Path $InstallDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AnimeJaNaiBridge.exe') -Destination $InstallDir
  . (Join-Path $PSScriptRoot 'Physical-Path.ps1')
  $physicalExe=Get-BridgePhysicalPath (Join-Path $InstallDir 'AnimeJaNaiBridge.exe')
  $InstallDir=Split-Path $physicalExe -Parent
  $config = @{extensionId=$ExtensionId;playerPath=$PlayerPath;dynamicStreams=$true;enableLaunch=$false}
  [IO.File]::WriteAllText((Join-Path $InstallDir 'config.json'),($config | ConvertTo-Json -Depth 5),$utf8)
  $manifestPath = Join-Path $InstallDir 'host-manifest.json'
  $manifest = @{name='com.animejanai.chrome_bridge';description='AnimeJaNai manual HLS bridge';path=(Join-Path $InstallDir 'AnimeJaNaiBridge.exe');type='stdio';allowed_origins=@("chrome-extension://$ExtensionId/")}
  [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 4),$utf8)
  New-Item -Path $key -Force | Out-Null
  $created = $true
  Set-Item -LiteralPath $key -Value $manifestPath
  Write-Host "Installed in DryRun mode: $InstallDir"
} catch {
  # No recursive deletion, including on partial failure. Remove only our new registry entry.
  if ($created) { Remove-Item -LiteralPath $key }
  throw
}
