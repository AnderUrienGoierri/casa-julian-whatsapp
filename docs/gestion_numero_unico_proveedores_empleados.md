# 📱 Gestión de Número Único (+34 943 67 14 17), Proveedores y Empleados con WhatsApp Cloud API

Este documento detalla la arquitectura, el funcionamiento técnico y el plan de migración para operar el teléfono oficial de Casa Julián de Tolosa (**+34 943 67 14 17**) como **número único** para todas las comunicaciones del restaurante (clientes, reservas, proveedores y empleados) mediante **WhatsApp Cloud API** y el panel de recepción.

---

## 1. Contexto y Regla Técnica de Meta WhatsApp

### WhatsApp Business App vs. WhatsApp Cloud API
* **WhatsApp Business App (Aplicación móvil clásica):**
  * Diseñada para uso manual en un único dispositivo móvil o mediante WhatsApp Web vinculado.
  * Almacena chats, contactos y etiquetas de colores exclusivamente en la memoria local y backup del teléfono.
* **WhatsApp Cloud API (Plataforma oficial empresarial del Chatbot):**
  * Diseñada para automatización, chatbots, menús interactivos y conexión a servidores (Synology NAS).
  * **Regla estricta de Meta:** Un mismo número de teléfono **NO puede estar activo simultáneamente** en la aplicación móvil de WhatsApp Business y en la Cloud API.

Al migrar el número `+34 943 67 14 17` a la Cloud API, la aplicación móvil de WhatsApp Business se desvincula de ese número y la gestión de mensajes pasa a realizarse a través del servidor del bot y del panel web de administración (`https://casajuliantolosa.synology.me/admin/`).

---

## 2. Solución de Número Único: Sistema de Etiquetas y Modo Silencioso

Dado que el restaurante utiliza un único número para todo, el sistema se estructura de la siguiente manera:

```
                                +34 943 67 14 17 (Meta Cloud API)
                                              │
                                              ▼
                             Servidor Node.js (Synology NAS)
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
         👤 Teléfono de Proveedor / Empleado                  👤 Cliente / Reserva
                    │                                                   │
        [Comprobación de Etiqueta]                              [Flujo Normal del Bot]
                    │                                                   │
        🚫 BYPASS: Chatbot SILENCIADO                           🤖 Chatbot ACTIVO
        (No envía menú de reservas)                             (Bienvenida, idiomas, menús)
                    │                                                   │
                    ▼                                                   ▼
         💬 Panel Web de Recepción                           💬 Panel Web de Recepción
         (Notificación directa a personal)                   (Gestión de Solicitudes y Chats)
```

---

## 3. Características del Sistema Implementado

### 🏷️ 1. Sistema de Etiquetas en el Panel Web (`/admin/`)
El panel de recepción y chats cuenta con etiquetas categorizadas para clasificar a los contactos:
* 🟢 **Proveedores:** Carne, Txakoli/Vino, Verduras, Carbón, Mantenimiento, etc.
* 🔵 **Empleados / Personal:** Cocina, Sala, Limpieza, Administración.
* 🟡 **Clientes VIP / Habituales.**
* ⚪ **Clientes Generales / Reservas.**

### 🚫 2. Modo Silencioso Automático (Bypass de Chatbot para Proveedores y Empleados)
* Si un proveedor escribe por WhatsApp (ejemplo: *"Hola, mañana a las 09:30 os entrego el pedido de chuletones"*):
  1. El servidor identifica el número en la base de datos como **Proveedor**.
  2. El chatbot **NO envía ningún menú de reservas ni mensajes automáticos**.
  3. El mensaje se registra directamente en el panel de recepción en **Modo Humano Permanente**.
  4. El personal de recepción responde directamente desde el móvil o portátil mediante el panel web.

### 📱 3. Acceso Remoto Seguro para el Personal
* El personal de recepción puede atender tanto a clientes como a proveedores desde cualquier lugar (dentro del restaurante por Wi-Fi o desde casa con cobertura 4G/5G):
  * **Dirección Segura:** `https://casajuliantolosa.synology.me/admin/`
  * **Filtros rápidos:** Ver solo "Proveedores", solo "Empleados" o solo "Clientes".
  * **Buscador global:** Búsqueda instantánea por nombre o número de teléfono.

---

## 4. Plan de Acción para la Migración del Número Oficial

Antes de activar el número `+34 943 67 14 17` en Meta Cloud API, se deben seguir estos pasos para asegurar que no se pierde ninguna información:

1. **Copia de Seguridad en el Móvil:**
   * En la App de WhatsApp Business del teléfono móvil: *Ajustes* $\rightarrow$ *Chats* $\rightarrow$ *Copia de seguridad*.
2. **Exportación de Contactos y Etiquetas:**
   * Anotar o exportar la lista de números de proveedores y empleados con sus nombres y categorías.
3. **Carga en la Base de Datos del Sistema:**
   * Registrar los números de proveedores y empleados en la tabla de contactos del sistema con la etiqueta correspondiente y la marca `bypass_bot = true`.
4. **Desvinculación y Activación en Meta:**
   * Eliminar la cuenta de WhatsApp Business en la aplicación móvil (*Ajustes* $\rightarrow$ *Cuenta* $\rightarrow$ *Eliminar cuenta* de la app, manteniendo la línea telefónica activa).
   * Registrar el número en la plataforma de **Meta WhatsApp Cloud API** mediante llamada de verificación por voz o SMS al fijo `+34 943 67 14 17`.
5. **Puesta en Marcha Inmediata:**
   * Desde el primer segundo, el bot atenderá a los clientes y derivará a proveedores y empleados directamente a recepción.
