@echo off
rem One-click launcher: builds once, then serves the experience at http://localhost:3000
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .next\BUILD_ID call npm run build
start "" http://localhost:3000
call npm start
