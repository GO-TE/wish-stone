@echo off
chcp 65001 >nul
title Wish Stone Quick Start

echo ==========================================================
echo   🪨 Wish Stone (위시 스톤) 원클릭 Quick Start 시작
echo ==========================================================
echo.

echo [1/2] Spring Boot MSA 5개 마이크로서비스 백그라운드 기동 중...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-backend.ps1"

echo.
echo [2/2] Expo 웹 프론트엔드 개발 서버를 브라우저로 엽니다...
echo (종료하려면 이 창에서 Ctrl+C 를 누르세요)
echo.

npx expo start --web --port 8085
