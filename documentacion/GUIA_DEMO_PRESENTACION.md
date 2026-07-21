# 🚀 Guía de Presentación y Demo en Vivo - Bot WhatsApp Casa Julian

Esta guía contiene la checklist de preparación y el guion paso a paso para la demostración de mañana a las 9:30 AM.

---

## 📋 Checklist de Preparación (Antes de las 9:30 AM)

### 1. Verificar Datos en `.env`

Asegúrate de que el archivo [**`.env`**](file:///c:/Dev/05_Projects/Professional/casa-julian-whatsapp/.env) tenga los valores copiados de Meta:

* `WHATSAPP_TOKEN`: Token temporal o permanente de Meta.
* `PHONE_NUMBER_ID`: Identificador de número de teléfono de Meta.
* `WEBHOOK_VERIFY_TOKEN`: `casajulian123`

### 2. Arrancar el Servidor Node.js

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
node server.js
```

*Debe mostrar:* `🚀 Servidor de WhatsApp Bot para Casa Julian corriendo en http://localhost:3000`

### 3. Exponer el Servidor a Internet (ngrok)

En una segunda terminal, ejecuta:

```bash
ngrok http 3000
```

*Copia la URL HTTPS generada (ejemplo: `https://xxxx.ngrok-free.app`).*

### 4. Verificar Webhook en Meta Developers

* Ve a **Meta Developers > WhatsApp > Configuración**.
* Pega la URL de ngrok agregando `/webhook` al final: `https://xxxx.ngrok-free.app/webhook`.
* Token de verificación: `casajulian123`.
* Guarda y verifica que esté suscrito al evento **`messages`**.
* Asegúrate de agregar el número `+34 664037707` en la sección "Para" (destinatarios de prueba) de Meta.

---

## 🎬 Guion de la Demostración Paso a Paso

Sigue esta secuencia durante la presentación para impresionar a tus clientes mostrando el potencial completo del bot:

### Paso 1: Saludo e Inicio

1. Abre WhatsApp en tu móvil y envía **"Hola"** al número de prueba de WhatsApp Business de Meta.
2. **Lo que verán:** El bot responde al instante con la bienvenida oficial y una **Lista Interactiva** con el botón *"Ver Opciones"*.
3. Pulsa *"Ver Opciones"* para desplegar las 4 opciones principales.

---

### Paso 2: Demostrar "1. QUIERO RESERVAR" (Reserva Exitosa)

1. Selecciona la opción **`1. QUIERO RESERVAR`**.
2. Escribe la fecha: `25/10/2026`.
3. Escribe la hora: `14:30`.
4. Escribe comensales: `4`.
5. El bot dirá **"¡Tenemos disponibilidad!"** y te pedirá tus datos:
   * Nombre: `Mikel Urkizu`
   * Teléfono: `664037707`
   * DNI: `12345678Z`
   * Email: `mikel@example.com`
6. **Resultado:** El bot emite una **Confirmación de Reserva con Código Único** (`RES-XXXXXX`).

---

### Paso 3: Demostrar "3. TENGO RESERVA" (Autogestión)

1. Envía *"Hola"* o pulsa el menú principal y elige **`3. TENGO RESERVA`**.
2. Escribe tu DNI `12345678Z` o teléfono `664037707`.
3. **Lo que verán:** El bot localiza la reserva y muestra 3 botones interactivos:
   * 👁️ **`[VER RESERVA]`**: Muestra la fecha, hora y comensales recién reservados.
   * ✏️ **`[MODIFICAR]`**: Permite cambiar hora o personas si fuera necesario.
   * ❌ **`[CANCELAR]`**: Pulsa cancelar para demostrar que se libera la mesa al instante.

---

### Paso 4: Demostrar Sin Disponibilidad y "2. LISTA DE ESPERA"

1. Selecciona **`1. QUIERO RESERVAR`**.
2. Pon una cantidad alta de comensales para simular sin disponibilidad (ej: `25` personas).
3. **Lo que verán:** El bot disculpa la falta de sitio y te ofrece el botón **`[Inscribirme en Espera]`**.
4. Pulsa el botón y pon tus datos (*Nombre, Teléfono, DNI, Email*).
5. **Resultado:** El bot te asigna la **Posición #1 en la Lista de Espera**.
6. Luego ve al menú **`2. LISTA DE ESPERA`**, pon tu DNI y demuestra cómo te muestra cuántas personas hay delante y la opción de **`[Eliminarme de lista]`**.

---

### Paso 5: Demostrar "4. PREGUNTAS FRECUENTES"

1. Selecciona **`4. PREGUNTAS FRECUENTES`**.
2. Pulsa *"Ver Preguntas"* y selecciona **`📜 Carta y Menús`**.
3. **Resultado:** Envía el enlace directo a la web oficial `https://casajulian.eus/`.
4. Muestra otras opciones como **`📍 Ubicación`** o **`🕒 Horarios`**.

---

## 💡 Argumentos Clave para la Reunión

* **Cero Comisiones:** El restaurante es dueño del software, sin cuotas mensuales a intermediarios.
* **Reducción de Llamadas:** El 80% de las dudas (horarios, ubicación, reservas básicas) se responden solas sin interrumpir el servicio en sala.
* **Base de Datos Organizada:** Todas las solicitudes quedan guardadas de forma estructurada en la base de datos `db.json` (que luego puede conectarse al programa de gestión del restaurante).
