const express = require('express');
const router = express.Router();
const { getTranslation, translations } = require('./i18n');
const { getDynamicTexts, saveDynamicText, getMenuItems, saveMenuItems } = require('./database');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'julian2026';
// Token estático basado en hash simple de contraseña
const VALID_TOKEN = Buffer.from(`admin_casa_julian_${ADMIN_PASSWORD}`).toString('base64');

// Middleware de autenticación
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['x-admin-token'] || req.headers['authorization'] || req.query.token;
    if (authHeader === VALID_TOKEN || authHeader === `Bearer ${VALID_TOKEN}`) {
        return next();
    }
    return res.status(401).json({ error: 'No autorizado. Token de administrador inválido o no proporcionado.' });
}

// 1. Login
router.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: VALID_TOKEN });
    }
    return res.status(401).json({ success: false, error: 'Contraseña de administrador incorrecta.' });
});

// 2. Obtener estructura completa y datos del chatbot
router.get('/structure', requireAdminAuth, (req, res) => {
    try {
        const dynamicTexts = getDynamicTexts();
        const menuItems = getMenuItems();
        
        // Estructura de flujos del chatbot
        const flowTree = [
            {
                id: 'step_welcome',
                title: '1. Bienvenida y Selección de Idioma',
                type: 'system',
                description: 'Envía sticker animado, imagen de bienvenida y solicita seleccionar idioma entre 14 opciones.',
                messageKey: 'welcomeMessage',
                buttons: ['1. Español', '2. Euskara', '3. English', '4. Français', '...']
            },
            {
                id: 'step_location',
                title: '2. Selección de Ubicación',
                type: 'buttons',
                description: 'Pregunta si desea información de Tolosa (País Vasco) o Madrid.',
                messageKey: 'selectLocationBody',
                buttons: [
                    { id: 'loc_pais_vasco', key: 'locPaisVasco' },
                    { id: 'loc_madrid', key: 'locMadrid' }
                ]
            },
            {
                id: 'step_main_menu',
                title: '3. Menú Principal',
                type: 'interactive_list',
                description: 'Menú interactivo con los servicios principales de Casa Julián.',
                messageKey: 'mainMenuHeader',
                rows: [
                    { id: 'opt_quiero_reservar', titleKey: 'opt1Title', descKey: 'opt1Desc' },
                    { id: 'opt_modificacion', titleKey: 'opt2Title', descKey: 'opt2Desc' },
                    { id: 'opt_cancelacion', titleKey: 'opt3Title', descKey: 'opt3Desc' },
                    { id: 'opt_regalar_menu_tradicion', titleKey: 'opt4Title', descKey: 'opt4Desc' },
                    { id: 'opt_otras_cuestiones', titleKey: 'opt5Title', descKey: 'opt5Desc' },
                    { id: 'opt_cambiar_idioma', titleKey: 'opt6Title', descKey: 'opt6Desc' }
                ]
            },
            {
                id: 'step_reserva',
                title: '4. Flujo de Reserva / Lista de Espera',
                type: 'branch',
                description: 'Pregunta por Tarjeta Regalo (Menú Tradición), solicita comensales, turnos, fechas y datos de contacto.',
                messageKey: 'reservaCardPrompt',
                buttons: [
                    { id: 'btn_reserva_con_tarjeta', key: 'reservaCardBtnSi' },
                    { id: 'btn_reserva_sin_tarjeta', key: 'reservaCardBtnNo' }
                ]
            },
            {
                id: 'step_faqs',
                title: '5. Otras Cuestiones (Preguntas Frecuentes)',
                type: 'interactive_list',
                description: 'Desplegable con 10 opciones organizadas (Carta, Horarios, Vacaciones, Cancelación, etc.).',
                messageKey: 'faqTitle',
                rows: [
                    { id: 'faq_1', titleKey: 'faq12Title', descKey: 'faq12Desc' },
                    { id: 'faq_2', titleKey: 'faq1Title', descKey: 'faq1Desc' },
                    { id: 'faq_3', titleKey: 'faq2Title', descKey: 'faq2Desc' },
                    { id: 'faq_4', titleKey: 'faq3Title', descKey: 'faq3Desc' },
                    { id: 'faq_5', titleKey: 'faq4Title', descKey: 'faq4Desc' },
                    { id: 'faq_6', titleKey: 'faq5Title', descKey: 'faq5Desc' },
                    { id: 'faq_7', titleKey: 'faq6Title', descKey: 'faq6Desc' },
                    { id: 'faq_8', titleKey: 'faq7Title', descKey: 'faq7Desc' },
                    { id: 'faq_9', titleKey: 'faq8Title', descKey: 'faq8Desc' },
                    { id: 'faq_10', titleKey: 'faq9Title', descKey: 'faq9Desc' }
                ]
            }
        ];

        // Lista de idiomas
        const languages = [
            { code: 'es', name: 'Español 🇪🇸' },
            { code: 'eu', name: 'Euskara' },
            { code: 'en', name: 'English 🇬🇧' },
            { code: 'fr', name: 'Français 🇫🇷' },
            { code: 'de', name: 'Deutsch 🇩🇪' },
            { code: 'it', name: 'Italiano 🇮🇹' },
            { code: 'pt', name: 'Português 🇵🇹' },
            { code: 'nl', name: 'Nederlands 🇳🇱' },
            { code: 'pl', name: 'Polski 🇵🇱' },
            { code: 'ro', name: 'Română 🇷🇴' },
            { code: 'ko', name: '한국어 🇰🇷' },
            { code: 'zh', name: '中文 🇨🇳' },
            { code: 'ja', name: '日本語 🇯🇵' },
            { code: 'ar', name: 'العربية 🇸🇦' }
        ];

        return res.json({
            success: true,
            flowTree,
            languages,
            staticTranslations: translations,
            dynamicTexts,
            menuItems
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 3. Actualizar texto de un idioma
router.post('/update-text', requireAdminAuth, async (req, res) => {
    const { lang, key, text, category } = req.body || {};
    if (!lang || !key || text === undefined) {
        return res.status(400).json({ error: 'Parámetros lang, key y text requeridos.' });
    }
    try {
        await saveDynamicText(lang, key, text, category || 'general');
        return res.json({ success: true, lang, key, text });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 4. Actualizar carta y precios
router.post('/update-menu', requireAdminAuth, async (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'El parámetro items debe ser una lista de platos.' });
    }
    try {
        await saveMenuItems(items);

        // Regenerar automáticamente el texto de la carta en faq12Msg (Ver carta) para español
        let cartaTxt = "📜 *CARTA - ASADOR CASA JULIÁN (TOLOSA)*\n\n";
        const categories = [...new Set(items.map(i => i.category))];
        
        categories.forEach(cat => {
            cartaTxt += `🥩 *${cat.toUpperCase()}:*\n`;
            items.filter(i => i.category === cat).forEach(item => {
                cartaTxt += `• ${item.name} — ${item.price} ${item.currency}\n`;
            });
            cartaTxt += "\n";
        });

        await saveDynamicText('es', 'faq12Msg', cartaTxt.trim(), 'carta');

        return res.json({ success: true, items, generatedCartaText: cartaTxt });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
