# Traspaso a Agente Humano y Conversación Bidireccional de Recepción

**Proyecto:** Asador Casa Julián de Tolosa — WhatsApp Bot & Panel CMS  
**Versión:** V193 — Handover Humano & Chat Bidireccional en Tiempo Real  
**Fecha:** 14 de Agosto de 2026  

---

## 1. Resumen Ejecutivo

Este documento describe la arquitectura y el funcionamiento operativo del **Modo de Traspaso a Agente Humano (*Human Handover*)** en el sistema de WhatsApp de Casa Julián de Tolosa.

Permite que, una vez que un cliente finaliza una solicitud o petición (Reserva de Menú Tradición, Modificación de Reserva, Cancelación o Consulta Abierta), **el chatbot pause automáticamente sus respuestas programadas** para ese cliente, permitiendo que la recepcionista mantenga una **conversación libre, fluida y bidireccional por WhatsApp** desde el **Panel Web de Recepción**, sin interferencias de menús automáticos ni botones.

---

## 2. Diagrama del Flujo de Interacción

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as 📱 Cliente (WhatsApp)
    participant Meta as ☁️ Meta WhatsApp Cloud API
    participant Bot as 🤖 Chatbot Core (Node.js)
    participant DB as 🗄️ Neon PostgreSQL
    actor Recepcion as 👩‍💼 Recepción (Panel Web)

    Cliente->>Meta: Envía solicitud (ej. Menú Tradición / Cambio de fecha)
    Meta->>Bot: Webhook con datos de la solicitud
    Bot->>DB: Guarda Solicitud + Activa "Modo Atención Humana" (en_atencion_humana = true)
    Bot->>Cliente: "✅ Tu solicitud ha sido enviada a Recepción. En breve te responderemos por aquí."
    
    Note over Bot,Cliente: ⏸️ CHATBOT EN PAUSA: No enviará menús automáticos a este cliente
    
    Cliente->>Meta: "¿Podría ser mejor a las 14:30? ¿Tenéis trona para bebé?"
    Meta->>Bot: Webhook de mensaje nuevo
    Bot->>DB: Almacena mensaje en el hilo de la solicitud (sin responder con menús)
    DB->>Recepcion: Muestra nuevo mensaje en tiempo real en la Bandeja de Entrada

    Recepcion->>Bot: Escribe respuesta libre ("¡Hola! Sí, disponemos de trona y mesa a las 14:30")
    Bot->>Meta: Envía WhatsApp directo al cliente
    Meta->>Cliente: Recibe mensaje de Casa Julián en su WhatsApp

    Note over Recepcion,Cliente: 💬 Conversación libre y flexible tantas veces como sea necesario

    Recepcion->>Bot: Clic en "✅ Concluir Gestión & Reactivar Bot"
    Bot->>DB: Actualiza estado a CONFIRMADA + en_atencion_humana = false
    Bot->>Cliente: "✅ Tu gestión ha quedado confirmada. ¡Muchas gracias por contactar con Casa Julián!"

    Note over Bot,Cliente: ▶️ CHATBOT REACTIVADO para futuras consultas del cliente
```

---

## 3. Componentes del Sistema

### 3.1. Estado de Atención Humana (`en_atencion_humana`)
Cada solicitud creada en la base de datos dispone de:
* `en_atencion_humana: true`: Indica que el cliente está bajo atención personalizada.
* `mensajes: [...]`: Hilo cronológico de mensajes intercambiados (`emisor: 'cliente' | 'recepcion'`, `texto`, `fecha`).
* `estado: 'PENDIENTE' | 'EN_GESTION' | 'CONFIRMADA' | 'RECHAZADA'`.

### 3.2. Enrutador Inteligente (`bot/router.js`)
Antes de evaluar los árboles de decisión o palabras clave, el router comprueba si el número de teléfono emisor tiene una atención humana activa:
* **Si está activa:** El mensaje se guarda en el hilo de la solicitud y **el bot permanece en silencio** (no emite menús ni botones).
* **Excepción de escape para el cliente:** Si el cliente escribe `#bot`, `/menu` o `menu`, el sistema libera el modo humano y vuelve a presentar el menú principal.

### 3.3. Bandeja de Recepción en el Panel Web (`/admin`)
La recepcionista (acceso con rol `recepcion`):
1. Ve la tarjeta de la solicitud con el historial completo de mensajes.
2. Dispone de un campo de texto para redactar cualquier mensaje de forma libre.
3. Envía el WhatsApp en tiempo real a través de la API oficial de Meta.
4. Puede concluir la gestión y reactivar el bot con un solo clic.

---

## 4. Guía de Uso para el Personal de Recepción

1. **Acceder al Panel:** Abrir `http://localhost:3000/admin` (o la URL remota / Homer) e introducir la contraseña `recepcion`.
2. **Revisar Solicitudes Pendientes:** Las nuevas solicitudes aparecen automáticamente ordenadas por fecha reciente.
3. **Conversar con el Cliente:**
   * Pulsar sobre el botón **"💬 Responder por WhatsApp"**.
   * Escribir cualquier propuesta, aclaración de horarios o confirmación.
   * Las respuestas del cliente aparecerán en el hilo en tiempo real.
4. **Finalizar la Gestión:**
   * Al acordar la reserva o resolver la duda, pulsar **"✅ Concluir Gestión"**.
   * El cliente recibirá el mensaje de confirmación final y el bot quedará reactivado para sus próximas visitas.
