# Requisitos y Especificaciones del Sistema: WhatsApp Bot Casa Julian

Este documento detalla todas las características, requisitos y especificaciones técnicas del sistema automatizado de atención por WhatsApp para el restaurante **Casa Julian**, adaptado al flujo de trabajo del negocio.

---

## 🎯 1. Objetivos del Sistema

* **Atención y Clasificación Automática:** Responder al cliente de forma inmediata mediante un menú de lista interactiva de 4 opciones.
* **Gestión Inteligente de Reservas:** Verificar disponibilidad en tiempo real contra la base de datos de reservas del restaurante.
* **Gestión de Lista de Espera:** Permitir la inscripción automatizada en lista de espera ante falta de mesa y consultar/cancelar la posición en la cola.
* **Autogestión de Reservas Existentes:** Permitir a los clientes consultar, modificar o cancelar sus reservas sin intervención humana.
* **Resolución de FAQs:** Proveer información sobre carta, horarios, ubicación, parking, mascotas, alergias y grupos.

---

## 📋 2. Requisitos Funcionales y Flujos de Conversación

### 2.1. Menú Principal (Lista Interactiva)
Al recibir un mensaje inicial, el bot responde con un menú interactivo tipo Lista con 4 opciones principales:
1. `1. QUIERO RESERVAR`
2. `2. LISTA DE ESPERA`
3. `3. TENGO RESERVA`
4. `4. PREGUNTAS FRECUENTES`

---

### 2.2. Flujo 1: "QUIERO RESERVAR"
1. **Recolección de parámetros:**
   * Solicita **Fecha** (ej. `25/10/2026`).
   * Solicita **Hora** (ej. `14:30`).
   * Solicita **Número de Comensales** (ej. `4`).
2. **Comprobación de Disponibilidad:**
   * Consulta a la base de datos del restaurante.
3. **Resultado - SI HAY Disponibilidad:**
   * Solicita datos personales: **Nombre completo**, **Teléfono**, **DNI** y **Email**.
   * Guarda la reserva en la base de datos con estado `CONFIRMADA`.
   * Muestra mensaje de confirmación y regresa al menú inicial.
4. **Resultado - NO HAY Disponibilidad:**
   * Expresa disculpas por no disponer de mesa para esa fecha/hora/comensales.
   * Ofrece inscribirse en la **Lista de Espera** (`[Sí, inscribirme]`, `[No, volver al menú]`).
   * Si acepta: Solicita **Nombre**, **Teléfono**, **DNI** y **Email**.
   * Guarda el registro en la Lista de Espera de la base de datos y finaliza regresando al menú inicial.

---

### 2.3. Flujo 2: "LISTA DE ESPERA"
1. **Identificación:**
   * Solicita **Nombre**, **Teléfono**, **DNI** y **Email** para buscar al cliente en la lista de espera.
2. **Consulta de Posición:**
   * Comprueba si el registro existe en la base de datos.
   * **Si NO existe:** Informa que no consta ninguna inscripción en la lista de espera con esos datos.
   * **Si SI existe:** Devuelve la **posición actual en la lista de espera** e indica cuántas personas tiene por delante.
3. **Acciones Disponibles:**
   * Presenta 2 botones: `[Seguir en Lista]` y `[Eliminarme de la Lista]`.
   * Si elige `[Eliminarme de la Lista]`, el registro se borra de la base de datos y se libera la posición. Regresa al menú inicial.

---

### 2.4. Flujo 3: "TENGO RESERVA"
1. **Identificación:**
   * Solicita **Nombre**, **Teléfono**, **DNI** y **Email** (o DNI/Teléfono).
2. **Búsqueda en Base de Datos:**
   * **Si NO existe:** Informa que no hay ninguna reserva asociada a esos datos.
   * **Si SI existe:** Presenta **3 Botones Interactivos**:
     * 👁️ `[VER RESERVA]`: Muestra los detalles de la reserva (Fecha, Hora, Comensales, Estado).
     * ✏️ `[MODIFICAR RESERVA]`: Permite modificar la fecha, hora o número de comensales (sujeto a disponibilidad).
     * ❌ `[CANCELAR RESERVA]`: Elimina la reserva de la base de datos, libera la disponibilidad y avisa si hay lista de espera.

---

### 2.5. Flujo 4: "PREGUNTAS FRECUENTES (FAQs)"
Muestra un submenú o lista con las consultas más habituales:
* 📜 **Carta y Menús:** Enlace directo a https://casajulian.eus/ o envío de PDF.
* 📍 **Ubicación y Cómo Llegar:** Dirección del asador en Tolosa / Madrid y mapa.
* 🕒 **Horarios de Apertura:** Días y turnos de comida y cena.
* 👥 **Gestión de Grupos:** Condiciones para reservas grandes (+8 personas).
* 🐶 **Gestión de Mascotas:** Política pet-friendly.
* 🚗 **Parking:** Opciones de aparcamiento cercanas.
* 🌾 **Alergias y Dietas:** Información sobre celíacos, alérgenos y opciones vegetarianas.

---

## 🏗️ 3. Especificaciones Técnicas y Arquitectura

### 3.1 Componentes del Código

```
 [ Cliente WhatsApp ]
         │
         ▼ (HTTPS POST /webhook)
 [ Servidor Node.js (server.js) ]
         │
         ▼
 [ botLogic.js ] ──────────────▶ [ database.js ]
         │                        (Base de datos de Reservas,
         ▼                         Disponibilidad y Lista de Espera)
 [ whatsappApi.js ]
 (Envía Menús de Lista y Botones mediante Meta Graph API v19.0)
```

1. **`server.js`:** Express HTTP Server para webhooks de Meta.
2. **`botLogic.js`:** Máquina de estados para gestionar conversaciones concurrentes por número de teléfono.
3. **`whatsappApi.js`:** Envíos de textos, botones interactivos (hasta 3 botones) y listas interactivas (hasta 10 elementos).
4. **`database.js`:** Módulo de gestión de datos (persistente en SQLite o archivo JSON estructurado) con las tablas:
   * **`reservas`**: `id`, `nombre`, `telefono`, `dni`, `email`, `fecha`, `hora`, `comensales`, `estado`.
   * **`lista_espera`**: `id`, `nombre`, `telefono`, `dni`, `email`, `fecha`, `hora`, `comensales`, `posicion`, `fecha_registro`.
   * **`disponibilidad`**: Capacidad máxima por turno/hora.

---

## 🔒 4. Estructura de Datos (Esquema de BD)

### Tabla `reservas`
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | STRING / INT | Identificador único de reserva |
| `nombre` | STRING | Nombre completo del cliente |
| `telefono` | STRING | Número de contacto |
| `dni` | STRING | Documento de identidad |
| `email` | STRING | Correo electrónico |
| `fecha` | STRING | Fecha en formato YYYY-MM-DD |
| `hora` | STRING | Hora en formato HH:MM |
| `comensales` | INT | Número de personas |
| `estado` | STRING | `CONFIRMADA`, `CANCELADA` |

### Tabla `lista_espera`
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | STRING / INT | Identificador de inscripción |
| `nombre` | STRING | Nombre completo |
| `telefono` | STRING | Teléfono |
| `dni` | STRING | DNI |
| `email` | STRING | Email |
| `fecha` | STRING | Fecha solicitada |
| `hora` | STRING | Hora solicitada |
| `comensales` | INT | Cantidad de comensales |
| `fecha_creacion` | DATETIME | Timestamp para definir el orden en la cola |
