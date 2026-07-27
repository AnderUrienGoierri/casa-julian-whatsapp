# 🛠️ PLAN DE IMPLEMENTACIÓN PASO A PASO: BOT WHATSAPP + THEFORK + REVO POS
## Roadmap de Desarrollo e Integración - Asador Casa Julian

---

## 🎯 RESUMEN DEL PROYECTO DE INTEGRACIÓN

El objetivo es transformar el bot de WhatsApp de Casa Julian en un **Gestor de Solicitudes Inteligente** articulado en tres fases operativas:

1. **Fase 1 (Inmediata - Desarrollo Backend & Bot):** Flujo de reserva en modo **Solicitud Pendiente de Confirmación**. El bot registra la petición, envía una alerta al equipo del restaurante con un botón de aprobación rápida y notifica automáticamente al cliente por WhatsApp cuando el restaurante confirma o propone otra hora.
2. **Fase 2 (Integración TheFork Partner API):** Sincronización bi-direccional con **TheFork Manager** para volcar las solicitudes directamente en la pantalla de reservas del restaurante y escuchar webhooks de aprobación.
3. **Fase 3 (Integración Revo POS & Perfil VIP):** Captura de tickets de consumo de **Revo XEF** para enriquecer el historial de vinos, cortes de carne y preferencias del cliente en su ficha.

---

## 📋 ROADMAP Y PASOS A DAR

---

### 🔹 FASE 1: IMPLEMENTACIÓN DEL FLUJO "SOLICITUD PENDIENTE DE CONFIRMACIÓN"
*Objetivo: Permitir que el restaurante apruebe cada reserva antes de ser confirmada al cliente.*

#### 1.1. Modificación de la Lógica de Estado en `botLogic.js`
- [ ] Reemplazar la confirmación automática directa (`confirmed`) por el estado **`reserva_solicitada_pendiente`**.
- [ ] Al completar los datos (Fecha, Turno, Comensales, Nombre, Teléfono, DNI, Email), guardar la reserva con estatus `"PENDIENTE_APROBACION"`.
- [ ] Enviar al cliente el mensaje multilingüe de solicitud recibida:
  > *"📩 **Solicitud de Reserva Recibida**\n\nHola {nombre}, hemos recibido tu petición para el **{fecha} a las {hora}** ({comensales} personas).\n\nEl equipo de recepción de Casa Julian revisará la disponibilidad y te enviará la **confirmación oficial por este mismo chat** en breve."*

#### 1.2. Notificación Instantánea al Restaurante (Maitre / Recepción)
- [ ] Configurar un canal de alerta instantánea para el personal de Casa Julian (Email HTML interactivo con botones rápidos de respuesta `[✅ Confirmar Reserva]` y `[❌ Rechazar / Cambiar Hora]`).
- [ ] Crear el endpoint `/api/admin/confirm-reservation` en `server.js`.
- [ ] Al hacer clic en `[✅ Confirmar Reserva]`, el servidor cambia el estatus a `"CONFIRMADA"` y activa a la API de WhatsApp para enviar al cliente:
  > *"✅ **¡RESERVA CONFIRMADA POR CASA JULIAN!**\n\nHola {nombre}, tu mesa para el **{fecha} a las {hora}** ({comensales} pax) está confirmada. ¡Te esperamos en Tolosa!"*

#### 1.3. Gestión de Cancelaciones y Modificaciones Pendientes
- [ ] Si el cliente solicita cancelar o modificar desde WhatsApp, la petición pasa a estado `"SOLICITUD_CANCELACION_PENDIENTE"` / `"SOLICITUD_MODIFICACION_PENDIENTE"`.
- [ ] El Maitre valida la acción y el bot notifica la resolución al cliente.

---

### 🔹 FASE 2: INTEGRACIÓN BI-DIRECCIONAL CON THEFORK PARTNER API
*Objetivo: Conectar el bot con la aplicación TheFork Manager que ya utiliza el restaurante.*

#### 2.1. Credenciales y Acceso a la API de TheFork
- [ ] Solicitar a TheFork Partner Network las credenciales de API (API Key / Partner ID) para el establecimiento Casa Julian de Tolosa.
- [ ] Configurar `THEFORK_API_KEY` y `THEFORK_RESTAURANT_ID` en las variables de entorno (`.env` y Render.com).

#### 2.2. Módulo de Integración `theForkApi.js`
- [ ] Crear el servicio `theForkApi.js` para consultar disponibilidades reales de mesas en tiempo real.
- [ ] Implementar la función `createPendingBookingInTheFork(bookingData)` para insertar la solicitud directamente en la tablet de TheFork Manager del restaurante.

#### 2.3. Receptor de Webhooks de TheFork (`/webhook/thefork`)
- [ ] Crear el endpoint en `server.js` para escuchar los eventos de TheFork:
  - `RESERVATION_ACCEPTED`: Dispara el mensaje WhatsApp de confirmación al cliente.
  - `RESERVATION_CANCELLED`: Notifica al cliente de la cancelación.
  - `RESERVATION_MODIFIED`: Envía el nuevo turno al cliente.

---

### 🔹 FASE 3: INTEGRACIÓN CON REVO POS (REVO XEF API) & PERFIL VIP
*Objetivo: Capturar los consumos por mesa para crear un perfil de fidelización gastronómica.*

#### 3.1. Webhook de Revo POS (`/webhook/revo`)
- [ ] Configurar en el panel de administración de Revo XEF el Webhook `order.closed`.
- [ ] Crear el endpoint `/webhook/revo` en `server.js` para recibir el JSON con el ticket detallado.

#### 3.2. Módulo de Procesamiento de Tickets y Vinculación CRM
- [ ] Analizar los ítems del ticket: botellas de vino, gramos de chuletón, punto de la carne, postres y gasto total.
- [ ] Asociar el consumo al perfil del cliente por su número de teléfono / DNI.
- [ ] Guardar el historial en la base de datos PostgreSQL Neon en la tabla `customer_profiles`.

#### 3.3. Ficha VIP para el Restaurante
- [ ] Al recibir una nueva solicitud de reserva por WhatsApp, el bot consulta la ficha VIP del cliente y adjunta a la alerta del Maitre sus preferencias:
  > *"👤 **Historial del Cliente:** 3ª visita | Vino preferido: Remelluri Reserva | Carne: Poco hecha | Gasto medio: 92€/pax"*

---

## 🚀 VERIFICACIÓN Y PRUEBAS

1. **Prueba de Solicitud Recibida:** Enviar solicitud desde WhatsApp y comprobar que el estado queda en `PENDIENTE_APROBACION`.
2. **Prueba de Aprobación por Maitre:** Pulsar en la alerta de prueba y verificar que el cliente recibe el mensaje oficial de confirmación.
3. **Prueba de Webhooks:** Validar respuesta en menos de 2 segundos.
