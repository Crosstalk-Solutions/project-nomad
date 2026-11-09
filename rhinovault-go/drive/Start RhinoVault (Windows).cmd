@echo off
title RhinoVault Go
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0RhinoVault\bin\Start-RhinoVault.ps1" %*
if errorlevel 1 pause
