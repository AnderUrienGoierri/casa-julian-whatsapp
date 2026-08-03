# Caso de Uso 03: Reserva con Tarjeta de Regalo (Menú Tradición)

## 📌 Descripción General
Este flujo permite a los clientes que poseen un código de Tarjeta de Regalo (Menú Tradición) completar su reserva directamente desde WhatsApp sin salir del chatbot.

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Selección de Tarjeta Regalo y Elección de Gestión
* **Acción del Cliente:**
  > Selecciona la opción `1. Hacer una reserva` y pulsa el botón **`[ 💳 Sí, tengo una ]`**.

* **Respuesta del Chatbot (Menú Interactivo):**
  > 💳 **Tarjeta de Regalo (Menú Tradición)**
  >
  > ¿Qué gestión deseas realizar?
  >
  > [ 📅 Reservar ]   [ ⏳ Ver fecha caducidad ]

* **Si pulsa `[ 📅 Reservar ]`:**
  > 🎁 **Menú Tradición (1/7)**
  >
  > Indícanos el número de tu tarjeta regalo:

* **Si pulsa `[ ⏳ Ver fecha caducidad ]`:**
  > ⏳ **Consulta de Caducidad**
  >
  > Por favor, indícanos tu nombre y el número de tu tarjeta regalo para consultar la fecha de caducidad:

---

### Paso 2: Validación del Código de Tarjeta (al Reservar)
* **Mensaje del Cliente:**
  > `TRAD-982341`

* **Evaluación de la BD (Caso A - Código Válido):**
  - El sistema verifica que el código exista, esté en estado `ACTIVA` y no haya caducado.
  - **Respuesta del Chatbot:**
    > ✅ **Tarjeta Validada:** Código `TRAD-982341` (Menú Tradición de Casa Julián).
    >
    > **Paso 1/6:** ¿Para cuántos comensales es la reserva? (Máximo 6 personas por mesa):

* **Evaluación de la BD (Caso B - Código Inválido o Consumido):**
  - **Respuesta del Chatbot:**
    > ⚠️ **El código introducido ("TRAD-000000") no es válido, ha expirado o ya ha sido utilizado.**
    >
    > Por favor, comprueba el código e inténtalo de nuevo o ponte en contacto con recepción.

---

### Paso 3: Selección de Comensales
* **Mensaje del Cliente:**
  > `4`

* **Verificación de Regla de Negocio (Máximo 6 Comensales):**
  - Si el cliente escribe más de 6 (ej. `8`):
    > ⚠️ **Atención:** En Casa Julián no aceptamos reservas de más de 6 comensales por WhatsApp/Web. Para grupos mayores de 6 personas, por favor ponte en contacto directamente por teléfono.
  - Si el valor es de 1 a 6:
    - **Respuesta del Chatbot:**
      > **Paso 2/6:** Indica la **fecha** deseada para la reserva (formato DD/MM/AAAA, ej: *15/08/2026*):

---

### Paso 4: Selección de Fecha y Turno
* **Mensaje del Cliente:**
  > `15/08/2026`

* **Respuesta del Chatbot:**
  > **Paso 3/6:** Selecciona el turno preferido:
  >
  > [ ☀️ Comida (Almuerzo) ]
  > [ 🌙 Cena ]

---

### Paso 5: Selección de Hora
* **Acción del Cliente:**
  > Pulsa **`[ ☀️ Comida (Almuerzo) ]`**.

* **Respuesta del Chatbot (Botones de Horas Disponibles):**
  > **Paso 4/6:** Selecciona la hora deseada:
  >
  > [ 🕐 13:30 ]
  > [ 🕐 14:00 ]
  > [ 🕐 14:30 ]

---

### Paso 6: Datos del Titular
* **Acción del Cliente:**
  > Pulsa **`[ 🕐 14:00 ]`**.

* **Respuesta del Chatbot:**
  > **Paso 5/6:** Indícanos el **Nombre completo** del titular de la reserva:

* **Mensaje del Cliente:**
  > `Ander Urien Telleria`

* **Respuesta del Chatbot:**
  > Indícanos tu **correo electrónico** (opcional, para enviarte la confirmación por email):
  >
  > [ ❌ Omitir Email ]

---

### Paso 7: Alergias o Intolerancias
* **Acción del Cliente:**
  > Pulsa **`[ ❌ Omitir Email ]`** (o escribe su email).

* **Respuesta del Chatbot:**
  > **Paso 6/6:** ¿Hay alguna alergia, intolerancia alimentaria u observación especial que debamos tener en cuenta? (Si no hay ninguna, escribe *"Ninguna"* o *"No"*):

---

### Paso 8: Resumen y Confirmación Final
* **Mensaje del Cliente:**
  > `Ninguna`

* **Respuesta del Chatbot (Resumen Interactivo):**
  > 📋 **RESUMEN DE RESERVA (MENÚ TRADICIÓN)**
  > 
  > 👤 **Titular:** Ander Urien Telleria
  > 📞 **Teléfono:** 34664037707
  > 💳 **Código Tarjeta:** TRAD-982341
  > 📅 **Fecha y Hora:** 15/08/2026 a las 14:00
  > 👥 **Comensales:** 4 personas
  > 📧 **Email:** N/A
  > 
  > ¿Deseas confirmar la reserva?
  >
  > [ ✅ Confirmar Reserva ]
  > [ ❌ Cancelar ]

---

### Paso 9: Confirmación Exitosa
* **Acción del Cliente:**
  > Pulsa **`[ ✅ Confirmar Reserva ]`**.

* **Acciones del Chatbot:**
  1. Registra la reserva en PostgreSQL Neon y `db.json` con estado `CONFIRMADA`.
  2. Actualiza la tarjeta regalo a estado `CANJEADA`.
  3. Envía notificación por email a recepción.

* **Respuesta del Chatbot:**
  > 🎉 **¡RESERVA CONFIRMADA CON ÉXITO!**
  >
  > 🆔 **Código de Reserva:** `RES-20260815-4421`
  > 📅 **Fecha:** 15/08/2026 a las 14:00
  > 👤 **Nombre:** Ander Urien Telleria
  > 
  > ¡Te esperamos en Asador Casa Julián!
