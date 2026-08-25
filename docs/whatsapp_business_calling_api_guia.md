# 📞 WhatsApp Business Calling API: Funcionamiento, Requisitos y Estrategia de Llamadas (+34 943 67 14 17)

Este documento detalla el funcionamiento técnico, las reglas de Meta, las ventajas, las limitaciones operativas y la viabilidad de implementar **WhatsApp Business Calling API** en el restaurante **Casa Julián de Tolosa**, manteniendo en paralelo el sistema de chatbot automatizado y el panel web de recepción sobre el número oficial (**+34 943 67 14 17**).

---

## 1. ¿Es Posible Combinar el Chatbot y las Llamadas de WhatsApp en el Mismo Número?

**SÍ, es técnicamente posible.** Con la plataforma **WhatsApp Cloud API**, un único número de teléfono (`+34 943 67 14 17`) puede:
1. **Ejecutar el Chatbot 24/7:** Menús interactivos, solicitudes de reserva, cartas, tarjetas regalo y desvío de proveedores silenciados.
2. **Recibir y Realizar Llamadas por WhatsApp (VoIP):** Utilizando el protocolo de voz sobre IP (**WebRTC / SIP**) de Meta.

Sin embargo, Meta impone condiciones, permisos y limitaciones estrictas que diferencian las **llamadas entrantes (clientes $\rightarrow$ restaurante)** de las **llamadas salientes (restaurante $\rightarrow$ clientes)**.

---

## 2. Funcionamiento Detallado de las Llamadas por WhatsApp

```
                                      +34 943 67 14 17
                                 (WhatsApp Cloud Platform)
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             💬 Mensajería y Bot                         📞 Llamadas de Voz (VoIP)
         (Chatbot 24/7 + Base de Datos)                (WebRTC / Señalización Meta)
                       │                                           │
                       ▼                                           ▼
            Panel Web de Recepción                       Panel Web / Dispositivo SIP
         (Solicitudes, Chats y CMS)                   (Atención de llamadas de voz)
```

### A. 📥 Llamadas Entrantes (Clientes llamando al Restaurante)
* **Experiencia de Usuario:** El cliente abre el chat de WhatsApp de Casa Julián y pulsa el botón de llamada (icono de teléfono).
* **Destino de la Llamada:** La llamada viaja por Internet (VoIP WebRTC) y suena en el panel web de recepción (`https://casajuliantolosa.synology.me/admin/`) en el ordenador o en un teléfono SIP / softphone de recepción.
* **Coste de Meta:** **100% Gratuito** (Meta no cobra a las empresas por recibir llamadas de usuarios).
* **Compatibilidad con el Bot:** Totalmente compatible; el bot continúa respondiendo mensajes sin interrumpirse.

### B. 📤 Llamadas Salientes (Restaurante llamando a Clientes)
Para evitar el spam telefónico de las empresas, Meta aplica una política estricta de **Consentimiento Previo Obligatorio ("Permission to Call")**:

1. **Petición de Permiso Previo:**
   * El restaurante **NO puede llamar directamente** a un cliente si este no ha aceptado previamente una solicitud de llamada dentro del chat.
   * El sistema debe enviarle un mensaje formal: *"¿Podemos llamarte para concretar los detalles de tu solicitud de reserva?"* con un botón interactivo de **"Aceptar Llamada"**.
2. **Límites Temporales y de Frecuencia:**
   * **Validez del permiso:** El cliente otorga permiso para ser llamado durante un máximo de **7 días**.
   * **Límite por usuario:** Máximo **5 llamadas conectadas al día** por cliente.
   * **Límite por empresa:** Máximo **100 llamadas salientes al día** por número de teléfono.
   * **Llamadas no atendidas:** Si se realizan 4 intentos seguidos sin respuesta, Meta revoca automáticamente el permiso.
3. **Coste:** Las llamadas salientes de empresa tienen una tarificación por minuto según las tarifas oficiales de Meta.

---

## 3. Comparativa: WhatsApp Calling API vs. Línea Telefónica Tradicional

| Funcionalidad | 📱 WhatsApp Calling API (VoIP Meta) | 📞 Línea Telefónica Tradicional (SIM / Fija) |
| :--- | :--- | :--- |
| **Número utilizado** | `+34 943 67 14 17` (Datos Internet) | `+34 943 67 14 17` (Red GSM / Fija) |
| **Cliente llama al restaurante** | ✅ Suena en el navegador web / panel de recepción. | ✅ Suena en el terminal telefónico físico del restaurante. |
| **Restaurante llama al cliente** | ⚠️ Requiere que el cliente pulse "Aceptar llamada" previamente en el chat. | ✅ **Directo e instantáneo**: se marca el número y se llama al segundo sin pedir permiso. |
| **Llamar a Proveedores / Empleados** | ❌ Inviable (requeriría pedir permiso por chat a cada proveedor antes de llamar). | ✅ **Perfecto**: llamadas directas a proveedores, distribuidores y personal. |
| **Calidad y Cobertura** | Depende de la conexión Wi-Fi/4G del cliente y del restaurante. | Máxima estabilidad garantizada por la red telefónica nacional. |
| **Turistas / Clientes Extranjeros** | 🌟 Excelente ventaja: pueden llamar gratis por datos sin costes de roaming internacional. | Puede implicar tarifas internacionales caras para el cliente extranjero. |

---

## 4. Requisitos Técnicos de Meta para Activar Calling API

Para poder habilitar las llamadas de WhatsApp en el `+34 943 67 14 17`, Meta exige cumplir los siguientes puntos:

1. **Límite de Conversaciones (Tier Limit):**
   * La cuenta de WhatsApp Business de Casa Julián debe alcanzar el nivel de **Tier 2K** (2.000 conversaciones únicas diarias).
   * *Nota:* Este nivel lo asigna Meta automáticamente a medida que el bot opera con normalidad y mantiene una buena calificación de calidad.
2. **Infraestructura de Audio en Synology NAS:**
   * Implementación de un gateway WebRTC / SIP compatible con códec OPUS y cifrado TLS/SRTP en el backend Node.js.
   * Integración de controles de audio (micrófono, altavoz, descolgar/colgar) en la interfaz del panel web de administración (`/admin/`).

---

## 5. Estrategia y Hoja de Ruta Recomendada para Casa Julián

### Fase 1: Lanzamiento con Chatbot y Telefonía Tradicional (Inmediato)
* **Chatbot Cloud API Activo en `+34 943 67 14 17`:**
  * Automatiza el 90% de las consultas (Menú Tradición, solicitudes de reserva, cartas, mapa, horarios, tarjetas regalo).
  * **30 Contactos Silenciados:** Proveedores y empleados pasan directos a recepción sin menús automáticos.
* **Atención Telefónica:**
  * Las llamadas de voz se gestionan a través de la **red telefónica habitual del restaurante**, permitiendo llamar a clientes y proveedores al instante sin restricciones ni permisos de Meta.
  * Se añade un botón en el menú del chatbot: **`📞 Llamar por Teléfono (+34 943 67 14 17)`** que abre el marcador del cliente en 1 clic.

### Fase 2: Incorporación de WhatsApp Business Calling (VoIP)
* Una vez el sistema esté plenamente consolidado en producción y Meta desbloquee el límite de 2.000 mensajes diarios:
  * Se activa el receptor de **llamadas VoIP entrantes** en el panel web de recepción, permitiendo que clientes internacionales y usuarios de WhatsApp llamen por voz directamente al restaurante a través de Internet sin coste.
