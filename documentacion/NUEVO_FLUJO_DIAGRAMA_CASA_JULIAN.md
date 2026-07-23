# 📊 ESPECIFICACIÓN DETALLADA DEL NUEVO FLUJO DEDUCIDO DEL DIAGRAMA
## Asador Casa Julián de Tolosa y Madrid

Documentación de análisis extraída del diagrama oficial `Diagrama-Whatsapp-casa-julian.pdf` / `diagrama.png` e incorporando las indicaciones de la dirección del restaurante.

---

## 🗺️ Mapa Completo del Flujo Conversacional

```mermaid
graph TD
    A[Inicio: Mensaje de Bienvenida] --> B[Selección de Idioma - 14 Idiomas\nPág. 1: 1. Español, 2. Euskara, 3. English...]
    B --> C[Ubicación: ¿En cuál de nuestros restaurantes estás interesado?]
    
    C -->|Madrid| D[Información Asadores Madrid:\nCava Baja: +34 925 94 28 94\nCalle Ibiza: +34 925 94 28 91]
    D --> Z[Mensaje de Agradecimiento y Cierre]
    
    C -->|País Vasco| E[Menú Principal: DÍGANOS EN QUÉ LE PODEMOS AYUDAR]
    
    E -->|1. Quiero hacer una reserva| F[Dos Opciones de Reserva]
    F -->|Solicitar reserva| F1[Enlace Web Oficial:\nhttps://casajulian.eus/#shopify-section-template--28289495892308__reservation_iframe_AqMBUi] --> Z
    F -->|Añadir a lista de espera| G[Formulario Lista de Espera:\n- Nombre y Apellidos\n- Nº comensales\n- Preferencia horaria\n- Disponibilidad días\n- Nº niños\n- Alergias/restricciones\n- Menú Tradición?] --> H[Respuesta: Equipo añadirá a lista de espera] --> Z
    
    E -->|2. Modificación| I[Formulario Reserva Actual:\n- Nombre y Apellido\n- Nº teléfono con prefijo]
    I --> J[¿Qué modificación desea hacer?\n- Nº de comensales\n- Día\n- Hora]
    J --> K[Respuesta: Equipo revisará solicitud]
    K --> Z
    
    E -->|3. Cancelación| L[Formulario Reserva Actual:\n- Nombre y Apellido\n- Nº teléfono con prefijo]
    L --> M[Respuesta: Equipo revisará solicitud]
    M --> Z
    
    E -->|4. Tengo un Menú Tradición| N[Submenú Menú Tradición:\n- Reservar\n- Consultar fecha caducidad]
    N -->|Reservar| O[Formulario Reserva Menú Tradición:\n- Nombre y apellidos\n- Nº tarjeta regalo\n- Preferencia horaria\n- Disponibilidad días\n- Alergias]
    O --> P[Respuesta: Equipo revisará solicitud]
    P --> Z
    N -->|Consultar Caducidad| Q[Respuesta: Equipo responderá en brevedad]
    Q --> Z
    
    E -->|5. Otras cuestiones| R[Submenú 11 Preguntas Frecuentes] --> Z
```

---

## 📌 Reglas de Negocio Clave

1. **Idiomas (14 Idiomas con Prioridad Inicial):**
   - El cliente puede elegir entre 14 idiomas.
   - En la primera página del menú desplegable de idiomas se posicionan en la cabecera: **1. Español**, **2. Euskara**, **3. English**.
2. **Notificaciones Internas 100% en Español:**
   - Para que el equipo de Casa Julián pueda gestionar ágilmente todas las solicitudes en sus teléfonos/tablets, **todas las alertas enviadas al personal estarán redactadas en Español**, independientemente del idioma elegido por el cliente.
3. **Flujo "Quiero hacer una reserva":**
   - El cliente dispone de 2 botones:
     - `Solicitar reserva`: Muestra el enlace web oficial `https://casajulian.eus/#shopify-section-template--28289495892308__reservation_iframe_AqMBUi`
     - `Añadir a lista de espera`: Despliega el cuestionario para registrarse en la lista de espera.
