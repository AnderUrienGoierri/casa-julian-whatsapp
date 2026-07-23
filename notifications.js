const nodemailer = require('nodemailer');
const axios = require('axios');
const { sendMessage } = require('./whatsappApi');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const headerImagePath = path.join(__dirname, 'documentacion', 'casa_julian_erretegia.jpg');
const hasHeaderImage = fs.existsSync(headerImagePath);
const headerImageUrl = 'https://raw.githubusercontent.com/AnderUrienGoierri/casa-julian-whatsapp/main/documentacion/casa_julian_erretegia.jpg';
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_cTP3Abo8_DxT439uxnRHriY6G9UXifbuQ';

/**
 * Envía un correo electrónico mediante la API REST HTTPS de Resend (Puerto 443).
 * Este método bypassea al 100% los bloqueos de puertos TCP (25, 465, 587) de servidores cloud como Render.com.
 */
async function sendViaResendHttpApi(targetEmail, subject, emailHtml) {
    try {
        const response = await axios.post(
            'https://api.resend.com/emails',
            {
                from: 'Asador Casa Julián <onboarding@resend.dev>',
                to: [targetEmail],
                subject: subject,
                html: emailHtml
            },
            {
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            }
        );
        console.log(`   └─ ✅ Email de alerta entregado con éxito vía Resend HTTPS (ID: ${response.data.id})`);
        return { success: true, method: 'resend_https_api_port443', messageId: response.data.id, targetEmail };
    } catch (error) {
        const errDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("⚠️ Falló Resend HTTPS API:", errDetails);
        return { success: false, error: errDetails };
    }
}

/**
 * Genera dinámicamente el transporte SMTP consultando las variables de entorno activas.
 * Soporta puerto 465 (SSL) y puerto 587 (STARTTLS) como sistema secundario.
 */
function getTransporter(forcedPort = null) {
    let smtpUser = (process.env.SMTP_USER || 'anurte@gmail.com').trim();
    let smtpPass = (process.env.SMTP_PASS || 'gnymaconrsfygnek').trim();

    if (!smtpUser) {
        return null;
    }

    const isGmailUser = smtpUser.toLowerCase().endsWith('@gmail.com');

    if (isGmailUser) {
        if (!smtpPass || smtpPass.includes('Errotagain')) {
            smtpPass = 'gnymaconrsfygnek';
        }

        const targetPort = forcedPort || 465;
        const isSecure = targetPort === 465;

        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: targetPort,
            secure: isSecure,
            auth: {
                user: smtpUser,
                pass: smtpPass
            },
            connectionTimeout: 8000,
            greetingTimeout: 5000,
            socketTimeout: 10000,
            tls: { rejectUnauthorized: false }
        });
    }

    const host = process.env.SMTP_HOST || 'smtp.office365.com';
    const port = forcedPort || parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = port === 465 || process.env.SMTP_SECURE === 'true';

    return nodemailer.createTransport({
        host: host,
        port: port,
        secure: secure,
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        connectionTimeout: 8000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        tls: { rejectUnauthorized: false }
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
 * Utiliza Resend HTTPS API (Puerto 443) con fallback a Nodemailer SMTP.
 */
async function sendInternalStaffAlertInSpanish(tipoAccion, telefonoCliente, datosDetallados, nombreCliente = null, telefonoReserva = null) {
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const categoryInfo = getCategoryHeader(tipoAccion);
    
    let targetEmail = process.env.STAFF_EMAIL || 'anurte@gmail.com';
    if (targetEmail.includes('outlook')) {
        targetEmail = 'anurte@gmail.com';
    }

    const nombreDisplay = nombreCliente ? nombreCliente : 'Ver detalles abajo';
    const telDisplay = telefonoReserva ? telefonoReserva : telefonoCliente;

    const alertMessage = `${categoryInfo.banner}\n\n` +
        `🏷️ *Categoría:* ${categoryInfo.colorTag}\n` +
        `👤 *Nombre Cliente:* ${nombreDisplay}\n` +
        `📞 *Teléfono Cliente:* ${telDisplay}\n` +
        `⏰ *Fecha Registro:* ${timestamp}\n\n` +
        `📝 *Datos Recibidos:*\n${datosDetallados}`;

    console.log(`\n================ [NOTIFICACIÓN INTERNA PARA PERSONAL EN ESPAÑOL] ================`);
    console.log(categoryInfo.banner);
    console.log(`🏷️ CATEGORÍA: ${categoryInfo.colorTag}`);
    console.log(`👤 NOMBRE CLIENTE: ${nombreDisplay}`);
    console.log(`📞 TELÉFONO CLIENTE: ${telDisplay}`);
    console.log(`📧 EMAIL DESTINO: ${targetEmail}`);
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

    // 2. Enviar email (HTTPS REST API Resend primero, fallback SMTP Nodemailer)
    const emailHtmlResend = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #8B0000; border-radius: 8px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <div style="width: 100%; text-align: center; background-color: #111; max-height: 240px; overflow: hidden;"><img src="${headerImageUrl}" alt="Asador Casa Julián" style="width: 100%; max-height: 240px; object-fit: cover; display: block;" /></div>
        <div style="background-color: #8B0000; color: #ffffff; padding: 14px; text-align: center;">
            <h2 style="margin: 0;">Asador Casa Julián de Tolosa</h2>
            <p style="margin: 6px 0 0 0; font-size: 15px; font-weight: bold;">${categoryInfo.colorTag}</p>
        </div>
        <div style="padding: 20px;">
            <p style="font-size: 16px; color: #333; margin-top: 0;"><strong>Categoría:</strong> <span style="color: #8B0000; font-weight: bold;">${categoryInfo.colorTag}</span></p>
            <p style="font-size: 15px; color: #333;"><strong>Nombre del Cliente:</strong> ${nombreDisplay}</p>
            <p style="font-size: 15px; color: #333;"><strong>Teléfono del Cliente:</strong> ${telDisplay}</p>
            <p style="font-size: 14px; color: #666;"><strong>Fecha y Hora de Registro:</strong> ${timestamp}</p>
            
            <div style="background-color: #fdf8f5; border-left: 4px solid #8B0000; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #8B0000;">Datos Recibidos del Cliente:</h3>
                <pre style="font-family: inherit; font-size: 14px; white-space: pre-wrap; word-break: break-word; color: #222;">${datosDetallados}</pre>
            </div>
        </div>
        <div style="border-top: 1px solid #eee; padding: 12px; text-align: center; font-size: 12px; color: #888; background-color: #fafafa;">
            <p style="margin: 0;">Notificación Automática del Sistema de Reservas - Asador Casa Julián</p>
        </div>
    </div>
    `;

    const subject = `${categoryInfo.subjectTag} - ${nombreDisplay} (${telDisplay})`;

    // Intento 1: API REST HTTPS Resend (Puerto 443 garantizado sin bloqueos cloud)
    const resendResult = await sendViaResendHttpApi(targetEmail, subject, emailHtmlResend);
    if (resendResult.success) {
        return resendResult;
    }

    // Intento 2: Fallback Nodemailer SMTP (Puerto 465 / 587)
    let activeTransporter = getTransporter(465);

    if (activeTransporter) {
        const headerImageHtml = hasHeaderImage 
            ? `<div style="width: 100%; text-align: center; background-color: #111; max-height: 240px; overflow: hidden;"><img src="cid:casa_julian_header" alt="Asador Casa Julián" style="width: 100%; max-height: 240px; object-fit: cover; display: block;" /></div>`
            : '';

        const emailHtmlSmtp = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #8B0000; border-radius: 8px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            ${headerImageHtml}
            <div style="background-color: #8B0000; color: #ffffff; padding: 14px; text-align: center;">
                <h2 style="margin: 0;">Asador Casa Julián de Tolosa</h2>
                <p style="margin: 6px 0 0 0; font-size: 15px; font-weight: bold;">${categoryInfo.colorTag}</p>
            </div>
            <div style="padding: 20px;">
                <p style="font-size: 16px; color: #333; margin-top: 0;"><strong>Categoría:</strong> <span style="color: #8B0000; font-weight: bold;">${categoryInfo.colorTag}</span></p>
                <p style="font-size: 15px; color: #333;"><strong>Nombre del Cliente:</strong> ${nombreDisplay}</p>
                <p style="font-size: 15px; color: #333;"><strong>Teléfono del Cliente:</strong> ${telDisplay}</p>
                <p style="font-size: 14px; color: #666;"><strong>Fecha y Hora de Registro:</strong> ${timestamp}</p>
                
                <div style="background-color: #fdf8f5; border-left: 4px solid #8B0000; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="margin-top: 0; color: #8B0000;">Datos Recibidos del Cliente:</h3>
                    <pre style="font-family: inherit; font-size: 14px; white-space: pre-wrap; word-break: break-word; color: #222;">${datosDetallados}</pre>
                </div>
            </div>
            <div style="border-top: 1px solid #eee; padding: 12px; text-align: center; font-size: 12px; color: #888; background-color: #fafafa;">
                <p style="margin: 0;">Notificación Automática del Sistema de Reservas - Asador Casa Julián</p>
            </div>
        </div>
        `;

        const mailOptions = {
            from: `"Casa Julian Bot" <${process.env.SMTP_USER || 'anurte@gmail.com'}>`,
            to: targetEmail,
            subject: subject,
            html: emailHtmlSmtp,
            attachments: hasHeaderImage ? [{
                filename: 'casa_julian_erretegia.jpg',
                path: headerImagePath,
                cid: 'casa_julian_header'
            }] : []
        };

        try {
            const info = await activeTransporter.sendMail(mailOptions);
            console.log(`   └─ ✅ Email de alerta entregado con éxito a ${targetEmail} (ID: ${info.messageId})`);
            return { success: true, method: 'port_465_ssl', messageId: info.messageId, targetEmail };
        } catch (error) {
            console.error('⚠️ Falló puerto 465, probando fallback puerto 587:', error.message);
            try {
                const fallbackTransporter = getTransporter(587);
                const info2 = await fallbackTransporter.sendMail(mailOptions);
                console.log(`   └─ ✅ Email de alerta entregado con éxito (vía Fallback 587) a ${targetEmail} (ID: ${info2.messageId})`);
                return { success: true, method: 'port_587_tls_fallback', messageId: info2.messageId, targetEmail, errPort465: error.message };
            } catch (fallbackErr) {
                console.error('⚠️ Error al enviar email interno al personal:', fallbackErr.message);
                return { success: false, targetEmail, resendErr: resendResult.error, errPort465: error.message, errPort587: fallbackErr.message };
            }
        }
    } else {
        return { success: false, resendErr: resendResult.error, targetEmail };
    }
}

/**
 * Envía un correo electrónico de confirmación de reserva al cliente.
 */
async function sendEmailConfirmation(reserva) {
    const emailHtmlResend = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #fcfbf9;">
        <div style="width: 100%; text-align: center; background-color: #111; max-height: 240px; overflow: hidden;"><img src="${headerImageUrl}" alt="Asador Casa Julián" style="width: 100%; max-height: 240px; object-fit: cover; display: block;" /></div>
        <div style="text-align: center; border-bottom: 2px solid #8B0000; padding: 15px; background-color: #ffffff;">
            <h1 style="color: #8B0000; margin: 0;">Asador Casa Julian de Tolosa</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Confirmación Oficial de Reserva</p>
        </div>
        <div style="padding: 20px;">
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
        <div style="text-align: center; border-top: 1px solid #e0e0e0; padding: 15px; color: #888; font-size: 12px; background-color: #fafafa;">
            <p style="margin: 0 0 5px 0;">Casa Julian • Calle Sta. Clara 6, Tolosa / Calle Ibiza 42, Madrid</p>
            <p style="margin: 0;"><a href="https://casajulian.eus/" style="color: #8B0000; text-decoration: none;">https://casajulian.eus/</a></p>
        </div>
    </div>
    `;

    const res = await sendViaResendHttpApi(reserva.email, `✅ Reserva Confirmada (${reserva.id}) - Asador Casa Julian`, emailHtmlResend);
    if (res.success) {
        console.log(`   └─ Status: Email entregado a ${reserva.email} vía Resend HTTPS API`);
        return;
    }

    const activeTransporter = getTransporter();
    if (activeTransporter) {
        try {
            await activeTransporter.sendMail({
                from: `"Casa Julian Reservas" <${process.env.SMTP_USER || 'anurte@gmail.com'}>`,
                to: reserva.email,
                subject: `✅ Reserva Confirmada (${reserva.id}) - Asador Casa Julian`,
                html: emailHtmlResend,
                attachments: hasHeaderImage ? [{
                    filename: 'casa_julian_erretegia.jpg',
                    path: headerImagePath,
                    cid: 'casa_julian_header'
                }] : []
            });
            console.log(`   └─ Status: Email entregado a ${reserva.email} vía SMTP`);
        } catch (error) {
            console.error('⚠️ Error al enviar email de confirmación:', error.message);
        }
    }
}

module.exports = {
    sendEmailConfirmation,
    sendInternalStaffAlertInSpanish
};
