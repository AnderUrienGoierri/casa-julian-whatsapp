# 📖 DOCUMENTACIÓN TÉCNICA, ARQUITECTURA Y GUÍA DE PRODUCCIÓN
## Sistema de Gestión Automatizada de Reservas por WhatsApp - Asador Casa Julian

---

## 1. 📌 Resumen Ejecutivo del Proyecto

El sistema desarrollado para el **Asador Casa Julian de Tolosa / Madrid** es una plataforma conversacional inteligente de nivel industrial integrada con la **API Cloud de WhatsApp Business de Meta**, **PostgreSQL** y un motor multicanal de notificaciones (Email + SMS + WhatsApp).

Permite automatizar el 100% de la atención a clientes para reservas, consultas de disponibilidad, gestión de listas de espera y resolución de preguntas frecuentes las **24 horas al día, los 7 días de la semana, sin intervención humana**.

---

## 2. 🏗️ Arquitectura Técnica del Sistema

El sistema está desplegado en la nube bajo una arquitectura desacoplada, escalable e indestructible:

```
                  ┌──────────────────────────────────────────┐
                  │    Cliente (Móvil / WhatsApp App)       │
                  └────────────────────┬─────────────────────┘
                                       │
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │   Meta WhatsApp Cloud API (v19.0)        │
                  └────────────────────┬─────────────────────┘
                                       │ (Webhook HTTPS)
                                       ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │  Servidor Node.js / Express 24/7 (Desplegado en Render.com)     │
     │  URL: https://casa-julian-whatsapp-bot.onrender.com/webhook      │
     └──────┬──────────────────────────┬─────────────────────────┬──────┘
            │                          │                         │
            ▼                          ▼                         ▼
┌────────────────────────┐ ┌──────────────────────┐ ┌────────────────────────┐
│ PostgreSQL (Neon.tech) │ │ Motor i18n (8 Langs) │ │ Notificaciones (Nodemailer│
│ Clientes / Reservas /  │ │ ES, EU, EN, FR, ZH,  │ │ Email HTML + SMS)      │
│ Lista de Espera        │ │ JA, RU, AR           │ │                        │
└────────────────────────┘ └──────────────────────┘ └────────────────────────┘
```

### Componentes Clave:
1. **Servidor Backend (`server.js`):** Express.js escuchando peticiones Webhook GET (verificación Meta) y POST (mensajes entrantes).
2. **Motor de Lógica (`botLogic.js`):** Máquina de estados conversacional que gestiona los 4 flujos principales y mantiene el contexto por usuario.
3. **Capa de Datos (`database.js` + `schema.sql`):** Conector a PostgreSQL en la nube con tablas relacionales de clientes, reservas e índices de disponibilidad.
4. **Motor Internacional (`i18n.js`):** Diccionario multilingüe de 8 idiomas traducidos profesionalmente.
5. **Módulo de Notificaciones (`notifications.js`):** Envíos automáticos por Email en HTML responsivo y SMS.
6. **Módulo API de Meta (`whatsappApi.js`):** Cliente HTTP para mensajes de texto, listas desplegables interactivas (hasta 10 filas) y botones de respuesta rápida (hasta 3 botones).

---

## 3. 🌐 Funcionalidades y Flujos de Conversación

### 3.1. Selección Inicial de Idioma (8 Idiomas)
Al iniciar la conversación, el bot presenta un menú desplegable interactivo con 8 idiomas:
- 🇪🇸 **Castellano** (Español)
- 🟢 **Euskera** (Euskara)
- 🇬🇧 **English** (Inglés)
- 🇫🇷 **Français** (Francés)
- 🇨🇳 **中文** (Chino)
- 🇯🇵 **日本語** (Japonés)
- 🇷🇺 **Русский** (Ruso)
- 🇸🇦 **العربية** (Árabe)

### 3.2. Flujo 1: QUIERO RESERVAR
1. Solicitud de **Fecha** (validación en formato DD/MM/AAAA).
2. Solicitud de **Hora** (Turnos: 13:30, 14:00, 14:30, 15:00, 20:30, 21:00, 21:30, 22:00).
3. Solicitud de **Comensales**.
4. **Comprobación de Disponibilidad en tiempo real:**
   - **Si HAY disponibilidad:** Solicita Nombre, Teléfono, DNI y Email. Guarda la reserva en PostgreSQL, despacha Email HTML y SMS de confirmación.
   - **Si NO hay disponibilidad (Aforo completo de 20 personas/turno):** Muestra aviso y ofrece unirse a la **Lista de Espera**.

### 3.3. Flujo 2: LISTA DE ESPERA
1. Permite inscribirse en caso de turno lleno.
2. Muestra posición exacta en la cola (ej. *Puesto #1, 0 personas delante*).
3. **Aviso Automático por Cancelación:** Si algún cliente cancela una reserva activa, el sistema localiza al primer cliente en espera para esa fecha/hora y le envía una **notificación prioritaria inmediata por WhatsApp, Email y SMS** ofreciéndole la reserva de la mesa liberada.

### 3.4. Flujo 3: TENGO RESERVA
1. Consulta por DNI, Teléfono o Email.
2. Presenta 3 botones interactivos:
   - `[VER RESERVA]`: Muestra los detalles completos.
   - `[MODIFICAR RESERVA]`: Permite cambiar fecha, hora o comensales re-verificando el aforo.
   - `[CANCELAR RESERVA]`: Cancela la reserva, libera el aforo y dispara la notificación a la Lista de Espera.

### 3.5. Flujo 4: PREGUNTAS FRECUENTES
Menú interactivo con sub-secciones informativas:
- 📜 Carta y Menús (Enlace directo a https://casajulian.eus/)
- 📍 Ubicación (Tolosa y Madrid)
- 🕒 Horarios de Apertura
- 👥 Reservas para Grupos (>8 personas)
- 🐶 Política de Mascotas
- 🚗 Información de Parking
- 🌾 Alergias y Dietas (Gluten free)

---

## 4. 🗄️ Esquema de Base de Datos PostgreSQL

```sql
-- TABLA DE CLIENTES
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) UNIQUE NOT NULL,
    dni VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    idioma VARCHAR(10) DEFAULT 'es',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE RESERVAS
CREATE TABLE reservas (
    id VARCHAR(30) PRIMARY KEY,
    cliente_dni VARCHAR(20) REFERENCES clientes(dni) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    fecha VARCHAR(20) NOT NULL,
    hora VARCHAR(10) NOT NULL,
    comensales INT NOT NULL,
    estado VARCHAR(20) DEFAULT 'CONFIRMADA',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE LISTA DE ESPERA
CREATE TABLE lista_espera (
    id VARCHAR(30) PRIMARY KEY,
    cliente_dni VARCHAR(20) REFERENCES clientes(dni) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    fecha VARCHAR(20) NOT NULL,
    hora VARCHAR(10) NOT NULL,
    comensales INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. 🚀 Paso a Producción Definitiva (Post-Demostración)

Una vez completada y aprobada la demostración con los responsables de Casa Julian, el procedimiento para pasar al entorno oficial del restaurante consta de **3 sencillos pasos**:

### Paso 1: Configurar el Número Oficial de WhatsApp de Casa Julian
1. En **Meta Business Manager** (https://business.facebook.com/), ir a **Cuentas de WhatsApp** -> **Números de teléfono**.
2. Añadir el número telefónico oficial del restaurante (ej. `+34 943 67 14 17` o el móvil asignado al restaurante).
3. Verificar el número mediante código SMS o llamada telefónica de Meta.
4. Obtener el nuevo `PHONE_NUMBER_ID` de producción asignado por Meta.

### Paso 2: Crear el Token Permanente de Usuario del Sistema
1. En Meta Business Manager -> **Usuarios del sistema**.
2. Crear un usuario del sistema (ej. `BotCasaJulian`) con rol *Administrador*.
3. Asignar activos: Añadir la App *Casa Julian Bot* y la cuenta de WhatsApp de producción.
4. Generar Token con caducidad **Nunca** y los permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copiar el token generado.

### Paso 3: Actualizar las Variables de Entorno en Render.com
En el panel de **Render.com** -> Servicio `casa-julian-whatsapp-bot` -> **Environment**:
1. Actualizar `PHONE_NUMBER_ID` con el ID oficial.
2. Actualizar `WHATSAPP_TOKEN` con el Token Permanente de por vida.
3. Guardar cambios (`Save Changes`).

### Paso 4: Sincronización de Base de Datos Real del Restaurante
Si el restaurante utiliza un sistema de gestión de reservas existente (CoverManager, ResDiary, ElTenedor/TheFork o sistema propio):
1. **Vía API / Webhook:** El módulo `database.js` puede configurarse para realizar peticiones directamente contra la API del software de reservas del restaurante.
2. **Vía Importación SQL:** Se pueden importar las reservas existentes ejecutando un script de migración SQL a la base de datos PostgreSQL de Neon.

---

## 📄 Archivos del Proyecto

| Archivo | Descripción |
| :--- | :--- |
| [`server.js`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/server.js) | Servidor Express y Webhook endpoints |
| [`botLogic.js`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/botLogic.js) | Máquina de estados y flujos conversacionales |
| [`database.js`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/database.js) | Conector relacional PostgreSQL / db.json |
| [`i18n.js`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/i18n.js) | Motor de traducciones en 8 idiomas |
| [`notifications.js`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/notifications.js) | Despachador de Emails HTML y SMS |
| [`whatsappApi.js`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/whatsappApi.js) | Cliente Graph API de Meta para mensajes interactivos |
| [`schema.sql`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/schema.sql) | Esquema de tablas e índices SQL |
| [`render.yaml`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/render.yaml) | Blueprint de despliegue 24/7 para Render.com |
| [`.env`](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/.env) | Variables de entorno y credenciales seguras |

---

*Documentación generada para Asador Casa Julian.*
