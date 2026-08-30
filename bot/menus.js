const { 
    sendInteractiveButtons, 
    sendInteractiveList, 
    sendMessage,
    sendImageMessage
} = require('../whatsappApi');
const { getTranslation } = require('../i18n');

/**
 * Muestra el menú de selección de idioma (3 idiomas: Español, Euskara, English).
 */
async function sendLanguageMenu(from, userLanguages, userStates) {
    const lang = userLanguages.get(from) || 'es';
    userStates.set(from, { step: 'select_language', data: {} });

    let welcomeMsgText = getTranslation('es', 'welcomeMessage', from);
    if (!welcomeMsgText || welcomeMsgText.includes('FR:') || welcomeMsgText.includes('🇫🇷') || welcomeMsgText.includes('Bienvenue')) {
        welcomeMsgText = "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800CASA JULIAN TOLOSA";
    }
    const bodyText = welcomeMsgText;
    
    const buttons = [
        { id: "lang_es", title: "ES Español" },
        { id: "lang_eu", title: "EU Euskara" },
        { id: "lang_en", title: "EN English" }
    ];
    console.log(`📤 Enviando menú de idiomas a ${from}...`);
    const resp = await sendInteractiveButtons(from, bodyText, buttons);
    if (resp && resp.messages) {
        console.log(`✅ Menú de idiomas entregado a Meta para ${from} (MsgID: ${resp.messages[0].id})`);
    } else {
        console.warn(`⚠️ Resultado de envío de menú de idiomas para ${from}:`, resp);
    }
}

/**
 * Muestra el menú de ubicación si el cliente aún no ha elegido ubicación,
 * o envía directamente el Menú Principal si ya eligió País Vasco (Tolosa).
 */
async function showLocationOrMainMenu(from, userLocations, userLanguages, userStates) {
    const userLoc = userLocations.get(from);
    if (userLoc === 'pais_vasco') {
        await sendMainMenu(from, userLanguages, userStates);
    } else {
        await sendLocationMenu(from, userLanguages);
    }
}

/**
 * Pregunta al cliente la ubicación del restaurante de su interés (Madrid vs País Vasco).
 */
async function sendLocationMenu(from, userLanguages) {
    const lang = userLanguages.get(from) || 'es';
    const titleText = getTranslation(lang, 'selectLocationTitle');
    const bodyText = getTranslation(lang, 'selectLocationBody');
    const fullText = titleText ? `${titleText}\n\n${bodyText}` : bodyText;
    const buttons = [
        { id: 'loc_pais_vasco', title: getTranslation(lang, 'locPaisVasco').slice(0, 20) },
        { id: 'loc_madrid', title: getTranslation(lang, 'locMadrid').slice(0, 20) }
    ];
    await sendInteractiveButtons(from, fullText, buttons);
}

/**
 * Muestra el menú principal de País Vasco (Tolosa) en el idioma del usuario.
 */
async function sendMainMenu(from, userLanguages, userStates) {
    const lang = userLanguages.get(from) || 'es';
    userStates.set(from, { step: 'main_menu', data: {} });

    const imageUrl = "https://casa-julian-whatsapp-bot.onrender.com/public/imagen_chat_casa_julian.jpg";
    await sendImageMessage(from, imageUrl, "🥩🔥 *Asador Casa Julián de Tolosa* 🥩🍖");

    const bodyText = getTranslation(lang, 'mainMenuHeader');
    const buttonText = getTranslation(lang, 'menuButtonText');
    
    const sections = [
        {
            title: "Servicios Casa Julián",
            rows: [
                { id: "opt_quiero_reservar", title: getTranslation(lang, 'opt1Title').slice(0, 24), description: getTranslation(lang, 'opt1Desc').slice(0, 72) },
                { id: "opt_modificacion", title: getTranslation(lang, 'opt2Title').slice(0, 24), description: getTranslation(lang, 'opt2Desc').slice(0, 72) },
                { id: "opt_cancelacion", title: getTranslation(lang, 'opt3Title').slice(0, 24), description: getTranslation(lang, 'opt3Desc').slice(0, 72) },
                { id: "opt_consulta_abierta", title: getTranslation(lang, 'optConsultaAbiertaTitle').slice(0, 24), description: getTranslation(lang, 'optConsultaAbiertaDesc').slice(0, 72) },
                { id: "opt_otras_cuestiones", title: getTranslation(lang, 'opt5Title').slice(0, 24), description: getTranslation(lang, 'opt5Desc').slice(0, 72) }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

/**
 * Despliega el menú de Preguntas Frecuentes (Otras cuestiones).
 */
async function sendFaqMenu(from, lang, userStates) {
    userStates.set(from, { step: 'faq_menu', data: {} });

    const bodyText = getTranslation(lang, 'faqTitle');
    const buttonText = getTranslation(lang, 'menuButtonText');

    const sections = [
        {
            title: "Otras Cuestiones",
            rows: [
                { id: "faq_1", title: getTranslation(lang, 'faq1Title').slice(0, 24), description: getTranslation(lang, 'faq1Desc').slice(0, 72) },
                { id: "faq_2", title: getTranslation(lang, 'faq2Title').slice(0, 24), description: getTranslation(lang, 'faq2Desc').slice(0, 72) },
                { id: "faq_3", title: getTranslation(lang, 'faq3Title').slice(0, 24), description: getTranslation(lang, 'faq3Desc').slice(0, 72) },
                { id: "faq_4", title: getTranslation(lang, 'faq4Title').slice(0, 24), description: getTranslation(lang, 'faq4Desc').slice(0, 72) },
                { id: "faq_5", title: getTranslation(lang, 'faq5Title').slice(0, 24), description: getTranslation(lang, 'faq5Desc').slice(0, 72) },
                { id: "faq_6", title: getTranslation(lang, 'faq6Title').slice(0, 24), description: getTranslation(lang, 'faq6Desc').slice(0, 72) },
                { id: "faq_7", title: getTranslation(lang, 'faq7Title').slice(0, 24), description: getTranslation(lang, 'faq7Desc').slice(0, 72) },
                { id: "faq_8", title: getTranslation(lang, 'faq8Title').slice(0, 24), description: getTranslation(lang, 'faq8Desc').slice(0, 72) },
                { id: "faq_9", title: getTranslation(lang, 'faq9Title').slice(0, 24), description: getTranslation(lang, 'faq9Desc').slice(0, 72) },
                { id: "faq_10", title: getTranslation(lang, 'faq10Title').slice(0, 24), description: getTranslation(lang, 'faq10Desc').slice(0, 72) }
            ]
        }
    ];

    await sendInteractiveList(from, bodyText, buttonText, sections);
}

module.exports = {
    sendLanguageMenu,
    showLocationOrMainMenu,
    sendLocationMenu,
    sendMainMenu,
    sendFaqMenu
};
