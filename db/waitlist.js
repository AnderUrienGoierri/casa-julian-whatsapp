/**
 * Módulo simplificado de Lista de Espera.
 * La gestión de lista de espera a través del chatbot se realiza enviando el enlace a la web del restaurante.
 */

async function addToWaitlist(data) {
    return { id: 'ESP-WEB', note: 'Waitlist managed via restaurant web link' };
}

function getWaitlistPosition(criterio) {
    return { encontrado: false };
}

function getFirstWaitlistForSlot(fecha, hora) {
    return null;
}

function removeFromWaitlist(id) {
    return null;
}

function getWaitlistEntry(criterio) {
    return null;
}

function cancelWaitlistEntry(id) {
    return null;
}

function findExistingWaitlistEntry(telefono, nombre) {
    return null;
}

module.exports = {
    addToWaitlist,
    getWaitlistPosition,
    getFirstWaitlistForSlot,
    removeFromWaitlist,
    getWaitlistEntry,
    cancelWaitlistEntry,
    findExistingWaitlistEntry
};
