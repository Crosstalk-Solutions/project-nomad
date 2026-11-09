@echo off
title RhinoVault Go - shared on network
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0RhinoVault\bin\Start-RhinoVault.ps1" -Share %*
if errorlevel 1 pause
