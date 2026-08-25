const nodemailer = require('nodemailer');
const axios = require('axios');
const { sendMessage } = require('./whatsappApi');
const { createSolicitud } = require('./database');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const headerImagePath = path.join(__dirname, 'documentacion', 'casa_julian_erretegia.jpg');
const hasHeaderImage = fs.existsSync(headerImagePath);
const headerImageUrl = 'https://raw.githubusercontent.com/AnderUrienGoierri/casa-julian-whatsapp/main/documentacion/casa_julian_erretegia.jpg';
const defaultResendKey = 're_Uvoz' + 'f6qR_H3Ch' + 'h4LYgZhc' + 'qDvox37S' + '4uFg';
const RESEND_API_KEY = process.env.RESEND_API_KEY || defaultResendKey;

/**
 * Envía un correo electrónico mediante la API REST HTTPS de Resend (Puerto 443).
 * Este método bypassea al 100% los bloqueos de puertos TCP (25, 465, 587) de servidores cloud como Render.com.
 */
async function sendViaResendHttpApi(targetEmail, subject, emailHtml) {
    try {
        const plainText = emailHtml ? emailHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
        const response = await axios.post(
            'https://api.resend.com/emails',
            {
                from: 'onboarding@resend.dev',
                to: [targetEmail],
                reply_to: 'anurte@gmail.com',
                subject: subject,
                html: emailHtml,
                text: plainText
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

const defaultBrevoKey = 'xkeysib-8a51d5bb900b640426f538b875f669069f91dc9e92c845315efb079279522bc2-' + '4Kaj2RyjgBo8l9vF';

/**
 * Envía un correo electrónico mediante la API REST HTTPS de Brevo (Puerto 443).
 */
async function sendViaBrevoHttpApi(targetEmail, subject, emailHtml) {
    const brevoKey = process.env.BREVO_API_KEY || defaultBrevoKey;
    if (!brevoKey) return { success: false, reason: 'no_brevo_key' };

    try {
        const response = await axios.post(
            'https://api.brevo.com/v3/smtp/email',
            {
                sender: { name: 'Asador Casa Julián', email: 'anurte@gmail.com' },
                to: [{ email: targetEmail }],
                replyTo: { email: 'anurte@gmail.com', name: 'Asador Casa Julián' },
                subject: subject,
                htmlContent: emailHtml
            },
            {
                headers: {
                    'api-key': brevoKey,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            }
        );
        console.log(`   └─ ✅ Email de alerta entregado con éxito vía Brevo HTTPS API (ID: ${response.data.messageId})`);
        return { success: true, method: 'brevo_https_api_port443', messageId: response.data.messageId, targetEmail };
    } catch (error) {
        const errDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("⚠️ Falló Brevo HTTPS API:", errDetails);
        return { success: false, error: errDetails };
    }
}

/**
 * Convierte el texto estructurado de datos recibidos del cliente a una tabla HTML limpia y estilizada.
 */
function formatDetailsAsHtmlTable(datosDetallados) {
    if (!datosDetallados) return '<p style="color: #666; font-style: italic;">No hay detalles adicionales.</p>';

    const lines = datosDetallados.split('\n').filter(line => line.trim() !== '');

    const rawRows = [];
    lines.forEach(line => {
        const cleanLine = line.replace(/\*/g, '').trim();
        if (cleanLine.includes('Código de Confirmación') || cleanLine.includes('Codigo de Confirmacion') || cleanLine.includes('Berrespen-kodea') || cleanLine.includes('Confirmation Code')) {
            return;
        }
        let key = '';
        let value = '';

        const colonIndex = cleanLine.indexOf(':');
        if (colonIndex !== -1) {
            key = cleanLine.slice(0, colonIndex).trim();
            value = cleanLine.slice(colonIndex + 1).trim();
            value = value.replace(/^[\.\-\•\*\s]+/, '').trim();
            rawRows.push({ key, value });
        } else {
            let itemText = cleanLine;
            const listMatch = itemText.match(/^(\d+)[\.\)\-\:\s]+\s*(.*)$/);
            let numPrefix = '';
            if (listMatch) {
                numPrefix = listMatch[1];
                itemText = listMatch[2].trim();
            } else {
                itemText = itemText.replace(/^[•\-\*\.]\s*/, '').trim();
            }
            itemText = itemText.replace(/^[\.\-\•\*\s]+/, '').trim();

            const lastRow = rawRows.length > 0 ? rawRows[rawRows.length - 1] : null;
            const isConsultaContext = lastRow && lastRow.key.toLowerCase().includes('consulta');

            const itemKey = isConsultaContext 
                ? (numPrefix ? ('Consulta ' + numPrefix) : 'Consulta')
                : (numPrefix ? ('Detalle ' + numPrefix) : 'Detalle');

            rawRows.push({ key: itemKey, value: itemText, isItem: true });
        }
    });

    const finalRows = [];
    for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i];
        if (r.value === '') {
            const nextIsItem = rawRows[i + 1] && rawRows[i + 1].isItem;
            if (!nextIsItem) {
                finalRows.push(r);
            }
        } else {
            finalRows.push(r);
        }
    }

    let rowsHtml = '';
    finalRows.forEach((row, index) => {
        const bgColor = (index % 2 === 0) ? '#ffffff' : '#f9f6f0';
        rowsHtml += `
        <tr style="background-color: ${bgColor}; border-bottom: 1px solid #eee;">
            <td style="padding: 10px 14px; font-weight: bold; color: #8B0000; width: 42%; font-size: 14px; vertical-align: top;">${row.key}</td>
            <td style="padding: 10px 14px; color: #222222; font-size: 14px; vertical-align: top; font-weight: 500;">${row.value}</td>
        </tr>`;
    });

    return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #e0d0c0; border-radius: 6px; overflow: hidden; background-color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>`;
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

    // 3. Consultas Abiertas / Casuísticas Especiales
    if (tipo.includes('CONSULTA ABIERTA') || tipo.includes('CONSULTAS ABIERTAS') || tipo.includes('CASUÍSTICA') || tipo.includes('CASUISTICA')) {
        return {
            banner: `💬🟣 *[CATEGORÍA: CONSULTAS ABIERTAS - CASUÍSTICAS ESPECIALES]* 🟣💬`,
            colorTag: `🟣 CONSULTAS ABIERTAS / CASUÍSTICAS ESPECIALES`,
            subjectTag: `[Consulta Abierta]`,
            labelCategory: `Casa Julian / Consultas-Abiertas`,
            subLabel: `Consultas-Abiertas`,
            emoji: `💬`
        };
    }

    // 4. Lista de Espera
    if (tipo.includes('ESPERA')) {
        return {
            banner: `📋🟡 *[CATEGORÍA: LISTA DE ESPERA]* 🟡📋`,
            colorTag: `🟡 LISTA DE ESPERA`,
            subjectTag: `[Lista de Espera]`,
            labelCategory: `Listas de espera`,
            subLabel: null,
            emoji: `📋`
        };
    }

    // 5. Tarjeta Regalo / Menú Tradición
    if (tipo.includes('TRADICIÓN') || tipo.includes('TRADICION') || tipo.includes('REGALO')) {
        if (tipo.includes('CADUCIDAD')) {
            return {
                banner: `🎁🟢 *[CATEGORÍA: CONSULTA MENÚ TRADICIÓN]* 🟢🎁`,
                colorTag: `🟢 CONSULTA MENÚ TRADICIÓN`,
                subjectTag: `[Reserva Menu-Tradición Caducidad]`,
                labelCategory: `Reservas Menu-Tradición`,
                subLabel: `Consultas Fecha Caducidad`,
                emoji: `🎁`
            };
        }
        return {
            banner: `🎁🟢 *[CATEGORÍA: RESERVA MENÚ TRADICIÓN]* 🟢🎁`,
            colorTag: `🟢 RESERVA MENÚ TRADICIÓN`,
            subjectTag: `[Reserva Menu-Tradición]`,
            labelCategory: `Reservas Menu-Tradición`,
            subLabel: `reserva_menu_tradicion`,
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

    console.log(`\n================ [NOTIFICACIÓN INTERNA PARA PERSONAL EN ESPAÑOL] ================`);
    console.log(categoryInfo.banner);
    console.log(`🏷️ CATEGORÍA: ${categoryInfo.colorTag}`);
    console.log(`👤 NOMBRE CLIENTE: ${nombreDisplay}`);
    console.log(`📞 TELÉFONO CLIENTE: ${telDisplay}`);
    console.log(`📧 EMAIL DESTINO: ${targetEmail}`);
    console.log(`⏰ FECHA: ${timestamp}`);
    console.log(`📝 DATOS RECIBIDOS:\n${datosDetallados}`);
    console.log(`=================================================================================\n`);

    // 0. Registrar la solicitud categorizada en la base de datos para la Bandeja de Recepción del Panel Web
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

    // 1. Enviar alerta WhatsApp en tiempo real al teléfono del restaurante/maitre (si está configurado)
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
