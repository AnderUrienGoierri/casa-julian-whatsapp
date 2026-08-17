# Reglas del Proyecto Casa Julián WhatsApp

## Mensajes de Commit en Git
- Todos los mensajes de commit para nuevas versiones y cambios en el código **DEBEN redactarse íntegramente en español** (ejemplo: `V124: Mensajes de commit en español a partir de ahora`).

## Publicación en Repositorio Remoto (Git Push)
- Tras realizar cualquier commit o modificación de código, **SE DEBE ejecutar siempre `git push origin main`** para mantener GitHub permanentemente sincronizado y actualizado.

## Docker — Sincronización Automática
- El proyecto usa **Docker con bind mount** (`.:/app`), lo que significa que los archivos estáticos (CSS, JS, HTML del admin) se sirven en tiempo real sin necesidad de reiniciar el contenedor.
- **NUNCA usar `docker restart` para aplicar cambios de CSS/HTML/JS** — el bind mount ya los sirve automáticamente.
- **SÍ reiniciar el contenedor** si se modifican archivos del servidor Node.js: `server.js`, `chatbot.js`, `routes.js`, `package.json`, `.env`.
- **El hook `PostToolUse`** (`.agents/hooks.json`) ejecuta automáticamente `.agents/scripts/docker-smart-rebuild.ps1` después de cada modificación de archivo, el cual:
  1. Comprueba si el contenedor tiene bind mount activo
  2. Si no tiene bind mount: lo reconstruye con `docker compose up -d`
  3. Si tiene bind mount y el archivo modificado es del servidor: hace `docker restart`
  4. Si es CSS/HTML/JS: no hace nada (ya se sirve en tiempo real)
- Para levantar el entorno desde cero: `docker compose up -d` (desde la raíz del proyecto)
- Para comprobar que el bind mount está activo: `docker inspect --format "{{json .Mounts}}" casa-julian-whatsapp-bot`

## Verificación Post-Modificación
- Después de cualquier cambio de UI, verificar en `http://localhost:3000/admin/` con **`Ctrl+F5`** (hard refresh) para limpiar caché del navegador.
- El CSS usa query string de versión (`?v=FECHA-VXX`) para cache busting — incrementar al modificar el CSS.
