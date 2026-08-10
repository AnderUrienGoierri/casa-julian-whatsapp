const { sendMessage, sendInteractiveButtons } = require('../whatsappApi');
const { getTranslation } = require('../i18n');
const { userStates: defaultUserStates } = require('./stateManager');

/**
 * Solicita confirmación interactiva al cliente antes de enviar la alerta a recepción.
 */
async function requestUserConfirmation(from, lang, pendingAlertData, userStatesParam) {
    const activeStates = userStatesParam || defaultUserStates;
    const state = activeStates.get(from) || { lang: lang };
    state.step = 'confirmacion_solicitud';
    state.data = state.data || {};
    state.data.pendingAlert = pendingAlertData;
    activeStates.set(from, state);

    // 1. Enviar primero al cliente un mensaje con el resumen detallado de su solicitud
    const summaryHeader = getTranslation(lang, 'requestSummaryHeader');
    const clientSummaryMsg = `${summaryHeader}\n\n${pendingAlertData.detalleMod}`;
    await sendMessage(from, clientSummaryMsg);

    // 2. Enviar la pregunta interactiva con los botones de confirmación
    const promptBody = getTranslation(lang, 'confirmPrompt');
    const buttons = [
        { id: 'confirm_yes', title: getTranslation(lang, 'confirmYesBtn').slice(0, 20) },
        { id: 'confirm_no', title: getTranslation(lang, 'confirmNoBtn').slice(0, 20) }
    ];

    await sendInteractiveButtons(from, promptBody, buttons);
}

module.exports = {
    requestUserConfirmation
};
