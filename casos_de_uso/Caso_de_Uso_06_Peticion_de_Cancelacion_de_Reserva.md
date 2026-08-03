# Caso de Uso 06: Petición de Cancelación de Reserva

## 📌 Descripción General
Permite a los clientes solicitar la cancelación de una reserva confirmada previa verificación de identidad por Nombre y Teléfono.

> **Política de Cancelación (Regla 24 Horas):**
> - **Más de 24h antes del servicio:** Cancelación sin recargo alguno.
> - **Menos de 24h antes del servicio:** El chatbot advierte que, conforme a la política del restaurante, la cancelación tardía puede conllevar un gasto de **45 € por comensal**.

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Selección en Menú Principal
* **Mensaje del Cliente:**
  > `3` (o pulsa *"3. Cancelar reserva"*)

* **Respuesta del Chatbot:**
  > ❌ **Verificación de Reserva para Cancelación**
  >
  > Por favor, indícanos el **Nombre completo** y el **Número de teléfono** de la reserva que deseas cancelar (ej: *Ander Urien 612345678*):

---

### Paso 2: Verificación de Identidad por Nombre y Teléfono
* **Mensaje del Cliente:**
  > `Ander Urien 612345678` (o en 2 pasos si envía solo uno primero).

* **Evaluación en BD:** Se encuentra la reserva `RES-20260815-4421` (4 comensales, 15/08/2026 a las 14:00).

---

### Paso 3: Advertencia de Política y Confirmación

#### Caso A: Cancelación con MÁS de 24 horas de antelación
* **Respuesta del Chatbot:**
  > 📋 **CONFIRMACIÓN DE CANCELACIÓN DE RESERVA**
  >
  > 🆔 **Reserva:** RES-20260815-4421
  > 👤 **Titular:** Ander Urien
  > 📅 **Fecha:** 15/08/2026 a las 14:00 (4 comensales)
  >
  > ✅ **Aviso:** La cancelación se realiza con más de 24 horas de antelación. No se aplicará ningún gasto por cancelación.
  >
  > ¿Deseas confirmar la cancelación?
  >
  > [ ✅ Confirmar Cancelación ]
  > [ ❌ Mantener Reserva ]

#### Caso B: Cancelación con MENOS de 24 horas de antelación
* **Respuesta del Chatbot:**
  > 📋 **CONFIRMACIÓN DE CANCELACIÓN DE RESERVA**
  >
  > 🆔 **Reserva:** RES-20260815-4421
  > 👤 **Titular:** Ander Urien
  > 📅 **Fecha:** Hoy a las 14:00 (4 comensales)
  >
  > 🚨 **ATENCIÓN - Faltan menos de 24h:**
  > Según la política del restaurante, la cancelación a menos de 24h puede conllevar un recargo de **45 € por comensal** (Total: 4 × 45 € = **180 €**).
  >
  > ¿Deseas enviar la solicitud de cancelación?
  >
  > [ ✅ Confirmar Cancelación ]
  > [ ❌ Mantener Reserva ]

---

### Paso 4: Finalización del Trámite
* **Acción del Cliente:**
  > Pulsa **`[ ✅ Confirmar Cancelación ]`**.

* **Respuesta del Chatbot:**
  > ✅ **Solicitud de Cancelación Registrada**
  >
  > Tu solicitud de cancelación para la reserva `RES-20260815-4421` ha sido registrada. La recepción procesará la liberación de la mesa y se te enviará la confirmación definitiva.
  >
  > ----------------------------------
  > 📍 **Asador Casa Julián**
  > Santa Klara Kalea 6, 20400 Tolosa, Gipuzkoa
  > 📞 **Atención Telefónica:** Martes a Domingo: 11:00 - 12:30 & 15:30 - 17:00
  > 🌐 https://casajulian.eus
