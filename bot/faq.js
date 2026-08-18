const { sendMessage, sendImageMessage, sendInteractiveButtons, sendTemplateMessage } = require('../whatsappApi');
const { getTranslation } = require('../i18n');
const db = require('../database');

/**
 * Responde a una selección de FAQ y registra la consulta en el buzón de recepción.
 */
async function handleFaqSelection(from, faqId, lang, handleRegalarMenuTradicion) {
    if (faqId === 'faq_regalar_menu' || faqId === 'opt_regalar_menu_tradicion') {
        if (handleRegalarMenuTradicion) await handleRegalarMenuTradicion(from, lang);
        return;
    }

    const faqNum = faqId.replace('faq_', '');
    const titleKey = `faq${faqNum}Title`;
    const faqTitleText = getTranslation(lang, titleKey) || `Consulta FAQ #${faqNum}`;

    // Registrar la consulta en el Buzón de Recepción para seguimiento del personal
    try {
        const detalleFaq = `❓ *CONSULTA PREGUNTAS FRECUENTES (OTRAS CUESTIONES)*\n\n` +
                           `📌 *Opción consultada:* ${faqTitleText}\n` +
                           `📱 *WhatsApp Remitente:* ${from}\n` +
                           `🌐 *Idioma:* ${lang.toUpperCase()}`;

        await db.createSolicitud({
            tipoAccion: `PREGUNTAS FRECUENTES: ${faqTitleText}`,
            telefonoCliente: from,
            datosDetallados: detalleFaq,
            nombreCliente: `Cliente WhatsApp (+${from})`,
            telefonoReserva: from
        });
    } catch (solErr) {
        console.error("⚠️ Error registrando FAQ en el buzón de recepción:", solErr.message);
    }

    // Opción 1 / Ver carta -> Plantilla / enlace web a la carta sin imagen
    if (faqNum === '1' || faqNum === '12' || faqId === 'faq_carta') {
        const templateRes = await sendTemplateMessage(from, 'ver_carta_web', lang);
        if (!templateRes || !templateRes.messages) {
            let msg = `📜 *Carta & Precios - Asador Casa Julián de Tolosa*\n\nPuedes consultar nuestra carta completa y actualizada directamente en nuestra web oficial:\n\n🌐 https://casajulian.eus/#:~:text=CARTA`;
            if (lang === 'eu') {
                msg = `📜 *Karta eta Prezioak - Tolosako Casa Julián Erretegia*\n\nGure karta eguneratua zuzenean webgune ofizialean kontsulta dezakezu:\n\n🌐 https://casajulian.eus/#:~:text=CARTA`;
            } else if (lang === 'en') {
                msg = `📜 *Menu & Prices - Asador Casa Julián Tolosa*\n\nYou can view our full updated menu and prices directly on our official website:\n\n🌐 https://casajulian.eus/#:~:text=CARTA`;
            }
            await sendMessage(from, msg);
        }
        return;
    }

    // Opción 7: Regalar Menú Tradición
    if (faqNum === '7') {
        const templateRes = await sendTemplateMessage(from, 'comprar_menu_tradicion', lang);
        if (!templateRes || !templateRes.messages) {
            const responseMsg = getTranslation(lang, 'faq7Msg');
            await sendMessage(from, responseMsg);
        }
        return;
    }

    // Opción 8: Ubicación en Google Maps
    if (faqNum === '8') {
        const templateRes = await sendTemplateMessage(from, 'ubicacion_google_maps', lang);
        if (!templateRes || !templateRes.messages) {
            const responseMsg = getTranslation(lang, 'faq8Msg');
            await sendMessage(from, responseMsg);
        }
        return;
    }

    const msgKey = `faq${faqNum}Msg`;
    const responseMsg = getTranslation(lang, msgKey);

    if (responseMsg) {
        if (faqNum === '4') { // Option 4: Cancelación
            const cancelBtnTitle = (lang === 'eu' ? 'Erreserba ezeztatu' : (lang === 'en' ? 'Cancel booking' : 'Cancelar reserva'));
            const buttons = [
                { id: 'btn_go_cancelacion', title: cancelBtnTitle.slice(0, 20) }
            ];
            await sendInteractiveButtons(from, responseMsg, buttons);
            return;
        }

        if (faqNum === '5') { // Option 5: Reducción comensales
            const modBtnTitle = (lang === 'eu' ? 'Erreserba aldatu' : (lang === 'en' ? 'Modify booking' : 'Modificar reserva'));

            const buttons = [
                { id: 'btn_go_modificacion', title: modBtnTitle.slice(0, 20) }
            ];
            await sendInteractiveButtons(from, responseMsg, buttons);
            return;
        }
        await sendMessage(from, responseMsg);
    }
}

module.exports = {
    handleFaqSelection
};
