# 📖 GUÍA MAESTRA: Despliegue Integral en Synology NAS (Base de Datos + Web + Bot)
## Asador Casa Julián Tolosa — 100% Autónomo y Sin Dependencias Externas

---

## 🎯 Objetivo del Proyecto

Alojar de forma simultánea e independiente la **Base de Datos PostgreSQL** y el **Servidor Web / Panel de Administración / Bot de WhatsApp** directamente en el servidor **Synology DiskStation DS223j** instalado en el restaurante.

### 🌟 Principales Beneficios:
- 🚫 **0€ de costes mensuales:** Cero pagos y cero suscripciones a plataformas cloud.
- ♾️ **Sin límites de cuota de datos:** Más de **6.8 TB libres** en discos duros Seagate IronWolf de uso empresarial.
- ⚡ **Rendimiento 24/7 instantáneo:** Sin "modo reposo" ni esperas de 50 segundos de arranque en frío.
- 🔒 **Soberanía y Privacidad RGPD:** Todos los chats, clientes y reservas quedan almacenados físicamente en el restaurante.
- 📶 **Doble acceso simultáneo:** 
  - **Local (Restaurante):** `http://192.168.110.57:3000/admin/` (Ultra rápido y sin consumir internet).
  - **Remoto (Exterior/Móvil):** `https://casajuliantolosa.synology.me:3443/admin/` (Conexión segura SSL).

---

## 📊 Ficha Técnica del Entorno Casa Julián

| Parámetro | Valor Configurado |
| :--- | :--- |
| **Servidor NAS** | Synology DiskStation **DS223j** |
| **Sistema Operativo** | DSM 7.4.1 / 7.2 |
| **IP Fija Local Synology** | `192.168.110.57` |
| **Router del Restaurante** | `192.168.110.1` |
| **Dominio DDNS Activo** | **`casajuliantolosa.synology.me`** |
| **Herramienta de Despliegue** | **Container Manager (Docker)** |

---

## 🏗️ Mapa de Arquitectura en Synology

```
                            ┌─────────────────────────────────────────────────────────────┐
                            │               SYNOLOGY DS223j (192.168.110.57)              │
                            │                                                             │
 Internet / Meta WhatsApp ──┼──► [Router 192.168.110.1]                                   │
                            │         │ (Puerto 3443 WAN)                                 │
                            │         ▼                                                   │
                            │    🔒 Proxy Inverso DSM (HTTPS con SSL Let's Encrypt)       │
                            │         │                                                   │
                            │         ▼ (Redirige a puerto interno 3000)                  │
                            │    📦 Contenedor Web & Bot (casa-julian-web-bot)            │
                            │         │                                                   │
                            │         ▼ (Conexión directa interna a 192.168.110.57:5433)  │
                            │    📦 Contenedor BD (casa-julian-postgres)                  │
                            │         │                                                   │
                            │         ▼                                                   │
                            │    💾 Carpeta Persistente: /docker/postgres_casa_julian     │
                            └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 PASO A PASO: Despliegue Completo de la A a la Z

---

### FASE 1: Configurar la Base de Datos (PostgreSQL)

1. **Crear la carpeta en File Station:**
   - Abre **File Station** en DSM.
   - Entra en la carpeta compartida **`docker`**.
   - Crea una nueva carpeta llamada: `postgres_casa_julian` (Ruta: `/volume1/docker/postgres_casa_julian`).

2. **Crear el contenedor en Container Manager:**
   - Abre **Container Manager > Imagen**.
   - Selecciona **`postgres:latest`** (o `postgres:16-alpine`) y pulsa **Ejecutar**.
   - **Configuración General:**
     - Nombre del contenedor: `casa-julian-postgres`
     - Habilitar el reinicio automático: ✅ **Marcado**
   - **Configuración Avanzada:**
     - **Configuración de puertos:**
       - *Puerto local:* `5433`
       - *Puerto del contenedor:* `5432`
       - *Tipo:* `TCP`
     - **Configuración de volúmenes:**
       - *Carpeta:* `/docker/postgres_casa_julian`
       - *Ruta de montaje:* `/var/lib/postgresql/data`
       - *Sólo lectura:* `No`
     - **Medio ambiente / Variables de Entorno:**
       - `POSTGRES_DB` = `casa_julian_db`
       - `POSTGRES_USER` = `casajulian_admin`
       - `POSTGRES_PASSWORD` = `CasaJulianTolosa2026!`
   - Pulsa **Siguiente** y luego **Finalizado**.

---

### FASE 2: Configurar el Servidor Web y Bot de WhatsApp

1. Abre **Container Manager > Imagen**.
2. Selecciona la imagen **`casa-julian-whatsapp-bot:latest`** y pulsa **Ejecutar**.
3. **Configuración General:**
   - Nombre del contenedor: `casa-julian-web-bot`
   - Habilitar el reinicio automático: ✅ **Marcado**
4. **Configuración Avanzada:**
   - **Configuración de puertos:**
     - *Puerto local:* `3000`
     - *Puerto del contenedor:* `3000`
     - *Tipo:* `TCP`
   - **Medio ambiente / Variables de Entorno (Environment):**
     Pulsa *+ Agregar* para definir la conexión con la base de datos y Meta:

| Variable | Valor |
| :--- | :--- |
| **`PORT`** | `3000` |
| **`DATABASE_URL`** | `postgresql://casajulian_admin:CasaJulianTolosa2026!@192.168.110.57:5433/casa_julian_db?sslmode=disable` |
| **`PHONE_NUMBER_ID`** | *(Tu ID de teléfono de WhatsApp en Meta)* |
| **`WHATSAPP_TOKEN`** | *(Tu Token de acceso permanente de Meta)* |
| **`WEBHOOK_VERIFY_TOKEN`** | `casa_julian_secure_webhook_token_2026` |
| **`BREVO_API_KEY`** | *(Clave API de Brevo para envío de emails)* |
| **`SMTP_HOST`** | `smtp-relay.brevo.com` |
| **`SMTP_PORT`** | `587` |
| **`SMTP_USER`** | *(Tu usuario SMTP)* |
| **`SMTP_PASS`** | *(Tu contraseña SMTP)* |
| **`STAFF_EMAIL`** | `info@casajulianmg.com` |

5. Pulsa **Siguiente** y luego **Finalizado**.

---

### FASE 3: Volcar los Datos y Crear las Tablas (Migración)

Para restaurar todos los chats, clientes, tarjetas regalo y solicitudes de la copia de seguridad `db.json` en la base de datos del Synology:

1. En tu ordenador de desarrollo (o mediante SSH en el Synology):
2. Asegúrate de tener en el archivo `.env`:
   ```env
   DATABASE_URL=postgresql://casajulian_admin:CasaJulianTolosa2026!@192.168.110.57:5433/casa_julian_db?sslmode=disable
   ```
3. Ejecuta el script de inicialización:
   ```bash
   node initPostgres.js
   ```
4. Verás el mensaje: `✅ Todas las tablas e índices creados con éxito y datos migrados.`

---

### FASE 4: Acceso HTTPS Seguro con Certificado SSL (Proxy Inverso)

Para poder entrar al panel de administración desde cualquier móvil o lugar fuera del restaurante con el candado verde de seguridad:

1. En Synology DSM, ve a **Panel de Control > Portal de inicio de sesión > Avanzado**.
2. Pulsa en el botón **Proxy Inverso** y luego en **Crear**:
   - **Nombre de la descripción:** `Casa Julian Panel Web`
   - **Origen:**
     - Protocolo: `HTTPS`
     - Nombre de host: `casajuliantolosa.synology.me`
     - Puerto: `3443`
     - Habilitar HSTS: ✅ Marcado
   - **Destino:**
     - Protocolo: `HTTP`
     - Nombre de host: `localhost`
     - Puerto: `3000`
3. Pulsa **Guardar**.

4. **Vincular el Certificado SSL:**
   - Ve a **Panel de Control > Seguridad > Certificado**.
   - Haz clic en **Configuración** (arriba).
   - En la línea `Casa Julian Panel Web`, asegúrate de que el certificado seleccionado sea el de **`synology.me` (Let's Encrypt)**.
   - Pulsa **Aceptar**.

---

### FASE 5: Redirección de Puertos en el Router del Restaurante (`192.168.110.1`)

Accede a la página del router del restaurante (`http://192.168.110.1`) y en **Port Forwarding / NAT** añade las siguientes reglas:

| Servicio | Puerto Externo (WAN) | IP Destino Synology | Puerto Interno (LAN) | Protocolo |
| :--- | :--- | :--- | :--- | :--- |
| **Panel Web & Webhook WhatsApp** | `3443` | `192.168.110.57` | `3443` | TCP |
| **Base de Datos PostgreSQL (Opcional)** | `5433` | `192.168.110.57` | `5433` | TCP |

---

### FASE 6: Configurar el Webhook en Meta WhatsApp Cloud API

1. Abre el panel de desarrolladores de Meta: [developers.facebook.com](https://developers.facebook.com/).
2. Entra en tu App > **WhatsApp > Configuración**.
3. En la sección **Webhook**:
   - **URL de devolución de llamada:** `https://casajuliantolosa.synology.me:3443/webhook`
   - **Token de verificación:** `casa_julian_secure_webhook_token_2026` (el mismo puesto en la variable `WEBHOOK_VERIFY_TOKEN`).
4. Haz clic en **Verificar y Guardar**.
5. Asegúrate de suscribir el campo **`messages`**.

---

### FASE 7: Copias de Seguridad Automáticas Diarias (Hyper Backup)

1. En DSM, abre la aplicación **Hyper Backup**.
2. Crea una nueva tarea de copia de seguridad (a carpeta local, disco externo USB o nube Synology C2).
3. Selecciona la carpeta compartida `/docker/postgres_casa_julian`.
4. Programa la ejecución automática todos los días a las **04:00 AM**.
5. ¡Listo! Tus datos estarán protegidos contra cualquier fallo de hardware.

---

## 📱 URLs de Acceso Finales

- **Dentro del Restaurante (Red Local / WiFi):**
  👉 `http://192.168.110.57:3000/admin/`
- **Desde el Exterior (Móvil / Casa / Fuera del restaurante):**
  👉 `https://casajuliantolosa.synology.me:3443/admin/`
- **Webhook de WhatsApp:**
  👉 `https://casajuliantolosa.synology.me:3443/webhook`

---

## ✅ Resumen del Estado del Sistema

| Componente | Antes | Ahora (Synology Autónomo) |
| :--- | :--- | :--- |
| **Base de Datos** | Neon Cloud (Límite 5 GB, bloqueos de cuota) | **Synology DS223j (6.8 TB libres, sin cuotas)** |
| **Servidor Web & Bot** | Render Free (Se duerme tras 15 min de inactividad) | **Synology DS223j (Activo 24/7 instantáneo)** |
| **Coste Mensual** | Riesgo de cobro por consumo | **0 € para siempre** |
| **Privacidad de Datos** | Servidores en EE.UU./Nube | **Discos físicos en Casa Julián (Tolosa)** |
