# Guía de Migración e Importación de Chats Históricos

## De WhatsApp Business App (+34 943 67 14 17) a Meta Cloud API & Panel Web CMS

**Proyecto:** Casa Julián de Tolosa — WhatsApp Bot & Panel de Administración Web
**Fecha de Documentación:** 26 de Agosto de 2026
**Estado:** Guía de Procedimiento para la Puesta en Marcha Oficial

---

## 📌 1. Resumen Ejecutivo

Cuando se realiza la transición desde la aplicación móvil **WhatsApp Business** (en el teléfono del restaurante) hacia la **Meta WhatsApp Cloud API** utilizando el número oficial (**+34 943 67 14 17**), Meta activa la entrega en tiempo real de todos los mensajes futuros mediante Webhooks HTTP hacia el servidor Node.js.

Sin embargo, Meta **no migra automáticamente los chats pasados** que residen en la memoria o copia de seguridad local del dispositivo móvil.

Para evitar la pérdida de contexto y conservar el historial de interacciones con los clientes de los últimos 6 meses, este documento detalla el procedimiento técnico para **exportar las conversaciones del teléfono e importarlas masivamente en la base de datos de la aplicación web (`db.json` / `chats.json`)**, haciendo que aparezcan inmediatamente en:

1. La pestaña **💬 Chats WhatsApp**.
2. El modal **📜 Historial Completo del Cliente**.
3. La tarjeta del **📥 Buzón de Recepción**.

---

## ⚙️ 2. Arquitectura de la Solución de Migración

```
┌────────────────────────────────────────┐
│  WhatsApp Business App (Móvil Físico)  │
│  Número Oficial: +34 943 67 14 17      │
└───────────────────┬────────────────────┘
                    │ 1. Exportación manual / Copia .txt
                    ▼
┌────────────────────────────────────────┐
│  Archivos de Exportación (.txt / zip)  │
│  Contiene: Chats de los últimos 6 meses│
└───────────────────┬────────────────────┘
                    │ 2. Ejecución del Script Node.js
                    ▼
┌────────────────────────────────────────┐
│  Script: scripts/importar-historico.js │
│  Parser de Texto, Fechas y Teléfonos   │
└───────────────────┬────────────────────┘
                    │ 3. Estructuración e Inserción
                    ▼
┌────────────────────────────────────────┐
│  Base de Datos del Bot (db.json / DB)  │
│  - chats: Hilos de conversación        │
│  - solicitudes: Peticiones detectadas  │
└───────────────────┬────────────────────┘
                    │ 4. Visualización Inmediata
                    ▼
┌────────────────────────────────────────┐
│  Panel Web CMS Casa Julián (Admin UI)  │
│  - 💬 Chats WhatsApp                   │
│  - 📜 Historial Interactivo por Cliente│
└────────────────────────────────────────┘
```

---

## 📱 3. Paso 1: Exportación de Conversaciones desde el Móvil

### Opción A: Exportar Chats Individuales desde WhatsApp Business (Recomendada para clientes clave)

1. Abrir la app **WhatsApp Business** en el teléfono.
2. Entrar en el chat del cliente.
3. Pulsar en el menú de los 3 puntos (arriba a la derecha) $\rightarrow$ **Más** $\rightarrow$ **Exportar chat**.
4. Seleccionar **"Sin archivos multimedia"** (para obtener un archivo `.txt` ligero con todo el historial de texto).
5. Guardar o enviar el archivo `.txt` (ejemplo: `Chat de WhatsApp con +34664037707.txt`).

### Opción B: Copia de Seguridad Completa de la Base de Datos Local (Android)

1. En Android, la base de datos local de WhatsApp se almacena en `/sdcard/WhatsApp/Databases/msgstore.db.crypt14` (o `.crypt15`).
2. Utilizando herramientas abiertas como *WhatsApp Backup Decrypter* o extractores de texto en lote, se genera un archivo JSON unificado con todas las conversaciones pasadas de los últimos 6 meses.

---

## 🛠️ 4. Paso 2: Script de Importación Automatizado en Node.js

Se creará un script dedicado en el servidor (`scripts/importar-historico-whatsapp.js`) que procesará los archivos exportados.

### Formato Típico de Exportación de WhatsApp (.txt):

```text
26/02/26, 14:15 - Los mensajes y las llamadas están cifrados al extremo.
26/02/26, 14:16 - +34 664 03 77 07: Hola, me gustaría reservar mesa para 4 personas este viernes a las 14:30.
26/02/26, 14:18 - Casa Julián Tolosa: Hola! Con mucho gusto le tomamos la reserva para 4 comensales. ¿A nombre de quién la ponemos?
26/02/26, 14:20 - +34 664 03 77 07: A nombre de Ander Urien. Gracias.
```

### Estructura del Script de Node.js (`scripts/importar-historico-whatsapp.js`):

```javascript
const fs = require('fs');
const path = require('path');
const db = require('../database'); // Conector a db.json / Postgres

async function importarChatArchivo(filePath, telefonoCliente, nombreCliente) {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const lineas = rawContent.split('\n');
  
    const regexMensaje = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/;
    const mensajesEstructurados = [];

    for (const linea of lineas) {
        const match = linea.match(regexMensaje);
        if (match) {
            const [_, fechaStr, horaStr, emisorRaw, texto] = match;
          
            // Determinar emisor
            const esCliente = emisorRaw.includes(telefonoCliente) || !emisorRaw.toLowerCase().includes('julian');
          
            // Construir fecha ISO
            const partesFecha = fechaStr.split('/');
            const isoDate = new Date(`20${partesFecha[2]}-${partesFecha[1].padStart(2,'0')}-${partesFecha[0].padStart(2,'0')}T${horaStr}:00`).toISOString();

            mensajesEstructurados.push({
                id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                emisor: esCliente ? 'cliente' : 'bot',
                nombreEmisor: esCliente ? (nombreCliente || 'Cliente') : 'Recepción Casa Julián',
                texto: texto.trim(),
                created_at: isoDate,
                origen: 'IMPORTADO_HISTORICO'
            });
        }
    }

    // Guardar en la base de datos bajo el teléfono del cliente
    await db.guardarChatHistorico(telefonoCliente, nombreCliente, mensajesEstructurados);
    console.log(`✅ Importados ${mensajesEstructurados.length} mensajes para +${telefonoCliente}`);
}
```

---

## 📊 5. Estructura de Datos resultante en el Panel (`chats.json` / `db.json`)

Una vez ejecutado el proceso de importación, el registro en la base de datos del proyecto contendrá la historia unificada:

```json
{
  "telefono": "34664037707",
  "nombreCliente": "Ander Urien",
  "ultimoTexto": "A nombre de Ander Urien. Gracias.",
  "ultimoEmisor": "cliente",
  "ultimoMensajeFecha": "2026-02-26T14:20:00.000Z",
  "origen": "HISTORICO_MIGRADO",
  "mensajes": [
    {
      "id": "hist_001",
      "emisor": "cliente",
      "texto": "Hola, me gustaría reservar mesa para 4 personas este viernes a las 14:30.",
      "created_at": "2026-02-26T14:16:00.000Z"
    },
    {
      "id": "hist_002",
      "emisor": "bot",
      "texto": "Hola! Con mucho gusto le tomamos la reserva para 4 comensales. ¿A nombre de quién la ponemos?",
      "created_at": "2026-02-26T14:18:00.000Z"
    },
    {
      "id": "hist_003",
      "emisor": "cliente",
      "texto": "A nombre de Ander Urien. Gracias.",
      "created_at": "2026-02-26T14:20:00.000Z"
    }
  ]
}
```

---

## 🎯 6. Ventajas de esta Migración

1. **Cero Pérdida de Información:** No se pierde la memoria de los últimos 6 meses de conversaciones con clientes habituales.
2. **Contexto Inmediato para la Recepción:** Cuando un cliente antiguo escriba de nuevo (ya a través del número oficial con la Cloud API), el personal de recepción podrá abrir su historial y ver instantáneamente qué reservó o qué consultó en el pasado.
3. **Continuidad Transparente:** La transición desde el teléfono móvil al sistema web automatizado es totalmente imperceptible para el cliente.

---

## 📝 7. Checklist de Ejecución

- [x] Realizar la copia de seguridad / exportación masiva de chats en WhatsApp Business (+34 943 67 14 17) -> 952 chats exportados en `copia_chats_whatsapp_business/`.
- [x] Ejecutar script de procesamiento e inserción masiva (`scripts/importar-historico-whatsapp.py`).
- [x] Sincronizar historial con PostgreSQL (`scripts/sync-historico-postgres.js`).
- [x] Habilitar la pestaña **💬 Chats WhatsApp** con filtros por categoría (Clientes, Proveedores, Alba, Hoteles, Taxis) y buscador en tiempo real en el Panel Web CMS.
- [ ] Vincular el número oficial **+34 943 67 14 17** en el panel de Meta Developer (WhatsApp Cloud API) cuando comience la atención en producción.
- [ ] Entrar en `https://casa-julian-whatsapp-bot.onrender.com/admin/` y verificar en **💬 Chats WhatsApp** que los historiales pasados se visualizan correctamente.
