const { sendMessage, sendImageMessage, sendInteractiveButtons } = require('../whatsappApi');
const { getTranslation } = require('../i18n');

/**
 * Responde a una selección de FAQ.
 */
async function handleFaqSelection(from, faqId, lang, handleRegalarMenuTradicion) {
    if (faqId === 'faq_regalar_menu' || faqId === 'opt_regalar_menu_tradicion') {
        if (handleRegalarMenuTradicion) await handleRegalarMenuTradicion(from, lang);
        return;
    }

    const faqNum = faqId.replace('faq_', '');

    // Opción 1: Ver carta -> Enviar la imagen oficial de la carta (media/carta.png)
    if (faqNum === '1' || faqNum === '12' || faqId === 'faq_carta') {
        const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || 'https://casa-julian-whatsapp-bot.onrender.com';
        const imageUrl = `${serverBaseUrl}/media/carta.png`;
        let caption = "📜 *Carta & Precios - Asador Casa Julián de Tolosa*";
        if (lang === 'eu') {
            caption = "📜 *Karta eta Prezioak - Tolosako Casa Julián Erretegia*";
        } else if (lang === 'en') {
            caption = "📜 *Menu & Prices - Asador Casa Julián Tolosa*";
        }

        try {
            await sendImageMessage(from, imageUrl, caption);
            return;
        } catch (e) {
            console.error("⚠️ Error enviando imagen de la carta por WhatsApp:", e.message);
        }
    }

    const msgKey = `faq${faqNum}Msg`;
    const responseMsg = getTranslation(lang, msgKey);

    if (responseMsg) {
        if (faqNum === '5') { // Option 5: Cancelación
            const cancelBtnTitle = (lang === 'eu' ? 'Erreserba ezeztatu' : (lang === 'en' ? 'Cancel booking' : 'Cancelar reserva'));
            const buttons = [
                { id: 'btn_go_cancelacion', title: cancelBtnTitle.slice(0, 20) }
            ];
            await sendInteractiveButtons(from, responseMsg, buttons);
            return;
        }

        if (faqNum === '6') { // Option 6: Reducción comensales
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
