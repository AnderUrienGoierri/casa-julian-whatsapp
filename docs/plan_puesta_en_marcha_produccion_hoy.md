# 🚀 Plan de Despliegue en Producción: Número Oficial (+34 943 67 14 17) & Puesta en Marcha Total

Este documento establece la hoja de ruta paso a paso para activar hoy el Chatbot con el número oficial del restaurante, completar la configuración de Meta Developers, abrir el Puerto 443 en el router de Casa Julián (FASE 5), eliminar las notificaciones por Gmail y verificar el historial completo de chats en el panel web.

---

## 📌 Resumen de Objetivos del Día

1. **Eliminar el envío de alertas por Gmail (`anurte@gmail.com`):** Todas las solicitudes y avisos se gestionan ahora de forma 100% centralizada en la base de datos y en el panel web de recepción (`/admin/`).
2. **FASE 5 (Apertura de Puerto 443 en Router del Restaurante):** Habilitar el Port Forwarding para que Meta entregue los webhooks en tiempo real al Synology NAS y el personal pueda acceder al panel desde casa y móvil vía `https://casajuliantolosa.synology.me/admin/`.
3. **Completar Configuración en Meta Developers:**
   * **Paso 2:** Registrar el número oficial `+34 943 67 14 17` (mediante llamada/SMS de verificación de Meta).
   * **Configurar Webhook:** URL de webhook `https://casajuliantolosa.synology.me/webhook` con el Verify Token `casa_julian_secure_webhook_token_2026`.
   * **Obtener Identificador:** Guardar el nuevo `PHONE_NUMBER_ID` y `WHATSAPP_TOKEN` permanente en `.env`.
4. **Historial Completo de Conversaciones (Cliente $\leftrightarrow$ Bot):** Asegurar que en el panel web (pestaña *Chats WhatsApp* e *Historial Bot*) se vean íntegros todos los mensajes recibidos del cliente y todas las respuestas/menús enviados por el bot.
5. **Pruebas en Vivo y Solución de Incidencias:** Probar el flujo real desde WhatsApp con un cliente real y verificar el bypass de los 30 proveedores silenciados.

---

## 🛠️ Plan de Ejecución Paso a Paso

### PASO 1: Desactivar Notificaciones por Gmail en el Código
* **Acción en el Código:**
  * Modificar `notifications.js` para suprimir las llamadas a Resend / Brevo / SMTP que enviaban copias a `anurte@gmail.com`.
  * Mantener el guardado inmediato en la base de datos PostgreSQL (`createSolicitud`) y el registro en el historial.
  * Desplegar en GitHub y Synology NAS.

---

### PASO 2: FASE 5 — Abrir el Puerto 443 en el Router de Casa Julián
Para que Meta pueda conectar con el Synology NAS y el panel sea accesible desde fuera del restaurante:
1. Acceder al panel de administración del router de la conexión a Internet del restaurante (habitualmente `192.168.1.1` o `192.168.110.1` desde un equipo conectado a la red).
2. Ir a la sección **Port Forwarding / Reenvío de Puertos / Servidor Virtual / NAT**.
3. Añadir la regla:
   * **Nombre de la Regla:** `Synology HTTPS Webhook`
   * **Protocolo:** `TCP`
   * **Puerto Externo / WAN:** `443`
   * **IP Destino / Interna (NAS):** `192.168.110.57`
   * **Puerto Interno / LAN:** `443`
4. Guardar y aplicar los cambios.

---

### PASO 3: Configurar Meta Developers (Paso 2 y Webhook)

#### 1. Configurar y Verificar el Webhook
* En la pantalla de **Paso 2. Configuración de producción** $\rightarrow$ **Configurar Webhooks**:
  * **URL de devolución de llamada (Callback URL):** `https://casajuliantolosa.synology.me/webhook`
  * **Identificador de verificación (Verify Token):** `casa_julian_secure_webhook_token_2026`
  * Pulsar **Verificar y Guardar**.
  * En los campos de suscripción, marcar la casilla **`messages`**.

#### 2. Registrar el Número de Teléfono Oficial
* En **Registrar tu número de teléfono de WhatsApp**:
  * Introducir el número: `+34 943 67 14 17`.
  * **Nombre para mostrar de la empresa:** `Asador Casa Julián` (o `Casa Julián de Tolosa`).
  * **Categoría:** *Restaurante*.
  * **Método de Verificación:** Seleccionar **Llamada de voz** (Recomendado para líneas fijas) o **SMS**.
  * Introducir el código de 6 dígitos que Meta proporcionará.
* Copiar el nuevo **Phone Number ID** que Meta generará para el número `943 67 14 17`.

#### 3. Actualizar Credenciales en `.env` en el Synology NAS
* Actualizar `PHONE_NUMBER_ID` con el ID del número oficial.
* Actualizar `WHATSAPP_TOKEN` con el token de sistema permanente.

---

### PASO 4: Verificación del Historial Completo (Cliente $\leftrightarrow$ Bot)
* Comprobar que en la pestaña **💬 Chats WhatsApp** y en el modal **📜 Historial Bot**:
  * Se registren y visualicen todos los mensajes entrantes del cliente (`emisor: 'cliente'`).
  * Se registren y visualicen todos los mensajes, menús y botones enviados por el bot (`emisor: 'bot'`).
  * Las respuestas manuales emitidas por los recepcionistas aparezcan identificadas con la etiqueta `[Staff / Recepción]`.

---

### PASO 5: Batería de Pruebas en Producción
1. **Prueba de Cliente Nuevo:** Enviar *"Hola"* desde un teléfono móvil al `+34 943 67 14 17` y comprobar:
   * Menú de bienvenida e idiomas (`Castellano`, `Euskera`, `English`).
   * Solicitud de Menú Tradición / Reserva Web.
   * Entrada inmediata en el panel de recepción (`/admin/`).
2. **Prueba de Proveedor Silenciado:** Enviar mensaje desde uno de los 30 teléfonos silenciados (ej. Maitines / Xabi) y verificar que:
   * El bot **NO responde automáticamente**.
   * El mensaje entra directo al buzón en modo humano.
3. **Prueba de Acceso Remoto:** Conectar al panel web desde un móvil con datos 4G/5G en `https://casajuliantolosa.synology.me/admin/`.
