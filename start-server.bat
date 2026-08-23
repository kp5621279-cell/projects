@echo off
title ZR Web Desktop - Local Server
cd /d "%~dp0"

echo ==============================================
echo   Starting ZR Web Desktop Local Server...
echo ==============================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo Running with Node.js...
    node server.js
    goto end
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo Running with Python...
    python server.py
    goto end
)

echo Neither Node.js nor Python was found.
echo Opening index.html directly in your default browser...
start index.html

:end
pause
