# 📖 DOCUMENTACIÓN TÉCNICA, ARQUITECTURA Y GUÍA DE PRODUCCIÓN

## Sistema de Gestión Automatizada de Reservas por WhatsApp - Asador Casa Julian

---

## 1. 📌 Resumen Ejecutivo del Proyecto

El sistema desarrollado para el **Asador Casa Julian de Tolosa / Madrid** es una plataforma conversacional inteligente de nivel industrial integrada con la **API Cloud de WhatsApp Business de Meta**, **PostgreSQL (Neon.tech)** y un motor multicanal de notificaciones (Email + SMS + WhatsApp).

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
                  │   Meta WhatsApp Cloud API (v20.0)        │
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
│ PostgreSQL (Neon.tech) │ │ Motor i18n (10 Langs)│ │ Notificaciones (Nodemailer│
│ Clientes / Reservas /  │ │ ES, EU, EN, FR, DE,  │ │ Email HTML + SMS)      │
│ Lista de Espera        │ │ NL, BE, ZH, JA, RU   │ │                        │
└────────────────────────┘ └──────────────────────┘ └────────────────────────┘
```

### Componentes Clave:

1. **Servidor Backend (`server.js`):** Express.js escuchando peticiones Webhook GET (verificación Meta) y POST (mensajes entrantes `processMessage`).
2. **Motor de Lógica (`botLogic.js`):** Máquina de estados conversacional que gestiona los 5 flujos principales y mantiene el contexto por usuario.
3. **Capa de Datos (`database.js` + `schema.sql`):** Conector a PostgreSQL en la nube con tablas relacionales de clientes, reservas e índices de disponibilidad real por turno.
4. **Motor Internacional (`i18n.js`):** Diccionario multilingüe de 10 idiomas traducidos profesionalmente.
5. **Módulo de Notificaciones (`notifications.js`):** Envíos automáticos por Email en HTML responsivo y SMS.
6. **Módulo API de Meta (`whatsappApi.js`):** Cliente HTTP para mensajes de texto, listas desplegables interactivas (hasta 10 filas) y botones de respuesta rápida (hasta 3 botones).

---

## 3. 🌐 Funcionalidades y Flujos de Conversación

### 3.1. Selección Inicial de Idioma (10 Idiomas)

El bot presenta un menú desplegable interactivo profesional con 10 idiomas:

- 🇪🇸 **Español**
- 🇪🇺 **Euskara** (EUS Euskara)
- 🇬🇧 **English**
- 🇫🇷 **Français**
- 🇩🇪 **Deutsch** (Alemán)
- 🇳🇱 **Nederlands** (Holandés)
- 🇧🇪 **Belgisch (NL/FR)** (Belga)
- 🇨🇳 **中文** (Chino)
- 🇯🇵 **日本語** (Japonés)
- 🇷🇺 **Русский** (Ruso)

### 3.2. Horarios y Turnos Oficiales de Casa Julian

De acuerdo con las especificaciones de capacidad y los turnos reales:
* **Comidas (Martes a Domingo):**
  * **1º Turno:** `12:30`, `13:00`, `13:30`, `14:00` *(Capacidad compartida: 40 comensales)*
  * **2º Turno:** `15:15` *(Capacidad: 20 comensales)*
* **Cenas (Viernes y Sábado):**
  * **Turno Cenas:** `20:00`, `20:30`, `21:00`, `21:30` *(Capacidad compartida: 60 comensales)*
* **Lunes:** 🛑 **CERRADO** por descanso semanal.

### 3.3. Flujo 1: QUIERO RESERVAR

1. Solicitud de **Fecha** (validación en formato DD/MM/AAAA).
2. **Comprobación Previa de Disponibilidad por Turno:** El sistema evalúa en tiempo real los turnos del día y muestra **únicamente los turnos con plazas libres disponibles** mediante una Lista Interactiva desplegable (`Elegir Turno`).
3. Solicitud de **Comensales**.
4. Registro de datos (Nombre, Teléfono, DNI, Email, Idioma preferido).
5. Confirmación inmediata por WhatsApp, Email HTML y SMS.

### 3.4. Flujo 2: TENGO RESERVA

1. Consulta por DNI, Teléfono o Email.
2. **Soporte Multi-Reserva con Paginación Interactiva:** Si un cliente tiene múltiples reservas activas, el bot utiliza una lista interactiva paginada (`▶️ Ver más`, `◀️ Anterior`).
3. Menú interactivo de opciones sobre la reserva localizada:
   - `1. VER RESERVA`
   - `2. MODIFICAR RESERVA`
   - `3. CANCELAR RESERVA`
   - `4. MENÚ PRINCIPAL`

### 3.5. Flujo 3: LISTA DE ESPERA

1. Inserción automática en cola en caso de aforo completo.
2. Consulta de posición exacta.
3. **Liberación y Notificación Automática:** Ante cualquier cancelación, el sistema notifica inmediatamente al primer cliente en lista de espera por WhatsApp, Email y SMS.

### 3.6. Flujo 4: PREGUNTAS FRECUENTES

Menú interactivo con información sobre Carta, Ubicación (Tolosa y Madrid), Horarios, Grupos, Aparcamiento y Alergias/Gluten.

### 3.7. Flujo 5: VER DISPONIBILIDAD

Muestra los próximos turnos disponibles en el Asador Casa Julian escaneando hasta 120 días en adelante.

---

## 4. 🔄 Procedimiento para Paso a Producción (Número Oficial Casa Julian)

Tras la demo, para migrar del número de pruebas de Meta al **número oficial de Casa Julian**:

1. **Alta en Meta Business Manager:** Registrar el número oficial en la consola de Meta Developers.
2. **Generación de Permanent Token:** Crear un System User con permisos `whatsapp_business_messaging` y token sin expiración.
3. **Actualización de Variables en Render:**
   - Cambiar `WHATSAPP_TOKEN` en Render.com por el token permanente.
   - Cambiar `PHONE_NUMBER_ID` por el ID del número oficial de Casa Julian.
4. **Suscripción de Webhook:** Activar los eventos `messages` en la cuenta oficial de WhatsApp Business.
