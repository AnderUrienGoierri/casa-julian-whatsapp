# Procedimiento de Desactivación, Pausa y Desvinculación de WhatsApp Cloud API en Casa Julián

Este documento detalla las opciones técnicas y operativas para detener el chatbot, gestionar la atención manual y el procedimiento para desvincular el número de la **WhatsApp Cloud API** de Meta en caso de querer regresar al uso exclusivo de la **App Móvil de WhatsApp Business**.

---

## 1. Regla Fundamental de Meta sobre Números de Teléfono

Meta (WhatsApp) impone una regla estricta de exclusividad para cualquier línea telefónica (`+34 943 67 14 17`):

* Un número de teléfono **SOLO puede estar registrado en una de estas dos modalidades a la vez**:
  1. **Modalidad Cloud API (Empresarial / Bot / Panel Web):** El número está conectado a los servidores de Meta WhatsApp Cloud API. Permite automatizaciones, chatbot 24/7, base de datos y múltiples recepcionistas trabajando en simultáneo desde cualquier ordenador o tablet.
  2. **Modalidad App Móvil (WhatsApp Business App):** El número está registrado directamente en la aplicación instalada en un smartphone físico.

---

## 2. Opción 1: Pausar el Chatbot desde el Panel CMS (Recomendada para el Día a Día)

Si el restaurante desea atender de forma 100% manual (por ejemplo, en servicios de alta demanda, fines de semana, eventos o vacaciones) **sin perder la infraestructura ni tener que reconfigurar Meta**:

### ¿Cómo se hace?
1. Acceder al **Panel de Administración** (`/admin/`).
2. Ir a la pestaña **⚙️ Ajustes**.
3. En el apartado *«Control Maestro del Chatbot»*, pulsar el botón **`🔴 Desactivar Chatbot`**.

### ¿Qué sucede de forma inmediata?
* **El bot se apaga al 100%:** No envía menús, ni respuestas automáticas, ni interactúa con los clientes.
* **Buzón activo:** Todos los mensajes de WhatsApp que escriban los clientes siguen llegando en tiempo real al **Buzón de Recepción**.
* **Atención humana total:** El personal de recepción responde libremente escribiendo el texto que desee o usando los botones de **`📞 Llamar`** y **`📲 WhatsApp`**.
* **Mensaje de mantenimiento opcional:** Se puede configurar un aviso automático breve (ej. *"Le atenderemos manualmente en unos momentos"*).
* **Reactivación:** Con un solo clic en **`🟢 Activar Chatbot`**, el bot vuelve a estar activo al segundo.

**Ventajas:** Tiempo de activación/desactivación de **1 segundo**, sin tocar configuraciones de Meta y accesible para múltiples personas del equipo a la vez.

---

## 3. Opción 2: Desvincular de Meta Cloud API para Volver a la App Móvil Tradicional

Si el restaurante decide prescindir totalmente del servidor, del CMS y de la API de Meta, y desea utilizar exclusivamente un teléfono móvil con la aplicación normal de WhatsApp Business:

### Paso 1: Eliminar el Número en Meta WhatsApp Cloud API
1. Iniciar sesión en el portal de desarrolladores de Meta ([Meta for Developers](https://developers.facebook.com/)) o en [Meta Business Suite](https://business.facebook.com/).
2. Ir a **WhatsApp > Configuración de la API** (o *Administrador de WhatsApp > Cuentas de Teléfono*).
3. Seleccionar el número `+34 943 67 14 17` y hacer clic en **Desvincular / Eliminar número de teléfono** (Delete / Deregister Phone Number).
4. Meta liberará la línea de la infraestructura Cloud API.

### Paso 2: Registrar el Número en la App Móvil
1. En el smartphone del restaurante, abrir la aplicación **WhatsApp Business** (descargable desde Google Play o App Store).
2. Introducir el número fijo oficial: `+34 943 67 14 17`.
3. Seleccionar el método de verificación por **Llamada Telefónica** (Voice Call).
4. La locución automática de WhatsApp llamará al teléfono fijo de Casa Julián y dictará el código de 6 dígitos.
5. Introducir el código en la app móvil.

A partir de este momento, el teléfono móvil gestiona todos los chats de forma manual exactamente igual que antes de la existencia del bot.

---

## 4. Tabla Comparativa de Ambas Opciones

| Aspecto | Opción 1: Pausar Chatbot en Panel Web | Opción 2: Volver a la App Móvil |
|---|---|---|
| **¿El bot responde automáticamente?** | ❌ No (apagado al instante) | ❌ No (desconectado) |
| **¿Recepción puede escribir libremente?** | ✅ Sí (desde el panel web o WhatsApp) | ✅ Sí (desde el smartphone) |
| **¿Atención multi-dispositivo / multi-usuario?** | ✅ Sí (todos los PCs y tablets de sala) | ❌ Solo el móvil principal y sesiones vinculadas |
| **Tiempo de cambio** | ⚡ **1 segundo (un clic en Ajustes)** | ⏱️ **10 a 15 minutos** |
| **Complejidad técnica** | Ninguna (para el personal de sala) | Requiere acceso a Meta Business y llamada de verificación |
| **Riesgo operativo** | Cero riesgo de desconfiguración | Hay que volver a registrar en Meta si se quiere el bot de nuevo |

---

## 5. Recomendación Operativa

Para la operativa habitual de Casa Julián, se aconseja utilizar siempre la **Opción 1**:
* Mantiene el historial de clientes centralizado en la base de datos.
* Permite a todo el equipo de recepción consultar y responder dudas desde la pantalla de sala.
* Se apaga y se enciende con un solo botón en menos de un segundo.
