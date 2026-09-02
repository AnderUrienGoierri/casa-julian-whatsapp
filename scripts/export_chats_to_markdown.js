const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');
const { getAllSilencedNumbers } = require('../db/silencedNumbers');
const { getInboxSettings } = require('../db/inboxSettings');

// Helper para formatear teléfonos
function formatPhoneWithPrefix(phone) {
    if (!phone) return '';
    const str = String(phone).trim();
    if (str.startsWith('group_')) return str;
    const clean = str.replace(/\D/g, '');
    if (!clean) return phone;

    if (clean.startsWith('1') && clean.length >= 11) {
        return `+1 ${clean.slice(1)}`;
    }
    const threeDigitPrefixes = ['351', '352', '353', '354', '358', '376', '502', '503', '504', '505', '506', '507', '591', '593', '595', '598', '971'];
    for (const p of threeDigitPrefixes) {
        if (clean.startsWith(p) && clean.length > p.length) {
            return `+${p} ${clean.slice(p.length)}`;
        }
    }
    if (clean.length >= 10) {
        const prefix2 = clean.slice(0, 2);
        return `+${prefix2} ${clean.slice(2)}`;
    }
    if (clean.length === 9) {
        return `+34 ${clean}`;
    }
    return `+${clean}`;
}

// Formateo de fecha en timezone de Madrid
function formatMadridDateTime(dateStr) {
    if (!dateStr) return 'Sin fecha';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);
}

// Clave de carpeta diaria: DD_MM_YYYY
function getDayFolderKey(dateStr) {
    if (!dateStr) return 'sin_fecha';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'sin_fecha';
    const formatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${day}_${month}_${year}`;
}

// Sanitizar nombres de archivo para Windows/Linux
function sanitizeFilename(str) {
    return (str || 'chat')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 100);
}

// Limpiar emojis y escapar caracteres especiales de tablas Markdown
function cleanMarkdownTableCell(text) {
    if (!text) return '-';
    let str = String(text);
    str = str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
    str = str.replace(/\|/g, '\\|');
    str = str.replace(/\r\n|\n/g, '<br>');
    str = str.replace(/\s+/g, ' ').trim();
    str = str.replace(/(<br>\s*){3,}/g, '<br><br>');
    return str || '-';
}

// Extraer etiquetas del chatbot
function getChatbotTags(allTexts, lastDateStr) {
    const combined = (allTexts || '').toLowerCase();
    const tags = [];
    if (/tarjeta\s*regalo|tarjeta_regalo|men[uú]\s*tradici[oó]n|menu_tradicion|opari[\s\-]txartel|gift\s*card|bono\s*regalo|reserva\s*men[uú]\s*tradici[oó]n|btn_reserva_con_tarjeta|opt_regalar_menu_tradicion|opt_menu_tradicion/i.test(combined)) {
        tags.push('OT');
    }
    if (/no\s*tengo\s*tarjeta|sin\s*tarjeta|no\s*dispongo\s*de\s*tarjeta|reserva\s*online|erreserba\s*online|book\s*a\s*table|casajulian\.eus|btn_reserva_sin_tarjeta|btn_reserva_web|btn_solicitar_reserva|no\s*tengo\s*c[oó]digo|sin\s*c[oó]digo|deseas realizar alguna otra gestión o finalizar la conversación|erreserba egin nahi duzu|do you want to make another reservation|no\s*tengo|ez\s*daukat|i\s*don'?t\s*have/i.test(combined)) {
        tags.push('NO OT');
    }
    if (/modifi|cambiar\s*hora|cambiar\s*fecha|cambiar\s*personas|cambiar\s*comensales|what\s*modification|aldatu\s*nahi\s*duzu|mod_comensales|mod_dia|mod_hora|opt_modificacion|btn_go_modificacion/i.test(combined)) {
        tags.push('MODIF');
    }
    if (/cancel|anul|cancel\s*request|erreserba\s*bertan\s*behera|no\s*podremos\s*asistir|no\s*podemos\s*ir|opt_cancelacion|btn_go_cancelacion/i.test(combined)) {
        tags.push('CANCEL');
    }
    if (/otras\s*cuestiones|preguntas\s*frecuentes|faq|horario|donde\s*aparcar|d[oó]nde\s*aparcar|c[oó]mo\s*llegar|como\s*llegar|ubicaci[oó]n|ubicacion|direcci[oó]n|direccion|ver\s*carta|ikusi\s*karta|view\s*menu|other\s*questions|beste\s*gai\s*batzuk|opt_otras_cuestiones|faq_/i.test(combined)) {
        tags.push('FAQS');
    }
    if (/consulta\s*abierta|casu[ií]stica|inquiry\s*successfully\s*sent|duda\s*o\s*consulta|necesidad\s*especial|embarazada|mascota|submit\s*request|bidali\s*eskaera|enviar\s*solicitud|opt_consulta_abierta|btn_consulta_enviar/i.test(combined)) {
        tags.push('OTRAS');
    }
    return tags;
}

// Obtener nombre display conocido
function getKnownDisplayName(cleanPhone, silencedMap, rawName) {
    if (cleanPhone === 'group_taxi_casa_julian') return 'Taxi Casa Julian';
    if (cleanPhone === '34670426540') return 'Taxi Iguaran';
    if (cleanPhone === '34670449858') return 'Taxi Tolosa';
    if (cleanPhone === '34636979092') return 'Taxi Lexus';
    if (cleanPhone === '34943671417') return 'Casa Julian Tolosa';
    if (cleanPhone === '34664037707' || cleanPhone === '3466407707') return 'Ander Informatico';
    if (cleanPhone === '34645747754') return 'Xabi Gorrotxategi';
    if (cleanPhone === '34623476521') return 'Ricardo Entretiempo Studio';

    if (silencedMap && silencedMap.has(cleanPhone)) {
        const s = silencedMap.get(cleanPhone);
        if (s.nombre) return s.nombre.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    }

    if (rawName && typeof rawName === 'string') {
        const trimmed = rawName.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
        const low = trimmed.toLowerCase();
        if (trimmed && !low.startsWith('cliente wa') && !low.startsWith('cliente ') && low !== 'cliente' && low !== 'usuario' && !low.startsWith('+')) {
            return trimmed;
        }
    }

    return formatPhoneWithPrefix(cleanPhone);
}

// Obtener categoría
function getCategory(cleanPhone, silencedMap, customCategory) {
    if (cleanPhone === 'group_taxi_casa_julian') return 'taxi';
    if (['34670426540', '34670449858', '34636979092'].includes(cleanPhone)) return 'taxi';
    if (['34664037707', '3466407707', '34645747754'].includes(cleanPhone)) return 'personal';
    if (cleanPhone === '34623476521') return 'proveedor';
    if (cleanPhone === '34943671417') return 'restaurante';

    if (silencedMap && silencedMap.has(cleanPhone)) {
        const s = silencedMap.get(cleanPhone);
        if (s.categoria) return s.categoria;
    }

    if (customCategory) return customCategory;
    return 'cliente';
}

// Genera el contenido Markdown para un chat
function buildChatMarkdown(chat, clientMessages) {
    let md = `# Conversación de WhatsApp: ${chat.displayName}\n\n`;
    md += `| Metadato | Detalle |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Contacto / Cliente** | ${chat.displayName} |\n`;
    md += `| **Número de Teléfono** | \`${formatPhoneWithPrefix(chat.telefono)}\` (\`${chat.telefono}\`) |\n`;
    md += `| **Categoría** | \`${chat.category.toUpperCase()}\` |\n`;
    md += `| **Etiquetas** | ${chat.tags.length > 0 ? chat.tags.map(t => `\`${t}\``).join(' ') : '*Ninguna*'} |\n`;
    md += `| **Fijado en Panel** | ${chat.isPinned ? 'Sí' : 'No'} |\n`;
    md += `| **Total de Mensajes** | ${chat.messagesCount} (Cliente: ${clientMessages.length}, Bot/Recepción: ${chat.messagesCount - clientMessages.length}) |\n`;
    md += `| **Primer Mensaje** | ${formatMadridDateTime(chat.firstDateStr)} |\n`;
    md += `| **Último Mensaje** | ${formatMadridDateTime(chat.lastDateStr)} |\n`;
    md += `| **Carpeta del Día** | \`${chat.dayKey}\` |\n\n`;
    md += `---\n\n`;
    
    md += `## Resumen: Mensajes del Cliente (Sin respuestas del Bot)\n\n`;
    if (clientMessages.length > 0) {
        md += `| # | Fecha y Hora | Mensaje Escrito por el Cliente |\n`;
        md += `| :---: | :--- | :--- |\n`;
        clientMessages.forEach((cm, cIdx) => {
            const cTime = formatMadridDateTime(cm.created_at);
            const cText = cleanMarkdownTableCell(cm.texto);
            md += `| ${cIdx + 1} | ${cTime} | ${cText} |\n`;
        });
        md += `\n`;
    } else {
        md += `*No hay mensajes enviados directamente por el cliente (conversación iniciada por recepción o historial archivado).*\n\n`;
    }

    md += `---\n\n`;
    md += `## Historial Completo de la Conversación\n\n`;
    md += `| # | Fecha y Hora | Emisor | Tipo | Mensaje | Opciones / Botones |\n`;
    md += `| :---: | :--- | :--- | :--- | :--- | :--- |\n`;

    chat.messages.forEach((m, idx) => {
        const time = formatMadridDateTime(m.created_at);
        
        let emisorLabel = 'Cliente';
        if (m.emisor === 'bot') emisorLabel = 'Bot';
        else if (['staff', 'humano', 'recepcion', 'admin', 'restaurante'].includes(m.emisor)) {
            emisorLabel = 'Recepción';
        }

        let typeLabel = 'Texto';
        if (m.tipo === 'interactive_list') typeLabel = 'Lista de opciones';
        else if (m.tipo === 'interactive_buttons') typeLabel = 'Botones interactivos';
        else if (m.tipo === 'interactive') typeLabel = 'Selección';
        else if (m.tipo === 'image') typeLabel = 'Imagen';
        else if (m.tipo === 'audio' || m.tipo === 'ptt') typeLabel = 'Audio';
        else if (m.tipo === 'document') typeLabel = 'Documento';

        let meta = {};
        try {
            meta = typeof m.metadata === 'object' ? (m.metadata || {}) : JSON.parse(m.metadata || '{}');
        } catch(e) {}

        let optionsText = '-';
        if (meta.sections && Array.isArray(meta.sections)) {
            const rows = meta.sections.flatMap(s => s.rows || []);
            const rowTitles = rows.map(r => (typeof r === 'object' ? (r.title || r.id || '') : r)).filter(Boolean);
            if (rowTitles.length > 0) {
                optionsText = rowTitles.map(t => cleanMarkdownTableCell(t)).join('<br>');
            }
        } else if (meta.buttons && Array.isArray(meta.buttons)) {
            const buttonTitles = meta.buttons.map(b => (typeof b === 'object' ? (b.title || b.reply?.title || b.id || '') : b)).filter(Boolean);
            if (buttonTitles.length > 0) {
                optionsText = buttonTitles.map(t => cleanMarkdownTableCell(t)).join('<br>');
            }
        }

        const cleanMsg = cleanMarkdownTableCell(m.texto);
        md += `| ${idx + 1} | ${time} | ${emisorLabel} | ${typeLabel} | ${cleanMsg} | ${optionsText} |\n`;
    });

    md += `\n`;
    return md;
}

async function runExport() {
    console.log("Iniciando exportación organizada de chats_whatsapp y chats_a_responder...");

    const rootDir = path.join(__dirname, '..');
    const mainChatsDir = path.join(rootDir, 'chats_whatsapp');
    const responderDir = path.join(rootDir, 'chats_a_responder');
    const typoDir = path.join(rootDir, 'chats_whastapp');

    // 0. Eliminar carpeta con errata si existe
    if (fs.existsSync(typoDir)) {
        fs.rmSync(typoDir, { recursive: true, force: true });
        console.log("Carpeta redundante 'chats_whastapp' eliminada.");
    }

    if (!fs.existsSync(mainChatsDir)) fs.mkdirSync(mainChatsDir, { recursive: true });
    if (!fs.existsSync(responderDir)) fs.mkdirSync(responderDir, { recursive: true });

    // 1. Cargar metadatos
    const silencedList = await getAllSilencedNumbers();
    const silencedMap = new Map();
    silencedList.forEach(s => {
        const clean = (s.telefono || '').replace(/\D/g, '');
        if (clean) silencedMap.set(clean, s);
    });

    const inboxSettings = await getInboxSettings();
    const chatTagsMap = inboxSettings.chatTags || {};
    const pinnedMap = inboxSettings.pinnedChats || {};
    const deletedChats = inboxSettings.deletedChats || {};

    // 2. Cargar todos los mensajes de bot_chat_history
    let allMessages = [];
    if (pool) {
        try {
            const res = await pool.query(`SELECT * FROM bot_chat_history ORDER BY telefono, created_at ASC, id ASC`);
            allMessages = res.rows || [];
        } catch(e) {
            console.error("Error leyendo bot_chat_history en Postgres:", e.message);
        }
    }

    if (allMessages.length === 0) {
        const dbPath = path.join(rootDir, 'db.json');
        if (fs.existsSync(dbPath)) {
            const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            allMessages = db.bot_chat_history || [];
        }
    }

    console.log(`Total de mensajes cargados: ${allMessages.length}`);

    // 3. Agrupar mensajes por teléfono
    const chatsMap = new Map();
    allMessages.forEach(msg => {
        const tel = String(msg.telefono || '').trim();
        if (!tel) return;
        if (deletedChats[tel]) return;

        if (!chatsMap.has(tel)) {
            chatsMap.set(tel, []);
        }
        chatsMap.get(tel).push(msg);
    });

    console.log(`Total de conversaciones activas: ${chatsMap.size}`);

    // 4. Procesar y clasificar
    const daysMap = new Map(); // Para chats_whatsapp: dayKey -> array de chatObj
    const responderTagsMap = {
        'OT': new Map(),     // dayKey -> array
        'NO OT': new Map(),
        'MODIF': new Map(),
        'CANCEL': new Map(),
        'FAQS': new Map(),
        'OTRAS': new Map()
    };

    let totalClientChats = 0;

    chatsMap.forEach((messages, telefono) => {
        const cleanPhone = telefono.startsWith('group_') ? telefono : telefono.replace(/\D/g, '');
        const lastMsg = messages[messages.length - 1];
        const firstMsg = messages[0];
        const lastDateStr = lastMsg?.created_at || new Date().toISOString();
        const firstDateStr = firstMsg?.created_at || lastDateStr;
        const dayKey = getDayFolderKey(lastDateStr);

        let rawClientName = '';
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            let meta = {};
            try {
                meta = typeof m.metadata === 'object' ? (m.metadata || {}) : JSON.parse(m.metadata || '{}');
            } catch(e) {}
            if (meta.nombreCliente) {
                rawClientName = meta.nombreCliente;
                break;
            }
        }

        const displayName = getKnownDisplayName(cleanPhone, silencedMap, rawClientName);
        const category = getCategory(cleanPhone, silencedMap, null);
        const allTexts = messages.map(m => m.texto || '').join(' ___ ');
        const clientMessages = messages.filter(m => m.emisor === 'cliente');
        const hasClientText = clientMessages.length > 0;

        // Etiquetas
        const customTags = chatTagsMap[cleanPhone] || [];
        const botTags = getChatbotTags(allTexts, lastDateStr);
        const combinedTags = [...new Set([...customTags, ...botTags])];
        if (category === 'personal' && !combinedTags.includes('Personal')) combinedTags.push('Personal');
        if (category === 'proveedor' && !combinedTags.includes('Proveedores')) combinedTags.push('Proveedores');
        if (category === 'taxi' && !combinedTags.includes('Taxis')) combinedTags.push('Taxis');
        if (cleanPhone === 'group_taxi_casa_julian' && !combinedTags.includes('GRUPO')) combinedTags.push('GRUPO');

        const isPinned = !!pinnedMap[cleanPhone];

        const chatObj = {
            telefono: cleanPhone,
            displayName,
            category,
            tags: combinedTags,
            isPinned,
            messagesCount: messages.length,
            firstDateStr,
            lastDateStr,
            dayKey,
            messages,
            clientMessages,
            hasClientText
        };

        // Guardar para chats_whatsapp (todos los chats agrupados por día)
        if (!daysMap.has(dayKey)) daysMap.set(dayKey, []);
        daysMap.get(dayKey).push(chatObj);

        // Guardar para chats_a_responder (solo chats con texto de cliente)
        if (hasClientText) {
            totalClientChats++;
            // Determinar etiquetas objetivo
            const targetTags = [];
            ['OT', 'NO OT', 'MODIF', 'CANCEL', 'FAQS', 'OTRAS'].forEach(t => {
                if (combinedTags.includes(t)) targetTags.push(t);
            });
            // Si no tiene ninguna de las 6 etiquetas pero tiene texto de cliente, clasificar en OTRAS
            if (targetTags.length === 0) targetTags.push('OTRAS');

            targetTags.forEach(t => {
                if (!responderTagsMap[t].has(dayKey)) responderTagsMap[t].set(dayKey, []);
                responderTagsMap[t].get(dayKey).push(chatObj);
            });
        }
    });

    console.log(`Total de chats con texto escrito por cliente: ${totalClientChats}`);

    // 5. Generar chats_whatsapp/ (Carpeta única completa por días)
    const sortedDays = Array.from(daysMap.keys()).sort((a, b) => {
        const [d1, m1, y1] = a.split('_').map(Number);
        const [d2, m2, y2] = b.split('_').map(Number);
        return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
    });

    for (const dayKey of sortedDays) {
        const dayDir = path.join(mainChatsDir, dayKey);
        if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

        const chatsInDay = daysMap.get(dayKey);
        chatsInDay.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastDateStr) - new Date(a.lastDateStr);
        });

        for (const chat of chatsInDay) {
            const safeName = sanitizeFilename(chat.displayName);
            const filename = `chat_${chat.telefono}_${safeName}.md`;
            const filePath = path.join(dayDir, filename);
            const md = buildChatMarkdown(chat, chat.clientMessages);
            fs.writeFileSync(filePath, md, 'utf8');
        }
    }

    // README principal para chats_whatsapp
    let readmeMain = `# Histórico de Conversaciones de WhatsApp - Casa Julián de Tolosa\n\n`;
    readmeMain += `Directorio maestro con todas las conversaciones de WhatsApp del restaurante organizadas por el día del último mensaje.\n\n`;
    readmeMain += `### Resumen General\n`;
    readmeMain += `- **Total de Días Registrados:** ${sortedDays.length}\n`;
    readmeMain += `- **Total de Chats Exportados:** ${chatsMap.size}\n`;
    readmeMain += `- **Total de Mensajes:** ${allMessages.length}\n`;
    readmeMain += `- **Chats con texto del cliente:** ${totalClientChats}\n\n`;
    readmeMain += `---\n\n### Índice de Carpetas por Día\n\n| Fecha | Carpeta | Total Chats |\n| :--- | :--- | :---: |\n`;
    sortedDays.forEach(dayKey => {
        const list = daysMap.get(dayKey);
        const [d, m, y] = dayKey.split('_');
        readmeMain += `| ${d}/${m}/${y} | [\`${dayKey}/\`](./${dayKey}/) | **${list.length}** |\n`;
    });
    fs.writeFileSync(path.join(mainChatsDir, 'README.md'), readmeMain, 'utf8');

    // 6. Generar chats_a_responder/ (Organizado por ETIQUETA -> DÍA)
    console.log("Generando estructura de chats_a_responder clasificada por etiquetas y días...");

    const tagFolders = ['OT', 'NO OT', 'MODIF', 'CANCEL', 'FAQS', 'OTRAS'];
    const tagDescriptions = {
        'OT': 'Reserva con Tarjeta de Regalo / Menú Tradición',
        'NO OT': 'Solicitud de Reserva Online estándar (Sin Tarjeta / Web)',
        'MODIF': 'Modificación de reservas existentes (Hora, Fecha, Comensales)',
        'CANCEL': 'Cancelación o anulación de reservas',
        'FAQS': 'Preguntas Frecuentes (Horarios, Aparcamiento, Carta, etc.)',
        'OTRAS': 'Consultas Abiertas y Casuísticas Particulares con texto de cliente'
    };

    let readmeResponder = `# Buzón de Chats a Responder - Casa Julián de Tolosa\n\n`;
    readmeResponder += `Este directorio agrupa exclusivamente los chats que contienen **mensajes enviados por clientes** clasificados por categoría/etiqueta y organizados en subcarpetas por día para facilitar la atención de solicitudes por parte de recepción.\n\n`;
    readmeResponder += `### Resumen por Categoría\n\n`;
    readmeResponder += `| Etiqueta | Descripción | Total Chats |\n`;
    readmeResponder += `| :--- | :--- | :---: |\n`;

    let totalResponderFiles = 0;

    for (const tag of tagFolders) {
        const tagDir = path.join(responderDir, tag);
        if (!fs.existsSync(tagDir)) fs.mkdirSync(tagDir, { recursive: true });

        const daysInTag = responderTagsMap[tag];
        const sortedTagDays = Array.from(daysInTag.keys()).sort((a, b) => {
            const [d1, m1, y1] = a.split('_').map(Number);
            const [d2, m2, y2] = b.split('_').map(Number);
            return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
        });

        let totalTagChats = 0;

        for (const dayKey of sortedTagDays) {
            const dayDir = path.join(tagDir, dayKey);
            if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

            const chatsInDay = daysInTag.get(dayKey);
            totalTagChats += chatsInDay.length;

            for (const chat of chatsInDay) {
                const safeName = sanitizeFilename(chat.displayName);
                const filename = `chat_${chat.telefono}_${safeName}.md`;
                const filePath = path.join(dayDir, filename);
                const md = buildChatMarkdown(chat, chat.clientMessages);
                fs.writeFileSync(filePath, md, 'utf8');
                totalResponderFiles++;
            }
        }

        readmeResponder += `| [**\`${tag}/\`**](./${encodeURIComponent(tag)}/) | ${tagDescriptions[tag]} | **${totalTagChats}** |\n`;

        // Generar README dentro de cada carpeta de etiqueta
        let tagReadme = `# Chats Clasificados: ${tag}\n\n`;
        tagReadme += `**Descripción:** ${tagDescriptions[tag]}\n\n`;
        tagReadme += `- **Total de Chats:** ${totalTagChats}\n`;
        tagReadme += `- **Total de Días con actividad:** ${sortedTagDays.length}\n\n`;
        tagReadme += `### Carpetas por Día\n\n| Fecha | Carpeta | Total Chats |\n| :--- | :--- | :---: |\n`;
        sortedTagDays.forEach(dayKey => {
            const list = daysInTag.get(dayKey);
            const [d, m, y] = dayKey.split('_');
            tagReadme += `| ${d}/${m}/${y} | [\`${dayKey}/\`](./${dayKey}/) | **${list.length}** |\n`;
        });
        fs.writeFileSync(path.join(tagDir, 'README.md'), tagReadme, 'utf8');
    }

    readmeResponder += `\n---\n*Total de copias clasificadas para respuesta rápida: ${totalResponderFiles} archivos en 6 categorías.*\n`;
    fs.writeFileSync(path.join(responderDir, 'README.md'), readmeResponder, 'utf8');

    console.log(`Exportación completa finalizada.`);
    console.log(`chats_whatsapp/ -> ${chatsMap.size} chats organizados en ${sortedDays.length} días.`);
    console.log(`chats_a_responder/ -> ${totalResponderFiles} chats con texto de cliente clasificados en 6 categorías y días.`);
}

runExport().then(() => process.exit(0)).catch(err => {
    console.error("Error en runExport:", err);
    process.exit(1);
});
