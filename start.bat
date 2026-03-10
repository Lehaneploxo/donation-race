@echo off
title Гонка Донатов — TikTok Live Game
color 0A
cd /d "%~dp0"

echo.
echo  ===================================
echo     *** ГОНКА ДОНАТОВ ***
echo  ===================================
echo.

:: Установка зависимостей если нужно
if not exist node_modules (
    echo  Установка зависимостей, подождите...
    call npm install
    echo.
)

:: Убиваем старые процессы на порту 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /F /PID %%a 2>nul

:: Запускаем сервер в фоне (демо-режим, ник выбирается в браузере)
start "Гонка Донатов — сервер" /min cmd /c "node server/server.js && pause"

:: Ждем запуска
echo  Запускаю сервер...
timeout /t 2 /nobreak >nul

:: Открываем браузер на стартовую страницу
start "" "http://localhost:3000"

echo  Готово! Введи ник в браузере.
echo  Это окно можно свернуть.
echo  Закрой окно сервера чтобы остановить.
echo.
pause
