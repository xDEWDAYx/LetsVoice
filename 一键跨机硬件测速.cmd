@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\benchmark\run-cross-machine-benchmark.ps1" %*
set "BENCH_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%BENCH_EXIT_CODE%"=="0" echo 测速脚本未成功完成，请查看上面的红色错误信息。
if "%~1"=="" pause

exit /b %BENCH_EXIT_CODE%
