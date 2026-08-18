# Guía de Despliegue en Producción: Synology NAS (192.168.110.57)

Documento técnico y de arquitectura para el despliegue del sistema **Casa Julián WhatsApp Chatbot & Panel CMS** en un servidor **Synology NAS (Container Manager / Docker)** en red local y su exposición segura a la API de Meta (WhatsApp).

---

## 1. ¿Es una buena idea utilizar Synology NAS para este proyecto?

**Sí, es una EXCELENTE idea.** Alojar el bot en un Synology NAS local (`192.168.110.57`) ofrece múltiples ventajas estratégicas para un restaurante:

### ✅ Ventajas Principales:
1. **Disponibilidad 24/7 sin coste mensual de servidores cloud:** El NAS siempre está encendido, consumiendo muy poca energía y amortizando la inversión en hardware que ya tiene el restaurante.
2. **Soporte Docker Nativo (Container Manager):** El proyecto ya está completamente dockerizado con `Dockerfile` y `docker-compose.yml`. En Synology se levanta con un solo clic o comando.
3. **Acceso local ultra-rápido para Recepción:** Todos los ordenadores, TPVs o tablets conectados al Wi-Fi / red de Casa Julián pueden acceder al panel web directamente en `http://192.168.110.57:3000/admin/` sin latencia y con máxima velocidad.
4. **Persistencia y Copias de Seguridad (Backups):** Synology incluye herramientas automáticas de copia (Hyper Backup, Snapshot Replication) para salvaguardar la base de datos de reservas, tarjetas y solicitudes sin esfuerzo.
5. **Privacidad y Control Total:** Toda la información de clientes, historiales y reservas reside físicamente dentro del restaurante.

---

## 2. Requisito Fundamental: Exposición del Webhook de Meta (HTTPS)

Para que Meta (WhatsApp) pueda enviar los mensajes que escriben los clientes hacia nuestro servidor en el Synology NAS, **Meta exige una URL pública con HTTPS válida (puerto 443)**.

Como el Synology NAS tiene una IP privada local (`192.168.110.57`), existen tres formas recomendadas para conectarlo con Meta:

### 🔹 Opción A: Synology QuickConnect / DDNS + Reverse Proxy + Certificado Let's Encrypt Gratuito (La más profesional)
* Synology incluye gratis su propio servicio de dominio dinámico (ej. `casajulian.synology.me`).
* En el panel DSM de Synology (*Panel de Control > Seguridad > Certificado*), se genera un certificado SSL gratuito de Let's Encrypt.
* En *Panel de Control > Portal de Inicio de Sesión > Proxy Inverso*, se crea una regla:
  * **Origen:** `https://casajulian.synology.me:443`
  * **Destino:** `http://localhost:3000` (o `http://192.168.110.57:3000`)
* En el router del restaurante solo se abre/redirige el puerto 443 hacia la IP del NAS (`192.168.110.57`).
* **URL en Meta Webhook:** `https://casajulian.synology.me/webhook`

### 🔹 Opción B: Cloudflare Tunnel (Zero Trust - La más segura, sin abrir puertos en el router)
* Se instala el contenedor oficial de Cloudflare (`cloudflared`) dentro del Synology.
* Crea un túnel cifrado saliente directo a un subdominio propio (ej. `bot.casajulian.com` o `whatsapp.casajulian.com`).
* **Ventaja:** No requiere abrir ningún puerto en el router de la empresa ni configurar IP fija.
* **URL en Meta Webhook:** `https://bot.casajulian.com/webhook`

### 🔹 Opción C: Ngrok Pro / Túnel Comercial
* Se ejecuta un servicio como ngrok con dominio reservado en el NAS.
* Fácil de poner en marcha, ideal para transiciones o pruebas avanzadas.

---

## 3. Pasos para Desplegar el Proyecto en Synology NAS

### Paso 1: Copiar los Archivos del Proyecto al NAS
En la captura vemos que ya se ha creado la carpeta compartida en la unidad de red:
`\\192.168.110.57\home\casa-julian-whatsapp-chatbot` (o en la carpeta `/volume1/docker/casa-julian-whatsapp`).

Asegurarse de que están incluidos:
* Código fuente completo (`server.js`, `whatsappApi.js`, `bot/`, `public/`, `db/`, etc.)
* Archivo `.env` con las credenciales de producción de Meta (`WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `ADMIN_PASSWORD`, etc.)
* `docker-compose.yml` y `Dockerfile`

### Paso 2: Configuración en Container Manager (Docker) de DSM
1. Abrir **Container Manager** en la interfaz web de Synology DSM.
2. Ir a **Proyecto (Project)** > **Crear**.
3. Asignar un nombre: `casa-julian-whatsapp`.
4. Seleccionar la ruta donde están los archivos: `/volume1/docker/casa-julian-whatsapp-chatbot`.
5. Seleccionar la opción de usar el archivo existente `docker-compose.yml`.
6. En el archivo `docker-compose.yml`, configurar el entorno de producción:
```yaml
name: casa-julian-docker

services:
  whatsapp-bot-admin:
    build:
      context: .
      dockerfile: Dockerfile
    image: casa-julian-whatsapp-bot:latest
    container_name: casa-julian-whatsapp-bot
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - PORT=3000
      - NODE_ENV=production
    volumes:
      - .:/app
      - /app/node_modules
```
7. Hacer clic en **Siguiente** y luego en **Finalizar (Construir y levantar proyecto)**.

---

## 4. Arquitectura de Acceso en Casa Julián

```
+-----------------------------------------------------------------------------------+
|                                 CLIENTES DE WHATSAPP                              |
+-----------------------------------------------------------------------------------+
                                          │
                                          │ (Mensajes WhatsApp)
                                          ▼
+-----------------------------------------------------------------------------------+
|                        META CLOUD API (+34 943 67 14 17)                          |
+-----------------------------------------------------------------------------------+
                                          │
                                          │ Webhook HTTPS Seguro (Let's Encrypt / Cloudflare)
                                          ▼
+-----------------------------------------------------------------------------------+
|                        SYNOLOGY NAS (192.168.110.57)                              |
|                                                                                   |
|  ┌─────────────────────────────────────────────────────────────────────────────┐  |
|  │                  CONTAINER DOCKER: casa-julian-whatsapp-bot                 │  |
|  │                                                                             │  |
|  │   - Puerto Interno: 3000                                                    │  |
|  │   - Motor Node.js: Chatbot + WhatsApp Cloud API                             │  |
|  │   - Panel Web CMS & Buzón: /admin/                                          │  |
|  │   - Base de Datos Persistente: PostgreSQL / db.json                         │  |
|  └─────────────────────────────────────────────────────────────────────────────┘  |
+-----------------------------------------------------------------------------------+
         ▲                                                           ▲
         │                                                           │
         │ Red Local (192.168.110.57:3000)                           │ Red Local / VPN
         │                                                           │
+───────────────────────────+                               +───────────────────────────+
|     TPV / PC RECEPCIÓN    |                               |     TABLET / MÓVIL SALA   |
| (Atención Buzón & Llamadas|                               | (Consulta de Reservas)    |
+───────────────────────────+                               +───────────────────────────+
```

---

## 5. Recomendaciones de Rendimiento y Seguridad

1. **Memoria y CPU:** El bot Node.js consume muy pocos recursos (apenas ~80 MB de RAM y menos del 1% de CPU), por lo que cualquier modelo de Synology NAS con procesador Intel o Realtek lo ejecutará con holgura.
2. **Reinicio automático:** Mantener la directiva `restart: always` en Docker para que si el NAS se reinicia o sufre un corte de luz, el bot vuelva a arrancar automáticamente en segundos.
3. **Copias de Seguridad:** Activar una tarea periódica de copia de la carpeta de la base de datos (`db.json` o volumen Postgres) hacia Synology C2 Cloud o disco externo USB.
4. **Acceso Seguro para el Personal:** El panel `/admin/` cuenta con autenticación por contraseña (`ADMIN_PASSWORD`). Para mayor seguridad, el acceso administrativo solo se permite desde la red local o mediante VPN del restaurante.
