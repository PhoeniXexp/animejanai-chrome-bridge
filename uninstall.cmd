@echo off
setlocal
title AnimeJaNai Chrome Bridge - Remove Native Host
echo Unregistering and removing the dedicated native host for the current user.
echo AnimeJaNai, mpv, the project folder and Chrome extension will be retained.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0native\Uninstall.ps1" -RemoveFiles
if errorlevel 1 goto failed
echo.
echo Native host removed. Remove the Chrome extension at chrome://extensions.
pause
exit /b 0
:failed
echo.
echo Removal failed. Read the error above.
echo Unknown files, links or another registration prevent automatic removal.
echo Review unexpected files in the dedicated host folder manually.
pause
exit /b 1

