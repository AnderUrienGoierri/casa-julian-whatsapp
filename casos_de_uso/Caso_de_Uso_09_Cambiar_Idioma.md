# Caso de Uso 09: Cambiar Idioma del Chatbot

## 📌 Descripción General
Permite al cliente cambiar el idioma de la interfaz del chatbot en cualquier momento entre los **14 idiomas soportados**.

---

## 🔄 Flujo Paso a Paso Detallado

### Paso 1: Selección en Menú Principal
* **Mensaje del Cliente:**
  > `6` (o pulsa *"6. Cambiar Idioma"*)

* **Respuesta del Chatbot (Menú de Selección de Idioma):**
  > 🌐 **SELECCIONA TU IDIOMA / CHOOSE YOUR LANGUAGE:**
  >
  > 1. 🇪🇸 Español
  > 2. 🏴‍☠️ Euskara
  > 3. 🇬🇧 English
  > 4. 🇫🇷 Français
  > 5. 🇩🇪 Deutsch
  > 6. 🇮🇹 Italiano
  > 7. 🇳🇱 Nederlands
  > 8. 🇵🇹 Português
  > 9. 🏴 Català
  > 10. 🏴 Galego
  > 11. 🇷🇺 Русский
  > 12. 🇯🇵 日本語
  > 13. 🇨🇳 中文
  > 14. 🇸🇦 العربية

---

### Paso 2: Selección de Idioma por el Cliente
* **Mensaje del Cliente:**
  > `2` (o escribe *"Euskara"* / *"2"*)

* **Procesamiento Interno:**
  - Se actualiza la preferencia de idioma del cliente a `eu` (Euskera).

* **Respuesta del Chatbot (Confirmación en el Nuevo Idioma):**
  > ✅ **Hizkuntza aldatu da: Euskara.**
  >
  > 🥩 **ZERTAN LAGUN DIZAKEGU?**
  >
  > **1. Erreserba egin**
  > **2. Erreserba aldatu**
  > **3. Erreserba ezeztatu**
  > **4. Tradizio Menua oparitu**
  > **5. Beste zalantza batzuk**
  > **6. Hizkuntza aldatu**
