const nodemailer = require('nodemailer');
require('dotenv').config();

// Configuración opcional de correo SMTP
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

/**
 * Envía una alerta interna al personal/maitre de Casa Julián 100% en ESPAÑOL.
 */
async function sendInternalStaffAlertInSpanish(tipoAccion, telefonoCliente, datosDetallados) {
    const alertHeader = `🚨 [ALERTA RECEPCIÓN CASA JULIÁN] - ${tipoAccion.toUpperCase()}`;
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #8B0000; border-radius: 8px; padding: 20px; background-color: #ffffff;">
        <div style="background-color: #8B0000; color: #ffffff; padding: 12px; text-align: center; border-radius: 4px;">
            <h2 style="margin: 0;">Asador Casa Julián de Tolosa</h2>
            <p style="margin: 4px 0 0 0; font-size: 14px;">Solicitud de Cliente por WhatsApp (Atención en Español)</p>
        </div>
        <div style="padding: 20px 0;">
            <p style="font-size: 16px; color: #333;"><strong>Tipo de Gestión:</strong> <span style="color: #8B0000;">${tipoAccion}</span></p>
            <p style="font-size: 15px; color: #333;"><strong>Teléfono del Cliente:</strong> ${telefonoCliente}</p>
            <p style="font-size: 14px; color: #666;"><strong>Fecha y Hora de Registro:</strong> ${timestamp}</p>
            
            <div style="background-color: #fdf8f5; border-left: 4px solid #8B0000; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #8B0000;">Datos Recibidos del Cliente:</h3>
                <pre style="font-family: inherit; font-size: 14px; white-space: pre-wrap; word-break: break-word; color: #222;">${datosDetallados}</pre>
            </div>
        </div>
        <div style="text-align: center; border-top: 1px solid #eee; padding-top: 10px; color: #888; font-size: 12px;">
            <p>Sistema Automatizado Casa Julián • Notificación Interna Recepción</p>
        </div>
    </div>
    `;

    console.log(`\n================ [NOTIFICACIÓN INTERNA PARA PERSONAL EN ESPAÑOL] ================`);
    console.log(`📌 TIPO: ${tipoAccion}`);
    console.log(`📞 TELÉFONO CLIENTE: ${telefonoCliente}`);
    console.log(`⏰ FECHA: ${timestamp}`);
    console.log(`📝 DATOS RECIBIDOS:\n${datosDetallados}`);
    console.log(`=================================================================================\n`);

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await transporter.sendMail({
                from: '"Casa Julian WhatsApp Bot" <alertas@casajulian.eus>',
                to: process.env.STAFF_EMAIL || 'recepcion@casajulian.eus',
                subject: `🚨 ${tipoAccion} - WhatsApp Cliente ${telefonoCliente}`,
                html: emailHtml
            });
            console.log(`   └─ Email de alerta enviado al personal (${process.env.STAFF_EMAIL || 'recepcion@casajulian.eus'})`);
        } catch (error) {
            console.error('⚠️ Error al enviar email interno al personal:', error.message);
        }
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
    console.log(`   Asunto: Confirmación de Reserva ${reserva.id} - Casa Julian`);

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await transporter.sendMail({
                from: '"Casa Julian Reservas" <reservas@casajulian.eus>',
                to: reserva.email,
                subject: `✅ Reserva Confirmada (${reserva.id}) - Asador Casa Julian`,
                html: htmlTemplate
            });
            console.log(`   └─ Status: Email entregado en bandeja de entrada real (${reserva.email})`);
        } catch (error) {
            console.error('⚠️ Error al enviar email de confirmación:', error.message);
        }
    }
}

module.exports = {
    sendEmailConfirmation,
    sendInternalStaffAlertInSpanish
};
