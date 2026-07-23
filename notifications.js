const nodemailer = require('nodemailer');
const { sendMessage } = require('./whatsappApi');
require('dotenv').config();

// Configuración de correo SMTP (si existen credenciales o ethereal test)
let transporter = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

/**
 * Obtiene el encabezado visual con iconos y colores según la categoría de la solicitud.
 */
function getCategoryHeader(tipoAccion) {
    const tipo = (tipoAccion || '').toUpperCase();

    if (tipo.includes('ESPERA')) {
        return {
            banner: `📋🟡 *[CATEGORÍA: LISTA DE ESPERA]* 🟡📋`,
            colorTag: `🟡 LISTA DE ESPERA`,
            subjectTag: `[🟡 LISTA DE ESPERA]`,
            emoji: `📋`
        };
    }
    if (tipo.includes('MODIFICACIÓN') || tipo.includes('MODIFICACION')) {
        return {
            banner: `✏️🔵 *[CATEGORÍA: MODIFICACIÓN]* 🔵✏️`,
            colorTag: `🔵 MODIFICACIÓN DE RESERVA`,
            subjectTag: `[🔵 MODIFICACIÓN]`,
            emoji: `✏️`
        };
    }
    if (tipo.includes('CANCELACIÓN') || tipo.includes('CANCELACION')) {
        return {
            banner: `❌🔴 *[CATEGORÍA: CANCELACIÓN]* 🔴❌`,
            colorTag: `🔴 CANCELACIÓN DE RESERVA`,
            subjectTag: `[🔴 CANCELACIÓN]`,
            emoji: `❌`
        };
    }
    if (tipo.includes('TRADICIÓN') || tipo.includes('TRADICION') || tipo.includes('REGALO')) {
        return {
            banner: `🎁🟢 *[CATEGORÍA: MENÚ TRADICIÓN]* 🟢🎁`,
            colorTag: `🟢 MENÚ TRADICIÓN / REGALO`,
            subjectTag: `[🟢 MENÚ TRADICIÓN]`,
            emoji: `🎁`
        };
    }

    return {
        banner: `🚨 *[ALERTA RECEPCIÓN CASA JULIÁN]* 🚨`,
        colorTag: `⚪ GESTIÓN GENERAL`,
        subjectTag: `[⚪ ALERTA RECEPCIÓN]`,
        emoji: `📌`
    };
}

/**
 * Envía una alerta interna al personal/maitre de Casa Julián 100% en ESPAÑOL por WhatsApp y Email.
 */
async function sendInternalStaffAlertInSpanish(tipoAccion, telefonoCliente, datosDetallados) {
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const categoryInfo = getCategoryHeader(tipoAccion);
    const targetEmail = process.env.STAFF_EMAIL || 'anurte@outlook.com';

    const alertMessage = `${categoryInfo.banner}\n\n` +
        `🏷️ *Categoría:* ${categoryInfo.colorTag}\n` +
        `📞 *Teléfono Cliente:* ${telefonoCliente}\n` +
        `⏰ *Fecha:* ${timestamp}\n\n` +
        `📝 *Datos Recibidos:*\n${datosDetallados}`;

    console.log(`\n================ [NOTIFICACIÓN INTERNA PARA PERSONAL EN ESPAÑOL] ================`);
    console.log(categoryInfo.banner);
    console.log(`🏷️ CATEGORÍA: ${categoryInfo.colorTag}`);
    console.log(`📧 EMAIL DESTINO: ${targetEmail}`);
    console.log(`📞 TELÉFONO CLIENTE: ${telefonoCliente}`);
    console.log(`⏰ FECHA: ${timestamp}`);
    console.log(`📝 DATOS RECIBIDOS:\n${datosDetallados}`);
    console.log(`=================================================================================\n`);

    // 1. Enviar alerta WhatsApp en tiempo real al teléfono del restaurante/maitre (34671652717)
    try {
        const staffPhone = process.env.STAFF_PHONE || '34671652717';
        await sendMessage(staffPhone, alertMessage);
        console.log(`   └─ ✅ Alerta WhatsApp enviada al teléfono del maitre (${staffPhone})`);
    } catch (error) {
        console.error('⚠️ Error al enviar alerta WhatsApp al personal:', error.message);
    }

    // 2. Enviar email si el servidor SMTP está configurado
    if (transporter) {
        try {
            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #8B0000; border-radius: 8px; padding: 20px; background-color: #ffffff;">
                <div style="background-color: #8B0000; color: #ffffff; padding: 14px; text-align: center; border-radius: 4px;">
                    <h2 style="margin: 0;">Asador Casa Julián de Tolosa</h2>
                    <p style="margin: 6px 0 0 0; font-size: 15px; font-weight: bold;">${categoryInfo.colorTag}</p>
                </div>
                <div style="padding: 20px 0;">
                    <p style="font-size: 16px; color: #333;"><strong>Categoría:</strong> <span style="color: #8B0000; font-weight: bold;">${categoryInfo.colorTag}</span></p>
                    <p style="font-size: 15px; color: #333;"><strong>Teléfono del Cliente:</strong> ${telefonoCliente}</p>
                    <p style="font-size: 14px; color: #666;"><strong>Fecha y Hora de Registro:</strong> ${timestamp}</p>
                    
                    <div style="background-color: #fdf8f5; border-left: 4px solid #8B0000; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <h3 style="margin-top: 0; color: #8B0000;">Datos Recibidos del Cliente:</h3>
                        <pre style="font-family: inherit; font-size: 14px; white-space: pre-wrap; word-break: break-word; color: #222;">${datosDetallados}</pre>
                    </div>
                </div>
                <div style="border-top: 1px solid #eee; padding-top: 10px; text-align: center; font-size: 12px; color: #888;">
                    <p>Notificación Automática del Sistema de Reservas - Asador Casa Julián</p>
                </div>
            </div>
            `;
            const info = await transporter.sendMail({
                from: `"Casa Julian Bot" <${process.env.SMTP_USER}>`,
                to: targetEmail,
                subject: `${categoryInfo.subjectTag} - Solicitud de Cliente ${telefonoCliente}`,
                html: emailHtml
            });
            console.log(`   └─ ✅ Email de alerta entregado con éxito a ${targetEmail} (ID: ${info.messageId})`);
        } catch (error) {
            console.error('⚠️ Error al enviar email interno al personal:', error.message);
        }
    } else {
        console.log(`ℹ️ [SIMULACIÓN EMAIL] Notificación configurada para enviarse a: ${targetEmail}`);
        console.log(`   (Para recibir el correo real en tu bandeja de entrada de ${targetEmail}, introduce tus credenciales SMTP en Render / .env)`);
    }
}

/**
 * Envía un correo electrónico de confirmación de reserva al cliente.
 */
async function sendEmailConfirmation(reserva) {
    const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; background-color: #fcfbf9;">
        <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 15px;">
            <h1 style="color: #8B0000; margin: 0;">Asador Casa Julian de Tolosa</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Confirmación Oficial de Reserva</p>
        </div>
        <div style="padding: 20px 0;">
            <p style="font-size: 16px;">Hola <strong>${reserva.nombre}</strong>,</p>
            <p>¡Muchas gracias por elegirnos! Tu solicitud de reserva ha sido <strong>CONFIRMADA</strong> correctamente.</p>
            
            <div style="background-color: #fff; border-left: 4px solid #8B0000; padding: 15px; margin: 20px 0; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin-top: 0; color: #333;">Detalles de la Reserva</h3>
                <p><strong>Código de Reserva:</strong> <span style="color: #8B0000; font-size: 18px;">${reserva.id}</span></p>
                <p><strong>Fecha:</strong> ${reserva.fecha}</p>
                <p><strong>Hora:</strong> ${reserva.hora} hs</p>
                <p><strong>Comensales:</strong> ${reserva.comensales} personas</p>
                <p><strong>DNI/NIE:</strong> ${reserva.dni}</p>
                <p><strong>Idioma Cliente:</strong> ${(reserva.idioma || 'es').toUpperCase()}</p>
            </div>
            
            <p style="color: #555; font-size: 14px;">Si necesitas modificar o cancelar tu reserva, puedes hacerlo a través de nuestro canal automatizado de WhatsApp.</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; color: #888; font-size: 12px;">
            <p>Casa Julian • Calle Sta. Clara 6, Tolosa / Calle Ibiza 42, Madrid</p>
            <p><a href="https://casajulian.eus/" style="color: #8B0000; text-decoration: none;">https://casajulian.eus/</a></p>
        </div>
    </div>
    `;

    console.log(`\n📧 [EMAIL CONFIRMACIÓN ENVIADO] ➔ A: ${reserva.email}`);

    if (transporter) {
        try {
            await transporter.sendMail({
                from: `"Casa Julian Reservas" <${process.env.SMTP_USER}>`,
                to: reserva.email,
                subject: `✅ Reserva Confirmada (${reserva.id}) - Asador Casa Julian`,
                html: htmlTemplate
            });
            console.log(`   └─ Status: Email entregado a ${reserva.email}`);
        } catch (error) {
            console.error('⚠️ Error al enviar email de confirmación:', error.message);
        }
    }
}

module.exports = {
    sendEmailConfirmation,
    sendInternalStaffAlertInSpanish
};
