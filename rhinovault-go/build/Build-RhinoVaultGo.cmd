@echo off
title RhinoVault Go builder
rem Usage: Build-RhinoVaultGo.cmd -Drive E: -Edition standard   (add -DryRun to preview)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-RhinoVaultGo.ps1" %*
pause
