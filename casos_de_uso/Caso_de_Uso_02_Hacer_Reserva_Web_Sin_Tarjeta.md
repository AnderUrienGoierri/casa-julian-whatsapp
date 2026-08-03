# Caso de Uso 02: Hacer Reserva Web (Sin Tarjeta Regalo)

## 📌 Descripción General
Este flujo cubre el caso en el que un cliente desea realizar una reserva estándar en Asador Casa Julián (Tolosa) y no dispone de una Tarjeta de Regalo previa. El chatbot le facilita el enlace oficial del motor de reservas online de la página web.

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Selección en el Menú Principal
* **Mensaje del Cliente:**
  > `1` (o pulsa *"1. Hacer una reserva"*)

* **Respuesta del Chatbot:**
  > 💳 **¿Cuenta con una Tarjeta de Regalo (Menú Tradición)?**
  >
  > [ 💳 Sí, tengo una ]
  > [ 🚫 No tengo ]

---

### Paso 2: Selección "No tengo tarjeta de regalo"
* **Acción del Cliente:**
  > Pulsa el botón **`[ 🚫 No tengo ]`** (o escribe *"no"* / *"no tengo"*).

* **Respuesta del Chatbot:**
  > 🌐 **Reserva en Asador Casa Julián (Tolosa)**
  >
  > Para realizar una reserva estándar, puedes acceder directamente a nuestro sistema de reservas online en la web oficial:
  >
  > [ 🌐 Reserva Web ]
  > [ 📝 Lista de Espera ]

---

### Paso 3: Elección de Reserva Web
* **Acción del Cliente:**
  > Pulsa el botón **`[ 🌐 Reserva Web ]`** (o escribe *"reserva web"* / *"web"*).

* **Respuesta del Chatbot:**
  > 🌐 **Reserva Directa Online**
  >
  > Puedes comprobar la disponibilidad en tiempo real e introducir tus datos de reserva en nuestra plataforma oficial:
  >
  > 👉 **https://casajulian.eus/reservas/**
  >
  > ----------------------------------
  > 📍 **Asador Casa Julián**
  > Santa Klara Kalea 6, 20400 Tolosa, Gipuzkoa
  > 📞 **Atención Telefónica:** Martes a Domingo: 11:00 - 12:30 & 15:30 - 17:00
  > 🌐 https://casajulian.eus

---

## 🛠️ Caso Alternativo: Elección de Lista de Espera
* Si en el Paso 2 el cliente pulsa el botón **`[ 📝 Lista de Espera ]`**, se deriva automáticamente al **Caso de Uso 04 (Inscripción en Lista de Espera)**.
