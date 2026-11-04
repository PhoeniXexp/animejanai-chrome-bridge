$ErrorActionPreference='Stop'
# Exercise the real scripts with a fake registration; never touch HKCU.
$native=Join-Path $PSScriptRoot '..\native'
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('bridge-encoding-'+[guid]::NewGuid().ToString('N'))
$unicode=-join ([char[]](0x041C,0x0438,0x0445,0x0430,0x0438,0x043B))
$install=Join-Path $fixture "$unicode\Native Host"
$player=Join-Path $fixture "$unicode\Player\mpvnet.exe"
$manifestFile=Join-Path $install 'host-manifest.json'
$configFile=Join-Path $install 'config.json'
$exe=Join-Path $install 'AnimeJaNaiBridge.exe'
$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.animejanai.chrome_bridge'
$extensionId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$utf8=New-Object Text.UTF8Encoding($false)
$registrationState=@{removed=$false}
function Test-Path {
  param([string]$LiteralPath,[string]$PathType)
  if($LiteralPath -eq $key){return $true}
  if($PathType){return Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath -PathType $PathType}
  Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath
}
function Get-Item {
  param([string]$LiteralPath)
  if($LiteralPath -eq $key){
    $registration=New-Object PSObject
    $registration | Add-Member ScriptMethod GetValue {param($name) $manifestFile}
    return $registration
  }
  Microsoft.PowerShell.Management\Get-Item -LiteralPath $LiteralPath
}
function Remove-Item {
  param([string]$LiteralPath)
  if($LiteralPath -eq $key){$registrationState.removed=$true;return}
  Microsoft.PowerShell.Management\Remove-Item -LiteralPath $LiteralPath
}
function Assert-Equal($actual,$expected,$label){if($actual -cne $expected){throw "${label}: values differ"}}
try {
  New-Item -ItemType Directory -Path $install,(Split-Path $player -Parent) | Out-Null
  [IO.File]::WriteAllText($player,'test player')
  # The source binary is copied, never executed by these tests.
  $manifest=@{name='com.animejanai.chrome_bridge';path=$exe;type='stdio';allowed_origins=@("chrome-extension://$extensionId/")}
  [IO.File]::WriteAllText($manifestFile,($manifest|ConvertTo-Json),$utf8)
  & (Join-Path $native 'Install-AnimeGo.ps1') -ExtensionId $extensionId -PlayerPath $player -DryRun
  $cfg=[IO.File]::ReadAllText($configFile)|ConvertFrom-Json
  Assert-Equal $cfg.playerPath $player 'Update preserves Unicode player path'
  Assert-Equal $cfg.enableLaunch $false 'DryRun disables launch'
  & (Join-Path $native 'Set-Launch.ps1') -Enabled $true -InstallDir $install
  $cfg=[IO.File]::ReadAllText($configFile)|ConvertFrom-Json
  Assert-Equal $cfg.playerPath $player 'Set-Launch preserves Unicode player path'
  Assert-Equal $cfg.enableLaunch $true 'Launch enabled'
  $updated=[IO.File]::ReadAllText($manifestFile)|ConvertFrom-Json
  Assert-Equal $updated.path $exe 'Update preserves Unicode host path'
  # A genuinely different layout must still be rejected without overwriting it.
  $updated.path=$player
  [IO.File]::WriteAllText($manifestFile,($updated|ConvertTo-Json),$utf8)
  $rejected=$false
  try { & (Join-Path $native 'Install-AnimeGo.ps1') -ExtensionId $extensionId -PlayerPath $player }
  catch {if($_.Exception.Message -ne 'Registration belongs to another layout. No changes made.'){throw};$rejected=$true}
  Assert-Equal $rejected $true 'Foreign layout rejected'
  $updated.path=$exe
  [IO.File]::WriteAllText($manifestFile,($updated|ConvertTo-Json),$utf8)
  & (Join-Path $native 'Uninstall.ps1') -InstallDir $install -RemoveFiles
  Assert-Equal $registrationState.removed $true 'Fake registration removed'
  Assert-Equal (Microsoft.PowerShell.Management\Test-Path -LiteralPath $install) $false 'Verified files removed'
  Write-Host 'Encoding tests passed (Unicode paths, update, launch toggle, uninstall, foreign layout).'
} finally {
  # Only known fixture files and empty folders, with no recursive deletion.
  foreach($file in @($manifestFile,$configFile,$exe,$player)){
    if([IO.File]::Exists($file)){[IO.File]::Delete($file)}
  }
  foreach($dir in @($install,(Split-Path $player -Parent),(Join-Path $fixture $unicode),$fixture)){
    if([IO.Directory]::Exists($dir)){[IO.Directory]::Delete($dir)}
  }
}
