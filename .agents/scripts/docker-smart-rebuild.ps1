# docker-smart-rebuild.ps1
# Hook PostToolUse: ejecutado automaticamente despues de write_to_file, replace_file_content, multi_replace_file_content.
# Detecta el tipo de archivo modificado y decide si reiniciar el contenedor o no.
# El bind mount .:/app ya sirve CSS/HTML/JS estatico en tiempo real sin necesidad de reinicio.

# Leer payload JSON del stdin (requerido por el sistema de hooks)
$inputJson = $null
try {
    $inputJson = $input | ConvertFrom-Json -ErrorAction SilentlyContinue
} catch {}

# Directorio del proyecto (dos niveles arriba de .agents/scripts/)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent (Split-Path -Parent $scriptDir)

# Verificar que docker esta disponible
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Output "{}"
    exit 0
}

# Comprobar si el contenedor esta corriendo
$containerRunning = docker inspect --format "{{.State.Running}}" casa-julian-whatsapp-bot 2>$null
if ($containerRunning -ne "true") {
    # Contenedor no activo: levantarlo con docker compose (con volumen bind mount)
    Push-Location $projectDir
    docker compose up -d 2>$null
    Pop-Location
    Write-Output "{}"
    exit 0
}

# Verificar si tiene bind mount activo (.:/app)
$mounts = docker inspect --format "{{range .Mounts}}{{.Type}}:{{.Source}}{{end}}" casa-julian-whatsapp-bot 2>$null
$hasBind = $mounts -match "bind"

if (-not $hasBind) {
    # El contenedor NO tiene bind mount: necesita reconstruirse con docker compose
    Write-Host "[HOOK] Contenedor sin bind mount. Reconstruyendo con docker compose..." -ForegroundColor Yellow
    Push-Location $projectDir
    docker rm -f casa-julian-whatsapp-bot 2>$null
    docker compose up -d 2>$null
    Pop-Location
    Write-Host "[HOOK] Contenedor reconstruido con bind mount activo." -ForegroundColor Green
} else {
    # El contenedor tiene bind mount: los archivos estaticos (CSS/JS/HTML) se sirven en tiempo real.
    # Detectar si se modifico un archivo del servidor Node.js que requiere reinicio
    $targetFile = ""
    try {
        if ($inputJson -and $inputJson.toolCall -and $inputJson.toolCall.args) {
            $targetFile = $inputJson.toolCall.args.TargetFile
        }
    } catch {}

    # Archivos del servidor que requieren reinicio del proceso Node.js
    $serverFiles = @("server.js", "server.cjs", "app.js", "package.json", "package-lock.json", ".env", "chatbot.js", "routes.js")
    $needsRestart = $false
    foreach ($sf in $serverFiles) {
        if ($targetFile -and $targetFile.EndsWith($sf)) {
            $needsRestart = $true
            break
        }
    }

    if ($needsRestart) {
        Write-Host "[HOOK] Archivo del servidor modificado ($targetFile). Reiniciando contenedor..." -ForegroundColor Yellow
        docker restart casa-julian-whatsapp-bot 2>$null
        Write-Host "[HOOK] Contenedor reiniciado." -ForegroundColor Green
    }
    # Si es CSS/JS/HTML del front: NO hace falta reiniciar, el bind mount sirve en tiempo real.
}

# Salida requerida por el sistema de hooks
Write-Output "{}"
exit 0
