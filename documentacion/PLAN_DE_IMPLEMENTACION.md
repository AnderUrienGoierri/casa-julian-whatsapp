# Plan de Implementación: Bot de WhatsApp Casa Julian

Este documento describe el plan ordenado para desarrollar el bot de WhatsApp según la nueva especificación detallada con base de datos, lista de espera y gestión de reservas.

---

## 📋 Resumen de Fases

```
[ Fase 1: Base de Datos & APIs ] ➔ [ Fase 2: Lógica de Flujos ] ➔ [ Fase 3: Pruebas con Meta/ngrok ] ➔ [ Fase 4: Despliegue ]
```

---

## 🛠️ Fase 1: Módulo de Base de Datos y APIs de WhatsApp

1. **Módulo `database.js`:**
   * Crear módulo de persistencia local (SQLite o JSON) con métodos para:
     * `checkAvailability(fecha, hora, comensales)`
     * `createReservation(data)`
     * `getReservation(dniOrPhone)`
     * `updateReservation(id, newData)`
     * `cancelReservation(id)`
     * `addToWaitlist(data)`
     * `getWaitlistPosition(dniOrPhone)`
     * `removeFromWaitlist(id)`
2. **Soporte para Mensajes de Lista en `whatsappApi.js`:**
   * Implementar `sendInteractiveList(to, header, body, buttonText, sections)` para mostrar las 4 opciones principales de forma limpia en WhatsApp.

---

## 🧠 Fase 2: Implementación de la Máquina de Estados (`botLogic.js`)

Implementar los 4 flujos en la máquina de estados:

* **Menú Principal:**
  * `1. QUIERO RESERVAR`
  * `2. LISTA DE ESPERA`
  * `3. TENGO RESERVA`
  * `4. PREGUNTAS FRECUENTES`

* **Flujo 1 (Quiero Reservar):**
  * Pedir Fecha ➔ Hora ➔ Comensales.
  * Consultar `checkAvailability`.
  * Si hay disponibilidad: pedir Nombre, Teléfono, DNI, Email ➔ Guardar Reserva ➔ Confirmar.
  * Si NO hay disponibilidad: lamentar ➔ Ofrecer lista de espera ➔ Pedir datos ➔ Guardar en Lista de Espera.

* **Flujo 2 (Lista de Espera):**
  * Pedir datos de identificación (DNI/Teléfono/Email).
  * Consultar `getWaitlistPosition`.
  * Devolver posición y personas por delante.
  * Mostrar opciones: `[Seguir esperando]` / `[Eliminarme de la Lista]`.

* **Flujo 3 (Tengo Reserva):**
  * Pedir datos de identificación.
  * Si existe, mostrar botones: `[VER RESERVA]`, `[MODIFICAR RESERVA]`, `[CANCELAR RESERVA]`.
  * Ejecutar la opción elegida.

* **Flujo 4 (Preguntas Frecuentes):**
  * Mostrar menú de FAQs (Carta, Ubicación, Horarios, Grupos, Mascotas, Parking, Alergias).
  * Devolver respuesta inmediata con enlace o PDF.

---

## 🧪 Fase 3: Pruebas y Validación con WhatsApp

1. **Verificación local con `node server.js`**.
2. **Creación del túnel con `ngrok http 3000`**.
3. **Conexión de Webhook en Meta Developers**.
4. **Prueba exhaustiva desde WhatsApp móvil:**
   * Probar flujo de reserva con fecha disponible.
   * Probar flujo de reserva con fecha sin disponibilidad ➔ inscripción a lista de espera.
   * Probar consulta y cancelación de lista de espera.
   * Probar consulta, modificación y cancelación de reserva existente.
   * Probar consulta de FAQs.

---

## 🚀 Fase 4: Producción

1. Subida del código a servidor 24/7 en la nube (Render / Railway / VPS).
2. Generación de Token de Acceso permanente en Meta Business Suite.
3. Migración y vinculación del teléfono oficial del negocio (`+34 664037707`).
