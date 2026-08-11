/**
 * Utility functions for bot logic (date parsing, closure checks, email validation, etc.).
 */

function parseAndValidateDates(text) {
    if (!text) return [];
    const parts = text.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
    const validDates = [];

    for (const part of parts) {
        const match = part.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const year = parseInt(match[3], 10);

            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024 && year <= 2035) {
                const formattedDay = day < 10 ? '0' + day : '' + day;
                const formattedMonth = month < 10 ? '0' + month : '' + month;
                const cleanDateStr = `${formattedDay}/${formattedMonth}/${year}`;
                if (!validDates.includes(cleanDateStr)) {
                    validDates.push(cleanDateStr);
                }
            }
        }
    }
    return validDates;
}

function getDayOfWeekFromDateStr(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const match = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day, 12, 0, 0);
    return d.getDay();
}

function checkRestaurantClosedDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const match = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // 1. Descanso semanal del restaurante: Lunes (dayOfWeek === 1) para CUALQUIER año
    // Se usa las 12:00:00 del mediodía para evitar cualquier desfasaje por zona horaria
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 1) {
        return { closed: true, reason: 'monday', date: dateStr };
    }

    // 2. Único periodo de vacaciones del restaurante: Del 24 de Agosto al 7 de Septiembre (ambos inclusive)
    if ((month === 8 && day >= 24) || (month === 9 && day <= 7)) {
        return { closed: true, reason: 'vacation', date: dateStr };
    }

    return null;
}

function isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
}

function getInvalidEmailMsg(lang) {
    if (lang === 'eu') {
        return '⚠️ *Email helbide baliogabea.* Mesedez, idatzi email baliogarri bat (adib. *nombre@ejemplo.com*), edo sakatu botoiaren bidez saltatu:';
    } else if (lang === 'en') {
        return '⚠️ *Invalid email address.* Please enter a valid email (e.g. *nombre@ejemplo.com*), or skip using the button:';
    } else {
        return '⚠️ *Email no válido.* Por favor, introduce un email correcto (ej. *nombre@ejemplo.com*), o pulsa el botón para omitirlo:';
    }
}

function formatModificationDetail(nombreCliente, telefonoReserva, from, reservaActual, campoMod, valorMod, lang = 'es') {
    let detailStr = '';

    if (lang === 'eu') {
        detailStr = `👤 *Bezeroaren izena:* ${nombreCliente || 'Zehaztugabea'}\n` +
                    `📞 *Telefonoa:* ${telefonoReserva || from}\n` +
                    `📌 *Uneko erreserba:* ${reservaActual}\n` +
                    `✏️ *Eskatutako aldaketa (${campoMod}):* ${valorMod}`;
    } else if (lang === 'en') {
        detailStr = `👤 *Guest Name:* ${nombreCliente || 'Unspecified'}\n` +
                    `📞 *Phone:* ${telefonoReserva || from}\n` +
                    `📌 *Current Reservation:* ${reservaActual}\n` +
                    `✏️ *Requested Change (${campoMod}):* ${valorMod}`;
    } else {
        detailStr = `👤 *Nombre del Cliente:* ${nombreCliente || 'No especificado'}\n` +
                    `📞 *Teléfono:* ${telefonoReserva || from}\n` +
                    `📌 *Reserva Actual:* ${reservaActual}\n` +
                    `✏️ *Modificación Solicitada (${campoMod}):* ${valorMod}`;
    }

    return detailStr;
}

function validateAndParseModShifts(text, fechaStr, lang = 'es') {
    if (!text || typeof text !== 'string') {
        return { isValid: false, invalidTime: '', reason: 'invalid_shift' };
    }

    const cleanText = text.trim();
    const lowerText = cleanText.toLowerCase();

    if (['sin preferencia', 'hobespenik ez', 'no preference', 'sin preferia'].includes(lowerText)) {
        return { isValid: true, formatted: 'Sin preferencia' };
    }

    const parts = cleanText.split(/[,y\/]+/i).map(p => p.trim()).filter(Boolean);

    const validLunch = ['12:30', '13:00', '13:30', '14:00', '15:15'];
    const validDinner = ['20:00', '20:30', '21:00', '21:30'];

    const dayOfWeek = fechaStr ? getDayOfWeekFromDateStr(fechaStr) : null;
    const isDinnerAllowed = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === null);

    const parsedTimes = [];

    for (let part of parts) {
        const match = part.match(/(\d{1,2})[:\.]?(\d{2})/);
        if (!match) {
            return {
                isValid: false,
                invalidTime: part,
                reason: 'invalid_shift'
            };
        }

        let hours = match[1].padStart(2, '0');
        let minutes = match[2];
        let normalizedTime = `${hours}:${minutes}`;

        if (validLunch.includes(normalizedTime)) {
            parsedTimes.push(normalizedTime);
        } else if (validDinner.includes(normalizedTime)) {
            if (!isDinnerAllowed) {
                return {
                    isValid: false,
                    invalidTime: normalizedTime,
                    reason: 'dinner_not_allowed'
                };
            }
            parsedTimes.push(normalizedTime);
        } else {
            return {
                isValid: false,
                invalidTime: part,
                reason: 'invalid_shift'
            };
        }
    }

    if (parsedTimes.length === 0) {
        return {
            isValid: false,
            invalidTime: cleanText,
            reason: 'invalid_shift'
        };
    }

    return {
        isValid: true,
        formatted: parsedTimes.join(', ')
    };
}

function isValidPersonName(text) {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();

    if (cleanText.length < 2) return false;

    const dates = parseAndValidateDates(cleanText);
    if (dates.length > 0) return false;

    if (/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/.test(cleanText)) return false;

    if (/^\d+$/.test(cleanText)) return false;

    if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑàèìòùÀÈÌÒÙäëïöüÄËÏÖÜçÇ]/.test(cleanText)) return false;

    return true;
}

function getInvalidNameMsg(lang = 'es') {
    if (lang === 'eu') {
        return `⚠️ Data bat edo formatu baliogabe bat idatzi duzu izen baten ordez.\n\nMesedez, idatzi titularraren *Izen-Abizen* osoak testu moduan (adibidez: *Ander Urien*):`;
    } else if (lang === 'en') {
        return `⚠️ You entered a date or an invalid format instead of a name.\n\nPlease enter the reservation holder's *Full Name* as text (e.g. *Ander Urien*):`;
    } else {
        return `⚠️ Has introducido una fecha o un formato no válido en lugar de un nombre.\n\nPor favor, indícanos el *Nombre y Apellidos* del titular en formato texto (ej: *Ander Urien*):`;
    }
}

function validateSingleDate(dateStr, lang = 'es') {
    if (!dateStr || typeof dateStr !== 'string') {
        return { isValid: false, reason: 'format', date: dateStr || '' };
    }

    const cleanInput = dateStr.trim();
    const match = cleanInput.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) {
        return { isValid: false, reason: 'format', date: cleanInput };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < 2024 || year > 2035) {
        return { isValid: false, reason: 'format', date: cleanInput };
    }

    const testDate = new Date(year, month - 1, day);
    if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
        return { isValid: false, reason: 'format', date: cleanInput };
    }

    const formattedDay = day < 10 ? '0' + day : '' + day;
    const formattedMonth = month < 10 ? '0' + month : '' + month;
    const formattedDateStr = `${formattedDay}/${formattedMonth}/${year}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inputDateObj = new Date(year, month - 1, day, 12, 0, 0);
    if (inputDateObj < today) {
        return { isValid: false, reason: 'past', date: formattedDateStr };
    }

    const dayOfWeek = inputDateObj.getDay();
    if (dayOfWeek === 1) {
        return { isValid: false, reason: 'monday', date: formattedDateStr };
    }

    if ((month === 8 && day >= 24) || (month === 9 && day <= 7)) {
        return { isValid: false, reason: 'vacation', date: formattedDateStr };
    }

    return { isValid: true, formatted: formattedDateStr, date: formattedDateStr };
}

function getDateValidationErrorMsg(validation, lang = 'es') {
    const d = validation?.date || '';

    if (validation.reason === 'past') {
        if (lang === 'eu') {
            return `⚠️ *${d}* data gaurkoa baino lehenagokoa da. Ezin da erreserbarik, aldaketarik edo ezeztapenik egin igarotako datetan.\n\nMesedez, idatzi gaur osteko data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ The date *${d}* is in the past. Reservations, modifications or cancellations cannot be made for past dates.\n\nPlease enter a date after today (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ La fecha *${d}* es anterior a la fecha actual. No se pueden realizar reservas, modificaciones o cancelaciones para fechas pasadas.\n\nPor favor, indica una fecha posterior a hoy (ejemplo: DD/MM/AAAA):`;
        }
    }

    if (validation.reason === 'monday') {
        if (lang === 'eu') {
            return `⚠️ *${d}* data astelehena da (jatetxearen asteko atseden eguna).\n\nMesedez, idatzi beste data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ The date *${d}* is on a Monday (restaurant weekly day off).\n\nPlease enter another date (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ La fecha *${d}* cae en lunes (día de descanso semanal del restaurante).\n\nPor favor, indica otra fecha (ejemplo: DD/MM/AAAA):`;
        }
    }

    if (validation.reason === 'vacation') {
        if (lang === 'eu') {
            return `⚠️ *${d}* data jatetxearen oporraldiarekin bat dator (abuztuaren 24tik irailaren 7ra).\n\nMesedez, idatzi beste data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ The date *${d}* falls within the restaurant vacation period (August 24th to September 7th).\n\nPlease enter another date (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ La fecha *${d}* coincide con el periodo de vacaciones del restaurante (del 24 de agosto al 7 de septiembre).\n\nPor favor, indica otra fecha (ejemplo: DD/MM/AAAA):`;
        }
    }

    if (lang === 'eu') {
        return `⚠️ Sartutako testua ("*${d}*") ez da data baliogarria.\n\nMesedez, idatzi data egoki bat egun/hilabete/urte formatuan (adibidez: *15/09/2026*):`;
    } else if (lang === 'en') {
        return `⚠️ The entered text ("*${d}*") is not a valid date.\n\nPlease enter a valid date in day/month/year format (example: *15/09/2026*):`;
    } else {
        return `⚠️ El texto introducido ("*${d}*") no es una fecha válida.\n\nPor favor, introduce una fecha válida en formato día/mes/año (ejemplo: *15/09/2026*):`;
    }
}

module.exports = {
    parseAndValidateDates,
    getDayOfWeekFromDateStr,
    checkRestaurantClosedDate,
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail,
    validateAndParseModShifts,
    isValidPersonName,
    getInvalidNameMsg,
    validateSingleDate,
    getDateValidationErrorMsg
};
