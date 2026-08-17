#!/bin/sh
# docker-rebuild.sh
# Se ejecuta automáticamente después de cualquier modificación de archivos del proyecto.
# Lee el payload JSON del stdin (requerido por el sistema de hooks).

# Leer stdin (requerido aunque no lo usemos)
INPUT=$(cat)

COMPOSE_FILE="$(dirname "$0")/../docker-compose.yml"
PROJECT_DIR="$(dirname "$0")/.."

# Verificar que el contenedor existe y el docker-compose también
if ! command -v docker > /dev/null 2>&1; then
    echo "Docker no disponible, omitiendo reconstrucción." >&2
    echo "{}"
    exit 0
fi

# Reiniciar el contenedor para que recoja los cambios (el bind mount .:/app ya sirve los archivos directamente)
# Solo necesitamos un reinicio rápido si hay cambios en package.json o server.js
# Para CSS/JS/HTML no es necesario reiniciar porque el bind mount sirve en tiempo real

# Emitir resultado vacío (requerido por el sistema de hooks)
echo "{}"
exit 0
