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

function getClosedDateDetails(year, month, day, dayOfWeek, dateStr) {
    // 1. Lunes siempre cerrado por descanso semanal
    if (dayOfWeek === 1) {
        return { closed: true, reason: 'monday', date: dateStr };
    }

    // 2. Calendario 2026:
    if (year === 2026) {
        // Vacaciones 2026: 24 de agosto al 8 de septiembre
        if ((month === 8 && day >= 24) || (month === 9 && day <= 8)) {
            return { closed: true, reason: 'vacation_2026', date: dateStr };
        }
        // 12 de octubre festivo
        if (month === 10 && day === 12) {
            return { closed: true, reason: 'holiday_12_oct', date: dateStr };
        }
        // 24, 25 y 31 de diciembre festivos
        if (month === 12 && (day === 24 || day === 25 || day === 31)) {
            return { closed: true, reason: `holiday_${day}_dec_2026`, date: dateStr };
        }
    }

    // 3. Calendario 2027:
    if (year === 2027) {
        // 1, 5, 6 de enero festivos
        if (month === 1 && (day === 1 || day === 5 || day === 6)) {
            return { closed: true, reason: `holiday_${day}_jan_2027`, date: dateStr };
        }
        // Vacaciones 2027: 18 al 31 de enero
        if (month === 1 && day >= 18 && day <= 31) {
            return { closed: true, reason: 'vacation_2027', date: dateStr };
        }
        // 10 de febrero cerrado (Carnaval)
        if (month === 2 && day === 10) {
            return { closed: true, reason: 'holiday_carnaval_2027', date: dateStr };
        }
    }

    // Regla general para vacaciones estivales (24 agosto - 8 septiembre) si no coincide año explícito
    if ((month === 8 && day >= 24) || (month === 9 && day <= 8)) {
        return { closed: true, reason: 'vacation_2026', date: dateStr };
    }

    return null;
}

function checkRestaurantClosedDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const match = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const dayOfWeek = dateObj.getDay();

    return getClosedDateDetails(year, month, day, dayOfWeek, dateStr);
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
        return '⚠️ *Dirección de email no válida.* Por favor, introduce un email válido (ej: *nombre@ejemplo.com*), o pulsa para omitir:';
    }
}

function formatModificationDetail(nombreCliente, telefonoReserva, senderPhone, reservaActual, labelCampo, nuevoValor, lang = 'es') {
    const titleLabel = lang === 'eu' ? 'RESERBA ALDATZEKO ESKAERA' : (lang === 'en' ? 'RESERVATION MODIFICATION REQUEST' : 'SOLICITUD MODIFICACIÓN DE RESERVA');
    const holderLabel = lang === 'eu' ? 'Titularraren izena:' : (lang === 'en' ? 'Holder Name:' : 'Nombre del Titular:');
    const phoneLabel = lang === 'eu' ? 'Telefonoa:' : (lang === 'en' ? 'Phone:' : 'Teléfono Reserva:');
    const senderLabel = lang === 'eu' ? 'Bidaltzailearen WhatsApp-a:' : (lang === 'en' ? 'Sender WhatsApp:' : 'WhatsApp Remitente:');
    const currentResLabel = lang === 'eu' ? 'Egungo erreserba:' : (lang === 'en' ? 'Current reservation:' : 'Reserva Actual:');
    const modLabel = lang === 'eu' ? 'Aldatu nahi den eremua:' : (lang === 'en' ? 'Field to modify:' : 'Campo a Modificar:');
    const valLabel = lang === 'eu' ? 'Balio berria:' : (lang === 'en' ? 'New value:' : 'Nuevo Valor:');
    const requestTypeLabel = lang === 'eu' ? 'Eskaera:' : (lang === 'en' ? 'Request:' : 'Solicitud:');

    return (
        `👤 *${holderLabel}* ${nombreCliente || 'No especificado'}\n` +
        `📞 *${phoneLabel}* ${telefonoReserva || 'No especificado'}\n` +
        `📱 *${senderLabel}* ${senderPhone}\n` +
        `📌 *${currentResLabel}* ${reservaActual}\n` +
        `✏️ *${modLabel}* ${labelCampo}\n` +
        `🆕 *${valLabel}* ${nuevoValor}\n` +
        `📋 *${requestTypeLabel}* ${titleLabel}`
    );
}

function validateAndParseModShifts(textStr, predefinedShifts = []) {
    if (!textStr || typeof textStr !== 'string') return { validShifts: [], invalidShifts: [], isValid: false };
    const parts = textStr.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);

    const validShifts = [];
    const invalidShifts = [];

    let allowed = [];
    if (Array.isArray(predefinedShifts)) {
        allowed = predefinedShifts.map(s => String(s).trim());
    } else if (typeof predefinedShifts === 'string') {
        allowed = [predefinedShifts.trim()];
    }

    for (const part of parts) {
        const timeMatch = part.match(/(\d{1,2})[:\.](\d{2})/);
        if (timeMatch) {
            const h = timeMatch[1].padStart(2, '0');
            const m = timeMatch[2];
            const formatted = `${h}:${m}`;
            if (allowed.length === 0 || allowed.includes(formatted)) {
                if (!validShifts.includes(formatted)) validShifts.push(formatted);
            } else {
                if (!invalidShifts.includes(part)) invalidShifts.push(part);
            }
        } else {
            if (!invalidShifts.includes(part)) invalidShifts.push(part);
        }
    }

    return { 
        validShifts, 
        invalidShifts, 
        isValid: validShifts.length > 0 && invalidShifts.length === 0,
        formatted: validShifts.join(', ')
    };
}

function isValidPersonName(text) {
    if (!text || typeof text !== 'string') return false;
    const cleanText = text.trim();

    if (cleanText.length < 2 || cleanText.length > 50) return false;
    if (/\d/.test(cleanText)) return false;

    const lower = cleanText.toLowerCase();
    const bannedKeywords = [
        'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes', 'sabado', 'sábado', 'domingo',
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
        'cancelar', 'modificar', 'reserva', 'mesa', 'comida', 'cena', 'hoy', 'mañana', 'manana'
    ];

    if (bannedKeywords.some(kw => lower.includes(kw))) return false;
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

function isWithin24Hours(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const cleanStr = dateStr.trim();
    let day, month, year;

    const matchDMY = cleanStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    const matchYMD = cleanStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);

    if (matchDMY) {
        day = parseInt(matchDMY[1], 10);
        month = parseInt(matchDMY[2], 10);
        year = parseInt(matchDMY[3], 10);
    } else if (matchYMD) {
        year = parseInt(matchYMD[1], 10);
        month = parseInt(matchYMD[2], 10);
        day = parseInt(matchYMD[3], 10);
    } else {
        return false;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const resDateStart = new Date(year, month - 1, day, 0, 0, 0);

    const diffDays = Math.round((resDateStart.getTime() - todayStart.getTime()) / 86400000);

    // Si la reserva es para hoy, mañana (siguiente día) o anterior, aplica la advertencia de antelación
    return diffDays <= 1;
}

function validateSingleDate(dateStr, lang = 'es', options = {}) {
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

    if (options.checkMax6Months) {
        const maxDate = new Date();
        maxDate.setMonth(maxDate.getMonth() + 6);
        maxDate.setHours(23, 59, 59, 999);

        if (inputDateObj > maxDate) {
            return { isValid: false, reason: 'max_6_months', date: formattedDateStr };
        }
    }

    const dayOfWeek = inputDateObj.getDay();
    const closedDetails = getClosedDateDetails(year, month, day, dayOfWeek, formattedDateStr);
    if (closedDetails) {
        return { isValid: false, reason: closedDetails.reason, date: formattedDateStr };
    }

    return { isValid: true, formatted: formattedDateStr, date: formattedDateStr };
}

function getDateValidationErrorMsg(validation, lang = 'es') {
    const d = validation?.date || '';

    if (validation.reason === 'max_6_months') {
        if (lang === 'eu') {
            return `⚠️ *Gehienez 6 hilabeteko aldez aurretik bakarrik egin daitezke erreserbak.*\n\nMesedez, idatzi datozen 6 hilabeteen barruko data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ *Reservations can only be made up to a maximum of 6 months in advance.*\n\nPlease enter a date within the next 6 months (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ *Solo se podrán hacer reservas con un máximo de 6 meses de antelación.*\n\nPor favor, indica una fecha dentro de los próximos 6 meses (ejemplo: DD/MM/AAAA):`;
        }
    }

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
            return `⚠️ *${d}* data astelehena da (jatetxearen asteko atseden eguna, astelehenetan beti itxita).\n\nMesedez, idatzi beste data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ The date *${d}* is on a Monday (restaurant weekly day off, closed every Monday).\n\nPlease enter another date (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ La fecha *${d}* cae en lunes (día de descanso semanal del restaurante, cerrado todos los lunes).\n\nPor favor, indica otra fecha (ejemplo: DD/MM/AAAA):`;
        }
    }

    if (validation.reason && validation.reason.startsWith('vacation')) {
        let period = 'del 24 de agosto al 8 de septiembre de 2026';
        if (validation.reason === 'vacation_2027') {
            period = 'del 18 de enero al 31 de enero de 2027';
        }

        if (lang === 'eu') {
            return `⚠️ *${d}* data jatetxearen oporraldiarekin bat dator (${period}).\n\nMesedez, idatzi beste data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ The date *${d}* falls within the restaurant vacation period (${period}).\n\nPlease enter another date (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ La fecha *${d}* coincide con el periodo de vacaciones del restaurante (${period}).\n\nPor favor, indica otra fecha (ejemplo: DD/MM/AAAA):`;
        }
    }

    if (validation.reason && validation.reason.startsWith('holiday')) {
        let desc = 'día festivo cerrado por el restaurante';
        if (validation.reason.includes('carnaval')) {
            desc = '10 de febrero (Carnaval, cerrado)';
        } else if (validation.reason.includes('12_oct')) {
            desc = '12 de octubre (Festivo, cerrado)';
        } else if (validation.reason.includes('dec')) {
            desc = 'Festivo navideño (24, 25 o 31 de diciembre, cerrado)';
        } else if (validation.reason.includes('jan_2027')) {
            desc = 'Festivo de Año Nuevo / Reyes (1, 5 o 6 de enero, cerrado)';
        }

        if (lang === 'eu') {
            return `⚠️ *${d}* data jaieguna da edo jatetxea itxita dago (${desc}).\n\nMesedez, idatzi beste data bat (adibidez: EG/HI/URTE):`;
        } else if (lang === 'en') {
            return `⚠️ The date *${d}* is a holiday and the restaurant is closed (${desc}).\n\nPlease enter another date (example: DD/MM/YYYY):`;
        } else {
            return `⚠️ La fecha *${d}* es un día festivo en el que el restaurante permanece cerrado (${desc}).\n\nPor favor, indica otra fecha (ejemplo: DD/MM/AAAA):`;
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
    getClosedDateDetails,
    checkRestaurantClosedDate,
    isValidEmail,
    getInvalidEmailMsg,
    formatModificationDetail,
    validateAndParseModShifts,
    isValidPersonName,
    getInvalidNameMsg,
    validateSingleDate,
    getDateValidationErrorMsg,
    isWithin24Hours
};
