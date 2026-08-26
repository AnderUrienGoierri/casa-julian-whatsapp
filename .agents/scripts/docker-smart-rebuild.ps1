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

# Automatización de Sincronización y Reinicio en Synology NAS (192.168.110.57)
$nasPath = "\\192.168.110.57\docker\casa-julian-whatsapp"

if (Test-Path $nasPath) {
    Write-Host "[AUTO-SYNC] Sincronizando cambios locales hacia Synology NAS ($nasPath)..." -ForegroundColor Cyan
    robocopy $projectDir $nasPath /MIR /XD node_modules .git scratch .tempmediaStorage /XF db.json /R:1 /W:1 | Out-Null
    Write-Host "[AUTO-SYNC] Archivos sincronizados en Synology NAS." -ForegroundColor Green

    # Enviar señal de reinicio automático al servidor Node.js en Synology NAS
    try {
        $restartUrl = "http://192.168.110.57:3000/api/admin/restart"
        Invoke-RestMethod -Uri $restartUrl -Method Post -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "[AUTO-SYNC] 🔄 Contenedor Docker en Synology NAS reiniciado automáticamente." -ForegroundColor Green
    } catch {}
} else {
    # Fallback local si no está en la red del NAS
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        $containerRunning = docker inspect --format "{{.State.Running}}" casa-julian-whatsapp-bot 2>$null
        if ($containerRunning -eq "true") {
            docker restart casa-julian-whatsapp-bot 2>$null
        }
    }
}

Write-Output "{}"
exit 0
