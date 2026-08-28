# 🏰 Guía Completa: Despliegue de la Web y Bot de WhatsApp 100% en Synology NAS

> **Objetivo:** Ejecutar todo el sistema (**Base de Datos PostgreSQL + Servidor Web + Panel de Administración + Chatbot de WhatsApp**) de forma autónoma dentro del **Synology DS223j** de Casa Julián, logrando **independencia total de plataformas de pago o con límites (como Render y Neon Cloud)** con coste 0€/mes de por vida.

---

## 🌟 Beneficios del Despliegue 100% en Synology

1. **🚫 Cero límites de transferencia y sin cuotas:**
   - Ni Render (límite de 100 GB y apagado a los 15 min) ni Neon (límite de 5 GB).
2. **⚡ Funcionamiento 24/7 sin retrasos de arranque:**
   - La web y el bot nunca se "duermen"; las respuestas son instantáneas las 24 horas del día.
3. **🔒 Privacidad y Control Total:**
   - Los datos de los clientes, reservas, tarjetas regalo y mensajes se almacenan físicamente en los discos duros del restaurante.
4. **📶 Acceso Dual:**
   - **Desde dentro del restaurante:** Conexión directa y ultrarrápida en la red local (`http://192.168.110.57:3000/admin/`).
   - **Desde fuera del restaurante:** Conexión cifrada segura con HTTPS (`https://casajuliantolosa.synology.me:...`).

---

## 🏗️ Arquitectura del Sistema en el Synology

```
                              ┌─────────────────────────────────────────────────────────────┐
                              │                    SYNOLOGY DS223j (192.168.110.57)         │
                              │                                                             │
   Internet / Meta WhatsApp ──┼──► Proxy Inverso (HTTPS / SSL Let's Encrypt)                │
                              │                  │                                          │
                              │                  ▼                                          │
                              │   📦 Contenedor Web & Bot (Node.js - Puerto 3000)           │
                              │                  │                                          │
                              │                  ▼ (Comunicación interna ultra rápida)      │
                              │   📦 Contenedor Base de Datos (PostgreSQL - Puerto 5432)    │
                              │                  │                                          │
                              │                  ▼                                          │
                              │   💾 Disco Duro / Almacenamiento Persistente (7 TB)         │
                              └─────────────────────────────────────────────────────────────┘
```

---

## 📋 PASO A PASO: Despliegue Completo

---

### PASO 1: Verificar la Base de Datos PostgreSQL  [OK]

Asegúrate de que el contenedor de base de datos **`casa-julian-postgres`** que configuramos esté encendido en **Container Manager**:

- **Puerto local:** `5433` (o `5432`)
- **Base de datos:** `casa_julian_db`
- **Usuario:** `casajulian_admin`
- **Contraseña:** `CasaJulianTolosa2026!`

---

### PASO 2: Crear el Contenedor de la Web y Bot (`casa-julian-whatsapp-bot`)

1. Abre **Container Manager** en tu Synology DSM.
2. Ve a la pestaña **Imagen** (a la izquierda).
3. Selecciona la imagen **`casa-julian-whatsapp-bot`** (que ya tienes descargada) y pulsa **Ejecutar**.
4. Configura los siguientes parámetros en el asistente:

#### 1. Configuración General:

- **Nombre del contenedor:** `casa-julian-web-bot`
- **Habilitar reinicio automático:** ✅ **Marcado** *(para que arranque siempre solo ante cualquier reinicio)*.
- Pulsa **Siguiente**.

#### 2. Configuración Avanzada:

- **Configuración de puertos:**

  - **Puerto local:** `3000`
  - **Puerto del contenedor:** `3000`
  - **Tipo:** `TCP`
- **Variables de Entorno (Environment Variables):**
  Pulsa **`+ Agregar`** para añadir las variables que necesita el bot y la web:

| Variable                           | Valor Recomendado / Descripción                                                                           |
| :--------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| **`PORT`**                 | `3000`                                                                                                   |
| **`DATABASE_URL`**         | `postgresql://casajulian_admin:CasaJulianTolosa2026!@192.168.110.57:5433/casa_julian_db?sslmode=disable` |
| **`PHONE_NUMBER_ID`**      | *(El ID de teléfono de WhatsApp de Meta)*                                                               |
| **`WHATSAPP_TOKEN`**       | *(Tu Token de Meta WhatsApp Cloud API)*                                                                  |
| **`WEBHOOK_VERIFY_TOKEN`** | *(Tu token secreto de verificación de webhook)*                                                         |
| **`BREVO_API_KEY`**        | *(Tu clave de Brevo para envío de emails de confirmación)*                                             |
| **`SMTP_HOST`**            | *(Host SMTP para emails)*                                                                                |
| **`SMTP_PORT`**            | `587`                                                                                                    |
| **`SMTP_USER`**            | *(Usuario de correo)*                                                                                    |
| **`SMTP_PASS`**            | *(Contraseña de correo)*                                                                                |
| **`STAFF_EMAIL`**          | `info@casajulianmg.com`                                                                                  |

5. Pulsa **Siguiente** y luego **Finalizado**.
6. ¡El servidor web y el bot ya estarán corriendo localmente en el restaurante! Puedes comprobarlo abriendo en tu navegador:
   👉 `http://192.168.110.57:3000/admin/`

---

### PASO 3: Configurar Acceso Seguro HTTPS desde el Exterior (Proxy Inverso)

Para que Meta WhatsApp pueda enviar los mensajes al bot y puedas acceder al panel desde fuera del restaurante con candado verde (HTTPS):

1. En DSM, ve a **Panel de Control > Portal de inicio de sesión > Avanzado**.
2. Haz clic en **Proxy Inverso** (Reverse Proxy).
3. Pulsa **Crear** y rellena:

#### Descripción General:

- **Nombre de la descripción:** `Casa Julian Web & Bot`

#### Origen (Lo que viene de Internet):

- **Protocolo:** `HTTPS`
- **Nombre de host:** `casajuliantolosa.synology.me`
- **Puerto:** `3443` *(o `443` si tu router lo permite)*
- **Habilitar HSTS:** ✅ Marcado

#### Destino (Hacia dónde lo envía el Synology internamente):

- **Protocolo:** `HTTP`
- **Nombre de host:** `localhost`
- **Puerto:** `3000`

4. Haz clic en **Guardar**.

---

### PASO 4: Certificado SSL Gratuito de Let's Encrypt (Candado Verde 🔒)

1. En DSM, ve a **Panel de Control > Seguridad > Certificado**.
2. Comprueba que el certificado de `casajuliantolosa.synology.me` esté activo.
3. Haz clic en **Configuración** (arriba):
   - En la fila de `Casa Julian Web & Bot` (Proxy Inverso), asegúrate de que tiene asignado el certificado de **`synology.me`**.
4. Pulsa **Aceptar**.

---

### PASO 5: Abrir los Puertos en el Router del Restaurante (`192.168.110.1`)

Accede a la administración del router del restaurante y añade las reglas de redirección:

| Servicio                           | Puerto Externo (WAN) | IP Interna Synology | Puerto Interno (LAN) | Protocolo |
| :--------------------------------- | :------------------- | :------------------ | :------------------- | :-------- |
| **Panel Web & Bot HTTPS**    | `3443`             | `192.168.110.57`  | `3443`             | TCP       |
| **Base de Datos PostgreSQL** | `5433`             | `192.168.110.57`  | `5433`             | TCP       |

---

### PASO 6: Actualizar el Webhook en Meta WhatsApp Developers

1. Entra en tu panel de [Meta for Developers](https://developers.facebook.com/).
2. Ve a tu aplicación de **WhatsApp > Configuración**.
3. En la sección **Webhook / URL de devolución de llamada**, actualiza la URL:
   ```text
   https://casajuliantolosa.synology.me:3443/webhook
   ```
4. Introduce tu **Token de verificación** (`WEBHOOK_VERIFY_TOKEN`) y pulsa **Verificar y Guardar**.

---

## 🎯 Resultado Final Obtenido

- 📱 **Panel de Administración:** Accesible 24/7 en `https://casajuliantolosa.synology.me:3443/admin/` y localmente en `http://192.168.110.57:3000/admin/`.
- 🤖 **Bot de WhatsApp:** Recibe y contesta mensajes al instante desde el propio hardware del restaurante.
- 💾 **Base de Datos:** Almacenada en los discos duros con copias de seguridad automáticas en Hyper Backup.
- 💶 **Coste mensual:** **0 €**. Cero dependencias de cuotas de Render o Neon.
