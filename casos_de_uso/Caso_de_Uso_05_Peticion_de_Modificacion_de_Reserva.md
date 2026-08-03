# Caso de Uso 05: Petición de Modificación de Reserva

## 📌 Descripción General
Permite a los clientes que poseen una reserva confirmada solicitar cambios en el número de comensales, día u hora de la reserva.

> **Reglas de Verificación Progresiva:**
> 1. Ya **no se exige código de reserva**.
> 2. Se exige la comprobación conjunta de **Nombre completo** y **Teléfono de la reserva**.
> 3. Si el cliente envía ambos datos en el mismo mensaje (ej: *"Ander Urien 612345678"*), el chatbot los procesa en 1 solo paso. Si sólo envía uno, el chatbot le pide el dato que falta sin mostrar mensajes de error falsos.

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Selección en Menú Principal
* **Mensaje del Cliente:**
  > `2` (o pulsa *"2. Modificación"*)

* **Respuesta del Chatbot:**
  > 📝 **Verificación de Reserva para Modificación**
  >
  > Por favor, indícanos el **Nombre completo** y el **Número de teléfono** de la reserva (puedes escribirlos juntos en el mismo mensaje, ej: *Ander Urien 612345678*):

---

### Paso 2: Verificación de Identidad (Variantes de Entrada)

#### Variante A: Mensaje Único con Nombre y Teléfono
* **Mensaje del Cliente:**
  > `Ander Urien 612345678`
* **Procesamiento:** Extrae Nombre (*Ander Urien*) y Teléfono (*612345678*) y busca en la BD.

#### Variante B: Envío Progresivo (Primero Nombre)
* **Mensaje 1 del Cliente:** `Ander Urien`
* **Respuesta del Chatbot:**
  > ¡Gracias, **Ander Urien**! Por favor, indícanos también el **número de teléfono** con el que realizaste la reserva:
* **Mensaje 2 del Cliente:** `612345678`

#### Variante C: Envío Progresivo (Primero Teléfono)
* **Mensaje 1 del Cliente:** `612345678`
* **Respuesta del Chatbot:**
  > ¡Gracias! Por favor, indícanos el **nombre completo** a nombre de quien está la reserva:
* **Mensaje 2 del Cliente:** `Ander Urien`

---

### Paso 3: Búsqueda y Presentación de Opciones de Modificación
* **Resultado de Búsqueda en BD:** Se localiza la reserva confirmada `RES-20260815-4421`.

* **Respuesta del Chatbot (Botones de Modificación):**
  > ✏️ **Reserva Localizada:**
  > 🆔 `RES-20260815-4421` (Ander Urien, 4 comensales, 15/08/2026 a las 14:00)
  >
  > ¿Qué dato deseas modificar?
  >
  > [ 👥 Nº Comensales ]
  > [ 📅 Día de Reserva ]
  > [ 🕐 Hora de Reserva ]

---

### Paso 4: Cambio del Dato Seleccionado
* **Acción del Cliente:**
  > Pulsa **`[ 👥 Nº Comensales ]`**.

* **Respuesta del Chatbot:**
  > Indícanos el **nuevo número de comensales** (máximo 6):

* **Mensaje del Cliente:**
  > `5`

---

### Paso 5: Resumen y Confirmación de Solicitud de Cambio
* **Respuesta del Chatbot (Confirmación Interactiva):**
  > 📋 **SOLICITUD DE MODIFICACIÓN DE RESERVA**
  >
  > 🆔 **Reserva:** RES-20260815-4421
  > 👤 **Titular:** Ander Urien
  > 📊 **Cambio Solicitado:** Pasar de 4 comensales a **5 comensales**.
  >
  > ¿Deseas enviar la solicitud de modificación?
  >
  > [ ✅ Confirmar Modificación ]
  > [ ❌ Cancelar ]

---

### Paso 6: Registro de Solicitud
* **Acción del Cliente:**
  > Pulsa **`[ ✅ Confirmar Modificación ]`**.

* **Respuesta del Chatbot:**
  > ✅ **Solicitud de Modificación Enviada**
  >
  > Hemos registrado tu solicitud de modificación para la reserva `RES-20260815-4421`. Nuestro equipo de recepción la revisará y te confirmaremos el cambio a la mayor brevedad.
