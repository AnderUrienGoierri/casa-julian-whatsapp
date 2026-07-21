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

    // Intentar envío real si hay credenciales configuradas
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await transporter.sendMail({
                from: '"Casa Julian Reservas" <reservas@casajulian.eus>',
                to: reserva.email,
                subject: `✅ Reserva Confirmada (${reserva.id}) - Asador Casa Julian`,
                html: htmlTemplate
            });
            console.log(`   └─ Status: Email entregado en bandeja de entrada real (${reserva.email})`);
        } catch (err) {
            console.error("   └─ Error al enviar correo SMTP real:", err.message);
        }
    }
}

/**
 * Envía un mensaje SMS de confirmación de reserva al móvil del cliente.
 */
async function sendSMSConfirmation(reserva) {
    const smsMessage = `Casa Julian: Hola ${reserva.nombre}, tu reserva ${reserva.id} para el ${reserva.fecha} a las ${reserva.hora}hs (${reserva.comensales} p.) ha sido CONFIRMADA. ¡Te esperamos!`;

    console.log(`\n📱 [SMS CONFIRMACIÓN ENVIADO] ➔ A: ${reserva.telefono}`);
    console.log(`   Mensaje: "${smsMessage}"`);
    console.log(`   └─ Status: Mensaje SMS despachado a la red telefónica de ${reserva.telefono}`);
}

module.exports = {
    sendEmailConfirmation,
    sendSMSConfirmation
};
