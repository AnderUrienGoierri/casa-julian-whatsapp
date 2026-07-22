# 🔑 DATOS E INFORMACIÓN REQUERIDA PARA LA INTEGRACIÓN CON THEFORK Y REVO POS
## Checklist Técnico y Credenciales de Acceso - Asador Casa Julian

Este documento detalla todas las credenciales, identificadores, accesos y permisos técnicos necesarios que se deben solicitar a los proveedores de software (**TheFork / ElTenedor** y **Revo POS**) para conectar el bot de WhatsApp con la gestión real de mesas y comandas de Casa Julian.

---

## 🍴 1. INTEGRACIÓN CON THEFORK MANAGER (ElTenedor)

Para que el sistema consulte disponibilidad real de mesas, cree solicitudes de reserva, las modifique o las cancele bi-direccionalmente, se requiere acceso a la **TheFork Partner API** (v2 / v3 OpenAPI):

### 📋 Credenciales y Parámetros Técnicos a Solicitar a TheFork:

| Parámetro / Credencial | Descripción | Dónde se solicita / Obtención |
| :--- | :--- | :--- |
| **`THEFORK_API_KEY` / `BEARER_TOKEN`** | Clave API privada para autenticar las peticiones HTTP desde el servidor. | Solicitar al gestor de cuenta de TheFork / *TheFork Partner API Portal*. |
| **`THEFORK_RESTAURANT_ID`** | Identificador único del restaurante Casa Julian en el sistema de TheFork. | Panel de *TheFork Manager* -> Configuración del Restaurante. |
| **`THEFORK_CLIENT_SECRET`** | Clave secreta para la verificación y firma de Webhooks. | Sección de Integraciones en *TheFork Manager*. |
| **URL del Webhook de TheFork** | Endpoint de nuestro servidor que registrará en TheFork: `https://casa-julian-whatsapp-bot.onrender.com/webhook/thefork` | Configurar en la sección de Webhooks de *TheFork Partner Portal*. |

### 📊 Datos Operativos de Mesas y Disponibilidad (TheFork):
1. **Reglas de Aforo y Turnos Configurados:**
   - Horarios de apertura y turnos permitidos por TheFork (Comida Turno 1: `12:30`, `13:00`, `13:30`, `14:00`; Comida Turno 2: `15:15`; Cenas: `20:00`-`21:30`).
   - Política de comensales máximos por reserva directa (ej. hasta 8 personas).
2. **Políticas de Cancelación y Antelación Mínima:**
   - Horas de antelación requeridas para modificar o cancelar sin penalización.

---

## 🍷 2. INTEGRACIÓN CON REVO POS (REVO XEF - SISTEMA DE COMANDAS)

Para vincular las botellas de vino, el punto del chuletón y el consumo histórico de cada cliente con su ficha de reserva, se requiere acceso a la **API REST de Revo XEF**:

### 📋 Credenciales y Parámetros Técnicos a Solicitar a Revo POS:

| Parámetro / Credencial | Descripción | Dónde se solicita / Obtención |
| :--- | :--- | :--- |
| **`REVO_TENANT_ID` / `ACCOUNT_NAME`** | Nombre de cuenta de la empresa Casa Julian en la plataforma Revo XEF. | Panel web de *Revo Backoffice* (`revoxef.works`). |
| **`REVO_API_TOKEN`** | Personal Access Token con permiso de lectura de órdenes y clientes (`orders:read`, `customers:read`). | Panel de *Revo Backoffice* -> Ajustes -> Integraciones -> API Keys. |
| **`REVO_WEBHOOK_SECRET`** | Clave de validación para asegurar los webhooks de cierre de ticket. | Panel de *Revo Backoffice* -> Ajustes -> Webhooks. |
| **URL del Webhook de Revo** | Endpoint de nuestro servidor para recibir tickets cerrados: `https://casa-julian-whatsapp-bot.onrender.com/webhook/revo` | Registrar el webhook para el evento `order.closed` en Revo Backoffice. |

### 🥩 Datos de Productos e Histórico (Revo POS):
1. **Identificación de Cliente en Ticket:**
   - Confirmar si los camareros introducen el teléfono o DNI del cliente al abrir/cerrar la mesa en el iPad de Revo.
2. **Categorías de Productos de Interés:**
   - IDs de categoría de vinos (*Vinos tintos, Reservas, Blancos*), cortes de carne y preferencias anotadas en comandas.

---

## 📱 3. DATOS DE META WHATSAPP BUSINESS (OFICIAL EN PRODUCCIÓN)

Para la migración final del bot de pruebas al número de teléfono oficial fijo/móvil de Casa Julian:

| Parámetro / Credencial | Estado Actual | Estado para Producción Oficial |
| :--- | :--- | :--- |
| **`PHONE_NUMBER_ID`** | `1232422906619224` (Entorno de pruebas) | Identificador del número oficial de Casa Julian en Meta Business Manager. |
| **`WHATSAPP_TOKEN`** | Configurado en Render (Token Permanente) | Token Permanente de Usuario del Sistema asignado a la WABA oficial. |
| **`WABA_ID`** | `WhatsApp Business Account ID` | ID de cuenta de WhatsApp Business de Casa Julian. |
| **Número de Teléfono Oficial** | `+34 664 03 77 07` | Teléfono principal de recepción de Casa Julian (Tolosa). |

---

## ✉️ 4. PLANTILLA DE SOLICITUD PARA ENVIAR A THEFORK Y REVO

Puedes enviar este texto directamente a vuestro contacto en **TheFork** y en **Revo POS**:

> *"Estimado equipo de soporte de [TheFork / Revo POS]:*
> 
> *Estamos implementando la integración del Asistente Virtual por WhatsApp de **Asador Casa Julian**. Para completar la conexión bi-direccional con vuestra plataforma, necesitamos que nos facilitéis los siguientes accesos de API:*
> 
> 1. * **API Key / Token de Acceso a la API REST** de integración.*
> 2. * **Restaurant ID / Account Tenant ID** de Casa Julian.*
> 3. * **Activación de Webhooks** para notificar eventos a nuestro endpoint: `https://casa-julian-whatsapp-bot.onrender.com/webhook`*
> 
> *Quedamos a la espera de las credenciales técnicas para proceder con la conexión.*
> 
> *Atentamente,\nEl equipo técnico de Casa Julian"*
