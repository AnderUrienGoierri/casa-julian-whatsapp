# Arquitectura de Llamadas, Telefonía y WhatsApp Cloud API en Casa Julián

Documento técnico y operativo sobre el funcionamiento de llamadas de voz (convencionales y WhatsApp), integración con la API de Meta y procedimiento para el traspaso a producción con el número oficial del restaurante.

---

## 1. Funcionamiento de Llamadas en WhatsApp Business Cloud API

El sistema de chatbot de Casa Julián opera sobre la infraestructura oficial de **Meta (WhatsApp Business Cloud API)**.

### A. Llamadas Entrantes de Clientes (Cliente → Casa Julián)
* **Llamadas por datos de WhatsApp (Voz/Vídeo sobre IP dentro de la app):**
  * La infraestructura de Meta Cloud API para empresas **no soporta llamadas de voz entrantes nativas dentro de la aplicación de WhatsApp**.
  * Si un cliente pulsa el icono de llamada en el perfil de WhatsApp del restaurante, la aplicación le muestra un aviso indicando que el número no admite llamadas de voz por WhatsApp y le ofrece la opción de marcar por **llamada telefónica convencional**.
* **Llamadas Telefónicas Convencionales (Red de Telefonía Móvil / Fija):**
  * Al asociar en producción el número fijo oficial **`+34 943 67 14 17`**, cualquier llamada telefónica estándar entrará de manera directa e inmediata a la **centralita / teléfonos físicos de recepción del restaurante**, sin interferencia alguna del bot.

### B. Llamadas Salientes de Recepción (Casa Julián → Cliente)
Desde la aplicación web del Panel de Administración & Recepción se integran dos accesos directos por cada cliente/solicitud:
1. **`📞 Llamar (Teléfono Convencional)`** (`tel:+34...`):
   * En terminales móviles o tablets de recepción: Inicia de inmediato la llamada de voz tradicional.
   * En ordenadores: Abre el marcador de telefonía / VoIP instalado (Skype, MicroSIP, app del proveedor telefónico, etc.).
2. **`📲 Abrir en WhatsApp Web / App`** (`https://wa.me/...`):
   * Abre directamente el chat con el cliente en la aplicación nativa de WhatsApp o WhatsApp Web en el dispositivo de recepción, permitiendo interactuar o iniciar llamadas desde ese terminal.

---

## 2. Configuración para Producción (+34 943 67 14 17)

Actualmente el entorno de desarrollo y pruebas utiliza el número de prueba de Meta:
* **Entorno de Prueba:** `+1 (555) 166-7550`
* **Entorno de Producción:** `+34 943 67 14 17` (Tolosa, Gipuzkoa)

### Proceso de Activación del Número Fijo en Meta:
1. **Verificación de la línea:**
   * Meta permite registrar líneas fijas (`+34 943...`).
   * Durante el proceso en el Administrador de WhatsApp de Meta (*Meta Business Suite*), se selecciona el método de verificación por **Llamada Telefónica**.
   * Una locución automática de Meta llamará al teléfono fijo de Casa Julián y dictará un código de 6 dígitos que se introduce en el panel para validar la propiedad del número.
2. **Coexistencia perfecta:**
   * **Voz:** La línea física `+34 943 67 14 17` sigue recibiendo llamadas normales en el restaurante.
   * **Mensajería WhatsApp:** Todos los mensajes de WhatsApp entrantes se enrutan automáticamente a nuestro servidor y al Buzón de Recepción.
   * **Remitente oficial:** El cliente ve el nombre comercial verificado *"Asador Casa Julián"* y el número oficial `+34 943 67 14 17`.

---

## 3. Accesos Rápidos en el Panel de Recepción

Para agilizar el flujo de trabajo de recepción:
* En cada tarjeta del **Buzón de Recepción** se incluyen los botones de llamada rápida y apertura de chat directo.
* En el **Modal de Atención Directa**, la barra superior y lateral ofrece los botones para marcar o saltar a WhatsApp con un solo clic.
