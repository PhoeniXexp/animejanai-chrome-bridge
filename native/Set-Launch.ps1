[CmdletBinding()]
param([Parameter(Mandatory)][bool]$Enabled,[string]$InstallDir=(Join-Path $env:LOCALAPPDATA 'AnimeJaNaiChromeBridge'))
$ErrorActionPreference='Stop'
if(-not $PSBoundParameters.ContainsKey('InstallDir')){
  $registration='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.animejanai.chrome_bridge'
  if(Test-Path -LiteralPath $registration){$InstallDir=Split-Path ([string](Get-Item -LiteralPath $registration).GetValue('')) -Parent}
}
$file=Join-Path $InstallDir 'config.json'
$cfg=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
$cfg.enableLaunch=$Enabled
$utf8=New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($file,($cfg | ConvertTo-Json -Depth 5),$utf8)
Write-Host "Player launch enabled: $Enabled"
