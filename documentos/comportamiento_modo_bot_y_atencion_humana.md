# Comportamiento del Modo Bot y Atención Humana

**Proyecto:** Asador Casa Julián de Tolosa — WhatsApp Bot & Panel CMS  
**Versión:** V200 — Regla definitiva de handover a agente humano  
**Fecha:** 14 de Agosto de 2026  

---

## 1. Principio de Operación (Regla Definitiva)

> **El chatbot siempre está activo por defecto. Solo Recepción puede pausarlo manualmente.**

El bot **NUNCA** se silencia de forma automática por acciones del cliente (ni al enviar solicitudes, ni al escribir texto, ni al pulsar botones). La única forma de pausarlo es que un miembro del equipo de recepción actúe desde el Panel Web.

---

## 2. Tabla de Comportamiento Detallado

| Situación | ¿Quién actúa? | Comportamiento del Bot | Estado `en_atencion_humana` |
|---|---|---|---|
| Cliente envía una solicitud (tarjeta regalo, reserva, cancelación, modificación...) | Cliente | ✅ **Bot ACTIVO** — el cliente puede seguir navegando libremente | `false` |
| Cliente pulsa cualquier botón de menú del chatbot | Cliente | ✅ **Bot RESPONDE** — si había modo humano activo, se desactiva y el bot retoma el control | `false` (forzado) |
| Cliente selecciona una opción de lista desplegable | Cliente | ✅ **Bot RESPONDE** — igual que los botones | `false` (forzado) |
| Cliente escribe texto libre por teclado, sin modo humano activo | Cliente | ✅ **Bot RESPONDE** — el bot gestiona el texto con normalidad | `false` |
| Cliente escribe texto libre por teclado, **con modo humano activo** | Cliente | ⏸️ **Bot en silencio** — el mensaje se guarda en el hilo de Recepción del Panel Web | `true` (ya activado por Recepción) |
| Recepción pulsa **`👤 Activar Atención Humana`** en el panel | Recepción | 🔴 **Bot PAUSADO** — conversación privada entre Recepción y el cliente | `true` |
| Recepción escribe un mensaje y pulsa **`📲 ENVIAR WHATSAPP`** | Recepción | 🔴 **Bot PAUSADO** — el envío activa automáticamente la atención humana | `true` |
| Recepción pulsa **`✅ Concluir Gestión & Reactivar Bot`** | Recepción | ✅ **Bot REACTIVADO** — el cliente vuelve al flujo normal del chatbot | `false` |

---

## 3. Flujo Completo de una Solicitud

```
1. Cliente navega el chatbot → Bot responde ✅
2. Cliente rellena formulario y envía solicitud (confirm_yes) → Bot responde con confirmación ✅
3. Solicitud llega al Panel de Recepción como PENDIENTE (Bot sigue activo)
4. Cliente puede hacer más consultas/solicitudes → Bot sigue respondiendo ✅
5. Recepción revisa la solicitud en el Panel Web
   ├─ Opción A: Recepción escribe y pulsa ENVIAR WHATSAPP → Bot pausado 🔴
   ├─ Opción B: Recepción pulsa "Activar Atención Humana" → Bot pausado 🔴
   └─ Opción C: Recepción ignora → Bot sigue activo ✅
6. (Si bot pausado) Cliente escribe → Mensaje visible en panel para Recepción ⏸️
7. (Si bot pausado) Cliente pulsa botón/lista → Bot se reactiva automáticamente ✅
8. Recepción pulsa "Concluir Gestión & Reactivar Bot" → Bot reactivado ✅
```

---

## 4. Reglas de Activación del Modo Humano

### ✅ ACTIVA el modo humano (`en_atencion_humana = true`):
- Recepción pulsa el botón **`👤 Activar Atención Humana`** en el panel.
- Recepción escribe un mensaje en el chat de la solicitud y pulsa **`📲 ENVIAR WHATSAPP`**.

### ✅ DESACTIVA el modo humano (`en_atencion_humana = false`):
- Recepción pulsa **`✅ Concluir Gestión & Reactivar Bot`**.
- El cliente pulsa **cualquier botón o selecciona cualquier opción de lista** del chatbot (automático).
- El cliente escribe exactamente: `#bot`, `/menu`, `menu`, `menú`, o `volver al bot` (escape manual).

### ❌ NO activa ni desactiva el modo humano:
- El cliente envía una solicitud (tarjeta regalo, modificación, cancelación, consulta...).
- El cliente escribe texto libre por teclado (si el modo humano **no** estaba ya activo).
- Cualquier interacción interna del bot (menús, confirmaciones, etc.).

---

## 5. Implementación Técnica

### Archivo principal: `bot/router.js`

La lógica de handover se ejecuta en `handleUserMessage()` al inicio, **antes** de cualquier otro procesamiento:

```javascript
const isInteractive = type === 'interactive' || type === 'button' || interactiveData !== null;

const activeSolicitud = await db.getActiveHumanHandoverSolicitud(from);
if (activeSolicitud) {
    if (isInteractive) {
        // Botón o lista → reactivar bot automáticamente
        await db.updateSolicitudStatus(activeSolicitud.id, activeSolicitud.estado, null, false);
    } else {
        // Texto libre → silenciar bot (guardar mensaje para Recepción)
        await db.appendMessageToSolicitud(activeSolicitud.id, { emisor: 'cliente', texto: body });
        return; // Bot no responde
    }
}
```

### Base de datos: `db/solicitudes.js`

- **Campo:** `en_atencion_humana` (BOOLEAN, DEFAULT FALSE) en tabla `solicitudes`.
- **`getActiveHumanHandoverSolicitud(telefono)`**: Busca si hay una solicitud activa con `en_atencion_humana = true` para ese teléfono.
- **`updateSolicitudStatus(id, estado, respuestaStaff, enAtencionHumana)`**: Actualiza el campo.

### API del Panel: `adminApi.js`

- **`POST /api/admin/solicitudes/:id/responder`**: Al enviar un mensaje de Recepción al cliente, establece `en_atencion_humana = true`.
- **`POST /api/admin/solicitudes/:id/atencion-humana`**: Toggle manual del modo humano.
- **`POST /api/admin/solicitudes/:id/concluir`**: Reactiva el bot (`en_atencion_humana = false`).

---

## 6. Estados de una Solicitud

| Estado | Descripción |
|---|---|
| `PENDIENTE` | Solicitud recibida, sin gestionar |
| `EN_GESTION` | Recepción ha respondido al cliente al menos una vez |
| `RESPONDIDA` | Solicitud respondida y pendiente de confirmación del cliente |
| `CONFIRMADA` | Gestión concluida con éxito |
| `RECHAZADA` | Solicitud rechazada por el restaurante |
| `RESUELTA` | Consulta o incidencia resuelta |

---

*Documento generado automáticamente. Última actualización: 14 de Agosto de 2026 — V200.*
