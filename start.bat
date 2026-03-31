@echo off
cd /d %~dp0
mode con: cols=120 lines=50
wsl -e bash /mnt/d/Dev/clsh/start.sh
pause
