@echo off
setlocal
title AnimeJaNai Chrome Bridge - Register Native Host
echo Registering native host for extension:
echo gjbheefcclbpfflemedindnmdmkbaein
echo.
echo This installs or updates the native host for the current user.
echo It does not install the Chrome extension or change AnimeJaNai settings.
echo Press Enter to use the default ID, or enter another ID.
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0native\Register-Interactive.ps1"
if errorlevel 1 goto failed
echo.
echo Installation completed. Player launch enabled.
echo In Chrome, save your site and use Check connection.
echo Player launch is enabled.
pause
exit /b 0
:failed
echo.
echo Registration failed. Read the error above.
echo Check the error before retrying; installation may be incomplete.
echo Check the player path and extension ID using README.md.
pause
exit /b 1


