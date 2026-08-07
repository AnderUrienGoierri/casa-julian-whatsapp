const { sendMessage, sendImageMessage, sendInteractiveButtons, sendInteractiveList } = require('../whatsappApi');
const { getTranslation } = require('../i18n');

/**
 * Envía la imagen del Menú Tradición y el enlace directo para comprar la tarjeta regalo en la web oficial.
 */
async function handleRegalarMenuTradicion(from, lang, userStates) {
    const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || 'https://casa-julian-whatsapp-bot.onrender.com';
    const imageUrl = `${serverBaseUrl}/public/menu_tradicion.png`;
    const caption = getTranslation(lang, 'regalarMenuCaption');

    try {
        await sendImageMessage(from, imageUrl, caption);
    } catch (e) {
        console.error("⚠️ Error enviando imagen de Menú Tradición por WhatsApp:", e.message);
    }

    const messageText = getTranslation(lang, 'regalarMenuMsg');
    await sendMessage(from, messageText);
    await sendMessage(from, getTranslation(lang, 'thanksClosingMsg'));
    userStates.delete(from);
}

/**
 * Muestra las opciones iniciales para Tarjeta Regalo / Menú Tradición.
 */
async function sendGiftCardOptions(from, lang, userStates) {
    userStates.set(from, { step: 'menu_tradicion_opciones', data: {} });
    let promptBody = '';
    let btnRes = '';
    let btnCad = '';

    if (lang === 'eu') {
        promptBody = `💳 *Tradizio Menua (Opari Txartela)*\n\nZer kudeaketa egin nahi duzu?`;
        btnRes = `📅 Erreserbatu`;
        btnCad = `⏳ Iraungipena ikusi`;
    } else if (lang === 'en') {
        promptBody = `💳 *Tradition Menu (Gift Card)*\n\nWhat would you like to do?`;
        btnRes = `📅 Book`;
        btnCad = `⏳ Check Expiration`;
    } else {
        promptBody = `💳 *Menú Tradición (Tarjeta Regalo)*\n\n¿Qué gestión deseas realizar?`;
        btnRes = `📅 Reservar`;
        btnCad = `⏳ Fecha caducidad`;
    }

    const buttons = [
        { id: 'menu_tradicion_reservar', title: btnRes.slice(0, 20) },
        { id: 'menu_tradicion_caducidad', title: btnCad.slice(0, 20) }
    ];
    await sendInteractiveButtons(from, promptBody, buttons);
}

/**
 * Maneja la selección interactiva de turno horario (Comida/Cena) en el formulario de Menú Tradición.
 */
async function handleMenuTradSlotSelection(from, slotId, lang, userStates) {
    const state = userStates.get(from) || { data: {} };
    state.data.menuTrad = state.data.menuTrad || {};

    if (slotId === 'mt_slot_sin_pref') {
        state.data.menuTrad.horario = 'Sin preferencia';
    } else {
        const rawTime = slotId.replace('mt_slot_', '');
        const timeClean = rawTime.replace(/(\d{2})(\d{2})/, '$1:$2');
        state.data.menuTrad.horario = timeClean;
    }

    state.data.menuTrad.fechas = [];
    state.step = 'menu_trad_step5_dias';
    userStates.set(from, state);

    await sendMessage(from, getTranslation(lang, 'menuTradStep5FechasPrompt'));
}

/**
 * Envía la lista desplegable interactiva para seleccionar días de preferencia en Menú Tradición.
 */
async function sendMenuTradDaysList(from, lang, userStates) {
    const state = userStates.get(from) || { data: {} };
    state.data.menuTrad = state.data.menuTrad || {};
    const selectedDays = state.data.menuTrad.selectedDays || [];
    const nextAvailMsg = state.data.menuTrad.nextAvailMsg || '';

    state.step = 'menu_trad_step5_dias';
    userStates.set(from, state);

    let promptBody = getTranslation(lang, 'menuTradStep5Dia1').replace('{nextAvailable}', nextAvailMsg);
    if (selectedDays.length > 0) {
        const daysFormatted = selectedDays.map(d => d.label).join(', ');
        const daysHeader = getTranslation(lang, 'selectedDaysHeader').replace('{days}', daysFormatted);
        if (lang === 'eu') {
            promptBody = `🎁 *Tradizio Menua (5/7)*\n\n${daysHeader}\n\nHautatu beste egun bat (gehienez 3) edo sakatu "Amaitu hautaketa":`;
        } else if (lang === 'en') {
            promptBody = `🎁 *Tradition Menu (5/7)*\n\n${daysHeader}\n\nSelect another day (max 3) or tap "Finish selection":`;
        } else {
            promptBody = `🎁 *Menú Tradición (5/7)*\n\n${daysHeader}\n\nSeleccione otro día (máx 3) o pulse "Finalizar selección":`;
        }
    }

    const buttonText = getTranslation(lang, 'menuButtonText');
    const rows = [];

    if (selectedDays.length > 0) {
        rows.push({
            id: 'mt_day_done',
            title: (getTranslation(lang, 'btnFinishDaySelection') || '✅ Amaitu hautaketa').slice(0, 24),
            description: (getTranslation(lang, 'descFinishDaySelection') || 'Gorde aukeratutako egunak').slice(0, 72)
        });
    } else {
        rows.push({
            id: 'mt_day_skip',
            title: getTranslation(lang, 'rowSinPreferenciaTitle').slice(0, 24),
            description: getTranslation(lang, 'rowSinPreferenciaDesc').slice(0, 72)
        });
    }

    const allDays = [
        { key: 'martes', label: getTranslation(lang, 'dayMartes') },
        { key: 'miercoles', label: getTranslation(lang, 'dayMiercoles') },
        { key: 'jueves', label: getTranslation(lang, 'dayJueves') },
        { key: 'viernes', label: getTranslation(lang, 'dayViernes') },
        { key: 'sabado', label: getTranslation(lang, 'daySabado') },
        { key: 'domingo', label: getTranslation(lang, 'dayDomingo') }
    ];

    const selectedKeys = selectedDays.map(d => d.key);
    allDays.filter(d => !selectedKeys.includes(d.key)).forEach(d => {
        rows.push({
            id: 'mt_day_' + d.key,
            title: d.label.slice(0, 24),
            description: `Aukeratu ${d.label}`.slice(0, 72)
        });
    });

    await sendInteractiveList(from, promptBody, buttonText, [{ title: "Egunen erabilgarritasuna", rows }]);
}

module.exports = {
    handleRegalarMenuTradicion,
    sendGiftCardOptions,
    handleMenuTradSlotSelection,
    sendMenuTradDaysList
};
