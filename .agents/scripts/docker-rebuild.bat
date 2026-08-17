@echo off
REM docker-rebuild.bat
REM Ejecutado automaticamente por el hook PostToolUse despues de modificar archivos.
REM Lee stdin (JSON) y escribe {} en stdout (requerido por el sistema de hooks).

REM Leer stdin
for /f "delims=" %%i in ('more') do (
    set "INPUT=%%i"
)

REM Directorio del proyecto (2 niveles arriba desde .agents\scripts\)
set "PROJECT_DIR=%~dp0..\.."

REM Verificar docker disponible
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo {}
    exit /b 0
)

REM Verificar si el contenedor esta corriendo
docker inspect --format "{{.State.Running}}" casa-julian-whatsapp-bot >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    REM El contenedor no existe, levantarlo con docker compose
    cd /d "%PROJECT_DIR%"
    docker compose up -d >nul 2>&1
    echo {}
    exit /b 0
)

REM El contenedor esta corriendo con bind mount, los archivos se sirven en tiempo real.
REM Solo necesitamos reiniciar si cambiaron archivos del servidor (server.js, package.json, etc.)
REM Para CSS/JS/HTML del front no hace falta reiniciar.

REM Salida vacia requerida por el hook system
echo {}
exit /b 0
