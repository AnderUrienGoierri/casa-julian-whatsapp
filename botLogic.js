/**
 * Asador Casa Julián - Módulo Principal del Bot de WhatsApp (Fachada Minimalista)
 * 
 * Re-exporta la lógica modularizada desde la carpeta /bot para mantener 100% 
 * de compatibilidad hacia atrás con server.js, adminApi.js y notifications.js.
 */

const bot = require('./bot');

module.exports = {
    // Enrutador de mensajes
    processMessage: bot.processMessage,
    handleUserMessage: bot.handleUserMessage,

    // Menús interactivos
    sendLanguageMenu: (from) => bot.sendLanguageMenu(from, bot.userLanguages, bot.userStates),
    sendLocationMenu: (from) => bot.sendLocationMenu(from, bot.userLanguages),
    sendMainMenu: (from) => bot.sendMainMenu(from, bot.userLanguages, bot.userStates),

    // Utilidades de validación
    checkRestaurantClosedDate: bot.checkRestaurantClosedDate,

    // Mapas de estado compartidos en memoria y disco
    userStates: bot.userStates,
    userLanguages: bot.userLanguages,
    userLocations: bot.userLocations,

    // Re-exportación completa del submódulo
    ...bot
};
