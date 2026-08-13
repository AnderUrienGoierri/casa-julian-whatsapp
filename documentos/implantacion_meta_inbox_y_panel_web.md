# Guía de Implantación Paso a Paso: Meta Business Suite Inbox y Panel Web Propio (Sin Números Personales)

## 📌 1. Resumen Ejecutivo
Para evitar el uso de números de teléfono personales de los trabajadores y mantener una gestión 100% corporativa, la atención de **Casa Julián de Tolosa** desde el número oficial **+34 943 67 14 17** se puede realizar mediante dos métodos profesionales:
1. **Meta Business Suite Inbox** (Herramienta oficial gratuita de Meta).
2. **Panel Web Propio del Chatbot** (Desarrollado en la plataforma en `/admin`).

---

## 🏬 Método 1: Meta Business Suite Inbox (Solución Oficial de Meta)

### ¿Qué es?
Es la plataforma corporativa unificada proporcionada por **Meta** (Facebook/WhatsApp). Funciona como una bandeja de entrada corporativa tipo WhatsApp Web pero conectada directamente a la API oficial Cloud.

### 🛠️ Pasos de Implantación y Configuración:
1. **Acceso al Administrador de Meta Business:**
   - El administrador de Casa Julián accede a [business.facebook.com](https://business.facebook.com) con la cuenta corporativa.
2. **Acceso a la Bandeja de Entrada (Inbox):**
   - En el menú lateral izquierdo, seleccionar la opción **Bandeja de entrada (Inbox)**.
3. **Asignación de Accesos a la Plantilla (Sin Teléfonos Personales):**
   - En *Configuración del negocio > Personas*, se invita a los trabajadores mediante su **correo electrónico laboral/corporativo**.
   - Se asigna el rol *"Atención al cliente"* restringido solo al buzón de mensajes.
4. **Uso en Dispositivos del Restaurante (Tablet / PC):**
   - En el ordenador de recepción se deja abierta la pestaña del navegador con Meta Business Suite.
   - Opcionalmente, se descarga la App gratuita **Meta Business Suite** (disponible en iOS y Android) en la tablet u ordenador oficial del restaurante.

### 📱 Flujo de Trabajo para el Personal:
- Cuando un cliente termina una solicitud con el bot, aparece en la pestaña de **WhatsApp Inbox**.
- El trabajador ve la notificación y el resumen generado.
- Escribe la respuesta (ej: *"Hola Juan, reserva confirmada..."*) y pulsa **Enviar**.
- El cliente recibe el mensaje en su WhatsApp procedente de **+34 943 67 14 17**.

---

## 💻 Método 2: Panel Web Propio (`/admin` - Desarrollado en el Proyecto)

### ¿Qué es?
Es la interfaz a medida construida específicamente para el proyecto de Casa Julián (`https://tu-dominio.com/admin`), diseñada para ser rápida, limpia e intuitiva desde cualquier ordenador, tablet o navegador.

### 🛠️ Pasos de Implantación y Configuración:
1. **Configuración de Usuarios y Claves:**
   - Se crea un usuario de acceso corporativo (ej: `recepcion` / `administracion`) con su contraseña segura en el archivo de entorno `.env` o base de datos.
2. **Acceso desde el Restaurante:**
   - En la tablet u ordenador de recepción de Casa Julián se guarda el marcador o acceso directo a `https://tu-dominio.com/admin`.
3. **Gestión de Solicitudes y Respuestas:**
   - En la pestaña de **Solicitudes Pendientes**, el trabajador ve en lista limpia las reservas, cancelaciones o modificaciones entrantes.
   - Hace clic en **"Aprobar Reserva"** o escribe un mensaje personalizado en el chat del panel.
   - El backend en Node.js envía automáticamente la respuesta al WhatsApp del cliente desde **+34 943 67 14 17**.

---

## ⚖️ Comparativa de Implantación

| Aspecto | Método 1: Meta Business Suite Inbox | Método 2: Panel Web Propio (`/admin`) |
| :--- | :--- | :--- |
| **Uso de números personales** | ❌ **No utiliza ningún número personal** | ❌ **No utiliza ningún número personal** |
| **Acceso para trabajadores** | Email corporativo en Meta Business | Usuario y contraseña en el Panel Web |
| **Dispositivo de atención** | Tablet / PC del restaurante | Tablet / PC del restaurante |
| **Coste de software** | Gratuito por Meta | Incluido en este desarrollo |
| **Control de datos** | Plataforma de Meta | Base de datos de Casa Julián |
| **Personalización** | Estándar de Facebook | 100% Personalizado para Casa Julián |
