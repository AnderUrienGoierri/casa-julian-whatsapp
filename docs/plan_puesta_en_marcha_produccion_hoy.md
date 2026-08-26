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

* ![](blob:https://web.whatsapp.com/0745be8d-a352-44f0-81f8-8370c77cb37a)
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

---

## 📈 6. Desbloqueo del Límite de 2.000 Mensajes y Activación de WhatsApp Business Calling API (Llamadas VoIP)

### ⏱️ ¿Cuándo y Cómo Desbloquea Meta el Límite de 2.000 Mensajes (Tier 2K)?

Para poder activar **WhatsApp Business Calling API** y permitir llamadas de voz VoIP directas al panel de recepción (especialmente útiles para turistas extranjeros y clientes sin cobertura móvil tradicional), Meta exige que la cuenta alcance el nivel **Tier 2K** (2.000 conversaciones únicas diarias).

* **Tiempo Estimado:** **Entre 2 y 7 días hábiles** desde la puesta en marcha en producción con el número oficial `+34 943 67 14 17`.
* **Proceso de Escalado Automático de Meta:**
  1. **Nivel Inicial (Tier 1K):** Al registrar y verificar el número oficial por llamada/SMS, Meta asigna un límite de 1.000 conversaciones diarias.
  2. **Subida Automática a Tier 2K:** Meta incrementa el límite a 2.000 de forma 100% automática si durante los primeros días:
     * La **calificación de calidad (Quality Rating)** se mantiene en **Verde / Alta** (los clientes no reportan spam).
     * El bot gestiona conversaciones reales con clientes entrantes.
     * Se acumula un volumen de uso continuo.
  3. **Acelerador (Verificación de Empresa en Meta):** Si en el **Paso 3. Verificación de la empresa** de Meta Developers se valida el CIF/documentación de Casa Julián de Tolosa S.L., Meta eleva los límites en **24-48 horas**.

### 🔍 Dónde Comprobar el Nivel de Límite en Tiempo Real:

1. Acceder a **Meta Business Manager** (`https://business.facebook.com/`).
2. Ir a **WhatsApp Manager** $\rightarrow$ **Cuentas de WhatsApp** $\rightarrow$ **Números de teléfono**.
3. En la fila del `+34 943 67 14 17`, revisar la columna **Límite de mensajes** (pasará de *1.000 / día* a *2.000 / día*).

### 🚀 Hoja de Ruta para las Llamadas:

1. **Fase Inicial (Hoy):** Operativa del Chatbot activa en el `+34 943 67 14 17` para reservas, menús, cartas y bypass de proveedores. Las llamadas de voz se atienden de forma habitual por la línea telefónica convencional del restaurante.
2. **Fase Posterior (A partir de Tier 2K):** Habilitación del módulo WebRTC en el Synology NAS para recibir llamadas VoIP entrantes por datos de WhatsApp directamente en el panel web de recepción.
