# Guía Paso a Paso: Instalación en Synology NAS (192.168.110.57) con DDNS, Reverse Proxy y SSL Let's Encrypt (Opción A)

Esta guía detalla el proceso exacto para desplegar el **WhatsApp Chatbot & Panel CMS de Casa Julián** en el **Synology NAS (`192.168.110.57`)**, configurar el dominio DDNS gratuito de Synology, generar el certificado SSL Let's Encrypt y enlazarlo con Meta WhatsApp Cloud API.

---

## 📋 Resumen de la Arquitectura

```
                        [ Clientes en WhatsApp ]
                                   │
                                   ▼
                   [ Meta WhatsApp Cloud API ]
                                   │  (Webhook HTTPS seguro: https://casajulian.synology.me/webhook)
                                   ▼
                       [ Router del Restaurante ]
                            (Puerto 443 abierto)
                                   │
                                   ▼
                    [ Synology NAS: 192.168.110.57 ]
                    ├── Reverse Proxy (SSL Let's Encrypt)
                    │   https://casajulian.synology.me:443 ──> http://localhost:3000
                    │
                    └── Container Manager (Docker)
                        └── Contenedor: casa-julian-whatsapp-bot (Puerto 3000)
```

---

## 🛠️ FASE 1: Preparación de Archivos en el Synology NAS

1. **Crear o abrir la carpeta en el NAS**:
   - En DSM, abre **File Station**.
   - Ve a la carpeta `docker` (o crea una carpeta compartida llamada `docker`).
   - Dentro, crea la subcarpeta: `casa-julian-whatsapp-chatbot` (Ruta: `/volume1/docker/casa-julian-whatsapp-chatbot`).

2. **Copiar los archivos del proyecto al NAS**:
   Copia todos los archivos de tu proyecto local a esa carpeta del NAS:
   - `server.js`, `package.json`, `Dockerfile`, `docker-compose.yml`
   - Carpetas: `bot/`, `db/`, `public/`, `tarjetas_regalo/`, etc.
   - Archivo `.env` (asegurándote de que contiene las credenciales activas del número de prueba).

---

## 🐳 FASE 2: Despliegue en Container Manager (Docker)

1. En el panel DSM de Synology, abre la aplicación **Container Manager**.
2. En el menú lateral izquierdo, haz clic en **Proyecto (Project)** > **Crear**.
3. Rellena los datos:
   - **Nombre del proyecto**: `casa-julian-whatsapp`
   - **Ruta**: `/docker/casa-julian-whatsapp-chatbot`
   - **Origen**: Selecciona _Usar docker-compose.yml existente_.
4. Haz clic en **Siguiente** > **Siguiente** > **Finalizar**.
5. Synology descargará la imagen, compilará y arrancará el contenedor.
6. **Comprobación local**: Abre el navegador en cualquier ordenador conectado a la red local y entra a:
   👉 `http://192.168.110.57:3000/admin/`
   _(Deberás ver el panel de Casa Julián y el Buzón de Recepción funcionando)._

---

## 🌐 FASE 3: Configurar DDNS Gratuito en Synology

1. En DSM, ve a **Panel de Control** > **Acceso Externo** > pestaña **DDNS**.
2. Haz clic en **Agregar**.
3. Configuración:
   - **Proveedor de servicio**: `Synology`
   - **Nombre de host**: Elige un nombre para el restaurante, por ejemplo: `casajuliantolosa.synology.me` (o `casajulian.synology.me` si está libre).
   - **Correo electrónico**: Tu email o el del restaurante.
   - Marca la casilla: **✅ Solicitar un certificado de Let's Encrypt y establecerlo como predeterminado**.
4. Haz clic en **Aceptar**.
   _(Synology creará el dominio dinámico y generará el certificado SSL válido automáticamente)._

---

## 🔒 FASE 4: Configurar el Proxy Inverso (Reverse Proxy HTTPS)

1. En DSM, ve a **Panel de Control** > **Portal de Inicio de Sesión** > pestaña **Avanzado** > **Proxy Inverso**.
2. Haz clic en **Crear**.
3. Rellena la regla general:
   - **Nombre de la regla**: `Casa Julian WhatsApp Webhook`
   - **ORIGEN (Source)**:
     - Protocolo: `HTTPS`
     - Nombre de host: `casajuliantolosa.synology.me` (el dominio DDNS configurado en el paso anterior)
     - Puerto: `443`
     - Habilitar HSTS: ✅ _(opcional pero recomendado)_
   - **DESTINO (Destination)**:
     - Protocolo: `HTTP`
     - Nombre de host: `localhost` (o `192.168.110.57`)
     - Puerto: `3000`
4. Pestaña **Encabezado personalizado (Custom Header)**:
   - Haz clic en **Crear** > **WebSocket** (esto añade automáticamente los encabezados `Upgrade` y `Connection` para actualizaciones en tiempo real).
5. Haz clic en **Guardar**.

---

## FASE 5: Abrir el Puerto 443 en el Router del Restaurante (Port Forwarding)

Para que las peticiones de Meta lleguen desde Internet hasta el NAS:

1. Accede al router de la conexión a Internet del restaurante (ej. `192.168.1.1` o la IP de puerta de enlace).
2. Ve a la sección **Port Forwarding / Reenvío de Puertos / NAT**.
3. Crea la regla:
   - **Nombre**: `Synology HTTPS Webhook`
   - **Protocolo**: `TCP`
   - **Puerto Externo**: `443`
   - **IP Destino / Interna**: `192.168.110.57`
   - **Puerto Interno**: `443`
4. Guarda los cambios en el router.

---

## 📱 FASE 6: Configurar el Webhook en Meta for Developers

1. Ve a [Meta for Developers](https://developers.facebook.com/) > Tu App de Casa Julián > **WhatsApp** > **Configuración (Configuration)**.
2. En la sección **Webhook**, haz clic en **Editar (Edit)**.
3. Rellena:
   - **URL de devolución de llamada (Callback URL)**:
     `https://casajuliantolosa.synology.me/webhook`>
   - **Identificador de verificación (Verify Token)**:
     `casajulian123` _(el valor configurado en tu archivo `.env`)_
4. Haz clic en **Verificar y Guardar (Verify and Save)**.
5. En la sección **Campos de webhook (Webhook fields)**, haz clic en **Administrar (Manage)** y asegúrate de que el campo **`messages`** esté **Suscrito (Subscribed)**.

---

## ✅ Comprobación Final

1. Envía un mensaje desde WhatsApp al número de prueba `+1 (555) 166-7550`.
2. El bot responderá instantáneamente desde el contenedor Docker alojado en el **Synology NAS (`192.168.110.57`)**.
3. Abre el navegador en `https://casajuliantolosa.synology.me/admin/` o en `http://192.168.110.57:3000/admin/`:
   - Verás los mensajes recibidos en el historial.
   - Las solicitudes de reserva y las alertas de tarjetas inactivas llegarán en vivo al Buzón de Recepción.
