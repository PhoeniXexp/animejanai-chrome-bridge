[CmdletBinding()]
param([string]$InstallDir=(Join-Path $env:LOCALAPPDATA 'AnimeJaNaiChromeBridge'),[switch]$RemoveFiles)
$ErrorActionPreference='Stop'
if(-not $PSBoundParameters.ContainsKey('InstallDir')){
  $registration='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.animejanai.chrome_bridge'
  if(Test-Path -LiteralPath $registration){$InstallDir=Split-Path ([string](Get-Item -LiteralPath $registration).GetValue('')) -Parent}
}
$InstallDir=[IO.Path]::GetFullPath($InstallDir).TrimEnd([IO.Path]::DirectorySeparatorChar)
$manifestPath=Join-Path $InstallDir 'host-manifest.json'
$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.animejanai.chrome_bridge'
$knownFiles=@('AnimeJaNaiBridge.exe','config.json','host-manifest.json','last-launch.txt')
$deleteFiles=@()
if($RemoveFiles -and (Test-Path -LiteralPath $InstallDir)){
  $directory=Get-Item -LiteralPath $InstallDir
  if(-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing removal: install directory is not a regular folder.' }
  $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $config=Get-Content -LiteralPath (Join-Path $InstallDir 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if($manifest.name -ne 'com.animejanai.chrome_bridge' -or $manifest.path -ne (Join-Path $InstallDir 'AnimeJaNaiBridge.exe') -or $config.extensionId -cnotmatch '^[a-p]{32}$' -or $manifest.allowed_origins.Count -ne 1 -or $manifest.allowed_origins[0] -ne "chrome-extension://$($config.extensionId)/") { throw 'Refusing removal: host ownership checks failed.' }
  foreach($item in (Get-ChildItem -LiteralPath $InstallDir -Force)){
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Name -notin $knownFiles) { throw 'Refusing removal: unknown files or links exist. Use unregister only and review the folder manually.' }
    $absolute=[IO.Path]::GetFullPath($item.FullName)
    if(-not $absolute.StartsWith($InstallDir+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing removal: path outside the installation.' }
    $deleteFiles+= $absolute
  }
}
if(Test-Path -LiteralPath $key){
  if ((Get-Item -LiteralPath $key).GetValue('') -ne $manifestPath) { throw 'Registry points to another installation. No changes made.' }
  Remove-Item -LiteralPath $key
}
if($RemoveFiles -and (Test-Path -LiteralPath $InstallDir)){
  # Delete only verified files, then the empty folder. Never recurse.
  foreach($file in $deleteFiles){Remove-Item -LiteralPath $file}
  Remove-Item -LiteralPath $InstallDir
  Write-Host 'Native host unregistered and its dedicated files removed.'
}else{
  Write-Host 'Native host unregistered. Installation files retained.'
}
Write-Host 'Remove the Chrome extension separately at chrome://extensions. AnimeJaNai is unchanged.'
