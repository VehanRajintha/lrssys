@echo off
title LRSYS - Sri Lanka Customs (CusDec) Next.js Terminal
cd /d "%~dp0"

echo =======================================================
echo    LRSYS - SRI LANKA CUSTOMS (CUSDEC) NEXT.JS TERMINAL
echo =======================================================
echo.

set PORT=5000
set NODE_EXE=%~dp0runtime\node-v20.18.0-win-x64\node.exe

if not exist "%NODE_EXE%" (
    where node >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set NODE_EXE=node
    ) else (
        echo [ERROR] Node.js runtime not found.
        pause
        exit /b 1
    )
)

echo Starting LRSYS Next.js Server on port %PORT%...
echo Opening browser...
start http://localhost:%PORT%

"%NODE_EXE%" node_modules\next\dist\bin\next start -p %PORT%

pause
