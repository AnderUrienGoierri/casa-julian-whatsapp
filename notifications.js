const { sendMessage } = require('./whatsappApi');
const { createSolicitud } = require('./database');
require('dotenv').config();

/**
 * Obtiene el encabezado visual con iconos y colores según la categoría de la solicitud.
 */
function getCategoryHeader(tipoAccion) {
    const tipo = (tipoAccion || '').toUpperCase();

    // 1. Modificaciones de Reserva
    if (tipo.includes('MODIFICACIÓN') || tipo.includes('MODIFICACION')) {
        return {
            banner: `✏️🔵 *[CATEGORÍA: MODIFICACIÓN DE RESERVA]* 🔵✏️`,
            colorTag: `🔵 MODIFICACIÓN DE RESERVA`,
            subjectTag: `[Modificación]`,
            labelCategory: `Modificaciones`,
            subLabel: `modificacion_reserva`,
            emoji: `✏️`
        };
    }

    // 2. Cancelaciones de Reserva
    if (tipo.includes('CANCELACIÓN') || tipo.includes('CANCELACION')) {
        if (tipo.includes('ESPERA')) {
            return {
                banner: `❌🔴 *[CATEGORÍA: CANCELACIÓN LISTA DE ESPERA]* 🔴❌`,
                colorTag: `🔴 CANCELACIÓN LISTA DE ESPERA`,
                subjectTag: `[Cancelación Lista de Espera]`,
                labelCategory: `Cancelaciones`,
                subLabel: `cancelacion_lista_espera`,
                emoji: `❌`
            };
        }
        return {
            banner: `❌🔴 *[CATEGORÍA: CANCELACIÓN DE RESERVA]* 🔴❌`,
            colorTag: `🔴 CANCELACIÓN DE RESERVA`,
            subjectTag: `[Cancelación]`,
            labelCategory: `Cancelaciones`,
            subLabel: `cancelacion_reserva`,
            emoji: `❌`
        };
    }

    // 3. Consultas Generales / Preguntas Frecuentes
    if (tipo.includes('CONSULTA') || tipo.includes('PREGUNTA') || tipo.includes('FAQ')) {
        return {
            banner: `❓🟡 *[CATEGORÍA: CONSULTA / PREGUNTA FRECUENTE]* 🟡❓`,
            colorTag: `🟡 CONSULTAS / PREGUNTAS FRECUENTES`,
            subjectTag: `[Consulta]`,
            labelCategory: `Preguntas Frecuentes`,
            subLabel: `consulta_general`,
            emoji: `❓`
        };
    }

    // 4. Solicitud de Menú Tradición
    if (tipo.includes('MENÚ TRADICIÓN') || tipo.includes('MENU TRADICION') || tipo.includes('TRADICION')) {
        return {
            banner: `🥩🟠 *[CATEGORÍA: MENÚ TRADICIÓN]* 🟠🥩`,
            colorTag: `🟠 MENÚ TRADICIÓN`,
            subjectTag: `[Menú Tradición]`,
            labelCategory: `Menú Tradición`,
            subLabel: `menu_tradicion`,
            emoji: `🥩`
        };
    }

    // 5. Gestión de Tarjetas Regalo
    if (tipo.includes('TARJETA') || tipo.includes('REGALO') || tipo.includes('CANJE')) {
        return {
            banner: `🎁🟣 *[CATEGORÍA: TARJETA REGALO]* 🟣🎁`,
            colorTag: `🟣 TARJETA REGALO`,
            subjectTag: `[Tarjeta Regalo]`,
            labelCategory: `Tarjetas Regalo`,
            subLabel: `tarjeta_regalo`,
            emoji: `🎁`
        };
    }

    return {
        banner: `🚨 *[ALERTA RECEPCIÓN CASA JULIÁN]* 🚨`,
        colorTag: `⚪ GESTIÓN GENERAL`,
        subjectTag: `[⚪ ALERTA RECEPCIÓN]`,
        labelCategory: `General`,
        subLabel: null,
        emoji: `📌`
    };
}

/**
 * Registra una solicitud interna en la base de datos y la envía al Buzón del Panel de Recepción.
 */
async function sendInternalStaffAlertInSpanish(tipoAccion, telefonoCliente, datosDetallados, nombreCliente = null, telefonoReserva = null) {
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const categoryInfo = getCategoryHeader(tipoAccion);

    const nombreDisplay = nombreCliente ? nombreCliente : 'Ver detalles abajo';
    const telDisplay = telefonoReserva ? telefonoReserva : telefonoCliente;

    const cleanDatosDetallados = (datosDetallados || '')
        .split('\n')
        .filter(l => !l.includes('Código de Confirmación') && !l.includes('Codigo de Confirmacion') && !l.includes('Berrespen-kodea') && !l.includes('Confirmation Code'))
        .join('\n');

    const alertMessage = `${categoryInfo.banner}\n\n` +
        `🏷️ *Categoría:* ${categoryInfo.colorTag}\n` +
        `👤 *Nombre Cliente:* ${nombreDisplay}\n` +
        `📞 *Teléfono Cliente:* ${telDisplay}\n` +
        `⏰ *Fecha Registro:* ${timestamp}\n\n` +
        `📝 *Datos Recibidos:*\n${cleanDatosDetallados}`;

    console.log(`\n================ [NOTIFICACIÓN INTERNA PARA RECEPCIÓN] ================`);
    console.log(categoryInfo.banner);
    console.log(`🏷️ CATEGORÍA: ${categoryInfo.colorTag}`);
    console.log(`👤 NOMBRE CLIENTE: ${nombreDisplay}`);
    console.log(`📞 TELÉFONO CLIENTE: ${telDisplay}`);
    console.log(`⏰ FECHA: ${timestamp}`);
    console.log(`📝 DATOS RECIBIDOS:\n${datosDetallados}`);
    console.log(`=========================================================================\n`);

    // 1. Registrar la solicitud categorizada en la base de datos para la Bandeja de Recepción del Panel Web
    try {
        await createSolicitud({
            tipoAccion,
            telefonoCliente,
            datosDetallados: cleanDatosDetallados,
            nombreCliente,
            telefonoReserva
        });
        console.log(`   └─ ✅ Solicitud guardada en la Base de Datos para el Panel de Recepción.`);
    } catch (dbErr) {
        console.error("⚠️ Error guardando solicitud en Base de Datos:", dbErr.message);
    }

    // 2. Enviar alerta WhatsApp en tiempo real al teléfono del maitre (si está configurado)
    try {
        const staffPhone = process.env.STAFF_PHONE;
        if (staffPhone && staffPhone !== '34671652717') {
            await sendMessage(staffPhone, alertMessage);
            console.log(`   └─ ✅ Alerta WhatsApp enviada al teléfono del maitre (${staffPhone})`);
        }
    } catch (error) {
        console.error('⚠️ Error al enviar alerta WhatsApp al personal:', error.message);
    }

    return { success: true, method: 'reception_database_inbox' };
}

/**
 * Función vacía de confirmación (toda la interacción se realiza ahora vía WhatsApp y Web).
 */
async function sendEmailConfirmation(reserva) {
    return { success: true, method: 'whatsapp_managed' };
}

module.exports = {
    sendEmailConfirmation,
    sendInternalStaffAlertInSpanish
};
