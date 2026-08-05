# 🚀 Guía de Procedimiento para Desplegar Cambios en Render (GitHub)

Esta guía documenta los pasos necesarios para desplegar cualquier cambio realizado en el código (`i18n.js`, `botLogic.js`, `server.js`, `admin.js`, etc.) en el chatbot de WhatsApp alojado en **Render.com**.

---

## 📋 Pasos Rápidos desde la Terminal (VS Code / PowerShell)

Abre la terminal en la raíz del proyecto (`c:\Dev\05_Projects\Professional\casa-julian-whatsapp`) y ejecuta los siguientes comandos:

### 1. Comprobar la Sintaxis del Código (Opcional pero recomendado)
Antes de subir los cambios, verifica que no haya errores de sintaxis en JavaScript:
```powershell
node -c server.js botLogic.js i18n.js adminApi.js public/admin/admin.js
```

### 2. Preparar los Archivos Modificados (Stage)
Añade todos los archivos creados o modificados al índice de Git:
```powershell
git add -A
```

### 3. Crear el Commit Local
Guarda los cambios localmente agregando un mensaje descriptivo del trabajo realizado:
```powershell
git commit -m "Descripción clara de las modificaciones realizadas"
```

### 4. Subir a GitHub (Despliegue Automático en Render)
Sube los cambios a la rama principal de GitHub para que Render inicie automáticamente el despliegue en la nube:
```powershell
git push origin main
```

---

## 🔍 Diagnóstico y Comprobación de Estado

- **Comprobar si faltan cambios por subir (`push`):**
  ```powershell
  git status
  ```
  Si aparece el mensaje: `Your branch is ahead of 'origin/main' by 1 commit`, significa que has hecho el `commit`, pero **aún te falta ejecutar `git push origin main`** para que se aplique en WhatsApp.

- **Verificar la versión desplegada en tiempo real:**
  Puedes comprobar la versión activa en el servidor consultando desde el navegador:
  `https://casa-julian-whatsapp-bot.onrender.com/version`

---

## ⏱️ Tiempo de Aplicación
Una vez ejecutado `git push origin main`, Render tarda aproximadamente **1 a 2 minutos** en compilar y activar la nueva versión en WhatsApp.
