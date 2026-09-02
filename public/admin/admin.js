document.addEventListener('DOMContentLoaded', () => {
    // Limpieza de claves obsoletas en localStorage para evitar parpadeos de versiones antiguas
    (function cleanupOldLocalStorage() {
        try {
            const rawMap = localStorage.getItem('casa_julian_chat_tags_map');
            if (rawMap && (rawMap.includes('EMPLEADOS') || rawMap.includes('empleados') || rawMap.includes('empleado'))) {
                const parsed = JSON.parse(rawMap);
                const cleaned = {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (Array.isArray(v)) {
                        cleaned[k] = v.map(t => {
                            const low = String(t).toLowerCase().trim();
                            if (low === 'empleado' || low === 'empleados' || low === 'alba') return 'Personal';
                            return t;
                        });
                    }
                }
                localStorage.setItem('casa_julian_chat_tags_map', JSON.stringify(cleaned));
            }
            const rawCustom = localStorage.getItem('casa_julian_custom_silenced_tags');
            if (rawCustom && (rawCustom.includes('EMPLEADOS') || rawCustom.includes('empleados'))) {
                const parsedC = JSON.parse(rawCustom);
                if (Array.isArray(parsedC)) {
                    const cleanedC = parsedC.filter(ct => ct && ct.id !== 'empleados' && (ct.name || '').toLowerCase() !== 'empleados');
                    localStorage.setItem('casa_julian_custom_silenced_tags', JSON.stringify(cleanedC));
                }
            }
        } catch(e) {}
    })();

    let adminToken = localStorage.getItem('casa_julian_admin_token') || '';
    let currentStructure = null;
    let currentLang = 'es';
    let currentLangFilter = 'es';
    let currentCategoryFilter = 'all';
    let isTestMode = false;

    // ELEMENTOS DOM
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const appContainer = document.getElementById('app-container');
    const logoutBtn = document.getElementById('logout-btn');
    const currentLangSelect = document.getElementById('current-lang-select');
    
    // TAB BUTTONS
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // INBOX & SOLICITUDES DOM & STATE
    let allSolicitudes = [];
    let allWhatsAppChats = [];
    let allUnifiedConversations = [];
    let currentActiveTabId = 'tab-inbox';
    let currentInboxCatFilter = 'all';
    let currentInboxStatusFilter = 'all';
    let currentInboxTopicFilter = 'all';
    let currentInboxSearch = '';
    let currentInboxView = 'active';      // 'active' | 'ARCHIVADA' | 'ELIMINADA'
    let currentInboxSort = 'date_desc';   // 'date_desc' | 'date_asc' | 'alpha_asc' | 'alpha_desc' | 'estado'
    let inboxFiltersOpen = false;         // Toggle colapsable (por defecto sin desplegar)
    let activeReplySolicitud = null;
    let minimizedSolicitudesMap = new Map();
    let inboxPollingInterval = null;

    const refreshInboxBtn = document.getElementById('refresh-inbox-btn');
    const searchInboxInput = document.getElementById('search-inbox-input');
    const inboxCardsContainer = document.getElementById('inbox-cards-container');
    const inboxCountBadge = document.getElementById('inbox-count-badge');
    const replyModal = document.getElementById('reply-modal');
    const closeReplyModalBtn = document.getElementById('close-reply-modal-btn');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const replyForm = document.getElementById('reply-form');
    const replyClientName = document.getElementById('reply-client-name');
    const replyClientPhone = document.getElementById('reply-client-phone');
    const replySolicitudSummary = document.getElementById('reply-solicitud-summary');
    const replySolicitudId = document.getElementById('reply-solicitud-id');
    const replyMessageText = document.getElementById('reply-message-text');
    const replyErrorMsg = document.getElementById('reply-error-msg');

    // Helper centralizado para limpiar claves de teléfono
    function getCleanPhoneKey(phone) {
        if (!phone) return '';
        const str = String(phone).trim();
        if (str.startsWith('group_')) return str;
        return str.replace(/\D/g, '');
    }

    // Helper para formatear teléfonos con el prefijo telefónico separado por un espacio (+34 600000000)
    function formatPhoneWithPrefix(phone) {
        if (!phone) return '';
        const str = String(phone).trim();
        if (str.startsWith('group_')) return str;
        const clean = str.replace(/\D/g, '');
        if (!clean) return phone;

        // 1 dígito (+1 USA / Canadá)
        if (clean.startsWith('1') && clean.length >= 11) {
            return `+1 ${clean.slice(1)}`;
        }
        
        // 3 dígitos (+351 Portugal, +352, +353, +354, +358, +376 Andorra, +502, +503, +504, +505, +506, +507, +591, +593, +595, +598, +971, etc.)
        const threeDigitPrefixes = ['351', '352', '353', '354', '358', '376', '502', '503', '504', '505', '506', '507', '591', '593', '595', '598', '971'];
        for (const p of threeDigitPrefixes) {
            if (clean.startsWith(p) && clean.length > p.length) {
                return `+${p} ${clean.slice(p.length)}`;
            }
        }
        
        // 2 dígitos (+34 España, +44 UK, +33 Francia, +49 Alemania, +39 Italia, +41 Suiza, +31, +32, +43, +45, +46, +47, +48, +52, +54, +55, +56, +57, +58, +61, +81, +86, +91, etc.)
        if (clean.length >= 10) {
            const prefix2 = clean.slice(0, 2);
            return `+${prefix2} ${clean.slice(2)}`;
        }
        
        // 9 dígitos (móvil o fijo español sin prefijo 34)
        if (clean.length === 9) {
            return `+34 ${clean}`;
        }
        
        return `+${clean}`;
    }

    // Helper unificado para obtener el nombre del cliente o su teléfono formateado si no tiene nombre registrado
    function getClientDisplayName(nombre, phone) {
        const clean = getCleanPhoneKey(phone);
        
        // Contactos conocidos del restaurante
        if (clean === 'group_taxi_casa_julian') return 'Taxi Casa Julián';
        if (clean === '34670426540') return 'Taxi Iguaran';
        if (clean === '34670449858') return 'Taxi Tolosa';
        if (clean === '34636979092') return 'Taxi Lexus';
        if (clean === '34943671417') return 'Casa Julián Tolosa';
        if (clean === '34664037707') return 'Ander Informatico';
        if (clean === '34645747754') return 'Xabi Gorrotxategi';
        if (clean === '34623476521') return 'Ricardo Entretiempo Studio';

        if (nombre && typeof nombre === 'string') {
            const trimmed = nombre.trim();
            const low = trimmed.toLowerCase();
            const isGeneric = !trimmed ||
                low.startsWith('cliente whatsapp') ||
                low.startsWith('cliente wa') ||
                low.startsWith('contacto whatsapp') ||
                low === 'cliente' ||
                low === 'contacto' ||
                low === 'usuario' ||
                low === 'cliente casa julián' ||
                low === 'cliente casa julian' ||
                low.startsWith('+') ||
                /^\+?\d[\d\s\-\(\)]+$/.test(trimmed);

            if (!isGeneric) {
                return trimmed;
            }
        }
        
        if (!clean) return 'Contacto';
        return formatPhoneWithPrefix(clean);
    }

    // SIMULADOR DOM
    const btnStartTest = document.getElementById('btn-start-test');
    const btnResetTest = document.getElementById('btn-reset-test');
    const simInputForm = document.getElementById('sim-input-form');
    const simUserInput = document.getElementById('sim-user-input');
    const singlePreviewBubble = document.getElementById('single-preview-bubble');
    const liveChatStream = document.getElementById('live-chat-stream');
    const whatsappScreen = document.getElementById('whatsapp-screen');

    // MODAL AÑADIR MENSAJE DOM
    const addTextBtn = document.getElementById('add-text-btn');
    const textModal = document.getElementById('text-modal');
    const closeTextModalBtn = document.getElementById('close-text-modal');
    const saveNewTextBtn = document.getElementById('save-new-text-btn');
    const newKeyNameInput = document.getElementById('new-key-name-input');
    const newKeyCatSelect = document.getElementById('new-key-cat-select');
    const newKeyTextInput = document.getElementById('new-key-text-input');

    // REGLAS DINÁMICAS POR PALABRA CLAVE DOM
    const customRuleForm = document.getElementById('custom-rule-form');
    const ruleIdInput = document.getElementById('rule-id-input');
    const ruleKeywordInput = document.getElementById('rule-keyword-input');
    const ruleCatSelect = document.getElementById('rule-cat-select');
    const ruleResponseInput = document.getElementById('rule-response-input');
    const customRulesBody = document.getElementById('custom-rules-body');

    // VERIFICAR AUTENTICACIÓN INICIAL - validar el token guardado con la API
    // Actualizar badges visuales inmediatamente con la caché para evitar parpadeos
    try {
        const cachedCount = parseInt(localStorage.getItem('casa_julian_cached_total_contacts') || '0', 10);
        const dropdownSilencedBadge = document.getElementById('dropdown-silenced-badge');
        const silencedBadge = document.getElementById('silenced-count-badge');
        if (cachedCount > 0) {
            if (dropdownSilencedBadge) {
                dropdownSilencedBadge.textContent = cachedCount;
                dropdownSilencedBadge.style.display = 'inline-block';
            }
            if (silencedBadge) {
                silencedBadge.textContent = cachedCount;
                silencedBadge.style.display = 'inline-block';
            }
        }
    } catch(e) {}

    if (adminToken) {
        // Validar token contra el servidor antes de arrancar el dashboard
        fetch('/api/admin/solicitudes', { headers: { 'x-admin-token': adminToken } })
            .then(res => {
                if (res.status === 401) {
                    // Token inválido o caducado → limpiar y mostrar login
                    localStorage.removeItem('casa_julian_admin_token');
                    localStorage.removeItem('casa_julian_user_role');
                    adminToken = '';
                    showLoginModal();
                } else {
                    initDashboard();
                }
            })
            .catch(() => {
                // Error de red → mostrar login igual
                showLoginModal();
            });
    } else {
        showLoginModal();
    }

    function showLoginModal() {
        loginModal.style.display = 'flex';
        appContainer.style.display = 'none';
    }

    function hideLoginModal() {
        loginModal.style.display = 'none';
        appContainer.style.display = 'block';
    }

    // FORMULARIO LOGIN
    const togglePassBtn = document.getElementById('toggle-password-visibility');
    const adminPassInput = document.getElementById('admin-password');

    if (togglePassBtn && adminPassInput) {
        togglePassBtn.addEventListener('click', () => {
            if (adminPassInput.type === 'password') {
                adminPassInput.type = 'text';
                togglePassBtn.textContent = '🙈';
                togglePassBtn.title = 'Ocultar contraseña';
            } else {
                adminPassInput.type = 'password';
                togglePassBtn.textContent = '👁️';
                togglePassBtn.title = 'Mostrar contraseña';
            }
        });
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = adminPassInput ? adminPassInput.value : '';
        loginError.style.display = 'none';

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            let data;
            const resText = await res.text();
            try {
                data = JSON.parse(resText);
            } catch (pErr) {
                data = { success: false, error: resText || `Error del servidor (${res.status} ${res.statusText})` };
            }

            if (data.success && data.token) {
                adminToken = data.token;
                localStorage.setItem('casa_julian_admin_token', adminToken);
                localStorage.setItem('casa_julian_user_role', data.role || 'admin');
                try {
                    await initDashboard();
                } catch (dashErr) {
                    console.error("⚠️ Error inicializando dashboard:", dashErr);
                }
            } else {
                loginError.textContent = data.error || 'Contraseña incorrecta.';
                loginError.style.display = 'block';
            }
        } catch (err) {
            console.error("⚠️ Error en petición de login:", err);
            loginError.textContent = err.message || 'Error de conexión con el servidor.';
            loginError.style.display = 'block';
        }
    });

    // CERRAR SESIÓN
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('casa_julian_admin_token');
            adminToken = '';
            showLoginModal();
        });
    }

    // Título de la pestaña activa en el Header (Sin Emojis)
    function updateHeaderActiveTab(tabId) {
        currentActiveTabId = tabId;

        document.body.classList.toggle('is-inbox-active-body', tabId === 'tab-inbox');

        const mainLayout = document.querySelector('.main-layout');
        if (mainLayout) {
            mainLayout.classList.toggle('is-inbox-active', tabId === 'tab-inbox');
        }

        const isInbox = (tabId === 'tab-inbox');
        const btnToggleSearch = document.getElementById('header-btn-toggle-inbox-search');
        const btnManageTags = document.getElementById('header-btn-manage-inbox-tags');
        const headerBtnCreateGroup = document.getElementById('header-btn-create-group');

        if (btnToggleSearch) btnToggleSearch.style.display = isInbox ? 'inline-flex' : 'none';
        if (btnManageTags) btnManageTags.style.display = isInbox ? 'inline-flex' : 'none';
        if (headerBtnCreateGroup) headerBtnCreateGroup.style.display = isInbox ? 'inline-flex' : 'none';

        const iconEl = document.getElementById('header-active-tab-icon');
        const nameEl = document.getElementById('header-active-tab-name');
        const badgeEl = document.getElementById('header-active-tab-badge');
        if (iconEl) {
            iconEl.textContent = '';
            iconEl.style.display = 'none';
        }
        if (!nameEl) return;

        if (tabId === 'tab-inbox') {
            nameEl.textContent = 'Buzón';
            if (badgeEl) {
                const count = getPendingConversationsCount();
                badgeEl.textContent = count;
                badgeEl.style.background = '#ef4444';
                badgeEl.style.color = '#fff';
                badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
            }
        } else if (tabId === 'tab-silenced') {
            nameEl.textContent = 'Contactos';
            if (badgeEl) {
                const count = (typeof getCombinedContactsList === 'function')
                    ? getCombinedContactsList().length
                    : ((typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers)) ? allSilencedNumbers.length : 0);
                badgeEl.textContent = count;
                badgeEl.style.background = '#a855f7';
                badgeEl.style.color = '#fff';
                badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
            }
        } else if (tabId === 'tab-flow') {
            nameEl.textContent = 'Estructura & Árbol de Flujos';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-texts') {
            nameEl.textContent = 'Editor de Mensajes & Textos';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-rules') {
            nameEl.textContent = 'Flujo & Respuestas Clave';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-publish') {
            nameEl.textContent = 'Comprobar y Subir';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-settings') {
            nameEl.textContent = 'Ajustes & Diagnóstico';
            if (badgeEl) badgeEl.style.display = 'none';
        }

        updateHeaderAndMenuBadges();
    }

    // Actualiza los badges tanto del header como del menú desplegable y pestañas
    function updateHeaderAndMenuBadges() {
        // 1. Contar contactos combinados reales
        let totalContacts = 0;
        try {
            if (typeof getCombinedContactsList === 'function') {
                const list = getCombinedContactsList();
                totalContacts = list.length;
            }
        } catch(e) {}

        if (totalContacts <= 0 && typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers)) {
            totalContacts = allSilencedNumbers.length;
        }

        // 2. Si es 0 o fallback pequeño (ej. antes de terminar la petición de red), usar la última cuenta real guardada en caché
        try {
            const cachedTotal = parseInt(localStorage.getItem('casa_julian_cached_total_contacts') || '0', 10);
            if (totalContacts <= 135 && cachedTotal > totalContacts) {
                totalContacts = cachedTotal;
            } else if (totalContacts > 135) {
                localStorage.setItem('casa_julian_cached_total_contacts', totalContacts.toString());
            }
        } catch(e) {}

        // Fallback garantizado: si sigue siendo <= 0, tomar 1002 como valor de seguridad
        const finalContactsDisplay = totalContacts > 0 ? totalContacts : 1002;

        const pendingInbox = (typeof getPendingConversationsCount === 'function')
            ? getPendingConversationsCount()
            : 0;

        // Badge en Menú Desplegable (Contactos) - Ocultado según requerimiento
        const dropdownSilencedBadge = document.getElementById('dropdown-silenced-badge');
        if (dropdownSilencedBadge) {
            dropdownSilencedBadge.style.display = 'none';
        }

        // Badge en Menú Desplegable (Buzón)
        const dropdownInboxBadge = document.getElementById('dropdown-inbox-badge');
        if (dropdownInboxBadge) {
            dropdownInboxBadge.textContent = pendingInbox;
            dropdownInboxBadge.style.display = pendingInbox > 0 ? 'inline-block' : 'none';
        }

        // Badge en Pestaña superior (Contactos)
        const silencedBadge = document.getElementById('silenced-count-badge');
        if (silencedBadge) {
            silencedBadge.textContent = finalContactsDisplay;
            silencedBadge.style.display = 'inline-block';
        }

        // Badge en Pestaña superior (Buzón)
        const inboxBadge = document.getElementById('inbox-count-badge');
        if (inboxBadge) {
            inboxBadge.textContent = pendingInbox;
            inboxBadge.style.display = pendingInbox > 0 ? 'inline-block' : 'none';
        }

        // Badge en Header Central Activo
        const headerBadge = document.getElementById('header-active-tab-badge');
        if (headerBadge) {
            if (currentActiveTabId === 'tab-silenced') {
                headerBadge.textContent = finalContactsDisplay;
                headerBadge.style.background = '#a855f7';
                headerBadge.style.color = '#fff';
                headerBadge.style.display = 'inline-block';
            } else if (currentActiveTabId === 'tab-inbox') {
                headerBadge.textContent = pendingInbox;
                headerBadge.style.background = '#ef4444';
                headerBadge.style.color = '#fff';
                headerBadge.style.display = pendingInbox > 0 ? 'inline-block' : 'none';
            }
        }
    }

    // ==========================================
    // MENÚ DESPLEGABLE DEL HEADER (DROPDOWN)
    // ==========================================
    const headerMenuBtn = document.getElementById('header-menu-btn');
    const headerMenuDropdown = document.getElementById('header-menu-dropdown');

    if (headerMenuBtn && headerMenuDropdown) {
        headerMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateHeaderAndMenuBadges();
            const isOpen = headerMenuDropdown.classList.toggle('show');
            headerMenuBtn.classList.toggle('active', isOpen);
            headerMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        document.addEventListener('click', (e) => {
            if (!headerMenuDropdown.contains(e.target) && e.target !== headerMenuBtn) {
                headerMenuDropdown.classList.remove('show');
                headerMenuBtn.classList.remove('active');
                headerMenuBtn.setAttribute('aria-expanded', 'false');
            }
        });

        // Función centralizada para cambio de pestaña
        function switchToTab(targetTab) {
            tabBtns.forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-tab') === targetTab);
            });
            tabContents.forEach(c => {
                c.classList.toggle('active', c.id === targetTab);
            });
            
            const targetEl = document.getElementById(targetTab);
            if (targetEl) {
                targetEl.classList.add('active');
            }

            if (typeof updateHeaderActiveTab === 'function') {
                updateHeaderActiveTab(targetTab);
            }

            if (targetTab === 'tab-inbox') {
                loadUnifiedInboxData();
            }
            if (targetTab === 'tab-silenced') {
                fetchSilencedNumbers();
            }
            if (targetTab === 'tab-flow') renderUseCasesFlow();
            if (targetTab === 'tab-texts') renderTextsGrid();
            if (targetTab === 'tab-menu') renderMenuTable();
            if (targetTab === 'tab-faqs') renderFaqsList();
            if (targetTab === 'tab-rules') renderCustomRulesTable();
            if (targetTab === 'tab-publish') renderDraftChangesTable();
            if (targetTab === 'tab-settings') loadSystemSettingsAndStatus();
        }

        // Navegación a pestañas desde el menú desplegable
        headerMenuDropdown.querySelectorAll('[data-tab-target]').forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab-target');
                switchToTab(targetTab);
                headerMenuDropdown.classList.remove('show');
                headerMenuBtn.classList.remove('active');
                headerMenuBtn.setAttribute('aria-expanded', 'false');
            });
        });

        // Selector de idioma en el dropdown
        headerMenuDropdown.querySelectorAll('.dropdown-lang-btn').forEach(langBtn => {
            langBtn.addEventListener('click', () => {
                const lang = langBtn.getAttribute('data-lang-val');
                currentLang = lang;
                headerMenuDropdown.querySelectorAll('.dropdown-lang-btn').forEach(b => b.classList.remove('active'));
                langBtn.classList.add('active');
                if (currentLangSelect) currentLangSelect.value = lang;
                if (currentStructure) {
                    renderTextsGrid();
                    renderFaqsList();
                }
                headerMenuDropdown.classList.remove('show');
                headerMenuBtn.classList.remove('active');
                headerMenuBtn.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // CAMBIO DE IDIOMA ORIGINAL
    if (currentLangSelect) {
        currentLangSelect.addEventListener('change', (e) => {
            currentLang = e.target.value;
            if (headerMenuDropdown) {
                headerMenuDropdown.querySelectorAll('.dropdown-lang-btn').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-lang-val') === currentLang);
                });
            }
            if (currentStructure) {
                renderTextsGrid();
                renderFaqsList();
            }
        });
    }

    // PESTAÑAS
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            if (typeof switchToTab === 'function') {
                switchToTab(tabId);
            }
        });
    });

    // Lista inicial garantizada de números silenciados (30 contactos oficiales)
    const DEFAULT_INITIAL_SILENCED = [
        { id: 1, telefono: "34633638732", nombre: "Maitines", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 2, telefono: "34664871950", nombre: "Ricardo Entretiempo", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 3, telefono: "34680872658", nombre: "Qooqer", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 4, telefono: "34661448834", nombre: "Inaxio Eztia", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 5, telefono: "34629471183", nombre: "Julien", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 6, telefono: "34676483584", nombre: "Ibon", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 7, telefono: "34608316238", nombre: "David Pallares", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 8, telefono: "34638729571", nombre: "Elisabet", categoria: "proveedor", notas: "Proveedor importado", activo: true },
        { id: 9, telefono: "34659981881", nombre: "Xabi Gorrotxategi", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 10, telefono: "34667508313", nombre: "Orlando Calvo", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 11, telefono: "34636906232", nombre: "Imanol Iraola", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 12, telefono: "34608324424", nombre: "Gastroceramica", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 13, telefono: "34609139151", nombre: "Oscar", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 14, telefono: "34609951375", nombre: "Edit Tolosa&Co", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 15, telefono: "34634954081", nombre: "Aimar Arregi kaia Getaria", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 16, telefono: "34657790326", nombre: "Arrugado Studio", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 17, telefono: "34609348987", nombre: "Joan Ramon", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 18, telefono: "34690320349", nombre: "Florian", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 19, telefono: "34695786438", nombre: "Federico Giorgi", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 20, telefono: "34661852033", nombre: "Eli", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 21, telefono: "34676902263", nombre: "Jesus Mendoza", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 22, telefono: "34623212283", nombre: "Contacto", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 23, telefono: "34689408669", nombre: "Iztueta Baserria", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 24, telefono: "34606775685", nombre: "Ellie", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 25, telefono: "34689255276", nombre: "Mikel Zapiain", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 26, telefono: "34620025700", nombre: "Carbonero Sarasola", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 27, telefono: "34606758577", nombre: "Aioña Garmendia", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 28, telefono: "34657731776", nombre: "Personal", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 29, telefono: "34645731776", nombre: "Personal", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 30, telefono: "34658704257", nombre: "Personal", categoria: "empleado", notas: "Personal / Empleado", activo: true },
        { id: 63, telefono: "34670426540", nombre: "Taxi Iguaran", categoria: "taxi", notas: "Grupo Taxi Casa Julián (+34 670 42 65 40)", activo: true },
        { id: 64, telefono: "34670449858", nombre: "Taxi Tolosa", categoria: "taxi", notas: "Grupo Taxi Casa Julián (+34 670 44 98 58)", activo: true },
        { id: 65, telefono: "34636979092", nombre: "Taxi Lexus", categoria: "taxi", notas: "Grupo Taxi Casa Julián (+34 636 97 90 92)", activo: true },
        { id: 66, telefono: "34943671417", nombre: "Casa Julián Tolosa", categoria: "empleado", notas: "Teléfono oficial del restaurante (+34 943 67 14 17)", activo: true }
    ];

    // Cargar caché local persistente de contactos silenciados si existe
    let cachedSilencedNumbers = [];
    try {
        const raw = localStorage.getItem('casa_julian_cached_silenced_list');
        if (raw) cachedSilencedNumbers = JSON.parse(raw);
    } catch(e) {}

    let allSilencedNumbers = (Array.isArray(cachedSilencedNumbers) && cachedSilencedNumbers.length > 0)
        ? cachedSilencedNumbers
        : [...DEFAULT_INITIAL_SILENCED];
    let currentSilencedFilter = 'all';
    let currentSilencedSearch = '';

    // ── GESTIÓN DE NÚMEROS BOT CANCELADOS Y ETIQUETAS DINÁMICAS ─────────────
    const silencedModal = document.getElementById('silenced-modal');
    const silencedModalTitle = document.getElementById('silenced-modal-title');
    const silencedPhoneInput = document.getElementById('silenced-phone-input');
    const silencedNameInput = document.getElementById('silenced-name-input');
    const silencedNotesInput = document.getElementById('silenced-notes-input');
    const silencedModalTagsContainer = document.getElementById('silenced-modal-tags-container');
    const closeSilencedModalBtn = document.getElementById('close-silenced-modal-btn');
    const silencedNumberForm = document.getElementById('silenced-number-form');
    const addSilencedNumberBtn = document.getElementById('add-silenced-number-btn');
    const addSilencedTagBtn = document.getElementById('add-silenced-tag-btn');
    const btnQuickNewTag = document.getElementById('btn-quick-new-tag');
    const refreshSilencedBtn = document.getElementById('refresh-silenced-btn');
    const searchSilencedInput = document.getElementById('search-silenced-input');
    const silencedFiltersContainer = document.getElementById('silenced-filters-container');

    // Modal de Nueva Etiqueta
    const silencedTagModal = document.getElementById('silenced-tag-modal');
    const silencedTagForm = document.getElementById('silenced-tag-form');
    const newTagNameInput = document.getElementById('new-tag-name-input');
    const closeSilencedTagModalBtn = document.getElementById('close-silenced-tag-modal-btn');
    const tagEmojiSelect = document.getElementById('tag-emoji-select');
    const selectedEmojiPreview = document.getElementById('selected-emoji-preview');
    const silencedTagModalTitle = document.getElementById('silenced-tag-modal-title');
    const silencedTagModalDesc = document.getElementById('silenced-tag-modal-desc');
    const editingTagIdInput = document.getElementById('editing-tag-id-input');
    const silencedTagSubmitBtn = document.getElementById('silenced-tag-submit-btn');

    let selectedTagEmoji = '🏷️';
    let selectedSilencedModalTags = ['proveedor'];
    let currentEditingTagId = null;
    let currentContactsPage = 1;
    const CONTACTS_PER_PAGE = 50;
    const selectedSilencedFilters = new Set();

    const DEFAULT_SYSTEM_TAGS = [
        { id: 'menu_tradicion', name: 'OT', label: '🎁 OT', emoji: '🎁', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.2)' },
        { id: 'no_ot', name: 'NO OT', label: '🎫 NO OT', emoji: '🎫', color: '#e879f9', bg: 'rgba(232, 121, 249, 0.2)' },
        { id: 'modificacion', name: 'MODIF', label: '🔄 MODIF', emoji: '🔄', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.2)' },
        { id: 'cancelacion', name: 'CANCEL', label: '❌ CANCEL', emoji: '❌', color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)' },
        { id: 'faq', name: 'FAQs', label: '❓ FAQs', emoji: '❓', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.2)' },
        { id: 'otras_cuestiones', name: 'OTRAS', label: '💬 OTRAS', emoji: '💬', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.2)' },
        { id: 'proveedor', name: 'Proveedores', label: '🚚 Proveedores', emoji: '🚚', color: '#a3e635', bg: 'rgba(132, 204, 22, 0.2)' },
        { id: 'hoteles', name: 'Hoteles', label: '🏨 Hoteles', emoji: '🏨', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' },
        { id: 'empleado', name: 'Personal', label: '👷 Personal', emoji: '👷', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.2)' },
        { id: 'taxi', name: 'Taxis', label: '🚕 Taxis', emoji: '🚕', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
        { id: 'grupo', name: 'Grupo', label: '👥 Grupo', emoji: '👥', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.2)' },
        { id: 'cliente', name: 'Clientes', label: '👤 Clientes', emoji: '👤', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.2)' },
        { id: 'otro', name: 'Otros', label: '📌 Otros', emoji: '📌', color: '#fde047', bg: 'rgba(234, 179, 8, 0.2)' }
    ];

    const DEFAULT_SILENCED_TAGS = DEFAULT_SYSTEM_TAGS;

    // Estado compartido en servidor PostgreSQL
    let serverInboxSettings = {
        customTags: [],
        tagsOrder: [],
        deletedTags: [],
        chatTags: {},
        pinnedChats: {},
        manualChatStatus: {}
    };

    async function fetchInboxSettings() {
        // Esta función es llamada en el arranque del panel (pestaña Contactos/Configuración)
        // La versión completa con merge por timestamp está en la sección de Buzón (loadUnifiedInboxData la usa)
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        if (!currentToken) return;
        try {
            const res = await fetch('/api/admin/inbox-settings', {
                headers: {
                    'x-admin-token': currentToken,
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.settings) {
                    // Merge de manualChatStatus por timestamp para no perder estados locales recientes
                    let localStatus = {};
                    try { localStatus = JSON.parse(localStorage.getItem('casa_julian_manual_chat_status') || '{}'); } catch(e) {}
                    const serverStatus = data.settings.manualChatStatus || {};
                    const merged = {};
                    const allPhones = new Set([...Object.keys(localStatus), ...Object.keys(serverStatus)]);
                    allPhones.forEach(phone => {
                        const loc = localStatus[phone];
                        const srv = serverStatus[phone];
                        if (!loc) { merged[phone] = srv; }
                        else if (!srv) { merged[phone] = loc; }
                        else {
                            const tsL = loc.readAt ? new Date(loc.readAt).getTime() : 0;
                            const tsS = srv.readAt ? new Date(srv.readAt).getTime() : 0;
                            merged[phone] = tsS >= tsL ? srv : loc;
                        }
                    });
                    serverInboxSettings = { ...serverInboxSettings, ...data.settings, manualChatStatus: merged };
                    if (Array.isArray(serverInboxSettings.customTags)) {
                        localStorage.setItem('casa_julian_custom_silenced_tags', JSON.stringify(serverInboxSettings.customTags));
                    }
                    if (Array.isArray(serverInboxSettings.tagsOrder)) {
                        localStorage.setItem('casa_julian_tags_custom_order', JSON.stringify(serverInboxSettings.tagsOrder));
                    }
                    if (Array.isArray(serverInboxSettings.deletedTags)) {
                        localStorage.setItem('casa_julian_deleted_tags', JSON.stringify(serverInboxSettings.deletedTags));
                    }
                    if (serverInboxSettings.chatTags && typeof serverInboxSettings.chatTags === 'object') {
                        localStorage.setItem('casa_julian_chat_tags_map', JSON.stringify(serverInboxSettings.chatTags));
                    }
                    if (serverInboxSettings.pinnedChats && typeof serverInboxSettings.pinnedChats === 'object') {
                        localStorage.setItem('casa_julian_pinned_chats', JSON.stringify(serverInboxSettings.pinnedChats));
                    }
                    try { localStorage.setItem('casa_julian_manual_chat_status', JSON.stringify(merged)); } catch(e) {}
                }
            }
        } catch (err) {
            console.warn('⚠️ [Inbox Settings] Error sincronizando con el servidor:', err.message);
        }
    }

    function getCustomTagsOrder() {
        if (Array.isArray(serverInboxSettings.tagsOrder) && serverInboxSettings.tagsOrder.length > 0) {
            return serverInboxSettings.tagsOrder;
        }
        try {
            return JSON.parse(localStorage.getItem('casa_julian_tags_custom_order') || '[]');
        } catch {
            return [];
        }
    }

    function setCustomTagsOrder(orderArray) {
        serverInboxSettings.tagsOrder = orderArray;
        localStorage.setItem('casa_julian_tags_custom_order', JSON.stringify(orderArray));
        // Persistir en servidor PostgreSQL
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        fetch('/api/admin/tags-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ order: orderArray })
        }).catch(e => console.warn('Error guardando tagsOrder en servidor:', e));
    }

    function getDeletedTags() {
        if (Array.isArray(serverInboxSettings.deletedTags)) {
            return serverInboxSettings.deletedTags;
        }
        try {
            return JSON.parse(localStorage.getItem('casa_julian_deleted_tags') || '[]');
        } catch {
            return [];
        }
    }

    function addDeletedTag(tagId) {
        const deleted = getDeletedTags();
        if (!deleted.includes(tagId)) {
            deleted.push(tagId);
        }
        serverInboxSettings.deletedTags = deleted;
        serverInboxSettings.customTags = (serverInboxSettings.customTags || []).filter(t => t.id !== tagId);
        localStorage.setItem('casa_julian_deleted_tags', JSON.stringify(deleted));
        localStorage.setItem('casa_julian_custom_silenced_tags', JSON.stringify(serverInboxSettings.customTags));

        // Persistir en servidor PostgreSQL
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        fetch('/api/admin/custom-tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ deleteTagId: tagId })
        }).catch(e => console.warn('Error eliminando etiqueta en servidor:', e));
    }

    function getCustomSilencedTags() {
        if (Array.isArray(serverInboxSettings.customTags) && serverInboxSettings.customTags.length > 0) {
            return serverInboxSettings.customTags;
        }
        try {
            const raw = localStorage.getItem('casa_julian_custom_silenced_tags');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveCustomSilencedTag(name, emoji = '🏷️', editId = null) {
        const cleanName = (name || '').trim();
        if (!cleanName) return null;
        const custom = getCustomSilencedTags();
        const id = editId || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // Si estaba en deleted, quitarlo para restaurarlo
        const deleted = getDeletedTags().filter(d => d !== id);
        serverInboxSettings.deletedTags = deleted;
        localStorage.setItem('casa_julian_deleted_tags', JSON.stringify(deleted));

        const colors = [
            { color: '#f472b6', bg: 'rgba(244, 114, 182, 0.2)' },
            { color: '#34d399', bg: 'rgba(52, 211, 153, 0.2)' },
            { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.2)' },
            { color: '#818cf8', bg: 'rgba(129, 140, 248, 0.2)' },
            { color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.2)' },
            { color: '#a3e635', bg: 'rgba(163, 230, 53, 0.2)' },
            { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' }
        ];

        const existingIdx = custom.findIndex(t => t.id === id);
        const tagLabel = emoji ? `${emoji} ${cleanName}` : cleanName;
        let tagObj;
        if (existingIdx > -1) {
            tagObj = {
                ...custom[existingIdx],
                name: cleanName,
                label: tagLabel,
                emoji: emoji || ''
            };
            custom[existingIdx] = tagObj;
        } else {
            const systemTag = DEFAULT_SYSTEM_TAGS.find(t => t.id === id);
            const colorObj = systemTag || colors[custom.length % colors.length];
            tagObj = {
                id,
                name: cleanName,
                label: tagLabel,
                emoji: emoji || '',
                color: colorObj.color || '#38bdf8',
                bg: colorObj.bg || 'rgba(56, 189, 248, 0.2)'
            };
            custom.push(tagObj);
        }

        serverInboxSettings.customTags = custom;
        localStorage.setItem('casa_julian_custom_silenced_tags', JSON.stringify(custom));

        // Persistir en servidor PostgreSQL
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        fetch('/api/admin/custom-tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ tag: tagObj })
        }).catch(e => console.warn('Error guardando etiqueta en servidor:', e));

        return tagObj;
    }

    function getAllAvailableSilencedTags() {
        const deleted = getDeletedTags();
        const tags = DEFAULT_SYSTEM_TAGS.filter(t => !deleted.includes(t.id)).map(t => ({ ...t }));
        const custom = getCustomSilencedTags();

        // Integrar o sobrescribir etiquetas personalizadas / editadas (filtrando residuos antiguos de empleados)
        custom.forEach(ct => {
            if (!ct || !ct.id) return;
            const cid = ct.id.toLowerCase();
            const cname = (ct.name || '').toLowerCase();
            if (cid === 'empleados' || cid === 'empleado' || cname === 'empleados') return;
            if (deleted.includes(ct.id)) return;
            const idx = tags.findIndex(t => t.id === ct.id);
            if (idx > -1) {
                tags[idx] = { ...tags[idx], ...ct };
            } else {
                tags.push(ct);
            }
        });

        // Detectar etiquetas adicionales en los contactos existentes
        if (Array.isArray(allSilencedNumbers)) {
            allSilencedNumbers.forEach(n => {
                if (n.categoria) {
                    const parts = n.categoria.split(',').map(p => p.trim()).filter(Boolean);
                    parts.forEach(p => {
                        const lowP = p.toLowerCase();
                        if (lowP === 'empleado' || lowP === 'empleados' || lowP === 'alba' || lowP === 'personal') return;
                        if (lowP === 'proveedor' || lowP === 'proveedores') return;
                        if (lowP === 'hotel' || lowP === 'hoteles') return;
                        if (lowP === 'taxi' || lowP === 'taxis') return;
                        if (lowP === 'cliente' || lowP === 'clientes') return;
                        const pid = lowP.replace(/[^a-z0-9]/g, '_');
                        if (pid && !tags.some(t => t.id === pid || t.name.toLowerCase() === lowP)) {
                            tags.push({
                                id: pid,
                                name: p,
                                label: `🏷️ ${p}`,
                                emoji: '🏷️',
                                color: '#e2e8f0',
                                bg: 'rgba(255, 255, 255, 0.12)'
                            });
                        }
                    });
                }
            });
        }
        // Aplicar orden personalizado si existe
        const customOrder = getCustomTagsOrder();
        if (Array.isArray(customOrder) && customOrder.length > 0) {
            tags.sort((a, b) => {
                const idxA = customOrder.indexOf(a.id);
                const idxB = customOrder.indexOf(b.id);
                if (idxA > -1 && idxB > -1) return idxA - idxB;
                if (idxA > -1) return -1;
                if (idxB > -1) return 1;
                return 0;
            });
        }

        return tags;
    }

    function getSilencedItemTags(item) {
        const raw = (item.categoria || 'proveedor').trim();
        const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
        const available = getAllAvailableSilencedTags();
        
        return parts.map(p => {
            const pLower = p.toLowerCase();
            const found = available.find(t => t.id === pLower || t.name.toLowerCase() === pLower || (pLower === 'alba' && t.id === 'empleado'));
            if (found) return found;
            return {
                id: pLower.replace(/[^a-z0-9]/g, '_'),
                name: p,
                label: `🏷️ ${p}`,
                emoji: '🏷️',
                color: '#e2e8f0',
                bg: 'rgba(255, 255, 255, 0.12)'
            };
        });
    }

    async function fetchSilencedNumbers() {
        renderSilencedNumbersTable();
        renderSilencedFilters();
        try {
            const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch('/api/admin/silenced-numbers', {
                headers: { 'x-admin-token': tokenToUse }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.numbers)) {
                    allSilencedNumbers = data.numbers;
                    try {
                        localStorage.setItem('casa_julian_cached_silenced_list', JSON.stringify(data.numbers));
                    } catch(e) {}
                    renderSilencedNumbersTable();
                    renderSilencedFilters();
                    updateHeaderAndMenuBadges();
                }
            }
        } catch (err) {
            console.error("⚠️ Error cargando números silenciados:", err.message);
        }
    }

    // Set para selección múltiple de contactos
    let selectedSilencedPhones = new Set();

    function getCombinedContactsList() {
        const contactsMap = new Map();

        // 1. Añadir los contactos de PostgreSQL (silenciados / personalizados)
        if (Array.isArray(allSilencedNumbers)) {
            allSilencedNumbers.forEach(item => {
                const cleanPhone = (item.telefono || '').toString().replace(/\D/g, '');
                if (!cleanPhone) return;
                contactsMap.set(cleanPhone, {
                    id: item.id,
                    telefono: cleanPhone,
                    nombre: item.nombre || 'Contacto',
                    categoria: item.categoria || 'proveedor',
                    notas: item.notas || '',
                    activo: item.activo !== false, // true = bot cancelado, false = bot activo
                    isFromDb: true
                });
            });
        }

        // 2. Integrar todos los contactos de los chats unificados de WhatsApp Business
        const chatsSource = (Array.isArray(allUnifiedConversations) && allUnifiedConversations.length > 0)
            ? allUnifiedConversations
            : (Array.isArray(allWhatsAppChats) ? allWhatsAppChats : []);

        if (Array.isArray(chatsSource)) {
            chatsSource.forEach(conv => {
                const cleanPhone = (conv.telefono || '').toString().replace(/\D/g, '');
                if (!cleanPhone) return;

                if (contactsMap.has(cleanPhone)) {
                    const existing = contactsMap.get(cleanPhone);
                    if ((!existing.nombre || existing.nombre === 'Contacto' || existing.nombre.startsWith('+')) && conv.nombreCliente) {
                        existing.nombre = conv.nombreCliente;
                    }
                } else {
                    const chatTags = (typeof getChatTags === 'function') ? getChatTags(cleanPhone, conv) : [];
                    let cat = 'cliente';
                    if (chatTags.length > 0) {
                        cat = chatTags.join(', ');
                    } else if (typeof getConversationCategory === 'function') {
                        cat = getConversationCategory(conv) || 'cliente';
                    }
                    contactsMap.set(cleanPhone, {
                        id: null,
                        telefono: cleanPhone,
                        nombre: conv.nombreCliente || `+${cleanPhone}`,
                        categoria: cat,
                        notas: '',
                        activo: false, // Por defecto en chats: Bot Activo
                        isFromDb: false
                    });
                }
            });
        }

        return Array.from(contactsMap.values());
    }

    let isSilencedFiltersExpanded = false;

    function renderSilencedFilters() {
        if (!silencedFiltersContainer) return;
        const allContacts = getCombinedContactsList();
        const total = allContacts.length;
        const activeBotCount = allContacts.filter(c => !c.activo).length;
        const canceledBotCount = allContacts.filter(c => !!c.activo).length;

        const tags = getAllAvailableSilencedTags().filter(tag => {
            const lowId = (tag.id || '').toLowerCase();
            const lowName = (tag.name || '').toLowerCase();
            if (['menu_tradicion', 'ot', 'modificacion', 'modif', 'cancelacion', 'cancel', 'faq', 'faqs', 'otras_cuestiones', 'otras', 'grupo'].includes(lowId) ||
                ['ot', 'modif', 'cancel', 'faqs', 'otras', 'grupo'].includes(lowName)) {
                return false;
            }
            return true;
        });
        const isAllActive = selectedSilencedFilters.size === 0;

        let html = `
            <button class="filter-chip ${isAllActive ? 'active' : ''}" data-silenced-cat="all">
                Todos (${total})
            </button>
            <button class="filter-chip ${selectedSilencedFilters.has('bot_active') ? 'active' : ''}" data-silenced-cat="bot_active">
                🔊 Bot Activo (${activeBotCount})
            </button>
            <button class="filter-chip ${selectedSilencedFilters.has('bot_canceled') ? 'active' : ''}" data-silenced-cat="bot_canceled">
                🔇 Bot Cancelado (${canceledBotCount})
            </button>
        `;

        if (isSilencedFiltersExpanded) {
            tags.forEach(tag => {
                const count = allContacts.filter(n => {
                    const itemTags = getSilencedItemTags(n);
                    return itemTags.some(t => t.id === tag.id || t.name.toLowerCase() === tag.name.toLowerCase());
                }).length;

                const isTagActive = selectedSilencedFilters.has(tag.id) || selectedSilencedFilters.has(tag.name.toLowerCase());

                html += `
                    <button class="filter-chip ${isTagActive ? 'active' : ''}" data-silenced-cat="${tag.id}">
                        ${tag.label || tag.name} (${count})
                    </button>
                `;
            });

            html += `
                <button type="button" id="btn-toggle-silenced-tags" class="filter-chip" style="background: rgba(147, 51, 234, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); color: #c084fc; font-weight: 600;">
                    ▴ Ocultar etiquetas
                </button>
            `;
        } else {
            // Si está colapsado pero hay alguna etiqueta seleccionada por el usuario, mostrarla para que sepa qué filtro está activo
            tags.forEach(tag => {
                const isTagActive = selectedSilencedFilters.has(tag.id) || selectedSilencedFilters.has(tag.name.toLowerCase());
                if (isTagActive) {
                    const count = allContacts.filter(n => {
                        const itemTags = getSilencedItemTags(n);
                        return itemTags.some(t => t.id === tag.id || t.name.toLowerCase() === tag.name.toLowerCase());
                    }).length;
                    html += `
                        <button class="filter-chip active" data-silenced-cat="${tag.id}">
                            ${tag.label || tag.name} (${count})
                        </button>
                    `;
                }
            });

            html += `
                <button type="button" id="btn-toggle-silenced-tags" class="filter-chip" style="background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(168, 85, 247, 0.5); color: #c084fc; font-weight: 600;">
                    🏷️ Etiquetas ▾
                </button>
            `;
        }

        silencedFiltersContainer.innerHTML = html;

        const toggleBtn = silencedFiltersContainer.querySelector('#btn-toggle-silenced-tags');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isSilencedFiltersExpanded = !isSilencedFiltersExpanded;
                renderSilencedFilters();
            });
        }

        silencedFiltersContainer.querySelectorAll('[data-silenced-cat]').forEach(chip => {
            chip.addEventListener('click', () => {
                const cat = chip.getAttribute('data-silenced-cat');
                if (cat === 'all') {
                    selectedSilencedFilters.clear();
                } else {
                    if (selectedSilencedFilters.has(cat)) {
                        selectedSilencedFilters.delete(cat);
                    } else {
                        selectedSilencedFilters.add(cat);
                    }
                }
                currentContactsPage = 1;
                renderSilencedFilters();
                renderSilencedNumbersTable();
            });
        });
    }

    function renderContactsPagination(totalItems, totalPages) {
        const infoEl = document.getElementById('contacts-pagination-info');
        const controlsEl = document.getElementById('contacts-pagination-controls');
        if (!infoEl || !controlsEl) return;

        if (totalItems === 0) {
            infoEl.textContent = 'Mostrando 0 contactos';
            controlsEl.innerHTML = '';
            return;
        }

        const start = (currentContactsPage - 1) * CONTACTS_PER_PAGE + 1;
        const end = Math.min(currentContactsPage * CONTACTS_PER_PAGE, totalItems);
        infoEl.textContent = `Mostrando ${start} - ${end} de ${totalItems} contactos (Pág. ${currentContactsPage}/${totalPages})`;

        if (totalPages <= 1) {
            controlsEl.innerHTML = '';
            return;
        }

        let buttonsHtml = '';

        // Botón Anterior
        buttonsHtml += `
            <button type="button" class="contacts-page-btn" data-page="${currentContactsPage - 1}" ${currentContactsPage <= 1 ? 'disabled' : ''}>
                « Anterior
            </button>
        `;

        // Generar botones de páginas numéricas
        let pageNumbers = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
        } else {
            if (currentContactsPage <= 4) {
                pageNumbers = [1, 2, 3, 4, 5, '...', totalPages];
            } else if (currentContactsPage >= totalPages - 3) {
                pageNumbers = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pageNumbers = [1, '...', currentContactsPage - 1, currentContactsPage, currentContactsPage + 1, '...', totalPages];
            }
        }

        pageNumbers.forEach(p => {
            if (p === '...') {
                buttonsHtml += `<span style="color: #64748b; padding: 0 4px; font-weight: bold; user-select: none;">...</span>`;
            } else {
                buttonsHtml += `
                    <button type="button" class="contacts-page-btn ${p === currentContactsPage ? 'active' : ''}" data-page="${p}">
                        ${p}
                    </button>
                `;
            }
        });

        // Botón Siguiente
        buttonsHtml += `
            <button type="button" class="contacts-page-btn" data-page="${currentContactsPage + 1}" ${currentContactsPage >= totalPages ? 'disabled' : ''}>
                Siguiente »
            </button>
        `;

        controlsEl.innerHTML = buttonsHtml;

        controlsEl.querySelectorAll('.contacts-page-btn:not(:disabled)').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = parseInt(btn.getAttribute('data-page'), 10);
                if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
                    currentContactsPage = targetPage;
                    renderSilencedNumbersTable();
                    // Desplazarse al inicio de la página manteniendo el header visible
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    }

    function updateBulkToolbar() {
        const toolbar = document.getElementById('contacts-bulk-toolbar');
        const countBadge = document.getElementById('bulk-selected-count-badge');
        const selectAllChk = document.getElementById('silenced-select-all-chk');
        if (!toolbar) return;

        const count = selectedSilencedPhones.size;
        if (count > 0) {
            toolbar.style.display = 'flex';
            if (countBadge) countBadge.textContent = `${count} seleccionado${count > 1 ? 's' : ''}`;
        } else {
            toolbar.style.display = 'none';
            if (selectAllChk) selectAllChk.checked = false;
        }
    }

    function renderSilencedNumbersTable() {
        const tbody = document.getElementById('silenced-numbers-table-body');
        const badge = document.getElementById('silenced-count-badge');
        const selectAllChk = document.getElementById('silenced-select-all-chk');
        if (!tbody) return;

        const allContacts = getCombinedContactsList();
        const total = allContacts.length;

        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline-block' : 'none';
        }
        updateHeaderAndMenuBadges();

        let filtered = [...allContacts];

        // Filtrar por múltiples etiquetas y estados (Intersección estricta / AND)
        if (selectedSilencedFilters.size > 0) {
            filtered = filtered.filter(item => {
                for (const filterId of selectedSilencedFilters) {
                    if (filterId === 'bot_active') {
                        if (item.activo !== false) return false;
                    } else if (filterId === 'bot_canceled') {
                        if (item.activo === false) return false;
                    } else {
                        const itemTags = getSilencedItemTags(item);
                        const hasTag = itemTags.some(t => t.id === filterId || t.name.toLowerCase() === filterId.toLowerCase());
                        if (!hasTag) return false;
                    }
                }
                return true;
            });
        }

        // Filtrar por búsqueda (insensible a espacios, guiones y símbolos en teléfonos y nombres)
        if (currentSilencedSearch.trim()) {
            const q = currentSilencedSearch.toLowerCase().trim();
            const qNoSpaces = q.replace(/\s+/g, '');
            const qDigits = q.replace(/\D/g, '');

            filtered = filtered.filter(n => {
                const rawName = (n.nombre || '').toLowerCase();
                const nameNoSpaces = rawName.replace(/\s+/g, '');
                const rawPhone = (n.telefono || '').toString().toLowerCase();
                const phoneDigits = rawPhone.replace(/\D/g, '');
                const phoneDigitsNo34 = phoneDigits.startsWith('34') ? phoneDigits.slice(2) : phoneDigits;
                const rawCat = (n.categoria || '').toLowerCase();
                const rawNotes = (n.notas || '').toLowerCase();

                // 1. Coincidencia por dígitos de teléfono (ej: "6704265 40" -> "670426540")
                const digitsMatch = qDigits.length >= 2 && (
                    phoneDigits.includes(qDigits) ||
                    phoneDigitsNo34.includes(qDigits) ||
                    (qDigits.length >= 6 && (qDigits.includes(phoneDigits) || qDigits.includes(phoneDigitsNo34)))
                );

                // 2. Coincidencia de texto (con y sin espacios)
                const textMatch = 
                    rawName.includes(q) ||
                    nameNoSpaces.includes(qNoSpaces) ||
                    rawPhone.includes(q) ||
                    rawCat.includes(q) ||
                    rawNotes.includes(q);

                return digitsMatch || textMatch;
            });
        }

        const totalPages = Math.ceil(filtered.length / CONTACTS_PER_PAGE) || 1;
        if (currentContactsPage > totalPages) currentContactsPage = totalPages;
        if (currentContactsPage < 1) currentContactsPage = 1;

        const startIndex = (currentContactsPage - 1) * CONTACTS_PER_PAGE;
        const endIndex = Math.min(startIndex + CONTACTS_PER_PAGE, filtered.length);
        const pageItems = filtered.slice(startIndex, endIndex);

        renderContactsPagination(filtered.length, totalPages);

        if (selectAllChk) {
            const allVisibleSelected = pageItems.length > 0 && pageItems.every(item => selectedSilencedPhones.has(item.telefono));
            selectAllChk.checked = allVisibleSelected;
        }

        updateBulkToolbar();

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #94a3b8; padding: 40px;">
                        No se encontraron contactos con los filtros actuales.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pageItems.map(item => {
            const itemTags = getSilencedItemTags(item);
            const badgesHtml = `
                <div class="silenced-tags-list-badges">
                    ${itemTags.map(t => `
                        <span class="silenced-tag-badge" style="background: ${t.bg || 'rgba(255,255,255,0.1)'}; color: ${t.color || '#e2e8f0'}; border: 1px solid ${t.color ? t.color + '44' : 'rgba(255,255,255,0.2)'};">
                            ${t.emoji || '🏷️'} ${t.name || t.id}
                        </span>
                    `).join('')}
                </div>
            `;

            const cleanPhone = (item.telefono || '').toString().replace(/\D/g, '');
            const isSilencedActive = item.activo !== false;
            const isChecked = selectedSilencedPhones.has(cleanPhone);

            const statusHtml = isSilencedActive
                ? `<span class="silenced-status-btn" style="background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35); padding: 3px 8px; border-radius: 12px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: transform 0.15s ease;" title="Bot Cancelado. Haz clic para activarlo.">🔇 Bot Cancelado</span>`
                : `<span class="silenced-status-btn" style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); padding: 3px 8px; border-radius: 12px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: transform 0.15s ease;" title="Bot Activo. Haz clic para cancelarlo.">🔊 Bot Activo</span>`;

            return `
                <tr class="silenced-row-item" style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); ${isChecked ? 'background: rgba(147, 51, 234, 0.08);' : ''}">
                    <td class="col-chk" style="width: 40px; padding: 10px 12px; text-align: center; vertical-align: middle;">
                        <input type="checkbox" class="silenced-row-chk" data-phone="${cleanPhone}" data-id="${item.id || ''}" ${isChecked ? 'checked' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #9333ea;">
                    </td>
                    <td class="col-name" style="padding: 10px 14px; font-family: var(--font-family); font-size: 0.88rem; font-weight: 600; color: #f8fafc; vertical-align: middle;">
                        <span class="silenced-contact-name">${item.nombre || 'Contacto'}</span>
                    </td>
                    <td class="col-phone" style="padding: 10px 14px; font-family: var(--font-family); font-size: 0.88rem; color: #f1f5f9; vertical-align: middle;">
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="silenced-phone-link" style="color: #f1f5f9; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-family); font-size: 0.88rem;">
                            +${item.telefono}
                        </a>
                    </td>
                    <td class="col-cat" style="padding: 10px 14px; font-family: var(--font-family); font-size: 0.88rem; vertical-align: middle;">
                        ${badgesHtml}
                    </td>
                    <td class="col-status" style="padding: 10px 14px; text-align: center; vertical-align: middle;">
                        <div class="status-toggle-wrapper" data-phone="${cleanPhone}" data-id="${item.id || ''}" data-name="${encodeURIComponent(item.nombre || 'Contacto')}" data-active="${isSilencedActive}" style="display: inline-block;">
                            ${statusHtml}
                        </div>
                    </td>
                    <td class="col-actions" style="padding: 10px 14px; text-align: right; white-space: nowrap; vertical-align: middle;">
                        <div class="silenced-actions-group" style="display: inline-flex; gap: 8px; align-items: center; justify-content: flex-end;">
                            <button type="button" class="btn-chat-silence" data-phone="${cleanPhone}" data-name="${encodeURIComponent(item.nombre || 'Contacto')}" style="background: none; border: none; box-shadow: none; cursor: pointer; padding: 2px 4px; display: inline-flex; align-items: center; justify-content: center; line-height: 1; transition: transform 0.15s ease;" title="Abrir chat de WhatsApp con este contacto">
                                <img src="/admin/whatsapp_logo_icon.png" alt="WhatsApp" style="width: 22px; height: 22px; object-fit: contain; display: block;">
                            </button>
                            <button type="button" class="btn-edit-silence" data-id="${item.id || ''}" data-phone="${cleanPhone}" data-name="${encodeURIComponent(item.nombre || '')}" data-cat="${encodeURIComponent(item.categoria || '')}" data-notes="${encodeURIComponent(item.notas || '')}" style="background: none; border: none; box-shadow: none; font-size: 1.15rem; cursor: pointer; padding: 2px 4px; display: inline-flex; align-items: center; justify-content: center; line-height: 1; transition: transform 0.15s ease;" title="Editar contacto y etiquetas">
                                ✏️
                            </button>
                            <button type="button" class="btn-delete-silence" data-id="${item.id || ''}" data-phone="${cleanPhone}" data-name="${encodeURIComponent(item.nombre || 'Contacto')}" style="background: none; border: none; box-shadow: none; font-size: 1.15rem; cursor: pointer; padding: 2px 4px; display: inline-flex; align-items: center; justify-content: center; line-height: 1; transition: transform 0.15s ease;" title="Eliminar contacto">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Listeners de Checkbox individual
        tbody.querySelectorAll('.silenced-row-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const phone = chk.getAttribute('data-phone');
                if (chk.checked) {
                    selectedSilencedPhones.add(phone);
                } else {
                    selectedSilencedPhones.delete(phone);
                }
                renderSilencedNumbersTable();
            });
        });

        // Listeners para abrir chat de WhatsApp directo desde Contactos
        tbody.querySelectorAll('.btn-chat-silence').forEach(btn => {
            btn.addEventListener('click', () => {
                const phone = btn.getAttribute('data-phone') || '';
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Contacto');
                if (!phone) return;

                // 1. Cambiar a la pestaña Buzón
                if (typeof switchToTab === 'function') {
                    switchToTab('tab-inbox');
                } else {
                    tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'tab-inbox'));
                    tabContents.forEach(c => c.classList.toggle('active', c.id === 'tab-inbox'));
                }

                // 2. Si existe o no la conversación en la lista, abrirla en el panel de conversación
                setTimeout(() => {
                    if (typeof selectConversation === 'function') {
                        selectConversation(phone, name);
                    } else if (typeof openReplyModal === 'function') {
                        openReplyModal(phone, name);
                    }
                }, 80);
            });
        });

        // Listeners para cambio interactivo de Estado (con confirmación)
        tbody.querySelectorAll('.status-toggle-wrapper').forEach(wrapper => {
            wrapper.addEventListener('click', async () => {
                const id = wrapper.getAttribute('data-id');
                const phone = wrapper.getAttribute('data-phone');
                const name = decodeURIComponent(wrapper.getAttribute('data-name') || 'Contacto');
                const isCanceled = wrapper.getAttribute('data-active') === 'true';

                const promptMsg = isCanceled
                    ? `¿Deseas activar el bot para "${name}" (+${phone})?\nEl chatbot volverá a responder automáticamente con menús a este contacto.`
                    : `¿Deseas cancelar el bot para "${name}" (+${phone})?\nEl chatbot dejará de enviar respuestas automáticas a este contacto.`;

                if (!confirm(promptMsg)) return;

                try {
                    const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                    if (id && !id.startsWith('chat_')) {
                        await fetch(`/api/admin/silenced-numbers/${id}/toggle`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                            body: JSON.stringify({ activo: !isCanceled })
                        });
                    } else {
                        // Si el contacto venía de un chat sin registrar en BD, lo registramos con el estado opuesto
                        await fetch('/api/admin/silenced-numbers', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                            body: JSON.stringify({
                                telefono: phone,
                                nombre: name,
                                categoria: 'cliente',
                                activo: !isCanceled
                            })
                        });
                    }
                    await fetchSilencedNumbers();
                } catch (err) {
                    alert('Error cambiando estado: ' + err.message);
                }
            });
        });

        // Listeners para editar contacto
        tbody.querySelectorAll('.btn-edit-silence').forEach(btn => {
            btn.addEventListener('click', () => {
                const phone = btn.getAttribute('data-phone') || '';
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');
                const cat = decodeURIComponent(btn.getAttribute('data-cat') || '');
                const notes = decodeURIComponent(btn.getAttribute('data-notes') || '');
                openSilencedModal(phone, name, cat, notes);
            });
        });

        // Listeners para eliminar contacto
        tbody.querySelectorAll('.btn-delete-silence').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Contacto');

                if (!confirm(`¿Eliminar a "${name}" (+${phone}) de la lista de contactos?`)) return;

                try {
                    const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                    if (id && !id.startsWith('chat_')) {
                        await fetch(`/api/admin/silenced-numbers/${id}`, {
                            method: 'DELETE',
                            headers: { 'x-admin-token': tokenToUse }
                        });
                    } else {
                        await fetch('/api/admin/silenced-numbers/bulk-delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                            body: JSON.stringify({ phones: [phone] })
                        });
                    }
                    selectedSilencedPhones.delete(phone);
                    await fetchSilencedNumbers();
                } catch (err) {
                    alert('Error al eliminar: ' + err.message);
                }
            });
        });
    }

    // Listener para el Checkbox Maestro "Seleccionar todos"
    const silencedSelectAllChk = document.getElementById('silenced-select-all-chk');
    if (silencedSelectAllChk) {
        silencedSelectAllChk.addEventListener('change', (e) => {
            const allContacts = getCombinedContactsList();
            let filtered = [...allContacts];

            if (currentSilencedFilter === 'bot_active') {
                filtered = filtered.filter(n => !n.activo);
            } else if (currentSilencedFilter === 'bot_canceled') {
                filtered = filtered.filter(n => !!n.activo);
            } else if (currentSilencedFilter !== 'all') {
                filtered = filtered.filter(n => {
                    const itemTags = getSilencedItemTags(n);
                    return itemTags.some(t => t.id === currentSilencedFilter || t.name.toLowerCase() === currentSilencedFilter.toLowerCase());
                });
            }

            if (currentSilencedSearch.trim()) {
                const q = currentSilencedSearch.toLowerCase().trim();
                filtered = filtered.filter(n => 
                    (n.nombre || '').toLowerCase().includes(q) ||
                    (n.telefono || '').toLowerCase().includes(q) ||
                    (n.categoria || '').toLowerCase().includes(q)
                );
            }

            if (silencedSelectAllChk.checked) {
                filtered.forEach(item => selectedSilencedPhones.add(item.telefono));
            } else {
                filtered.forEach(item => selectedSilencedPhones.delete(item.telefono));
            }
            renderSilencedNumbersTable();
        });
    }

    // Listeners para la barra de acciones masivas
    const btnBulkActivateBot = document.getElementById('btn-bulk-activate-bot');
    const btnBulkCancelBot = document.getElementById('btn-bulk-cancel-bot');
    const btnBulkOpenTags = document.getElementById('btn-bulk-open-tags');
    const btnBulkDeleteContacts = document.getElementById('btn-bulk-delete-contacts');
    const btnBulkDeselectAll = document.getElementById('btn-bulk-deselect-all');

    if (btnBulkDeselectAll) {
        btnBulkDeselectAll.addEventListener('click', () => {
            selectedSilencedPhones.clear();
            renderSilencedNumbersTable();
        });
    }

    if (btnBulkActivateBot) {
        btnBulkActivateBot.addEventListener('click', async () => {
            const phones = Array.from(selectedSilencedPhones);
            if (phones.length === 0) return;
            if (!confirm(`¿Activar el bot para los ${phones.length} contactos seleccionados?`)) return;

            try {
                const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                await fetch('/api/admin/silenced-numbers/bulk-toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                    body: JSON.stringify({ phones, activo: false })
                });
                selectedSilencedPhones.clear();
                await fetchSilencedNumbers();
            } catch (err) {
                alert('Error al activar bot por lotes: ' + err.message);
            }
        });
    }

    if (btnBulkCancelBot) {
        btnBulkCancelBot.addEventListener('click', async () => {
            const phones = Array.from(selectedSilencedPhones);
            if (phones.length === 0) return;
            if (!confirm(`¿Cancelar el bot para los ${phones.length} contactos seleccionados?`)) return;

            try {
                const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                await fetch('/api/admin/silenced-numbers/bulk-toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                    body: JSON.stringify({ phones, activo: true })
                });
                selectedSilencedPhones.clear();
                await fetchSilencedNumbers();
            } catch (err) {
                alert('Error al cancelar bot por lotes: ' + err.message);
            }
        });
    }

    if (btnBulkDeleteContacts) {
        btnBulkDeleteContacts.addEventListener('click', async () => {
            const phones = Array.from(selectedSilencedPhones);
            if (phones.length === 0) return;
            if (!confirm(`¿Eliminar los ${phones.length} contactos seleccionados?`)) return;

            try {
                const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                await fetch('/api/admin/silenced-numbers/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                    body: JSON.stringify({ phones })
                });
                selectedSilencedPhones.clear();
                await fetchSilencedNumbers();
            } catch (err) {
                alert('Error al eliminar contactos por lotes: ' + err.message);
            }
        });
    }

    // Modal de asignación de etiquetas en lote
    const bulkTagModal = document.getElementById('bulk-tag-modal');
    const bulkTagSelect = document.getElementById('bulk-tag-select');
    const closeBulkTagModalBtn = document.getElementById('close-bulk-tag-modal-btn');
    const saveBulkTagBtn = document.getElementById('save-bulk-tag-btn');

    if (btnBulkOpenTags && bulkTagModal && bulkTagSelect) {
        btnBulkOpenTags.addEventListener('click', () => {
            const tags = getAllAvailableSilencedTags();
            bulkTagSelect.innerHTML = tags.map(t => `<option value="${t.id}">${t.label || t.name}</option>`).join('');
            bulkTagModal.style.display = 'flex';
        });
    }

    if (closeBulkTagModalBtn && bulkTagModal) {
        closeBulkTagModalBtn.addEventListener('click', () => {
            bulkTagModal.style.display = 'none';
        });
    }

    if (saveBulkTagBtn && bulkTagModal && bulkTagSelect) {
        saveBulkTagBtn.addEventListener('click', async () => {
            const phones = Array.from(selectedSilencedPhones);
            const selectedCat = bulkTagSelect.value;
            if (phones.length === 0 || !selectedCat) return;

            try {
                const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                await fetch('/api/admin/silenced-numbers/bulk-tag', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                    body: JSON.stringify({ phones, categoria: selectedCat })
                });
                bulkTagModal.style.display = 'none';
                selectedSilencedPhones.clear();
                await fetchSilencedNumbers();
            } catch (err) {
                alert('Error asignando etiqueta por lotes: ' + err.message);
            }
        });
    }

    function renderSilencedModalTags() {
        if (!silencedModalTagsContainer) return;
        const available = getAllAvailableSilencedTags();

        silencedModalTagsContainer.innerHTML = available.map(tag => {
            const isSelected = selectedSilencedModalTags.includes(tag.id) || selectedSilencedModalTags.includes(tag.name.toLowerCase());
            return `
                <div class="silenced-tag-selectable-chip ${isSelected ? 'selected' : ''}" data-tag-id="${tag.id}" data-tag-name="${tag.name}">
                    <span class="tag-check-icon">${isSelected ? '✓' : '+'}</span>
                    <span>${tag.label || tag.name}</span>
                </div>
            `;
        }).join('');

        silencedModalTagsContainer.querySelectorAll('.silenced-tag-selectable-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tagId = chip.getAttribute('data-tag-id');
                const tagName = chip.getAttribute('data-tag-name');
                const idx = selectedSilencedModalTags.findIndex(t => t === tagId || t === tagName || t.toLowerCase() === tagId.toLowerCase());
                if (idx > -1) {
                    if (selectedSilencedModalTags.length > 1) {
                        selectedSilencedModalTags.splice(idx, 1);
                    } else {
                        // Mantener al menos una seleccionada
                        selectedSilencedModalTags.splice(idx, 1);
                    }
                } else {
                    selectedSilencedModalTags.push(tagId);
                }
                renderSilencedModalTags();
            });
        });
    }

    const silencedSubmitBtn = document.getElementById('silenced-submit-btn');

    function openSilencedModal(prefillPhone = '', prefillName = '', prefillCat = 'proveedor', prefillNotes = '') {
        if (!silencedModal) return;
        if (silencedPhoneInput) silencedPhoneInput.value = prefillPhone;
        if (silencedNameInput) silencedNameInput.value = prefillName;
        if (silencedNotesInput) silencedNotesInput.value = prefillNotes;

        if (silencedModalTitle) {
            silencedModalTitle.textContent = prefillPhone ? '✏️ Editar Contacto' : '➕ Añadir Contacto';
        }
        if (silencedSubmitBtn) {
            silencedSubmitBtn.textContent = prefillPhone ? '💾 Guardar Cambios' : '💾 Guardar Contacto';
        }

        if (prefillCat) {
            selectedSilencedModalTags = prefillCat.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
            if (selectedSilencedModalTags.length === 0) selectedSilencedModalTags = ['proveedor'];
        } else {
            selectedSilencedModalTags = ['proveedor'];
        }

        renderSilencedModalTags();
        silencedModal.style.display = 'flex';
        setTimeout(() => {
            if (prefillPhone && silencedNameInput) {
                silencedNameInput.focus();
            } else if (silencedPhoneInput) {
                silencedPhoneInput.focus();
            }
        }, 50);
    }

    function closeSilencedModal() {
        if (silencedModal) silencedModal.style.display = 'none';
    }

    const btnDeleteCurrentTag = document.getElementById('btn-delete-current-tag');

    function openSilencedTagModal(editTag = null) {
        if (!silencedTagModal) return;
        
        if (editTag) {
            currentEditingTagId = editTag.id;
            if (silencedTagModalTitle) silencedTagModalTitle.textContent = '✏️ Editar Etiqueta';
            if (silencedTagModalDesc) silencedTagModalDesc.textContent = `Modifica el nombre de la etiqueta "${editTag.name}".`;
            if (silencedTagSubmitBtn) silencedTagSubmitBtn.textContent = '💾 Guardar Cambios';
            if (editingTagIdInput) editingTagIdInput.value = editTag.id;
            if (newTagNameInput) newTagNameInput.value = editTag.name || '';
            selectedTagEmoji = (editTag.emoji !== undefined && editTag.emoji !== null) ? editTag.emoji : '';
            if (btnDeleteCurrentTag) {
                btnDeleteCurrentTag.style.display = 'inline-flex';
                btnDeleteCurrentTag.setAttribute('data-tag-id', editTag.id);
                btnDeleteCurrentTag.setAttribute('data-tag-name', editTag.name || '');
            }
        } else {
            currentEditingTagId = null;
            if (silencedTagModalTitle) silencedTagModalTitle.textContent = '🏷️ Crear Nueva Etiqueta';
            if (silencedTagModalDesc) silencedTagModalDesc.textContent = 'Crea una etiqueta personalizada para clasificar tus chats y contactos.';
            if (silencedTagSubmitBtn) silencedTagSubmitBtn.textContent = '💾 Guardar Etiqueta';
            if (editingTagIdInput) editingTagIdInput.value = '';
            if (newTagNameInput) newTagNameInput.value = '';
            selectedTagEmoji = '';
            if (btnDeleteCurrentTag) {
                btnDeleteCurrentTag.style.display = 'none';
                btnDeleteCurrentTag.removeAttribute('data-tag-id');
                btnDeleteCurrentTag.removeAttribute('data-tag-name');
            }
        }

        silencedTagModal.style.display = 'flex';
        setTimeout(() => { if (newTagNameInput) newTagNameInput.focus(); }, 50);
    }

    function closeSilencedTagModal() {
        if (silencedTagModal) silencedTagModal.style.display = 'none';
        currentEditingTagId = null;
    }

    if (closeSilencedModalBtn) closeSilencedModalBtn.addEventListener('click', closeSilencedModal);
    if (addSilencedNumberBtn) addSilencedNumberBtn.addEventListener('click', () => openSilencedModal());
    if (addSilencedTagBtn) addSilencedTagBtn.addEventListener('click', () => openSilencedTagModal());
    if (btnQuickNewTag) btnQuickNewTag.addEventListener('click', () => openSilencedTagModal());
    if (closeSilencedTagModalBtn) closeSilencedTagModalBtn.addEventListener('click', closeSilencedTagModal);

    // Botón para eliminar la etiqueta desde el modal de edición
    if (btnDeleteCurrentTag) {
        btnDeleteCurrentTag.addEventListener('click', () => {
            const tagId = btnDeleteCurrentTag.getAttribute('data-tag-id');
            const tagName = btnDeleteCurrentTag.getAttribute('data-tag-name') || '';
            if (!tagId) return;

            if (!confirm(`⚠️ ¿Estás seguro de que deseas ELIMINAR la etiqueta "${tagName}"?`)) return;

            addDeletedTag(tagId);

            // Desasignar de los chats guardados
            const map = getChatTagsMap();
            let changed = false;
            Object.keys(map).forEach(phone => {
                if (Array.isArray(map[phone])) {
                    const filtered = map[phone].filter(t => t.toLowerCase() !== tagId.toLowerCase() && t.toLowerCase() !== tagName.toLowerCase());
                    if (filtered.length !== map[phone].length) {
                        map[phone] = filtered;
                        changed = true;
                    }
                }
            });
            if (changed) localStorage.setItem(CHAT_TAGS_STORAGE_KEY, JSON.stringify(map));

            selectedChatTagsList = selectedChatTagsList.filter(t => t.toLowerCase() !== tagId.toLowerCase() && t.toLowerCase() !== tagName.toLowerCase());

            closeSilencedTagModal();
            renderSilencedFilters();
            if (typeof renderInboxTagsManagerList === 'function') renderInboxTagsManagerList();
            if (typeof renderChatTagsModalGrid === 'function') renderChatTagsModalGrid();
            syncUnifiedConversations();
            if (typeof renderInboxFilterPills === 'function') renderInboxFilterPills();
            renderInboxCards();

            showToast(`🗑️ Etiqueta "${tagName}" eliminada correctamente.`);
        });
    }

    // Dropdown de Emoticonos Listener
    if (tagEmojiSelect) {
        tagEmojiSelect.addEventListener('change', () => {
            selectedTagEmoji = tagEmojiSelect.value;
            if (selectedEmojiPreview) selectedEmojiPreview.textContent = selectedTagEmoji || '—';
        });
    }

    // Formulario para guardar / editar etiqueta
    if (silencedTagForm) {
        silencedTagForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = newTagNameInput ? newTagNameInput.value.trim() : '';
            if (!name) return;
            const editId = editingTagIdInput ? editingTagIdInput.value.trim() : null;

            const savedTag = saveCustomSilencedTag(name, selectedTagEmoji, editId);
            if (savedTag) {
                // Si el modal de contacto silenciado está abierto, seleccionarla
                if (silencedModal && silencedModal.style.display !== 'none') {
                    if (!selectedSilencedModalTags.includes(savedTag.id)) {
                        selectedSilencedModalTags.push(savedTag.id);
                    }
                    renderSilencedModalTags();
                }

                // Si el modal de etiquetas de chat está abierto, seleccionarla
                if (chatTagsModal && chatTagsModal.style.display !== 'none') {
                    if (!selectedChatTagsList.some(t => t.toLowerCase() === savedTag.id || t.toLowerCase() === savedTag.name.toLowerCase())) {
                        selectedChatTagsList.push(savedTag.name);
                    }
                    renderChatTagsModalGrid();
                }

                // Refrescar todos los gestores, filtros y tarjetas
                renderSilencedFilters();
                if (typeof renderInboxTagsManagerList === 'function') renderInboxTagsManagerList();
                if (typeof renderChatTagsModalGrid === 'function') renderChatTagsModalGrid();
                syncUnifiedConversations();
                if (typeof renderInboxFilterPills === 'function') renderInboxFilterPills();
                renderInboxCards();

                closeSilencedTagModal();
                showToast(editId ? `✅ Etiqueta "${savedTag.name}" actualizada con éxito` : `✅ Etiqueta "${savedTag.name}" creada con éxito`);
            }
        });
    }

    if (refreshSilencedBtn) refreshSilencedBtn.addEventListener('click', fetchSilencedNumbers);

    if (searchSilencedInput) {
        searchSilencedInput.addEventListener('input', (e) => {
            currentSilencedSearch = e.target.value;
            currentContactsPage = 1;
            renderSilencedNumbersTable();
        });
    }

    if (silencedNumberForm) {
        silencedNumberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = silencedPhoneInput ? silencedPhoneInput.value.trim() : '';
            const name = silencedNameInput ? silencedNameInput.value.trim() : '';
            const tagsToSave = selectedSilencedModalTags.length > 0 ? selectedSilencedModalTags.join(', ') : 'proveedor';
            const notes = silencedNotesInput ? silencedNotesInput.value.trim() : '';

            if (!phone || !name) {
                alert('Por favor, introduce al menos el teléfono y el nombre.');
                return;
            }

            try {
                const res = await fetch('/api/admin/silenced-numbers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                    body: JSON.stringify({ telefono: phone, nombre: name, categoria: tagsToSave, notas: notes })
                });
                const data = await res.json();
                if (data.success) {
                    closeSilencedModal();
                    await fetchSilencedNumbers();
                } else {
                    alert('Error guardando contacto: ' + (data.error || 'Error desconocido'));
                }
            } catch (err) {
                alert('Error de conexión: ' + err.message);
            }
        });
    }

    // INICIALIZAR DASHBOARD Y CARGAR ESTRUCTURA
    async function initDashboard() {
        hideLoginModal();

        // Aplicar restricciones visuales por rol de usuario
        const role = localStorage.getItem('casa_julian_user_role') || 'admin';
        if (role === 'recepcion') {
            // RECEPCIÓN: Buzón de Recepción y Números Silenciados visibles
            document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
                const t = btn.getAttribute('data-tab');
                btn.style.display = (t === 'tab-inbox' || t === 'tab-silenced') ? 'inline-block' : 'none';
            });
            // Ocultar el simulador de móvil (no necesario para recepción)
            document.body.classList.add('mode-recepcion');
            // Activar la pestaña inbox directamente
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const inboxContent = document.getElementById('tab-inbox');
            if (inboxContent) inboxContent.classList.add('active');
            // Cargar ajustes compartidos, solicitudes, chats y contactos en paralelo y empezar polling
            await Promise.all([
                fetchInboxSettings(),
                fetchSilencedNumbers(),
                loadUnifiedInboxData()
            ]);
            if (!inboxPollingInterval) {
                inboxPollingInterval = setInterval(() => {
                    loadUnifiedInboxData();
                }, 3500);
            }
            // No cargar estructura del bot (no necesaria para recepción)
            return;
        }

        // ADMINISTRACIÓN: Todas las pestañas habilitadas
        document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
            btn.style.display = 'inline-block';
        });
        // Activar primera pestaña visible (tab-flow)
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const flowContent = document.getElementById('tab-flow');
        if (flowContent) flowContent.classList.add('active');
        const flowTabBtn = document.querySelector('.tabs-nav .tab-btn[data-tab="tab-flow"]');
        if (flowTabBtn) { flowTabBtn.classList.add('active'); }
        if (typeof updateHeaderActiveTab === 'function') updateHeaderActiveTab('tab-flow');

        // Iniciar sincronización compartida y polling continuo en tiempo real
        await Promise.all([
            fetchInboxSettings(),
            fetchSilencedNumbers(),
            loadUnifiedInboxData()
        ]);
        if (!inboxPollingInterval) {
            inboxPollingInterval = setInterval(() => {
                loadUnifiedInboxData();
            }, 3500);
        }

        try {
            const res = await fetch('/api/admin/structure', {
                headers: { 'x-admin-token': adminToken }
            });

            if (res.status === 401) {
                localStorage.removeItem('casa_julian_admin_token');
                localStorage.removeItem('casa_julian_user_role');
                showLoginModal();
                return;
            }

            const data = await res.json();
            if (data.success) {
                currentStructure = data;
                renderUseCasesFlow();
                renderTextsGrid();
                renderMenuTable();
                renderFaqsList();
                renderCustomRulesTable();
                renderDraftChangesTable();
                updateLiveSimulator('welcomeMessage');
            }
        } catch (err) {
            console.error('Error cargando estructura del bot:', err);
        }
    }

    function getCategoryForKey(key) {
        if (!key) return 'main';
        if (key.startsWith('welcome') || key.startsWith('lang_') || key.includes('Language')) {
            return 'welcome';
        }
        if (key.startsWith('selectLocation') || key.startsWith('loc') || key === 'madridMsg') {
            return 'location';
        }
        if (key.startsWith('thanks') || key.includes('Closing') || key.includes('Despedida')) {
            return 'closing';
        }
        if (key.startsWith('faq')) {
            return 'faq';
        }
        if (key.startsWith('menuTrad') || key.startsWith('regalar') || key.includes('Gift')) {
            return 'tradicion';
        }
        if (key.startsWith('mod')) {
            return 'mod';
        }
        if (key.startsWith('cancel')) {
            return 'cancel';
        }
        if (key.startsWith('waitlist') || key.startsWith('reserva') || key.startsWith('day')) {
            return 'reserva';
        }
        if (key.startsWith('mainMenu') || key.startsWith('menu') || key.startsWith('opt')) {
            return 'main';
        }
        return (currentStructure && currentStructure.categoryMap && currentStructure.categoryMap[key]) || 'main';
    }

    // CLASIFICACIÓN DE COLORES POR TIPO DE ETIQUETA
    function getBadgeColorClass(key) {
        if (key.startsWith('welcome') || key.startsWith('lang_') || key.includes('Language')) return 'badge-header';
        if (key.startsWith('selectLocation') || key.startsWith('loc') || key === 'madridMsg') return 'badge-button';
        if (key.startsWith('thanks') || key.includes('Closing')) return 'badge-closing';
        if (key.startsWith('btn') || key.includes('Btn')) return 'badge-button';
        if (key.startsWith('faq')) return 'badge-faq';
        if (key.startsWith('menuTrad') || key.startsWith('regalar')) return 'badge-tradicion';
        if (key.startsWith('waitlist') || key.startsWith('reserva') || key.startsWith('mod') || key.startsWith('cancel') || key.startsWith('day')) return 'badge-reserva';
        return 'badge-main';
    }

    // 1. RENDERIZAR CASOS DE USO Y FLUJO SECUENCIAL (TAB 1)
    function renderUseCasesFlow() {
        const container = document.getElementById('flow-tree-container');
        if (!container || !currentStructure) return;

        container.innerHTML = '';
        const useCases = currentStructure.useCases || [];

        useCases.forEach(uc => {
            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'flow-node';
            nodeDiv.style.flexDirection = 'column';
            nodeDiv.style.alignItems = 'flex-start';
            nodeDiv.style.gap = '8px';

            let keysBadges = '';
            uc.keys.forEach(k => {
                const colorClass = getBadgeColorClass(k);
                const isDisabled = !!(currentStructure.disabledKeys && currentStructure.disabledKeys[k]);
                const statusTag = isDisabled ? `<span style="font-size:0.65rem; color:#f87171; margin-left:2px;">[SILENCIADO]</span>` : '';
                keysBadges += `<span class="key-jump-badge ${colorClass}" data-key="${k}" title="Editar ${k}">${k}${statusTag}</span>`;
            });

            nodeDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div class="flow-node-title" style="color:var(--accent-gold); font-weight:700;">
                        <span class="flow-badge" style="background:var(--accent-gold); color:#fff; font-weight:bold; margin-right:8px;">Paso ${uc.order}</span>
                        ${uc.title}
                    </div>
                </div>
                <div style="font-size:0.85rem; color:#e9edef; background:#181b22; padding:8px 12px; border-radius:6px; width:100%; border-left:3px solid var(--accent-blue); box-sizing:border-box;">
                    🤖 <strong>Acción del Chatbot:</strong> ${uc.botAction}
                </div>
                <div style="font-size:0.85rem; color:#e9edef; background:#181b22; padding:8px 12px; border-radius:6px; width:100%; border-left:3px solid var(--accent-green); box-sizing:border-box;">
                    👤 <strong>Respuesta Esperada del Cliente / Interacción:</strong> ${uc.expectedCustomerInput}
                </div>
                <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px; width:100%; box-sizing:border-box;">
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Mensajes configurables (${uc.keys.length}):</span>
                    <div class="key-badges-container">
                        ${keysBadges}
                    </div>
                </div>
            `;

            nodeDiv.querySelectorAll('.key-jump-badge').forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetKey = badge.getAttribute('data-key');
                    document.querySelector('[data-tab="tab-texts"]').click();
                    const allChip = document.querySelector('.filter-chip[data-cat="all"]');
                    if (allChip) allChip.click();
                    const targetCard = document.getElementById(`text-card-${targetKey}`);
                    if (targetCard) {
                        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetCard.style.border = '2px solid var(--accent-gold)';
                        setTimeout(() => targetCard.style.border = '1px solid var(--border-color)', 2500);
                        updateLiveSimulator(targetKey);
                    }
                });
            });

            container.appendChild(nodeDiv);
        });
    }

    function getEffectiveAttachment(key, attachments = {}) {
        if (attachments && attachments[key] && attachments[key].mediaUrl) {
            return { ...attachments[key], isCustom: true };
        }
        const baseUrl = window.location.origin;
        if (key === 'welcomeImageUrl') {
            return {
                mediaType: 'image',
                mediaUrl: `${baseUrl}/public/casa_julian_erretegia.jpg`,
                caption: 'Imagen de Bienvenida Predeterminado (Parrilla Casa Julián)',
                isDefault: true
            };
        }
        if (key === 'welcomeStickerUrl') {
            return {
                mediaType: 'sticker',
                mediaUrl: `${baseUrl}/public/casa_julian_sticker.webp`,
                caption: 'Sticker Animado de Bienvenida Predeterminado',
                isDefault: true
            };
        }
        if (key === 'regalarMenuMsg' || key === 'menuTradicionTitle') {
            return {
                mediaType: 'image',
                mediaUrl: `${baseUrl}/public/casa_julian_menu_tradicion.jpg`,
                caption: 'Ficha Menú Tradición Predeterminada',
                isDefault: true
            };
        }
        return null;
    }

    function renderMediaPreviewHtml(key, att) {
        if (!att || !att.mediaUrl) return '';

        const mediaType = (att.mediaType || 'image').toLowerCase();
        const isCustom = att.isCustom;
        const badgeText = isCustom ? '📌 ADJUNTO PERSONALIZADO' : '⭐ ARCHIVO PREDETERMINADO EN USO';
        const badgeColor = isCustom ? '#10b981' : '#f59e0b';
        const mediaIcon = mediaType === 'image' ? '🖼️' : mediaType === 'video' ? '🎬' : mediaType === 'audio' ? '🔊' : mediaType === 'sticker' ? '🎭' : mediaType === 'document' ? '📄' : '📁';

        let mediaElementHtml = '';
        if (mediaType === 'image' || mediaType === 'sticker') {
            mediaElementHtml = `
                <div style="margin-top:6px; text-align:center;">
                    <img src="${att.mediaUrl}" alt="Media Preview" style="max-width:100%; max-height:150px; border-radius:8px; object-fit:contain; border:1px solid rgba(255,255,255,0.15); background:#0d0f12; padding:4px;">
                </div>
            `;
        } else if (mediaType === 'video') {
            mediaElementHtml = `
                <div style="margin-top:6px;">
                    <video src="${att.mediaUrl}" controls style="max-width:100%; max-height:160px; border-radius:8px; width:100%; border:1px solid rgba(255,255,255,0.15);"></video>
                </div>
            `;
        } else if (mediaType === 'audio') {
            mediaElementHtml = `
                <div style="margin-top:6px;">
                    <audio src="${att.mediaUrl}" controls style="width:100%; height:40px; margin-top:4px;"></audio>
                </div>
            `;
        } else {
            mediaElementHtml = `
                <div style="margin-top:6px; background:#111827; padding:10px; border-radius:6px; border:1px dashed var(--accent-gold); display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:0.82rem; color:#f3f4f6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">
                        📄 <strong>${att.filename || 'Documento PDF/Adjunto'}</strong>
                    </span>
                    <a href="${att.mediaUrl}" target="_blank" style="background:var(--accent-gold); color:#000; font-weight:700; padding:4px 10px; border-radius:4px; font-size:0.75rem; text-decoration:none;">📥 Abrir Archivo</a>
                </div>
            `;
        }

        return `
            <div class="attachment-preview-card" style="background:#14171d; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px; margin-top:10px; position:relative;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.75rem; font-weight:700; color:${badgeColor}; background:rgba(0,0,0,0.4); padding:2px 8px; border-radius:4px; border:1px solid ${badgeColor};">
                        ${mediaIcon} ${badgeText}
                    </span>
                    ${isCustom ? `<button class="btn-danger btn-remove-attachment" data-key="${key}" style="padding:2px 8px; font-size:0.72rem;">🗑️ Quitar Adjunto</button>` : ''}
                </div>
                ${mediaElementHtml}
                ${att.caption ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px; font-style:italic;">💬 ${att.caption}</div>` : ''}
            </div>
        `;
    }

    // 2. RENDERIZAR GRID DE TEXTOS CON BOTONES DESACTIVAR / OCULTAR / ELIMINAR + ADJUNTOS (TAB 2)
    // 2. RENDERIZAR GRID DE TEXTOS CON BOTONES DESACTIVAR / OCULTAR / ELIMINAR + ADJUNTOS (TAB 2)
    function renderTextsGrid() {
        const container = document.getElementById('texts-list-container');
        if (!container || !currentStructure) return;

        const categoryMap = currentStructure.categoryMap || {};
        const disabledKeys = currentStructure.disabledKeys || {};
        const attachments = currentStructure.attachments || {};
        const staticEsTexts = currentStructure.staticTranslations['es'] || {};

        container.innerHTML = '';
        
        const allKeys = [...new Set([
            ...Object.keys(staticEsTexts),
            ...Object.keys((currentStructure.staticTranslations && currentStructure.staticTranslations['eu']) || {}),
            ...Object.keys((currentStructure.staticTranslations && currentStructure.staticTranslations['en']) || {}),
            ...Object.keys((currentStructure.dynamicTexts && currentStructure.dynamicTexts['es']) || {}),
            ...Object.keys((currentStructure.dynamicTexts && currentStructure.dynamicTexts['eu']) || {}),
            ...Object.keys((currentStructure.dynamicTexts && currentStructure.dynamicTexts['en']) || {})
        ])];

        // Añadir claves especiales de medios (imagen bienvenida, sticker) si no están ya
        const specialMediaKeys = [
            { key: 'welcomeImageUrl', label: '🖼️ Imagen de Bienvenida', category: 'welcome', mediaOnly: false },
            { key: 'welcomeStickerUrl', label: '🎭 Sticker Animado de Bienvenida', category: 'welcome', mediaOnly: true }
        ];

        specialMediaKeys.forEach(smk => {
            if (!allKeys.includes(smk.key)) allKeys.unshift(smk.key);
            if (!categoryMap[smk.key]) categoryMap[smk.key] = smk.category;
        });

        // Orden de prioridad secuencial (sólo idiomas soportados: es, eu, en)
        const keyOrderPriority = [
            'welcomeImageUrl',
            'welcomeStickerUrl',
            'welcomeMessage',
            'lang_es', 'lang_eu', 'lang_en',
            'selectLocationTitle',
            'selectLocationBody',
            'locPaisVasco',
            'locMadrid',
            'madridMsg',
            'mainMenuHeader',
            'menuButtonText',
            'opt1Title', 'opt1Desc',
            'opt2Title', 'opt2Desc',
            'opt3Title', 'opt3Desc',
            'optConsultaAbiertaTitle', 'optConsultaAbiertaDesc',
            'opt5Title', 'opt5Desc',
            'thanksClosingMsg'
        ];

        allKeys.sort((a, b) => {
            const indexA = keyOrderPriority.indexOf(a);
            const indexB = keyOrderPriority.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });

        allKeys.forEach(key => {
            const specialMedia = specialMediaKeys.find(s => s.key === key);
            const isMediaOnly = specialMedia && specialMedia.mediaOnly;
            const category = getCategoryForKey(key);
            const colorClass = getBadgeColorClass(key);
            const isDisabled = !!disabledKeys[key];
            const isCustomKey = !(key in staticEsTexts) && !isMediaOnly;

            const card = document.createElement('div');
            card.className = `text-card ${isDisabled ? 'card-disabled' : ''}`;
            card.id = `text-card-${key}`;
            card.setAttribute('data-category', category);

            const att = getEffectiveAttachment(key, attachments);
            const attachmentPreviewHtml = renderMediaPreviewHtml(key, att);
            const displayTitle = specialMedia ? specialMedia.label : key;

            let bodyHtml = '';
            if (isMediaOnly) {
                bodyHtml = `<div style="padding:8px; font-size:0.82rem; color:var(--text-muted); background:#181b22; border-radius:6px;">Este campo es exclusivamente multimedia. Usa <strong>📎 Añadir Adjunto</strong> para configurar el medio en este paso.</div>`;
            } else if (currentLangFilter === 'all') {
                // Modo comparativo (ES, EU, EN)
                const languages = [
                    { code: 'es', flag: '🇪🇸', name: 'Español' },
                    { code: 'eu', flag: '🇪🇺', name: 'Euskara' },
                    { code: 'en', flag: '🇬🇧', name: 'English' }
                ];
                
                bodyHtml = `<div class="comparative-lang-box" style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">`;
                languages.forEach(l => {
                    const lStatic = (currentStructure.staticTranslations[l.code] && currentStructure.staticTranslations[l.code][key]) || staticEsTexts[key] || '';
                    const lDyn = (currentStructure.dynamicTexts[l.code] && currentStructure.dynamicTexts[l.code][key]);
                    const lVal = lDyn !== undefined ? lDyn : lStatic;
                    
                    bodyHtml += `
                        <div class="lang-field-row" style="background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <span style="font-weight:600; font-size:0.85rem; color:var(--accent-gold);">${l.flag} ${l.name} (${l.code.toUpperCase()})</span>
                                <span class="char-counter-${l.code}" style="font-size:0.75rem; color:var(--text-muted);">${lVal.length} caracteres</span>
                            </div>
                            <textarea data-key="${key}" data-lang="${l.code}" style="width:100%; min-height:60px;">${lVal}</textarea>
                            <div style="text-align:right; margin-top:4px;">
                                <button class="btn-primary btn-save-lang-text" data-key="${key}" data-lang="${l.code}" style="padding: 3px 10px; font-size: 0.78rem;">💾 Guardar ${l.code.toUpperCase()}</button>
                            </div>
                        </div>
                    `;
                });
                bodyHtml += `</div>`;
            } else {
                // Modo idioma único (es, eu, en)
                const activeLang = currentLangFilter;
                const staticVal = (currentStructure.staticTranslations[activeLang] && currentStructure.staticTranslations[activeLang][key]) || staticEsTexts[key] || '';
                const currentVal = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[activeLang] && currentStructure.dynamicTexts[activeLang][key] !== undefined)
                    ? currentStructure.dynamicTexts[activeLang][key]
                    : staticVal;

                bodyHtml = `<textarea data-key="${key}" data-lang="${activeLang}">${currentVal}</textarea>`;
            }

            const activeLangSingle = currentLangFilter === 'all' ? 'es' : currentLangFilter;
            const currentValSingle = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[activeLangSingle] && currentStructure.dynamicTexts[activeLangSingle][key] !== undefined)
                ? currentStructure.dynamicTexts[activeLangSingle][key]
                : ((currentStructure.staticTranslations[activeLangSingle] && currentStructure.staticTranslations[activeLangSingle][key]) || staticEsTexts[key] || '');

            card.innerHTML = `
                <div class="text-card-header" style="align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="key-title ${colorClass}" style="padding:2px 6px; border-radius:4px;">${displayTitle}</span>
                        <span class="flow-badge">${category.toUpperCase()}</span>
                        <span class="status-badge ${isDisabled ? 'badge-off' : 'badge-on'}">${isDisabled ? '🔴 SILENCIADO / OCULTO' : '🟢 ACTIVO'}</span>
                        <span class="flow-badge" style="background:#2b3245; border: 1px solid rgba(212,175,55,0.3); color: var(--accent-gold);">${currentLangFilter === 'all' ? '🌐 VISTA COMPARATIVA (ES/EU/EN)' : (currentLangFilter === 'es' ? '🇪🇸 ESPAÑOL' : (currentLangFilter === 'eu' ? '🇪🇺 EUSKARA' : '🇬🇧 ENGLISH'))}</span>
                    </div>
                </div>
                ${bodyHtml}
                ${attachmentPreviewHtml}
                <div class="text-card-footer" style="margin-top:8px;">
                    ${isMediaOnly || currentLangFilter === 'all' ? '<span></span>' : `<span class="char-counter">${currentValSingle.length} caracteres</span>`}
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="btn-attachment btn-add-attachment" data-key="${key}" title="Añadir o cambiar adjunto multimedia">📎 Añadir Adjunto</button>
                        <button class="btn-secondary btn-toggle-status" data-key="${key}" title="${isDisabled ? 'Activar este mensaje en el bot' : 'Ocultar/Silenciar este mensaje en el bot'}">
                            ${isDisabled ? '👁️ Activar' : '🙈 Ocultar'}
                        </button>
                        ${isCustomKey ? `<button class="btn-danger btn-delete-key" data-key="${key}" title="Eliminar clave personalizada">🗑️ Eliminar</button>` : ''}
                        ${(!isMediaOnly && currentLangFilter !== 'all') ? `<button class="btn-primary btn-save-text" data-key="${key}">💾 Guardar [${currentLangFilter.toUpperCase()}]</button>` : ''}
                    </div>
                </div>
            `;

            if (!isMediaOnly) {
                if (currentLangFilter === 'all') {
                    card.querySelectorAll('textarea').forEach(ta => {
                        const lCode = ta.getAttribute('data-lang');
                        ta.addEventListener('input', (e) => {
                            const val = e.target.value;
                            const counter = card.querySelector(`.char-counter-${lCode}`);
                            if (counter) counter.textContent = `${val.length} caracteres`;
                        });
                    });

                    card.querySelectorAll('.btn-save-lang-text').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const lCode = btn.getAttribute('data-lang');
                            const ta = card.querySelector(`textarea[data-lang="${lCode}"]`);
                            if (ta) saveText(key, ta.value, category, lCode);
                        });
                    });
                } else {
                    const textarea = card.querySelector('textarea');
                    if (textarea) {
                        textarea.addEventListener('input', (e) => {
                            const val = e.target.value;
                            const charCounter = card.querySelector('.char-counter');
                            if (charCounter) charCounter.textContent = `${val.length} caracteres`;
                            if (!isTestMode) updateLiveSimulator(key, val);
                        });

                        textarea.addEventListener('focus', () => {
                            if (!isTestMode) updateLiveSimulator(key, textarea.value);
                        });

                        const saveBtn = card.querySelector('.btn-save-text');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', () => {
                                saveText(key, textarea.value, category, currentLangFilter);
                            });
                        }
                    }
                }
            }

            // Ocultar / Silenciar / Activar clave
            card.querySelector('.btn-toggle-status').addEventListener('click', async () => {
                await toggleKeyStatus(key, !isDisabled, displayTitle || key);
            });

            // Eliminar clave personalizada
            const deleteBtn = card.querySelector('.btn-delete-key');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if (confirm(`¿Estás seguro de eliminar el mensaje personalizado "${key}"?`)) {
                        await deleteCustomKey(key);
                    }
                });
            }

            // Añadir adjunto
            card.querySelector('.btn-add-attachment').addEventListener('click', () => {
                openAttachmentModal(key);
            });

            // Eliminar adjunto existente
            const removeAttBtn = card.querySelector('.btn-remove-attachment');
            if (removeAttBtn) {
                removeAttBtn.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar el adjunto multimedia de "${key}"?`)) {
                        await deleteAttachment(key);
                    }
                });
            }

            container.appendChild(card);
        });

        filterTexts();
    }

    function filterTexts() {
        const searchInput = document.getElementById('search-text-input');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cards = document.querySelectorAll('#texts-list-container .text-card');

        cards.forEach(card => {
            const cardCategory = (card.getAttribute('data-category') || 'main').toLowerCase();
            const cardKey = (card.id || '').replace('text-card-', '').toLowerCase();
            const textareas = card.querySelectorAll('textarea');
            let cardText = '';
            textareas.forEach(ta => { cardText += ' ' + ta.value.toLowerCase(); });
            const cardTitle = (card.querySelector('.key-title') ? card.querySelector('.key-title').textContent : '').toLowerCase();

            const matchesCategory = (currentCategoryFilter === 'all') || (cardCategory === currentCategoryFilter.toLowerCase());
            const matchesQuery = !query || cardKey.includes(query) || cardText.includes(query) || cardTitle.includes(query);

            if (matchesCategory && matchesQuery) {
                card.classList.remove('hidden-card');
                card.style.setProperty('display', 'flex', 'important');
            } else {
                card.classList.add('hidden-card');
                card.style.setProperty('display', 'none', 'important');
            }
        });
    }

    // Event listeners para los chips de filtro de categoría
    const categoryFiltersContainer = document.getElementById('category-filters');
    if (categoryFiltersContainer) {
        categoryFiltersContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;

            categoryFiltersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            currentCategoryFilter = chip.getAttribute('data-cat') || 'all';
            filterTexts();
        });
    }

    // Event listeners para los chips de filtro de idioma
    const langFiltersContainer = document.getElementById('lang-filters');
    if (langFiltersContainer) {
        langFiltersContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;

            langFiltersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            currentLangFilter = chip.getAttribute('data-lang-filter') || 'es';
            if (currentLangFilter !== 'all') {
                currentLang = currentLangFilter;
                if (currentLangSelect) currentLangSelect.value = currentLang;
            }
            renderTextsGrid();
        });
    }

    // Event listener para el campo de búsqueda por texto
    const searchTextInput = document.getElementById('search-text-input');
    if (searchTextInput) {
        searchTextInput.addEventListener('input', () => {
            filterTexts();
        });
    }

    // MODAL ADJUNTO MULTIMEDIA
    function openAttachmentModal(keyName) {
        let modal = document.getElementById('attachment-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'attachment-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <h3 style="margin-bottom:12px;">📎 Adjuntar Multimedia a <span style="color:var(--accent-gold);">"${keyName}"</span></h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Tipo de archivo:</label>
                    <select id="att-media-type" class="input-dark" style="width:100%;">
                        <option value="image">🖼️ Imagen (JPG, PNG, WebP)</option>
                        <option value="video">🎬 Vídeo (MP4)</option>
                        <option value="audio">🔊 Audio (MP3, OGG)</option>
                        <option value="document">📎 Documento (PDF, Word)</option>
                        <option value="sticker">🎭 Sticker (WebP animado)</option>
                    </select>
                    <label style="font-size:0.85rem; color:var(--text-muted);">URL pública del archivo:</label>
                    <input type="url" id="att-media-url" class="input-dark" placeholder="https://ejemplo.com/imagen.jpg" style="width:100%;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Pie de foto / Descripción (opcional):</label>
                    <input type="text" id="att-caption" class="input-dark" placeholder="Descripción del adjunto..." style="width:100%;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Nombre del archivo (solo documentos):</label>
                    <input type="text" id="att-filename" class="input-dark" placeholder="carta_menu.pdf" style="width:100%;">
                </div>
                <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end;">
                    <button id="att-cancel-btn" class="btn-secondary">Cancelar</button>
                    <button id="att-save-btn" class="btn-primary">💾 Guardar Adjunto</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Pre-fill if attachment exists
        const existing = (currentStructure.attachments || {})[keyName];
        if (existing) {
            modal.querySelector('#att-media-type').value = existing.mediaType || 'image';
            modal.querySelector('#att-media-url').value = existing.mediaUrl || '';
            modal.querySelector('#att-caption').value = existing.caption || '';
            modal.querySelector('#att-filename').value = existing.filename || '';
        }

        modal.querySelector('#att-cancel-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#att-save-btn').addEventListener('click', async () => {
            const mediaType = modal.querySelector('#att-media-type').value;
            const mediaUrl = modal.querySelector('#att-media-url').value.trim();
            const caption = modal.querySelector('#att-caption').value.trim();
            const filename = modal.querySelector('#att-filename').value.trim();

            if (!mediaUrl) {
                alert('Por favor, introduce la URL del archivo multimedia.');
                return;
            }

            await saveAttachment(keyName, mediaType, mediaUrl, caption, filename);
            modal.remove();
        });
    }

    // GUARDAR ADJUNTO EN SERVIDOR
    async function saveAttachment(keyName, mediaType, mediaUrl, caption, filename) {
        try {
            const res = await fetch('/api/admin/save-attachment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ key_name: keyName, media_type: mediaType, media_url: mediaUrl, caption, filename })
            });
            const data = await res.json();
            if (data.success) {
                if (!currentStructure.attachments) currentStructure.attachments = {};
                currentStructure.attachments[keyName] = data.attachment;
                await reloadStructureData();
                renderTextsGrid();
                renderUseCasesFlow();
                alert(`✅ Adjunto guardado para "${keyName}".`);
            } else {
                alert(`❌ Error: ${data.error}`);
            }
        } catch (err) {
            alert('❌ Error de conexión al guardar adjunto.');
        }
    }

    // ELIMINAR ADJUNTO DEL SERVIDOR
    async function deleteAttachment(keyName) {
        try {
            const res = await fetch('/api/admin/delete-attachment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ key_name: keyName })
            });
            const data = await res.json();
            if (data.success) {
                if (currentStructure.attachments) delete currentStructure.attachments[keyName];
                await reloadStructureData();
                renderTextsGrid();
                renderUseCasesFlow();
            } else {
                alert(`❌ Error: ${data.error}`);
            }
        } catch (err) {
            alert('❌ Error de conexión al eliminar adjunto.');
        }
    }

    // MODAL AÑADIR MENSAJE PERSONALIZADO
    if (addTextBtn) {
        addTextBtn.addEventListener('click', () => {
            newKeyNameInput.value = '';
            newKeyTextInput.value = '';
            textModal.style.display = 'flex';
        });
    }

    if (closeTextModalBtn) {
        closeTextModalBtn.addEventListener('click', () => {
            textModal.style.display = 'none';
        });
    }

    if (saveNewTextBtn) {
        saveNewTextBtn.addEventListener('click', async () => {
            const keyName = newKeyNameInput.value.trim();
            const cat = newKeyCatSelect.value;
            const textVal = newKeyTextInput.value.trim();

            if (!keyName) {
                alert('Por favor, introduce el nombre de la clave del mensaje.');
                return;
            }
            if (!textVal) {
                alert('Por favor, introduce el texto del mensaje.');
                return;
            }

            await saveText(keyName, textVal, cat);
            if (!currentStructure.categoryMap) currentStructure.categoryMap = {};
            currentStructure.categoryMap[keyName] = cat;
            
            textModal.style.display = 'none';
            renderTextsGrid();
        });
    }

    // ALTERNAR ESTADO OCULTO / ACTIVO DE CLAVE
    async function toggleKeyStatus(key, isDisabled, keyTitle = null) {
        const targetStateText = isDisabled ? 'SILENCIAR / OCULTAR' : 'ACTIVAR';
        const displayLabel = keyTitle || key;
        const confirmMsg = `¿Estás seguro de que deseas cambiar el estado a "${targetStateText}" para el mensaje "${displayLabel}" en el chatbot?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const res = await fetch('/api/admin/toggle-key-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ key, isDisabled })
            });
            const data = await res.json();
            if (data.success) {
                if (!currentStructure.disabledKeys) currentStructure.disabledKeys = {};
                currentStructure.disabledKeys[key] = isDisabled;
                
                // Recargar estructura para actualizar borrador
                await reloadStructureData();
                renderTextsGrid();
                renderUseCasesFlow();
            } else {
                alert(`Error al modificar estado: ${data.error}`);
            }
        } catch (err) {
            alert('Error de conexión al modificar estado.');
        }
    }

    // ELIMINAR CLAVE PERSONALIZADA
    async function deleteCustomKey(key) {
        try {
            const res = await fetch('/api/admin/delete-custom-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ lang: currentLang, key })
            });
            const data = await res.json();
            if (data.success) {
                if (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) {
                    delete currentStructure.dynamicTexts[currentLang][key];
                }
                await reloadStructureData();
                renderTextsGrid();
            } else {
                alert(`Error al eliminar: ${data.error}`);
            }
        } catch (err) {
            alert('Error de conexión al eliminar.');
        }
    }

    // GUARDAR TEXTO EN SERVIDOR
    async function saveText(key, text, category = 'general', targetLang = currentLangFilter) {
        const langToUse = (targetLang && targetLang !== 'all') ? targetLang : currentLang;
        try {
            const res = await fetch('/api/admin/update-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ lang: langToUse, key, text, category })
            });

            const data = await res.json();
            if (data.success) {
                if (!currentStructure.dynamicTexts[langToUse]) {
                    currentStructure.dynamicTexts[langToUse] = {};
                }
                currentStructure.dynamicTexts[langToUse][key] = text;
                await reloadStructureData();
                alert(`✅ Guardado correctamente para [${langToUse.toUpperCase()}]: ${key}`);
            } else {
                alert(`❌ Error guardando texto: ${data.error}`);
            }
        } catch (err) {
            alert('❌ Error de conexión al guardar.');
        }
    }

    // 3. RENDERIZAR TABLA DE CARTA & PRECIOS (TAB 3)
    function renderMenuTable() {
        const body = document.getElementById('menu-items-body');
        if (!body || !currentStructure) return;

        body.innerHTML = '';
        const items = (currentStructure.menuItems && Array.isArray(currentStructure.menuItems) && currentStructure.menuItems.length > 0)
            ? currentStructure.menuItems
            : [
                { id: 1, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Jamón Ibérico', price: 32, currency: '€', sort_order: 1 },
                { id: 2, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Cecina', price: 36, currency: '€', sort_order: 2 },
                { id: 3, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Charcutería', price: 34, currency: '€', sort_order: 3 },
                { id: 4, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Txuleta Tartar', price: 32, currency: '€', sort_order: 4 },
                { id: 5, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Puerro', price: 18, currency: '€', sort_order: 5 },
                { id: 6, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Espárrago', price: 18, currency: '€', sort_order: 6 },
                { id: 7, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Pimientos del Piquillo', price: 18, currency: '€', sort_order: 7 },
                { id: 8, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Ensalada', price: 4, currency: '€', sort_order: 8 },
                { id: 9, category: 'NUESTRA ESPECIALIDAD', name: 'Txuleta', price: 100, currency: '€ / kg', sort_order: 9 },
                { id: 10, category: 'POSTRES', name: 'Flan', price: 9, currency: '€', sort_order: 10 },
                { id: 11, category: 'POSTRES', name: 'Tarta de Queso', price: 10, currency: '€', sort_order: 11 },
                { id: 12, category: 'POSTRES', name: 'Fresa', price: 8, currency: '€', sort_order: 12 }
            ];

        currentStructure.menuItems = items;

        items.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="table-input item-cat" value="${item.category}"></td>
                <td><input type="text" class="table-input item-name" value="${item.name}"></td>
                <td><input type="number" step="0.5" class="table-input item-price" value="${item.price}"></td>
                <td><input type="text" class="table-input item-unit" value="${item.currency || '€'}"></td>
                <td><button class="btn-danger btn-delete-item" data-index="${index}">🗑️ Eliminar</button></td>
            `;

            tr.querySelector('.btn-delete-item').addEventListener('click', () => {
                currentStructure.menuItems.splice(index, 1);
                renderMenuTable();
            });

            body.appendChild(tr);
        });
    }

    const addDishBtn = document.getElementById('add-dish-btn');
    if (addDishBtn) {
        addDishBtn.addEventListener('click', () => {
            if (!currentStructure.menuItems) currentStructure.menuItems = [];
            currentStructure.menuItems.push({
                id: currentStructure.menuItems.length + 1,
                category: 'NUEVA CATEGORÍA',
                name: 'Nuevo Plato',
                price: 15,
                currency: '€',
                sort_order: currentStructure.menuItems.length + 1
            });
            renderMenuTable();
        });
    }

    // GUARDAR CAMBIOS EN LA CARTA
    const saveMenuBtn = document.getElementById('save-menu-btn');
    if (saveMenuBtn) {
        saveMenuBtn.addEventListener('click', async () => {
            const rows = document.querySelectorAll('#menu-items-body tr');
            const items = [];

            rows.forEach((tr, idx) => {
                items.push({
                    id: idx + 1,
                    category: tr.querySelector('.item-cat').value,
                    name: tr.querySelector('.item-name').value,
                    price: parseFloat(tr.querySelector('.item-price').value) || 0,
                    currency: tr.querySelector('.item-unit').value,
                    sort_order: idx + 1
                });
            });

            try {
                const res = await fetch('/api/admin/update-menu', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ items })
                });

                const data = await res.json();
                if (data.success) {
                    currentStructure.menuItems = items;
                    await reloadStructureData();
                    alert('✅ Carta y precios guardados correctamente.');
                } else {
                    alert(`❌ Error al guardar carta: ${data.error}`);
                }
            } catch (err) {
                alert('❌ Error de conexión al guardar carta.');
            }
        });
    }

    // 4. RENDERIZAR PREGUNTAS FRECUENTES (TAB 4)
    function renderFaqsList() {
        const container = document.getElementById('faqs-list-container');
        if (!container || !currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const staticEsTexts = currentStructure.staticTranslations['es'] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};
        const attachments = currentStructure.attachments || {};
        const disabledKeys = currentStructure.disabledKeys || {};

        container.innerHTML = '';

        const faqListDef = [
            { num: 1, titleKey: 'faq1Title', descKey: 'faq1Desc', msgKey: 'faq1Msg' },
            { num: 2, titleKey: 'faq2Title', descKey: 'faq2Desc', msgKey: 'faq2Msg' },
            { num: 3, titleKey: 'faq3Title', descKey: 'faq3Desc', msgKey: 'faq3Msg' },
            { num: 4, titleKey: 'faq4Title', descKey: 'faq4Desc', msgKey: 'faq4Msg' },
            { num: 5, titleKey: 'faq5Title', descKey: 'faq5Desc', msgKey: 'faq5Msg' },
            { num: 6, titleKey: 'faq6Title', descKey: 'faq6Desc', msgKey: 'faq6Msg' },
            { num: 7, titleKey: 'faq7Title', descKey: 'faq7Desc', msgKey: 'faq7Msg' },
            { num: 8, titleKey: 'faq8Title', descKey: 'faq8Desc', msgKey: 'faq8Msg' },
            { num: 9, titleKey: 'faq9Title', descKey: 'faq9Desc', msgKey: 'faq9Msg' },
            { num: 10, titleKey: 'faq10Title', descKey: 'faq10Desc', msgKey: 'faq10Msg' }
        ];

        faqListDef.forEach(faqItem => {
            const titleVal = dynamicLangTexts[faqItem.titleKey] || langTexts[faqItem.titleKey] || staticEsTexts[faqItem.titleKey] || `Opción ${faqItem.num}`;
            const msgVal = dynamicLangTexts[faqItem.msgKey] || langTexts[faqItem.msgKey] || staticEsTexts[faqItem.msgKey] || '';
            const isDisabled = !!disabledKeys[faqItem.msgKey];
            const att = attachments[faqItem.msgKey];

            let attachmentPreviewHtml = '';
            if (att && att.mediaUrl) {
                const mediaIcon = att.mediaType === 'image' ? '🖼️' : att.mediaType === 'video' ? '🎬' : att.mediaType === 'audio' ? '🔊' : att.mediaType === 'sticker' ? '🎭' : att.mediaType === 'document' ? '📎' : '📁';
                attachmentPreviewHtml = `
                    <div class="attachment-preview" style="display:flex; align-items:center; gap:10px; background:#181b22; padding:8px 10px; border-radius:6px; margin:6px 0; border-left:3px solid var(--accent-gold);">
                        <span>${mediaIcon} <strong>${att.mediaType.toUpperCase()}</strong>: <a href="${att.mediaUrl}" target="_blank" style="color:var(--accent-gold);">${att.filename || 'Ver adjunto'}</a></span>
                        <button class="btn-danger btn-remove-faq-att" data-key="${faqItem.msgKey}" style="padding:3px 8px; font-size:0.72rem;">🗑️ Quitar</button>
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = `text-card ${isDisabled ? 'card-disabled' : ''}`;
            card.style.marginBottom = '16px';
            card.innerHTML = `
                <div class="text-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span class="key-title badge-faq" style="padding:4px 8px; border-radius:4px; font-weight:700;">FAQ ${faqItem.num}: ${titleVal}</span>
                    <span class="status-badge ${isDisabled ? 'badge-off' : 'badge-on'}" style="font-size:0.75rem;">${isDisabled ? '🔴 Oculta' : '🟢 Activa'}</span>
                </div>
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:block;">Título de opción desplegable:</label>
                <input type="text" value="${titleVal}" class="faq-title-input" style="width:100%; margin-bottom:12px; padding:8px; border-radius:6px; background:#1e222a; color:#fff; border:1px solid #333;">
                <label style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; display:block;">Mensaje de respuesta del Chatbot:</label>
                <textarea class="faq-msg-input" style="width:100%; height:100px; padding:8px; border-radius:6px; background:#1e222a; color:#fff; border:1px solid #333; resize:vertical;">${msgVal}</textarea>
                ${attachmentPreviewHtml}
                <div class="text-card-footer" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                    <button class="btn-attachment btn-add-faq-att" data-key="${faqItem.msgKey}" style="padding:6px 12px; font-size:0.8rem;">📎 Añadir Adjunto</button>
                    <button class="btn-warning btn-toggle-faq" data-key="${faqItem.msgKey}" style="padding:6px 12px; font-size:0.8rem;">${isDisabled ? '👁️ Mostrar' : '👁️ Ocultar'}</button>
                    <button class="btn-primary btn-save-faq" style="padding:6px 14px; font-size:0.8rem; font-weight:600;">💾 Guardar FAQ ${faqItem.num}</button>
                </div>
            `;

            card.querySelector('.btn-save-faq').addEventListener('click', async () => {
                const newTitle = card.querySelector('.faq-title-input').value;
                const newMsg = card.querySelector('.faq-msg-input').value;
                await saveText(faqItem.titleKey, newTitle, 'faq');
                await saveText(faqItem.msgKey, newMsg, 'faq');
            });

            card.querySelector('.btn-toggle-faq').addEventListener('click', async () => {
                await toggleKeyStatus(faqItem.msgKey, !isDisabled, titleVal || faqItem.msgKey);
            });

            card.querySelector('.btn-add-faq-att').addEventListener('click', () => {
                openAttachmentModal(faqItem.msgKey);
            });

            const removeAttBtn = card.querySelector('.btn-remove-faq-att');
            if (removeAttBtn) {
                removeAttBtn.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar adjunto multimedia de FAQ ${faqItem.num}?`)) {
                        await deleteAttachment(faqItem.msgKey);
                    }
                });
            }

            container.appendChild(card);
        });
    }

    // 5. RENDERIZAR Y CONFIGURAR REGLAS DINÁMICAS POR PALABRA CLAVE (TAB 5)
    function renderCustomRulesTable() {
        if (!customRulesBody || !currentStructure) return;
        customRulesBody.innerHTML = '';
        const rules = currentStructure.customRules || [];

        rules.forEach(rule => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600; color:var(--accent-gold); font-family:monospace;">"${rule.keyword}"</td>
                <td><span class="flow-badge">${(rule.category || 'general').toUpperCase()}</span></td>
                <td style="max-width:260px; word-break:break-word; font-size:0.82rem;">${rule.responseText}</td>
                <td><span class="status-badge ${rule.isActive ? 'badge-on' : 'badge-off'}">${rule.isActive ? '🟢 ACTIVA' : '🔴 INACTIVA'}</span></td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-secondary btn-edit-rule" style="padding:4px 8px; font-size:0.75rem;">✏️ Editar</button>
                        <button class="btn-danger btn-delete-rule" style="padding:4px 8px; font-size:0.75rem;">🗑️ Eliminar</button>
                    </div>
                </td>
            `;

            tr.querySelector('.btn-edit-rule').addEventListener('click', () => {
                ruleIdInput.value = rule.id;
                ruleKeywordInput.value = rule.keyword;
                ruleCatSelect.value = rule.category || 'general';
                ruleResponseInput.value = rule.responseText;
                document.querySelector('#custom-rule-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            tr.querySelector('.btn-delete-rule').addEventListener('click', async () => {
                if (confirm(`¿Estás seguro de eliminar la regla para la palabra clave "${rule.keyword}"?`)) {
                    await deleteCustomRule(rule.id);
                }
            });

            customRulesBody.appendChild(tr);
        });
    }

    if (customRuleForm) {
        customRuleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = ruleIdInput.value;
            const keyword = ruleKeywordInput.value.trim();
            const category = ruleCatSelect.value;
            const responseText = ruleResponseInput.value.trim();

            if (!keyword || !responseText) {
                alert('Debes indicar la palabra clave y la respuesta automática.');
                return;
            }

            try {
                const res = await fetch('/api/admin/update-custom-rule', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ id, keyword, category, responseText, isActive: true })
                });
                const data = await res.json();
                if (data.success && data.rule) {
                    ruleIdInput.value = '';
                    ruleKeywordInput.value = '';
                    ruleResponseInput.value = '';
                    await reloadStructureData();
                    renderCustomRulesTable();
                    alert(`✅ Regla automática guardada para la palabra clave "${keyword}".`);
                } else {
                    alert(`Error guardando regla: ${data.error}`);
                }
            } catch (err) {
                alert('Error de conexión al guardar regla.');
            }
        });
    }

    async function deleteCustomRule(id) {
        try {
            const res = await fetch('/api/admin/delete-custom-rule', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.success) {
                await reloadStructureData();
                renderCustomRulesTable();
            } else {
                alert(`Error al eliminar regla: ${data.error}`);
            }
        } catch (err) {
            alert('Error de conexión al eliminar regla.');
        }
    }

    // 6. RENDERIZAR TABLA DE CAMBIOS EN BORRADOR & PUBLICACIÓN A PRODUCCIÓN (TAB 6)
    function renderDraftChangesTable() {
        const draftBody = document.getElementById('draft-changes-body');
        const draftBadge = document.getElementById('draft-count-badge');
        const pendingCountEl = document.getElementById('pending-changes-count');
        const lastPublishDateEl = document.getElementById('last-publish-date');
        
        if (!currentStructure) return;

        const drafts = currentStructure.draftChanges || [];
        
        if (draftBadge) {
            if (drafts.length > 0) {
                draftBadge.textContent = drafts.length;
                draftBadge.style.display = 'inline-block';
            } else {
                draftBadge.style.display = 'none';
            }
        }

        if (pendingCountEl) pendingCountEl.textContent = drafts.length;

        if (lastPublishDateEl && currentStructure.lastPublishTimestamp) {
            const d = new Date(currentStructure.lastPublishTimestamp);
            lastPublishDateEl.textContent = d.toLocaleString();
        }

        if (!draftBody) return;
        draftBody.innerHTML = '';

        if (drafts.length === 0) {
            draftBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">
                        ✅ No hay modificaciones pendientes en el borrador. Todos los cambios están publicados en producción.
                    </td>
                </tr>
            `;
            return;
        }

        drafts.forEach((draft, idx) => {
            const tr = document.createElement('tr');
            const dateStr = draft.createdAt ? new Date(draft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            tr.innerHTML = `
                <td style="font-weight:600; color:var(--text-muted);">${idx + 1}</td>
                <td><span class="status-badge badge-on" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid rgba(59, 130, 246, 0.4);">${draft.changeType}</span></td>
                <td style="font-weight:600; color:var(--accent-gold); font-family:monospace;">${draft.sequenceLocation}</td>
                <td style="font-size:0.85rem; color:#e9edef;">${draft.details}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
                <td>
                    <button class="btn-danger btn-discard-single" data-id="${draft.id}" style="padding:4px 8px; font-size:0.75rem;">🗑️ Descartar</button>
                </td>
            `;

            tr.querySelector('.btn-discard-single').addEventListener('click', async () => {
                await discardDraft(draft.id);
            });

            draftBody.appendChild(tr);
        });
    }

    // BOTÓN: SUBIR A PRODUCCIÓN
    const publishBtn = document.getElementById('publish-to-prod-btn');
    if (publishBtn) {
        publishBtn.addEventListener('click', async () => {
            const drafts = currentStructure ? (currentStructure.draftChanges || []) : [];
            const count = drafts.length;

            const confirmMsg = count > 0
                ? `🚀 ¿Confirmas SUBIR ${count} MODIFICACIONES A PRODUCCIÓN?\n\nLos usuarios reales de WhatsApp en vivo comenzarán a interactuar con los nuevos textos y reglas de inmediato.`
                : `🚀 ¿Deseas verificar la versión de producción actual?\n\nNo hay cambios pendientes en borrador.`;

            if (confirm(confirmMsg)) {
                try {
                    const res = await fetch('/api/admin/publish', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-token': adminToken
                        }
                    });
                    const data = await res.json();
                    if (data.success) {
                        if (currentStructure) {
                            currentStructure.draftChanges = [];
                            currentStructure.lastPublishTimestamp = data.timestamp;
                        }
                        renderDraftChangesTable();
                        renderUseCasesFlow();
                        alert(`🎉 ${data.message}`);
                    } else {
                        alert(`❌ Error al subir a producción: ${data.error}`);
                    }
                } catch (err) {
                    alert('❌ Error de conexión al subir a producción.');
                }
            }
        });
    }

    // BOTÓN: DESCARTAR TODOS LOS CAMBIOS
    const discardAllBtn = document.getElementById('discard-all-drafts-btn');
    if (discardAllBtn) {
        discardAllBtn.addEventListener('click', async () => {
            if (confirm('⚠️ ¿Estás seguro de descartar TODOS los cambios pendientes del borrador? Esta acción restablecerá el estado.')) {
                await discardDraft(null, true);
            }
        });
    }

    async function discardDraft(draftId, all = false) {
        try {
            const res = await fetch('/api/admin/discard-draft', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ draftId, all })
            });
            const data = await res.json();
            if (data.success) {
                await reloadStructureData();
            }
        } catch (err) {
            console.error('Error descartando borrador:', err);
        }
    }

    async function reloadStructureData() {
        try {
            const res = await fetch('/api/admin/structure', {
                headers: { 'x-admin-token': adminToken }
            });
            const data = await res.json();
            if (data.success) {
                currentStructure = data;
                renderDraftChangesTable();
            }
        } catch (e) {
            console.error('Error recargando estructura:', e);
        }
    }

    // 7. PREVISUALIZACIÓN ESTÁTICA WHATSAPP
    function updateLiveSimulator(key, customText = null) {
        if (isTestMode) return;

        const simBody = document.getElementById('sim-body');
        const simButtons = document.getElementById('sim-buttons');
        const simListTrigger = document.getElementById('sim-list-trigger');
        const metaAlertBox = document.getElementById('meta-limits-alert');
        const metaAlertList = document.getElementById('meta-alert-list');

        if (!currentStructure) return;

        const langTexts = currentStructure.staticTranslations[currentLang] || {};
        const dynamicLangTexts = (currentStructure.dynamicTexts && currentStructure.dynamicTexts[currentLang]) || {};

        let textVal = customText !== null ? customText : (dynamicLangTexts[key] !== undefined ? dynamicLangTexts[key] : langTexts[key]);
        if (!textVal) textVal = `[Clave ${key} sin texto]`;

        simBody.textContent = textVal;
        simButtons.innerHTML = '';
        simListTrigger.style.display = 'none';
        metaAlertBox.style.display = 'none';
        metaAlertList.innerHTML = '';

        const alerts = [];

        if (key === 'welcomeMessage') {
            simListTrigger.style.display = 'block';
            document.getElementById('sim-list-btn-text').textContent = '🌐 Seleccionar Idioma';
        } else if (key === 'selectLocationTitle' || key === 'selectLocationBody') {
            const titleText = dynamicLangTexts['selectLocationTitle'] || langTexts['selectLocationTitle'] || '📍 *Seleccionar restaurante*';
            const bodyText = dynamicLangTexts['selectLocationBody'] || langTexts['selectLocationBody'] || '¿En cuál de nuestros restaurantes estás interesado?';
            simBody.textContent = `${titleText}\n\n${bodyText}`;

            const b1 = dynamicLangTexts['locPaisVasco'] || langTexts['locPaisVasco'] || 'Tolosa (Euskadi)';
            const b2 = dynamicLangTexts['locMadrid'] || langTexts['locMadrid'] || 'Madrid';

            [b1, b2].forEach(b => {
                const btnDiv = document.createElement('div');
                btnDiv.className = 'sim-btn';
                btnDiv.textContent = b;
                if (b.length > 20) {
                    alerts.push(`El botón "${b}" supera el límite de 20 caracteres de Meta (${b.length} caracteres).`);
                }
                simButtons.appendChild(btnDiv);
            });
        } else if (key === 'mainMenuHeader') {
            simListTrigger.style.display = 'block';
            document.getElementById('sim-list-btn-text').textContent = '📋 Ver Opciones';
        }

        if (alerts.length > 0) {
            metaAlertBox.style.display = 'block';
            alerts.forEach(alertText => {
                const li = document.createElement('li');
                li.textContent = alertText;
                metaAlertList.appendChild(li);
            });
        }
    }

    // 8. MODALIDAD TEST INTERACTIVO EN VIVO
    if (btnStartTest) {
        btnStartTest.addEventListener('click', () => {
            startInteractiveTest();
        });
    }

    if (btnResetTest) {
        btnResetTest.addEventListener('click', () => {
            resetInteractiveTest();
        });
    }

    if (simInputForm) {
        simInputForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const val = simUserInput.value.trim();
            if (!val) return;

            simUserInput.value = '';
            if (!isTestMode) {
                isTestMode = true;
                singlePreviewBubble.style.display = 'none';
                liveChatStream.style.display = 'flex';
            }

            appendUserBubble(val);
            await sendSimPayload({ text: val });
        });
    }

    async function startInteractiveTest() {
        isTestMode = true;
        singlePreviewBubble.style.display = 'none';
        liveChatStream.style.display = 'flex';
        liveChatStream.innerHTML = '';

        await sendSimPayload({ action: 'reset' });
    }

    function resetInteractiveTest() {
        isTestMode = false;
        singlePreviewBubble.style.display = 'block';
        liveChatStream.style.display = 'none';
        liveChatStream.innerHTML = '';
        simUserInput.value = '';
        updateLiveSimulator('welcomeMessage');
    }

    async function sendSimPayload(payload) {
        try {
            const res = await fetch('/api/admin/simulate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success && Array.isArray(data.messages)) {
                renderLiveChatMessages(data.messages);
            }
        } catch (err) {
            console.error('Error en simulación interactiva:', err);
        }
    }

    function appendUserBubble(text) {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-bubble';
        userDiv.textContent = text;
        liveChatStream.appendChild(userDiv);
        scrollSimToBottom();
    }

    function renderLiveChatMessages(messages) {
        liveChatStream.innerHTML = '';
        messages.forEach(msg => {
            if (msg.type === 'text') {
                const b = document.createElement('div');
                b.className = 'bot-bubble';
                b.textContent = msg.text;
                liveChatStream.appendChild(b);
            } else if (msg.type === 'button') {
                const b = document.createElement('div');
                b.className = 'bot-bubble';
                b.textContent = msg.text;

                if (Array.isArray(msg.buttons)) {
                    const btnsDiv = document.createElement('div');
                    btnsDiv.className = 'sim-buttons';
                    msg.buttons.forEach(btn => {
                        const btnEl = document.createElement('div');
                        btnEl.className = 'sim-interactive-btn';
                        btnEl.textContent = btn.title || btn.id;
                        btnEl.addEventListener('click', async () => {
                            appendUserBubble(btn.title || btn.id);
                            await sendSimPayload({ buttonId: btn.id });
                        });
                        btnsDiv.appendChild(btnEl);
                    });
                    b.appendChild(btnsDiv);
                }
                liveChatStream.appendChild(b);
            } else if (msg.type === 'list') {
                const b = document.createElement('div');
                b.className = 'bot-bubble';
                b.textContent = msg.text;

                if (Array.isArray(msg.sections)) {
                    msg.sections.forEach(sec => {
                        if (Array.isArray(sec.rows)) {
                            sec.rows.forEach(row => {
                                const rowEl = document.createElement('div');
                                rowEl.className = 'sim-interactive-btn';
                                rowEl.textContent = `${row.title} - ${row.description || ''}`;
                                rowEl.addEventListener('click', async () => {
                                    appendUserBubble(row.title);
                                    await sendSimPayload({ listId: row.id });
                                });
                                b.appendChild(rowEl);
                            });
                        }
                    });
                }
                liveChatStream.appendChild(b);
            }
        });

        scrollSimToBottom();
    }

    function scrollSimToBottom() {
        setTimeout(() => {
            whatsappScreen.scrollTop = whatsappScreen.scrollHeight;
        }, 50);
    }

    // =========================================================================
    // LÓGICA DE BANDEJA DE RECEPCIÓN Y NOTIFICACIONES EN TIEMPO REAL (INBOX)
    // =========================================================================

    // Variables de Estado de Notificaciones y Rastreo de Mensajes
    let knownSolicitudMsgCounts = {};
    let isFirstSolicitudesFetch = true;
    let unreadSolicitudIds = new Set();
    let titleFlashInterval = null;
    const baseDocumentTitle = document.title || 'Panel de Administración & Editor Visual - Casa Julián Chatbot';

    // 🔔 Reproducir Sonido de Notificación Doble Tono estilo WhatsApp (Web Audio API)
    function playWhatsAppNotificationChime() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;

            // Tono 1: Campana suave y clara (E5 -> A5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, now);
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.1);

            gain1.gain.setValueAtTime(0.35, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.28);

            // Tono 2: Resonancia armónica brillante (A5 -> E6)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.12);
            osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.22);

            gain2.gain.setValueAtTime(0.4, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.45);
        } catch (e) {
            console.warn("⚠️ Audio notification error:", e);
        }
    }

    // 📢 Parpadeo Dinámico del Título de la Pestaña en el Navegador
    function startTitleFlash(alertText) {
        if (titleFlashInterval) clearInterval(titleFlashInterval);
        let toggle = false;
        titleFlashInterval = setInterval(() => {
            document.title = toggle ? `🔔 ${alertText}` : `(1) 💬 ¡NUEVO WHATSAPP!`;
            toggle = !toggle;
        }, 900);
    }

    function stopTitleFlash() {
        if (titleFlashInterval) {
            clearInterval(titleFlashInterval);
            titleFlashInterval = null;
            document.title = baseDocumentTitle;
        }
    }

    window.addEventListener('focus', () => {
        if (unreadSolicitudIds.size === 0) {
            stopTitleFlash();
        }
    });

    // Solicitar permiso de Notificaciones de Escritorio al primer click del usuario
    window.addEventListener('click', () => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, { once: true });

    function triggerDesktopNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const notif = new Notification(title, {
                    body: body,
                    icon: '/favicon.ico',
                    tag: 'casa-julian-incoming-msg'
                });
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };
            } catch (e) {
                console.warn("⚠️ Notification error:", e);
            }
        }
    }

    // ── Notificaciones Toast Visuales ────────────────────────────────────────
    function showToast(message, type = 'info') {
        let container = document.getElementById('global-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-toast-container';
            container.style.position = 'fixed';
            container.style.bottom = '24px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
            container.style.zIndex = '99999';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '8px';
            container.style.pointerEvents = 'none';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = 'admin-toast';
        toast.style.background = '#1e293b';
        toast.style.color = '#ffffff';
        toast.style.padding = '10px 18px';
        toast.style.borderRadius = '24px';
        toast.style.border = '1px solid rgba(255, 255, 255, 0.18)';
        toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
        toast.style.fontSize = '0.85rem';
        toast.style.fontWeight = '600';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '8px';
        toast.style.pointerEvents = 'auto';
        toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        toast.textContent = message;

        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-8px)';
            setTimeout(() => toast.remove(), 300);
        }, 2800);
    }

    // ── Formato Inteligente de Fecha y Hora (Estilo WhatsApp Business) ─────
    function formatSmartDateTime(dateInput) {
        if (!dateInput) return '';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '';
        
        const now = new Date();
        const isToday = d.getFullYear() === now.getFullYear() &&
                        d.getMonth() === now.getMonth() &&
                        d.getDate() === now.getDate();
        
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        
        if (isToday) {
            return timeStr;
        }

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = d.getFullYear() === yesterday.getFullYear() &&
                            d.getMonth() === yesterday.getMonth() &&
                            d.getDate() === yesterday.getDate();
        if (isYesterday) {
            return 'Ayer';
        }

        const diffTime = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 7 && diffDays > 0) {
            const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            return days[d.getDay()];
        }
        
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const yearShort = String(d.getFullYear()).slice(-2);
        return `${day}/${month}/${yearShort}`;
    }

    function getCleanPhoneKey(phone) {
        if (!phone) return '';
        const str = phone.toString().trim();
        if (str.startsWith('group_')) return str;
        return str.replace(/\D/g, '');
    }

    // ── Chats Fijados con Chincheta ──────────────────────────────────────────
    let activeCardDropdownPhone = null;

    function getPinnedChatsMap() {
        if (serverInboxSettings.pinnedChats && typeof serverInboxSettings.pinnedChats === 'object') {
            return serverInboxSettings.pinnedChats;
        }
        try {
            const saved = localStorage.getItem('casa_julian_pinned_chats');
            let map = saved ? JSON.parse(saved) : null;
            if (!map || typeof map !== 'object') {
                map = {};
            }
            return map;
        } catch (e) {
            return {};
        }
    }

    function toggleChatPinned(phone) {
        const clean = getCleanPhoneKey(phone);
        if (!clean) return false;
        const map = { ...getPinnedChatsMap() };
        let isNowPinned = false;
        if (map[clean]) {
            delete map[clean];
            isNowPinned = false;
        } else {
            map[clean] = true;
            isNowPinned = true;
        }
        serverInboxSettings.pinnedChats = { ...map };
        localStorage.setItem('casa_julian_pinned_chats', JSON.stringify(map));

        // Persistir en servidor PostgreSQL (enviando a ambos endpoints para máxima fiabilidad)
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        fetch('/api/admin/chat-pin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ phone: clean, isPinned: isNowPinned })
        }).catch(e => console.warn('Error guardando pin en servidor:', e));

        fetch('/api/admin/inbox-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ pinnedChats: map })
        }).catch(e => console.warn('Error guardando inbox-settings en servidor:', e));

        return isNowPinned;
    }

    function isChatPinned(phone) {
        const clean = getCleanPhoneKey(phone);
        const map = getPinnedChatsMap();
        return !!map[clean];
    }

    // ── Estado Unificado del Buzón de Recepción ──────────────────────────────

    // Merge de estados manuales: gana el entry con readAt más reciente (local o servidor)
    function mergeStatusMaps(mapA, mapB) {
        const result = { ...mapA };
        for (const phone in mapB) {
            const entryB = mapB[phone];
            const entryA = result[phone];
            if (!entryA) {
                result[phone] = entryB;
            } else {
                // Comparar timestamps: gana el más reciente
                const tsA = entryA && entryA.readAt ? new Date(entryA.readAt).getTime() : 0;
                const tsB = entryB && entryB.readAt ? new Date(entryB.readAt).getTime() : 0;
                if (tsB > tsA) result[phone] = entryB;
            }
        }
        return result;
    }

    // Mapa de estados manuales y última fecha de lectura (persistido en PostgreSQL y sincronizado entre usuarios)
    function getManualChatStatusMap() {
        const serverMap = (serverInboxSettings && typeof serverInboxSettings.manualChatStatus === 'object') 
            ? serverInboxSettings.manualChatStatus 
            : {};
        let localMap = {};
        try {
            localMap = JSON.parse(localStorage.getItem('casa_julian_manual_chat_status') || '{}');
        } catch (e) {}
        // Merge por timestamp: gana el entry más reciente de cualquier origen
        return mergeStatusMaps(localMap, serverMap);
    }

    function setManualChatStatus(phone, status) {
        const clean = getCleanPhoneKey(phone);
        if (!clean) return;
        
        let localMap = {};
        try {
            localMap = JSON.parse(localStorage.getItem('casa_julian_manual_chat_status') || '{}');
        } catch (e) {}
        const serverMap = (serverInboxSettings && typeof serverInboxSettings.manualChatStatus === 'object') 
            ? serverInboxSettings.manualChatStatus 
            : {};
        const map = { ...localMap, ...serverMap };
        
        // Buscar la conversación para guardar su huella exacta
        const conv = allUnifiedConversations.find(c => getCleanPhoneKey(c.telefono) === clean) 
                  || allWhatsAppChats.find(c => getCleanPhoneKey(c.telefono) === clean);

        if (status === 'leido') {
            const currentText = conv ? (conv.ultimoTexto || '') : '';
            const currentDate = conv ? (conv.ultimoMensajeFecha || '') : '';
            const currentCount = conv ? (conv.totalInteracciones || 0) : 0;

            map[clean] = { 
                status: 'leido', 
                readAt: new Date().toISOString(),
                lastText: currentText,
                lastDate: currentDate,
                lastCount: currentCount
            };
            if (conv) {
                conv.unreadCount = 0;
            }
            const waMatch = allWhatsAppChats.find(c => getCleanPhoneKey(c.telefono) === clean);
            if (waMatch) {
                waMatch.unreadCount = 0;
            }
        } else {
            map[clean] = { status: 'pendiente', readAt: null, lastText: '', lastDate: '', lastCount: 0 };
        }
        
        serverInboxSettings.manualChatStatus = map;
        localStorage.setItem('casa_julian_manual_chat_status', JSON.stringify(map));

        // Persistir en servidor PostgreSQL para que todos los usuarios lo vean
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        fetch('/api/admin/chat-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ phone: clean, status: map[clean] })
        }).catch(e => console.warn('Error guardando chatStatus en servidor:', e));
    }

    function getConversationStatus(c) {
        if (!c) return 'leido';
        const cleanPhone = getCleanPhoneKey(c.telefono);
        if (!cleanPhone) return 'leido';

        const manualMap = getManualChatStatusMap();
        const manualEntry = manualMap[cleanPhone];
        const statusVal = manualEntry ? (typeof manualEntry === 'object' ? manualEntry.status : manualEntry) : null;

        // 1. Si está marcado MANUALMENTE como "No Leído" → mostrar badge verde aunque el chat esté abierto
        if (statusVal === 'pendiente') {
            return 'pendiente';
        }

        // 2. Si esta conversación es la que el usuario tiene abierta actualmente en pantalla, está leída
        if (activeConversationPhone && cleanPhone === activeConversationPhone) {
            return 'leido';
        }

        // 3. Si está marcado como leído manualmente
        if (statusVal === 'leido') {
                // Grupos: nunca comparar por fecha → la comparación de fechas NO aplica a grupos
                // porque ultimoMensajeFecha puede ser null/imprecisa (API WhatsApp)
                const isGroupConv = c.isGroup || cleanPhone.startsWith('group_');
                if (!isGroupConv && typeof manualEntry === 'object' && manualEntry.readAt) {
                    // Comparar por fecha: si el último mensaje es posterior a cuando se marcó leído → PENDIENTE
                    const readTime = new Date(manualEntry.readAt).getTime();
                    const lastMsgFecha = c.ultimoMensajeFecha;
                    if (lastMsgFecha) {
                        const msgTime = new Date(lastMsgFecha).getTime();
                        // 15 segundos de margen para evitar falsos positivos por desfase de reloj
                        if (!isNaN(readTime) && !isNaN(msgTime) && msgTime > readTime + 15000) {
                            return 'pendiente';
                        }
                    }
                }
                return 'leido';
            }

        // 4. Si tiene solicitud activa en estado PENDIENTE o EN_ATENCION
        if (c.solicitudEstado === 'PENDIENTE' || c.solicitudEstado === 'EN_ATENCION') {
            return 'pendiente';
        }

        // 5. Si es un grupo sin mensajes pendientes
        if (cleanPhone.startsWith('group_')) {
            return 'leido';
        }

        // 6. Determinar por el tipo de emisor del último mensaje:
        //    - cliente/user/bot → PENDIENTE (el bot no cuenta como "atendido" por recepción)
        //    - restaurante/admin/staff → LEIDO (recepción ya intervino)
        const lastSender = (c.ultimoEmisor || '').toLowerCase();
        const isFromClientOrBot = lastSender === 'cliente' || lastSender === 'user' || lastSender === 'bot';
        if (isFromClientOrBot) {
            return 'pendiente';
        }
        return 'leido';
    }

    function getConversationUnreadCount(c) {
        if (getConversationStatus(c) !== 'pendiente') return 0;
        const cleanPhone = getCleanPhoneKey(c.telefono);
        const manualMap = getManualChatStatusMap();
        const manualEntry = manualMap[cleanPhone];

        // Si tenemos el conteo de cuando se leyó por última vez y aumentaron las interacciones
        if (manualEntry && typeof manualEntry === 'object' && manualEntry.lastCount && c.totalInteracciones) {
            const diff = Number(c.totalInteracciones) - Number(manualEntry.lastCount);
            if (diff > 0) return diff;
        }

        if (typeof c.unreadCount === 'number' && c.unreadCount > 0) {
            return c.unreadCount;
        }
        return 1;
    }

    function getPendingConversationsCount() {
        if (!Array.isArray(allUnifiedConversations) || allUnifiedConversations.length === 0) {
            if (Array.isArray(allSolicitudes)) {
                return allSolicitudes.filter(s => s.estado === 'PENDIENTE' || s.estado === 'EN_ATENCION').length;
            }
            return 0;
        }
        return allUnifiedConversations.filter(c => getConversationStatus(c) === 'pendiente').length;
    }

    function getCategoryBadgeHtml(cat) {
        const c = (cat || 'cliente').toLowerCase();
        if (c === 'proveedor' || c === 'proveedores') {
            return `<span style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.35); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">🟢 Proveedor</span>`;
        }
        if (c === 'alba') {
            return `<span style="background: rgba(244, 114, 182, 0.15); color: #f472b6; border: 1px solid rgba(244, 114, 182, 0.35); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">🌸 Alba</span>`;
        }
        if (c === 'hoteles' || c === 'hotel') {
            return `<span style="background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.35); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">🟡 Hotel</span>`;
        }
        if (c === 'taxi' || c === 'taxis') {
            return `<span style="background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.35); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">🚕 Taxi</span>`;
        }
        return `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700;">👥 Cliente</span>`;
    }

    function getCleanPhoneKey(phone) {
        if (!phone) return '';
        const str = String(phone).trim();
        if (str.startsWith('group_')) return str;
        return str.replace(/\D/g, '');
    }

    function getChatAvatarUrl(phone, clientDisplayName = '', convObj = null) {
        const cleanPhone = getCleanPhoneKey(phone);
        const lowerName = (clientDisplayName || '').toLowerCase();
        
        // 1. Si el objeto conversación o contacto ya contiene foto o avatar de WhatsApp
        if (convObj) {
            if (convObj.avatar && typeof convObj.avatar === 'string' && convObj.avatar.trim()) return convObj.avatar.trim();
            if (convObj.avatarUrl && typeof convObj.avatarUrl === 'string' && convObj.avatarUrl.trim()) return convObj.avatarUrl.trim();
            if (convObj.profilePic && typeof convObj.profilePic === 'string' && convObj.profilePic.trim()) return convObj.profilePic.trim();
            if (convObj.photo && typeof convObj.photo === 'string' && convObj.photo.trim()) return convObj.photo.trim();
            if (convObj.profilePhoto && typeof convObj.profilePhoto === 'string' && convObj.profilePhoto.trim()) return convObj.profilePhoto.trim();
        }

        // 2. Comprobar si está en serverInboxSettings.chatAvatars
        if (serverInboxSettings && serverInboxSettings.chatAvatars && serverInboxSettings.chatAvatars[cleanPhone]) {
            return serverInboxSettings.chatAvatars[cleanPhone];
        }

        // 3. Comprobar si está en contactos silenciados o conocidos
        if (typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers)) {
            const found = allSilencedNumbers.find(s => getCleanPhoneKey(s.telefono) === cleanPhone);
            if (found && found.avatar) return found.avatar;
        }

        // 4. Comprobar en caché local
        try {
            const localAvatars = JSON.parse(localStorage.getItem('casa_julian_chat_avatars_map') || '{}');
            if (localAvatars[cleanPhone]) return localAvatars[cleanPhone];
        } catch(e) {}
        
        // 5. Avatares del restaurante y grupos predeterminados
        if (cleanPhone === 'group_taxi_casa_julian' || lowerName.includes('taxi casa juli')) {
            return '/admin/taxi_img.png';
        }
        if (cleanPhone === '34664037707' || lowerName.includes('ander informatico') || lowerName.includes('ander informático')) {
            return '/admin/ander_img.png';
        }
        if (cleanPhone === '34943671417' || lowerName.includes('casa julián tolosa') || lowerName.includes('casa julian tolosa')) {
            return '/admin/casa_julian_logo_CJ.jpeg';
        }
        return '';
    }

    // Caché rápida en sessionStorage para renderizado instantáneo en 0 ms
    const INBOX_CHATS_CACHE_KEY = 'casa_julian_cached_chats_v1';
    try {
        const cached = sessionStorage.getItem(INBOX_CHATS_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                allUnifiedConversations = parsed;
                setTimeout(() => {
                    renderInboxCards();
                }, 0);
            }
        }
    } catch(e) {}

    // Cargar Solicitudes desde Backend y Detectar Mensajes Nuevos en Tiempo Real
    async function fetchSolicitudes(skipRender = false) {
        if (!adminToken) return;
        try {
            const res = await fetch('/api/admin/solicitudes', {
                headers: { 'x-admin-token': adminToken }
            });
            if (res.status === 401) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.solicitudes)) {
                allSolicitudes = data.solicitudes;

                let hasNewIncomingClientMsg = false;
                let latestClientMsgInfo = null;

                allSolicitudes.forEach(sol => {
                    const msgList = Array.isArray(sol.mensajes) ? sol.mensajes : [];
                    const msgCount = msgList.length;
                    const prevCount = knownSolicitudMsgCounts[sol.id];

                    if (!isFirstSolicitudesFetch) {
                        if (prevCount !== undefined && msgCount > prevCount) {
                            const lastMsg = msgList[msgCount - 1];
                            if (lastMsg && lastMsg.emisor === 'cliente') {
                                unreadSolicitudIds.add(sol.id);
                                hasNewIncomingClientMsg = true;
                                latestClientMsgInfo = {
                                    clientName: sol.nombreCliente || 'Cliente',
                                    text: lastMsg.texto || 'Nuevo mensaje',
                                    solId: sol.id
                                };
                            }
                        } else if (prevCount === undefined) {
                            unreadSolicitudIds.add(sol.id);
                            hasNewIncomingClientMsg = true;
                            latestClientMsgInfo = {
                                clientName: sol.nombreCliente || 'Cliente',
                                text: sol.datosDetallados ? 'Nueva solicitud recibida' : 'Nueva consulta',
                                solId: sol.id
                            };
                        }
                    }

                    knownSolicitudMsgCounts[sol.id] = msgCount;
                });

                isFirstSolicitudesFetch = false;

                // Alerta Activa si entró un nuevo mensaje del cliente
                if (hasNewIncomingClientMsg && latestClientMsgInfo) {
                    playWhatsAppNotificationChime();
                    startTitleFlash(`¡Nuevo mensaje de ${latestClientMsgInfo.clientName}!`);
                    triggerDesktopNotification(
                        `💬 WhatsApp de ${latestClientMsgInfo.clientName}`,
                        latestClientMsgInfo.text
                    );

                    const miniWidget = document.getElementById('minimized-chat-widget');
                    const miniBadge = document.getElementById('minimized-unread-badge');
                    if (miniWidget && miniWidget.style.display !== 'none') {
                        miniWidget.classList.add('has-unread');
                        if (miniBadge) miniBadge.style.display = 'inline-block';
                    }

                    if (activeReplySolicitud && activeReplySolicitud.id === latestClientMsgInfo.solId) {
                        const updatedActiveSol = allSolicitudes.find(s => s.id === latestClientMsgInfo.solId);
                        if (updatedActiveSol) {
                            activeReplySolicitud = updatedActiveSol;
                            renderChatThreadInModal(updatedActiveSol);
                        }
                    }
                }

                if (!skipRender) {
                    syncUnifiedConversations();
                    renderInboxCards();
                    renderMinimizedChatsStack();
                }
            }
        } catch (err) {
            console.error("⚠️ Error cargando solicitudes del buzón:", err);
        }
    }

    async function fetchWhatsAppChats(skipRender = false) {
        try {
            const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch('/api/admin/chats', {
                headers: {
                    'x-admin-token': currentToken,
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                allWhatsAppChats = data.chats || [];
                if (!skipRender) {
                    syncUnifiedConversations();
                    renderInboxCards();
                }
            } else {
                console.warn("⚠️ [Chats WhatsApp] Error HTTP en /api/admin/chats:", res.status);
            }
        } catch (err) {
            console.error("⚠️ Error cargando conversaciones de WhatsApp:", err);
        }
    }

    // Sincronización en tiempo real de ajustes compartidos (Fotos de perfil, Etiquetas, Chinchetas, Estados)
    async function fetchInboxSettings() {
        if (!adminToken) return;
        try {
            const res = await fetch('/api/admin/inbox-settings', {
                headers: { 'x-admin-token': adminToken }
            });
            if (res.status === 401) return;
            const data = await res.json();
            if (data.success && data.settings) {
                const prevAvatars = JSON.stringify(serverInboxSettings.chatAvatars || {});
                const prevTags = JSON.stringify(serverInboxSettings.chatTags || {});
                const prevPins = JSON.stringify(serverInboxSettings.pinnedChats || {});
                const prevStatus = JSON.stringify(serverInboxSettings.manualChatStatus || {});
                const prevOrder = JSON.stringify(serverInboxSettings.tagsOrder || []);

                let localStatus = {};
                try {
                    localStatus = JSON.parse(localStorage.getItem('casa_julian_manual_chat_status') || '{}');
                } catch(e) {}

                // Merge de manualChatStatus por timestamp: el entry más reciente (local o servidor) gana
                const serverStatusData = (data.settings && data.settings.manualChatStatus) || {};
                const mergedStatus = mergeStatusMaps(localStatus, serverStatusData);

                serverInboxSettings = { 
                    ...serverInboxSettings, 
                    ...data.settings,
                    manualChatStatus: mergedStatus
                };
                // Sincronizar localStorage con el resultado del merge
                try {
                    localStorage.setItem('casa_julian_manual_chat_status', JSON.stringify(mergedStatus));
                } catch(e) {}
                if (data.settings && data.settings.pinnedChats) {
                    try {
                        localStorage.setItem('casa_julian_pinned_chats', JSON.stringify(data.settings.pinnedChats));
                    } catch(e) {}
                }

                const newAvatars = JSON.stringify(serverInboxSettings.chatAvatars || {});
                const newTags = JSON.stringify(serverInboxSettings.chatTags || {});
                const newPins = JSON.stringify(serverInboxSettings.pinnedChats || {});
                const newStatus = JSON.stringify(serverInboxSettings.manualChatStatus || {});
                const newOrder = JSON.stringify(serverInboxSettings.tagsOrder || []);

                if (prevAvatars !== newAvatars || prevTags !== newTags || prevPins !== newPins || prevStatus !== newStatus || prevOrder !== newOrder) {
                    renderInboxFilterPills();
                    renderInboxCards();
                    if (activeConversationPhone && typeof renderConversationView === 'function') {
                        renderConversationView(activeConversationPhone);
                    }
                }
            }
        } catch (err) {
            console.warn("⚠️ Error en fetchInboxSettings:", err.message);
        }
    }

    // Carga unificada y paralela a máxima velocidad para sincronizar todos los datos entre usuarios
    async function loadUnifiedInboxData() {
        if (!adminToken) return;
        try {
            await Promise.all([
                fetchInboxSettings(),
                fetchSolicitudes(true),
                fetchWhatsAppChats(true)
            ]);
            syncUnifiedConversations();
            renderInboxFilterPills();
            renderInboxCards();
            renderMinimizedChatsStack();
            try {
                sessionStorage.setItem(INBOX_CHATS_CACHE_KEY, JSON.stringify(allUnifiedConversations.slice(0, 100)));
            } catch(e) {}
        } catch (err) {
            console.error("⚠️ Error en loadUnifiedInboxData:", err);
        }
    }

    // Combina chats de historial con solicitudes y contactos para tener la lista completa
    // Combina chats de historial con solicitudes y contactos para tener la lista completa
    function syncUnifiedConversations() {
        const map = new Map();

        // 1. Agregar todas las conversaciones de WhatsApp (incluyendo grupos como group_taxi_casa_julian)
        allWhatsAppChats.forEach(c => {
            const phoneKey = getCleanPhoneKey(c.telefono);
            if (!phoneKey) return;
            const isGroup = phoneKey.startsWith('group_') || c.isGroup;
            map.set(phoneKey, {
                telefono: phoneKey,
                nombreCliente: isGroup ? 'Taxi Casa Julián' : (c.nombreCliente || `+${phoneKey}`),
                categoria: isGroup ? 'taxi' : (c.categoria || 'cliente'),
                ultimoMensajeFecha: c.ultimoMensajeFecha || null,
                ultimoTexto: c.ultimoTexto || (isGroup ? '🚕 Grupo Taxi Casa Julián (3 Taxis + Restaurante)' : ''),
                allTexts: c.allTexts || c.ultimoTexto || '',
                ultimoEmisor: c.ultimoEmisor || 'cliente',
                totalInteracciones: c.totalInteracciones || 1,
                unreadCount: (c.unreadCount !== undefined ? c.unreadCount : 0),
                solicitudId: c.solicitudId || null,
                solicitudEstado: c.solicitudEstado || null,
                tipoSolicitud: c.tipoSolicitud || null,
                isGroup: isGroup,
                participants: c.participants
            });
        });

        // 2. Vincular o insertar solicitudes activas
        allSolicitudes.forEach(sol => {
            const rawPhone = sol.telefonoCliente || sol.telefonoReserva || '';
            const phoneKey = getCleanPhoneKey(rawPhone);
            if (!phoneKey) return;
            if (map.has(phoneKey)) {
                const item = map.get(phoneKey);
                item.solicitudId = sol.id;
                item.solicitudEstado = sol.estado;
                item.tipoSolicitud = sol.tipoAccion || sol.categoria;
                item.allTexts = (item.allTexts ? item.allTexts + ' ___ ' : '') + (sol.tipoAccion || '') + ' ' + (sol.datosDetallados || '');
                if (sol.nombreCliente && (!item.nombreCliente || item.nombreCliente.startsWith('+'))) {
                    item.nombreCliente = sol.nombreCliente;
                }
                if (new Date(sol.created_at || 0) > new Date(item.ultimoMensajeFecha)) {
                    item.ultimoMensajeFecha = sol.created_at;
                }
            } else {
                map.set(phoneKey, {
                    telefono: phoneKey,
                    nombreCliente: sol.nombreCliente || (phoneKey.startsWith('group_') ? 'Taxi Casa Julián' : `+${phoneKey}`),
                    categoria: sol.categoria || 'cliente',
                    ultimoMensajeFecha: sol.created_at || new Date().toISOString(),
                    ultimoTexto: sol.datosDetallados || 'Nueva solicitud',
                    allTexts: (sol.tipoAccion || '') + ' ' + (sol.datosDetallados || ''),
                    ultimoEmisor: 'cliente',
                    totalInteracciones: Array.isArray(sol.mensajes) ? sol.mensajes.length : 1,
                    solicitudId: sol.id,
                    solicitudEstado: sol.estado,
                    tipoSolicitud: sol.tipoAccion || sol.categoria
                });
            }
        });

        // 3. Ordenar: Primero los chats fijados con chincheta (📌), luego los más recientes
        const pinnedMap = getPinnedChatsMap();
        allUnifiedConversations = Array.from(map.values()).sort((a, b) => {
            const keyA = getCleanPhoneKey(a.telefono);
            const keyB = getCleanPhoneKey(b.telefono);
            const pinA = !!pinnedMap[keyA];
            const pinB = !!pinnedMap[keyB];
            if (pinA && !pinB) return -1;
            if (!pinA && pinB) return 1;
            const tA = new Date(a.ultimoMensajeFecha || 0).getTime();
            const tB = new Date(b.ultimoMensajeFecha || 0).getTime();
            return tB - tA;
        });

        // 4. Actualizar contadores del header y dropdown
        updateHeaderAndMenuBadges();
    }

    // ── GESTIÓN DE ETIQUETAS DE CONVERSACIONES Y CHATS ──────────────────────
    const CHAT_TAGS_STORAGE_KEY = 'casa_julian_chat_tags_map';

    // Sets para Filtros con Selección Múltiple
    let activeInboxStatusFilters = new Set();
    let activeInboxCatFilters = new Set();
    let activeInboxTopicFilters = new Set();
    let activeInboxTagFilters = new Set();

    // Extrae y acumula todas las etiquetas de las interacciones del cliente con el Chatbot
    function getChatbotTagsForConversation(c) {
        if (!c) return [];
        const combined = `${c.allTexts || ''} ${c.ultimoTexto || ''} ${c.tipoSolicitud || ''} ${c.categoria || ''}`.toLowerCase();
        const tags = [];

        // 1. OT: Reserva con Tarjeta de Regalo / Menú Tradición
        if (/tarjeta\s*regalo|tarjeta_regalo|men[uú]\s*tradici[oó]n|menu_tradicion|opari[\s\-]txartel|gift\s*card|bono\s*regalo|reserva\s*men[uú]\s*tradici[oó]n|btn_reserva_con_tarjeta|opt_regalar_menu_tradicion|opt_menu_tradicion/i.test(combined)) {
            tags.push('OT');
        }

        // 2. NO OT: Solicitud de reserva SIN tarjeta de regalo / TheFork / "No tengo"
        if (/no\s*tengo\s*tarjeta|sin\s*tarjeta|no\s*dispongo\s*de\s*tarjeta|reserva\s*online|erreserba\s*online|book\s*a\s*table|casajulian\.eus|btn_reserva_sin_tarjeta|btn_reserva_web|btn_solicitar_reserva|no\s*tengo\s*c[oó]digo|sin\s*c[oó]digo|deseas realizar alguna otra gestión o finalizar la conversación|erreserba egin nahi duzu|do you want to make another reservation|no\s*tengo|ez\s*daukat|i\s*don'?t\s*have/i.test(combined)) {
            tags.push('NO OT');
        }

        // 3. MODIF: Modificación de reserva
        if (/modifi|cambiar\s*hora|cambiar\s*fecha|cambiar\s*personas|cambiar\s*comensales|what\s*modification|aldatu\s*nahi\s*duzu|mod_comensales|mod_dia|mod_hora|opt_modificacion|btn_go_modificacion/i.test(combined)) {
            tags.push('MODIF');
        }

        // 4. CANCEL: Cancelación de reserva
        if (/cancel|anul|cancel\s*request|erreserba\s*bertan\s*behera|no\s*podremos\s*asistir|no\s*podemos\s*ir|opt_cancelacion|btn_go_cancelacion/i.test(combined)) {
            tags.push('CANCEL');
        }

        // 5. OTRAS: Consulta abierta
        if (/consulta\s*abierta|casu[ií]stica|inquiry\s*successfully\s*sent|duda\s*o\s*consulta|necesidad\s*especial|embarazada|mascota|submit\s*request|bidali\s*eskaera|enviar\s*solicitud|opt_consulta_abierta|btn_consulta_enviar/i.test(combined)) {
            tags.push('OTRAS');
        }

        // 6. FAQs: Preguntas frecuentes / Otras cuestiones
        if (/otras\s*cuestiones|preguntas\s*frecuentes|faq|horario|donde\s*aparcar|d[oó]nde\s*aparcar|c[oó]mo\s*llegar|como\s*llegar|ubicaci[oó]n|ubicacion|direcci[oó]n|direccion|ver\s*carta|ikusi\s*karta|view\s*menu|other\s*questions|beste\s*gai\s*batzuk|opt_otras_cuestiones|faq_/i.test(combined)) {
            tags.push('FAQs');
        }

        return tags;
    }

    function chatMatchesTag(c, tagId, tagName) {
        const id = (tagId || '').toLowerCase().trim();
        const name = (tagName || '').toLowerCase().trim();
        const chatTags = getChatTags(c.telefono, c).map(t => String(t).toLowerCase().trim());

        // 1. Coincidencia directa por etiquetas asignadas o acumuladas al chat
        if (chatTags.some(t => {
            if (t === id || t === name) return true;
            if (id === 'menu_tradicion' && (t === 'ot' || t === 'menu_tradicion' || t === 'tradicion')) return true;
            if (id === 'no_ot' && (t === 'no ot' || t === 'no_ot')) return true;
            if (id === 'modificacion' && (t === 'modif' || t === 'modificacion' || t === 'modificaciones')) return true;
            if (id === 'cancelacion' && (t === 'cancel' || t === 'cancelacion' || t === 'cancelaciones')) return true;
            if (id === 'faq' && (t === 'faqs' || t === 'faq' || t === 'preguntas_frecuentes')) return true;
            if (id === 'otras_cuestiones' && (t === 'otras' || t === 'otras_cuestiones' || t === 'consulta' || t === 'consulta_abierta')) return true;
            if (name === 'ot' && (t === 'ot' || t === 'menu_tradicion')) return true;
            if (name === 'no ot' && (t === 'no ot' || t === 'no_ot')) return true;
            if (name === 'modif' && (t === 'modif' || t === 'modificacion')) return true;
            if (name === 'cancel' && (t === 'cancel' || t === 'cancelacion')) return true;
            if (name === 'faqs' && (t === 'faqs' || t === 'faq')) return true;
            if (name === 'otras' && (t === 'otras' || t === 'otras_cuestiones')) return true;
            return (name.length > 2 && t.includes(name)) || (t.length > 2 && name.includes(t));
        })) {
            return true;
        }

        // 2. Coincidencia por Categoría / Grupo
        const cat = getConversationCategory(c);
        const cleanPhone = getCleanPhoneKey(c.telefono);

        if (id === 'proveedor' || name.includes('proveedor')) {
            if (cat === 'proveedor') return true;
        }
        if (id === 'hoteles' || name.includes('hotel')) {
            if (cat === 'hoteles') return true;
        }
        if (id === 'empleado' || name.includes('personal') || name.includes('emplead')) {
            if (cat === 'empleado') return true;
        }
        if (id === 'taxi' || name.includes('taxi')) {
            if (cat === 'taxi' || cleanPhone === 'group_taxi_casa_julian' || c.isGroup) return true;
        }
        if (id === 'grupo' || name === 'grupo') {
            if (cleanPhone === 'group_taxi_casa_julian' || c.isGroup || (c.nombreCliente && c.nombreCliente.toLowerCase().includes('grupo'))) return true;
        }
        if (id === 'cliente' || name.includes('cliente')) {
            if (cat === 'cliente' && cleanPhone !== 'group_taxi_casa_julian' && !c.isGroup) return true;
        }
        if (id === 'otro' || name === 'otros' || name === 'otro') {
            if (cat === 'otro' && cleanPhone !== 'group_taxi_casa_julian' && !c.isGroup) return true;
        }

        return false;
    }

    function getChatTagsMap() {
        if (serverInboxSettings.chatTags && typeof serverInboxSettings.chatTags === 'object') {
            return serverInboxSettings.chatTags;
        }
        try {
            return JSON.parse(localStorage.getItem(CHAT_TAGS_STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function getChatTags(phone, conv = null) {
        const cleanPhone = getCleanPhoneKey(phone);
        const map = getChatTagsMap();
        
        // Si el usuario ha guardado explícitamente etiquetas para este chat (incluso si está vacío []), se respeta su decisión
        if (map && Object.prototype.hasOwnProperty.call(map, cleanPhone)) {
            const arr = map[cleanPhone];
            if (Array.isArray(arr)) {
                return arr.map(t => {
                    const low = String(t).toLowerCase();
                    if (low === 'empleado' || low === 'empleados' || low === 'alba') return 'Personal';
                    return t;
                });
            }
        }

        if (cleanPhone === 'group_taxi_casa_julian') {
            return ['TAXIS', 'GRUPO'];
        }
        
        // Si no tiene asignación explícita, inferir de contactos silenciados o categoría
        const tags = [];
        const silenced = Array.isArray(allSilencedNumbers) ? allSilencedNumbers.find(s => getCleanPhoneKey(s.telefono) === cleanPhone) : null;
        if (silenced && silenced.categoria) {
            const parts = silenced.categoria.split(',').map(p => p.trim()).filter(Boolean);
            parts.forEach(p => {
                const low = p.toLowerCase();
                if (low === 'empleado' || low === 'empleados' || low === 'alba' || low === 'personal') {
                    tags.push('Personal');
                } else if (low === 'proveedor' || low === 'proveedores') {
                    tags.push('Proveedores');
                } else if (low === 'hotel' || low === 'hoteles') {
                    tags.push('Hoteles');
                } else if (low === 'taxi' || low === 'taxis') {
                    tags.push('Taxis');
                } else {
                    tags.push(p);
                }
            });
        }
        
        if (conv && Array.isArray(conv.etiquetas) && conv.etiquetas.length > 0) {
            tags.push(...conv.etiquetas.map(t => {
                const low = String(t).toLowerCase();
                if (low === 'empleado' || low === 'empleados' || low === 'alba') return 'Personal';
                return t;
            }));
        }

        // Acumular etiquetas de interacción con el Chatbot (OT, NO OT, MODIF, CANCEL, OTRAS, FAQs)
        if (conv) {
            const botTags = getChatbotTagsForConversation(conv);
            botTags.forEach(bt => {
                if (!tags.includes(bt)) tags.push(bt);
            });
        }

        if (tags.length === 0 && conv) {
            const cat = (conv.categoria || '').toLowerCase();
            const name = (conv.nombreCliente || '').toLowerCase();
            if (cat === 'proveedor' || cat === 'proveedores' || name.includes('entretiempo') || name.includes('ricardo')) {
                tags.push('Proveedores');
            } else if (cat === 'hoteles' || cat === 'hotel') {
                tags.push('Hoteles');
            } else if (cat === 'empleado' || cat === 'empleados' || cat === 'alba' || cat === 'personal' || name.includes('alba') || name.includes('gorrotxategi') || name.includes('informatico')) {
                tags.push('Personal');
            } else if (cat === 'taxi' || cat === 'taxis') {
                tags.push('Taxis');
            }
        }

        return [...new Set(tags)];
    }

    function setChatTags(phone, tagsArray) {
        const cleanPhone = getCleanPhoneKey(phone);
        if (!cleanPhone) return;
        const map = { ...getChatTagsMap() };
        map[cleanPhone] = Array.isArray(tagsArray) ? tagsArray : [];
        serverInboxSettings.chatTags = map;
        localStorage.setItem(CHAT_TAGS_STORAGE_KEY, JSON.stringify(map));

        // Persistir en servidor PostgreSQL
        const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
        fetch('/api/admin/chat-tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': currentToken,
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ phone: cleanPhone, tags: tagsArray })
        }).catch(e => console.warn('Error guardando chatTags en servidor:', e));
    }

    function updateHeaderAndMenuBadges() {
        const pendingCount = getPendingConversationsCount();
        const inboxCountBadge = document.getElementById('inbox-count-badge');
        const dropdownInboxBadge = document.getElementById('dropdown-inbox-badge');
        const headerActiveBadge = document.getElementById('header-active-tab-badge');

        if (inboxCountBadge) {
            inboxCountBadge.textContent = pendingCount;
            inboxCountBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
        if (dropdownInboxBadge) {
            dropdownInboxBadge.textContent = pendingCount;
            dropdownInboxBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
        if (currentActiveTabId === 'tab-inbox' && headerActiveBadge) {
            headerActiveBadge.textContent = pendingCount;
            headerActiveBadge.style.background = '#ef4444';
            headerActiveBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
    }

    // ── Clasificación Inteligente de Categorías y Temáticas ────────────────
    function getConversationCategory(c) {
        const cat = (c.categoria || '').toLowerCase();
        const chatTags = getChatTags(c.telefono, c).map(t => String(t).toLowerCase());
        if (cat === 'proveedor' || cat === 'proveedores' || chatTags.some(t => t.includes('prov'))) return 'proveedor';
        if (cat === 'hoteles' || cat === 'hotel' || chatTags.some(t => t.includes('hotel'))) return 'hoteles';
        if (cat === 'empleado' || cat === 'empleados' || cat === 'alba' || cat === 'personal' || chatTags.some(t => t.includes('alba') || t.includes('emplead') || t.includes('personal'))) return 'empleado';
        if (cat === 'otro' || cat === 'taxi' || cat === 'taxis' || chatTags.some(t => t.includes('taxi') || t.includes('otro'))) return 'otro';
        return 'cliente';
    }

    function getConversationTopic(c) {
        if (!c) return null;
        const tipo = (c.tipoSolicitud || '').toUpperCase();
        const cat = (c.categoria || '').toUpperCase();
        const text = (c.ultimoTexto || '').toLowerCase();
        const tags = Array.isArray(c.etiquetas) ? c.etiquetas.map(t => String(t).toLowerCase()) : [];

        // 1. Tarjeta Regalo / Menú Tradición (OT)
        if (tipo.includes('TRADICION') || tipo.includes('TRADICIÓN') || tipo.includes('REGALO') || tipo.includes('TARJETA') || cat.includes('TRADICION') || cat.includes('REGALO') || tags.some(t => t.includes('ot') || t.includes('menu') || t.includes('tradici') || t.includes('regalo') || t.includes('tarjeta')) || /men[uú]|tradici[oó]n|tarjeta|regalo|degustaci|opari/i.test(text)) {
            return 'menu_tradicion';
        }

        // 2. Modificación de Reserva (MODIF)
        if (tipo.includes('MODIF') || cat.includes('MODIF') || tags.some(t => t.includes('modif')) || /modifi|cambi|ampliar|retras/i.test(text)) {
            return 'modificacion';
        }

        // 3. Cancelación de Reserva (CANCEL)
        if (tipo.includes('CANCEL') || cat.includes('CANCEL') || tags.some(t => t.includes('cancel')) || /cancel|anul|no podemos ir|no podre/i.test(text)) {
            return 'cancelacion';
        }

        // 4. Preguntas Frecuentes (FAQs - 5. Otras cuestiones)
        if (tipo.includes('FAQ') || tipo.includes('PREGUNTA') || cat === 'FAQS' || tags.some(t => t.includes('faq')) || /faq|pregunt|horario|donde|d[oó]nde|ubicaci[oó]n|c[oó]mo llegar|aparc|parking|direccion/i.test(text)) {
            return 'faq';
        }

        // 5. Consulta Abierta (OTRAS - 4. Consulta abierta)
        if (tipo.includes('CONSULTA') || tipo.includes('CASUIST') || tipo.includes('CASUÍST') || tipo.includes('OTRAS') || tipo.includes('DUDA') || cat.includes('CONSULTA') || tags.some(t => t.includes('otra') || t.includes('consulta')) || /consulta|casu[ií]stica|duda|alergia|celiac/i.test(text)) {
            return 'otras_cuestiones';
        }

        return null;
    }

    // ── Renderizar Píldoras de Filtro Dinámicas según el orden de Gestión de Etiquetas ──
    function renderInboxFilterPills() {
        const pillsRow = document.querySelector('.wa-filter-pills-row');
        if (!pillsRow) return;

        const countPend = allUnifiedConversations.filter(c => getConversationStatus(c) === 'pendiente').length;
        const isTodosActive = (activeInboxStatusFilters.size === 0 && activeInboxTagFilters.size === 0 && activeInboxCatFilters.size === 0 && activeInboxTopicFilters.size === 0);
        const isPendActive = activeInboxStatusFilters.has('pendiente');

        const availableTags = getAllAvailableSilencedTags();

        let html = `
            <button class="filter-chip wa-pill ${isTodosActive ? 'active' : ''}" data-filter-type="all">Todos</button>
            <button class="filter-chip wa-pill ${isPendActive ? 'active' : ''}" data-filter-type="status" data-filter-val="pendiente">No leídos <span id="count-status-pend">${countPend}</span></button>
        `;

        availableTags.forEach(tag => {
            const tagCount = allUnifiedConversations.filter(c => chatMatchesTag(c, tag.id, tag.name)).length;
            const isTagActive = activeInboxTagFilters.has(tag.id) || activeInboxTagFilters.has(tag.name.toLowerCase());
            const tagDisplayName = tag.name || tag.label || tag.id;
            
            html += `
                <button class="filter-chip wa-pill wa-tag-filter-pill ${isTagActive ? 'active' : ''}" data-filter-type="tag" data-tag-id="${tag.id}" data-tag-name="${tagDisplayName}">
                    ${tagDisplayName} (<span class="tag-filter-count">${tagCount}</span>)
                </button>
            `;
        });

        pillsRow.innerHTML = html;

        // Conectar event listeners a las píldoras renderizadas
        pillsRow.querySelectorAll('.wa-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const filterType = pill.getAttribute('data-filter-type');
                
                if (filterType === 'all') {
                    activeInboxStatusFilters.clear();
                    activeInboxTagFilters.clear();
                    activeInboxCatFilters.clear();
                    activeInboxTopicFilters.clear();
                    renderInboxFilterPills();
                    renderInboxCards();
                    return;
                }

                if (filterType === 'status') {
                    const statusVal = pill.getAttribute('data-filter-val');
                    if (activeInboxStatusFilters.has(statusVal)) {
                        activeInboxStatusFilters.delete(statusVal);
                    } else {
                        activeInboxStatusFilters.add(statusVal);
                    }
                } else if (filterType === 'tag') {
                    const tagId = pill.getAttribute('data-tag-id');
                    const tagName = pill.getAttribute('data-tag-name');
                    const tagKey = tagId || (tagName || '').toLowerCase();
                    if (activeInboxTagFilters.has(tagKey)) {
                        activeInboxTagFilters.delete(tagKey);
                    } else {
                        activeInboxTagFilters.add(tagKey);
                    }
                }

                renderInboxFilterPills();
                renderInboxCards();
            });
        });
    }

    // Estado de selección múltiple de chats en buzón
    let selectedChatCardsPhones = new Set();
    let isChatMultiSelectMode = false;

    // Helper centralizado para alternar estado del bot (Activar / Desactivar) para cualquier contacto o chat
    async function toggleBotStatusForContact(phone, name = '') {
        const clean = getCleanPhoneKey(phone);
        if (!clean || clean.startsWith('group_')) return;
        
        // Buscar en la lista de silenciados
        const cleanNoPrefix = clean.replace(/^34/, '');
        const silenced = (typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers))
            ? allSilencedNumbers.find(s => {
                const sClean = getCleanPhoneKey(s.telefono);
                return sClean === clean || sClean === cleanNoPrefix || (sClean && cleanNoPrefix.length >= 7 && sClean.endsWith(cleanNoPrefix));
            })
            : null;
            
        const isCurrentlySilenced = silenced ? !!silenced.activo : false;
        const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';

        try {
            if (silenced && silenced.id) {
                await fetch(`/api/admin/silenced-numbers/${silenced.id}/toggle`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                    body: JSON.stringify({ activo: !isCurrentlySilenced })
                });
            } else {
                await fetch('/api/admin/silenced-numbers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tokenToUse },
                    body: JSON.stringify({
                        telefono: clean,
                        nombre: name || `+${clean}`,
                        categoria: 'cliente',
                        notas: 'Desactivado desde buzón (atención humana)'
                    })
                });
            }
            showToast(!isCurrentlySilenced ? '🔇 Bot desactivado (atención humana)' : '🔊 Bot reactivado');
            await fetchSilencedNumbers();
            renderInboxCards();
        } catch (err) {
            console.error('Error al alternar estado del bot:', err);
            showToast('❌ Error al cambiar estado del bot');
        }
    }

    // Cache en memoria para renderizado instantáneo de hilos de chat
    const chatHistoryCache = new Map();

    // ── GESTIÓN ULTRA-FLUIDA DE SELECCIÓN MÚLTIPLE FLOTANTE ──
    let isFloatingBarEventsBound = false;

    function updateFloatingSelectionToolbar() {
        const floatingBar = document.getElementById('chat-multi-select-floating-bar');
        if (!floatingBar) return;
        const container = document.getElementById('inbox-cards-container');
        const count = selectedChatCardsPhones.size;
        const isActive = count > 0;
        
        isChatMultiSelectMode = isActive;

        if (container) {
            container.classList.toggle('multi-select-mode', isActive);
        }

        if (isActive) {
            floatingBar.style.display = 'flex';
            const countText = document.getElementById('chat-multi-select-count-text');
            if (countText) countText.textContent = `${count} ${count === 1 ? 'elegido' : 'elegidos'}`;
            const chkAll = document.getElementById('chat-multi-select-all');
            if (chkAll) {
                const allVisible = Array.from(document.querySelectorAll('.chat-card-item')).map(el => el.getAttribute('data-phone')).filter(Boolean);
                chkAll.checked = allVisible.length > 0 && allVisible.every(ph => selectedChatCardsPhones.has(ph));
            }
        } else {
            floatingBar.style.display = 'none';
        }
    }

    function toggleChatCardSelection(phone, cardEl) {
        const clean = getCleanPhoneKey(phone);
        if (!clean) return;
        const willSelect = !selectedChatCardsPhones.has(clean);
        if (willSelect) {
            selectedChatCardsPhones.add(clean);
        } else {
            selectedChatCardsPhones.delete(clean);
        }
        isChatMultiSelectMode = selectedChatCardsPhones.size > 0;

        const targetCard = cardEl || document.querySelector(`.chat-card-item[data-phone="${clean}"]`);
        if (targetCard) {
            targetCard.classList.toggle('is-bulk-selected', willSelect);
            const chk = targetCard.querySelector('.wa-chat-select-chk');
            if (chk) chk.checked = willSelect;
        }

        updateFloatingSelectionToolbar();
    }

    function setAllChatsSelected(selectAll) {
        const container = document.getElementById('inbox-cards-container');
        if (!container) return;
        const allCards = container.querySelectorAll('.chat-card-item');
        if (selectAll) {
            allCards.forEach(card => {
                const ph = card.getAttribute('data-phone');
                if (ph) {
                    selectedChatCardsPhones.add(ph);
                    card.classList.add('is-bulk-selected');
                    const chk = card.querySelector('.wa-chat-select-chk');
                    if (chk) chk.checked = true;
                }
            });
            isChatMultiSelectMode = selectedChatCardsPhones.size > 0;
        } else {
            selectedChatCardsPhones.clear();
            isChatMultiSelectMode = false;
            allCards.forEach(card => {
                card.classList.remove('is-bulk-selected');
                const chk = card.querySelector('.wa-chat-select-chk');
                if (chk) chk.checked = false;
            });
        }
        updateFloatingSelectionToolbar();
    }

    function initFloatingSelectionToolbarEvents() {
        if (isFloatingBarEventsBound) return;
        isFloatingBarEventsBound = true;

        const chkAll = document.getElementById('chat-multi-select-all');
        if (chkAll) {
            chkAll.addEventListener('change', (e) => {
                setAllChatsSelected(e.target.checked);
            });
        }

        const btnCancel = document.getElementById('btn-multi-cancel');
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                setAllChatsSelected(false);
            });
        }

        const btnArchive = document.getElementById('btn-multi-archive-chats');
        if (btnArchive) {
            btnArchive.addEventListener('click', () => {
                if (selectedChatCardsPhones.size === 0) return;
                const phonesArr = Array.from(selectedChatCardsPhones);
                let archMap = {};
                try { archMap = JSON.parse(localStorage.getItem('casa_julian_archived_chats') || '{}'); } catch(e) {}
                const now = new Date().toISOString();
                phonesArr.forEach(ph => { archMap[ph] = { archivedAt: now }; });
                localStorage.setItem('casa_julian_archived_chats', JSON.stringify(archMap));
                if (!serverInboxSettings.archivedChats) serverInboxSettings.archivedChats = {};
                phonesArr.forEach(ph => { serverInboxSettings.archivedChats[ph] = { archivedAt: now }; });
                const tok = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                fetch('/api/admin/inbox-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': tok, 'Authorization': `Bearer ${tok}` },
                    body: JSON.stringify({ settings: serverInboxSettings })
                }).catch(e => console.warn('Error guardando archivedChats:', e));
                showToast(`📦 ${phonesArr.length} chat(s) movidos al fondo de la lista`);
                setAllChatsSelected(false);
                renderInboxCards();
            });
        }

        const btnDelete = document.getElementById('btn-multi-delete-chats');
        if (btnDelete) {
            btnDelete.addEventListener('click', async () => {
                if (selectedChatCardsPhones.size === 0) return;
                const phonesArr = Array.from(selectedChatCardsPhones);
                if (!confirm(`⚠️ ¿Estás seguro de que deseas ELIMINAR DEFINITIVAMENTE los ${phonesArr.length} chats seleccionados? Esta acción no se puede deshacer.`)) return;
                try {
                    const res = await fetch('/api/admin/chats/bulk-delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                        body: JSON.stringify({ phones: phonesArr })
                    });
                    const d = await res.json();
                    showToast(d.message || `${phonesArr.length} chats eliminados.`);
                    setAllChatsSelected(false);
                    await fetchWhatsAppChats();
                    syncUnifiedConversations();
                    renderInboxCards();
                } catch (err) {
                    showToast('❌ Error al eliminar: ' + err.message);
                }
            });
        }

        const btnMarkUnread = document.getElementById('btn-multi-mark-unread');
        if (btnMarkUnread) {
            btnMarkUnread.addEventListener('click', () => {
                if (selectedChatCardsPhones.size === 0) return;
                const phonesArr = Array.from(selectedChatCardsPhones);
                phonesArr.forEach(ph => setManualChatStatus(ph, 'pendiente'));
                showToast(`🔴 ${phonesArr.length} chat(s) marcados como No Leído`);
                setAllChatsSelected(false);
                renderInboxCards();
            });
        }

        const btnMarkRead = document.getElementById('btn-multi-mark-read');
        if (btnMarkRead) {
            btnMarkRead.addEventListener('click', () => {
                if (selectedChatCardsPhones.size === 0) return;
                const phonesArr = Array.from(selectedChatCardsPhones);
                phonesArr.forEach(ph => setManualChatStatus(ph, 'leido'));
                showToast(`✅ ${phonesArr.length} chat(s) marcados como Leído`);
                setAllChatsSelected(false);
                renderInboxCards();
            });
        }
    }

    function renderInboxCards() {
        const container = document.getElementById('inbox-cards-container');
        const summaryEl = document.getElementById('inbox-filter-summary');
        if (!container) return;

        const total = allUnifiedConversations.length;
        if (typeof updateHeaderAndMenuBadges === 'function') updateHeaderAndMenuBadges();

        let filtered = [...allUnifiedConversations];

        // 1. Filtrar por Estado Múltiple (ej: 'pendiente' / No leídos)
        if (activeInboxStatusFilters.size > 0) {
            filtered = filtered.filter(c => activeInboxStatusFilters.has(getConversationStatus(c)));
        }

        // 2. Filtrar por Etiquetas Múltiples (según las etiquetas seleccionadas en las píldoras superiores)
        if (activeInboxTagFilters.size > 0) {
            const availableTagsList = typeof getAllAvailableSilencedTags === 'function' ? getAllAvailableSilencedTags() : [];
            filtered = filtered.filter(c => {
                return Array.from(activeInboxTagFilters).some(tagKey => {
                    const tagObj = availableTagsList.find(t => t.id === tagKey || (t.name && t.name.toLowerCase() === tagKey.toLowerCase()));
                    const tagId = tagObj ? tagObj.id : tagKey;
                    const tagName = tagObj ? tagObj.name : tagKey;
                    return chatMatchesTag(c, tagId, tagName);
                });
            });
        }

        // 3. Filtrar por Categoría / Temática residual si existiese
        if (activeInboxCatFilters.size > 0) {
            filtered = filtered.filter(c => {
                const cat = getConversationCategory(c);
                const chatTags = getChatTags(c.telefono, c).map(t => t.toLowerCase());
                return activeInboxCatFilters.has(cat) || Array.from(activeInboxCatFilters).some(f => chatTags.some(t => t.includes(f) || f.includes(t)));
            });
        }
        if (activeInboxTopicFilters.size > 0) {
            filtered = filtered.filter(c => activeInboxTopicFilters.has(getConversationTopic(c)));
        }

        // 4. Filtrar por buscador
        if (currentInboxSearch.trim()) {
            const q = currentInboxSearch.toLowerCase().trim();
            const qDigits = q.replace(/\D/g, '');
            filtered = filtered.filter(c => {
                const rawTel = (c.telefono || '').toLowerCase();
                const telDigits = rawTel.replace(/\D/g, '');
                const rawName = (c.nombreCliente || '').toLowerCase();
                const nameDigits = rawName.replace(/\D/g, '');
                const rawText = (c.ultimoTexto || '').toLowerCase();
                const rawTipo = (c.tipoSolicitud || '').toLowerCase();
                const chatTags = getChatTags(c.telefono, c).join(' ').toLowerCase();

                const digitsMatch = qDigits.length >= 3 && (telDigits.includes(qDigits) || nameDigits.includes(qDigits));
                const textMatch = rawTel.includes(q) || rawName.includes(q) || rawText.includes(q) || rawTipo.includes(q) || chatTags.includes(q);

                return digitsMatch || textMatch;
            });
        }

        if (summaryEl) {
            summaryEl.textContent = `${filtered.length} de ${total} conversaciones`;
        }

        // Mover chats archivados al fondo (salvo que haya llegado un nuevo mensaje después de archivarlos)
        let archMap = {};
        try { archMap = { ...(serverInboxSettings.archivedChats || {}), ...JSON.parse(localStorage.getItem('casa_julian_archived_chats') || '{}') }; } catch(e) {}
        if (Object.keys(archMap).length > 0) {
            filtered.sort((a, b) => {
                const aKey = getCleanPhoneKey(a.telefono);
                const bKey = getCleanPhoneKey(b.telefono);
                const archA = archMap[aKey];
                const archB = archMap[bKey];
                // Auto-desarchivar si llegó un mensaje nuevo después de archivar
                if (archA) {
                    const archTime = new Date(archA.archivedAt).getTime();
                    const msgTime = a.ultimoMensajeFecha ? new Date(a.ultimoMensajeFecha).getTime() : 0;
                    if (!isNaN(archTime) && !isNaN(msgTime) && msgTime > archTime + 5000) {
                        delete archMap[aKey];
                        // Limpiar del localStorage y serverInboxSettings
                        const saved = JSON.parse(localStorage.getItem('casa_julian_archived_chats') || '{}');
                        delete saved[aKey];
                        localStorage.setItem('casa_julian_archived_chats', JSON.stringify(saved));
                        if (serverInboxSettings.archivedChats) delete serverInboxSettings.archivedChats[aKey];
                    }
                }
                if (archB) {
                    const archTime = new Date(archB.archivedAt).getTime();
                    const msgTime = b.ultimoMensajeFecha ? new Date(b.ultimoMensajeFecha).getTime() : 0;
                    if (!isNaN(archTime) && !isNaN(msgTime) && msgTime > archTime + 5000) {
                        delete archMap[bKey];
                        const saved = JSON.parse(localStorage.getItem('casa_julian_archived_chats') || '{}');
                        delete saved[bKey];
                        localStorage.setItem('casa_julian_archived_chats', JSON.stringify(saved));
                        if (serverInboxSettings.archivedChats) delete serverInboxSettings.archivedChats[bKey];
                    }
                }
                const isArchA = !!archMap[aKey];
                const isArchB = !!archMap[bKey];
                if (isArchA && !isArchB) return 1;  // A al fondo
                if (!isArchA && isArchB) return -1; // B al fondo
                return 0; // Mantener orden relativo
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 50px 20px; background: #111b21; border-radius: 0 0 12px 12px; border: 1px dashed rgba(134, 150, 160, 0.2);">
                    <div style="font-size: 2.2rem; margin-bottom: 10px;">💬</div>
                    <div style="font-size: 1.05rem; font-weight: 700; color: #e9edef;">No hay chats en este filtro</div>
                    <p style="font-size: 0.85rem; margin-top: 6px; color: #8696a0;">Prueba a seleccionar otros filtros o desactivar alguno para ver más conversaciones.</p>
                </div>
            `;
            return;
        }

        const availableTagsList = typeof getAllAvailableSilencedTags === 'function' ? getAllAvailableSilencedTags() : [];
        const cardsHtml = [];

        filtered.forEach(c => {
            const cleanPhone = getCleanPhoneKey(c.telefono);
            const isGroup = cleanPhone === 'group_taxi_casa_julian' || c.isGroup;
            const clientDisplayName = isGroup ? 'Taxi Casa Julián' : getClientDisplayName(c.nombreCliente, cleanPhone);
            const smartTime = formatSmartDateTime(c.ultimoMensajeFecha);
            const isFromClient = c.ultimoEmisor === 'cliente' || c.ultimoEmisor === 'user';
            const isSelected = activeConversationPhone === cleanPhone;
            const isBulkSelected = selectedChatCardsPhones.has(cleanPhone);
            // Si el chat está abierto Y NO está marcado manualmente como pendiente → leído
            const _manualMap = getManualChatStatusMap();
            const _mEntry = _manualMap[cleanPhone];
            const _mVal = _mEntry ? (typeof _mEntry === 'object' ? _mEntry.status : _mEntry) : null;
            const status = (isSelected && _mVal !== 'pendiente') ? 'leido' : getConversationStatus(c);
            const isPending = (status === 'pendiente');
            const unreadCount = isPending ? getConversationUnreadCount(c) : 0;
            const isPinned = isChatPinned(cleanPhone);
            const isDropdownOpen = (activeCardDropdownPhone === cleanPhone);

            const silencedContact = (typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers))
                ? allSilencedNumbers.find(s => getCleanPhoneKey(s.telefono) === cleanPhone)
                : null;
            const isBotCanceled = silencedContact ? !!silencedContact.activo : false;

            const outgoingCheckHtml = !isFromClient 
                ? `<span class="wa-check-double" title="Entregado y Leído">✓✓</span> ` 
                : '';

            // Generador de Avatar estilo WhatsApp Business con soporte de fotos personalizadas, grupos y WhatsApp
            let avatarHtml = '';
            const lowerName = (clientDisplayName || '').toLowerCase();
            const grpData = (serverInboxSettings.customGroups && serverInboxSettings.customGroups[cleanPhone]) || (c.isGroup ? c : null);
            const customAvatarUrl = getChatAvatarUrl(cleanPhone, clientDisplayName, c)
                || (grpData && grpData.avatar && (grpData.avatar.startsWith('/') || grpData.avatar.startsWith('http')) ? grpData.avatar : '');

            if (customAvatarUrl) {
                const borderClr = cleanPhone === 'group_taxi_casa_julian' ? '#f59e0b' : (isGroup ? '#10b981' : 'transparent');
                avatarHtml = `<div class="wa-avatar-container" style="background: #1e293b; border: 2px solid ${borderClr}; overflow: hidden;" title="${clientDisplayName}"><img src="${customAvatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span style=\\'font-size:1.4rem\\'>${cleanPhone === 'group_taxi_casa_julian' ? '🚕' : (isGroup ? '👥' : '👤')}</span>'"></div>`;
            } else if (grpData && grpData.avatar && !grpData.avatar.startsWith('/')) {
                avatarHtml = `<div class="wa-avatar-container" style="background: #1e293b; border: 2px solid #10b981; overflow: hidden;" title="${clientDisplayName}"><span style="font-size: 1.4rem;">${grpData.avatar}</span></div>`;
            } else if (lowerName.includes('entretiempo') || lowerName.includes('ricardo')) {
                avatarHtml = `<div class="wa-avatar-container wa-avatar-ricardo" title="${clientDisplayName}"><span>E</span></div>`;
            } else if (lowerName.includes('xabi') || lowerName.includes('gorrotxategi')) {
                avatarHtml = `<div class="wa-avatar-container" style="background: #1e3a8a; color: #93c5fd;" title="${clientDisplayName}"><span>XG</span></div>`;
            } else if (cleanPhone === '41795958760') {
                avatarHtml = `<div class="wa-avatar-container" style="background: #065f46; color: #6ee7b7;" title="${clientDisplayName}"><span>+41</span></div>`;
            } else if (cleanPhone === '923218428609') {
                avatarHtml = `<div class="wa-avatar-container" style="background: #701a75; color: #f5d0fe;" title="${clientDisplayName}"><span>SA</span></div>`;
            } else if (clientDisplayName && !clientDisplayName.startsWith('+')) {
                const words = clientDisplayName.trim().split(/\s+/);
                const initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase();
                avatarHtml = `<div class="wa-avatar-container" style="background: #2a3942; color: #e9edef;" title="${clientDisplayName}"><span>${initials}</span></div>`;
            } else {
                avatarHtml = `<div class="wa-avatar-container" style="background: #202c33; color: #8696a0;" title="${clientDisplayName}"><span style="font-size: 1.2rem;">👤</span></div>`;
            }

            // Etiquetas WhatsApp Business (Píldoras de colores visibles bajo el mensaje - se oculta CLIENTES)
            let tagsHtml = '';
            const allChatTags = getChatTags(cleanPhone, c);
            const tags = allChatTags.filter(t => {
                const low = String(t).toLowerCase().trim();
                return low !== 'cliente' && low !== 'clientes';
            });

            if (tags.length > 0) {
                tagsHtml = `<div class="wa-tags-container">` + tags.map(t => {
                    const lowT = String(t).toLowerCase().trim();
                    const tagObj = availableTagsList.find(at => {
                        const atId = (at.id || '').toLowerCase();
                        const atName = (at.name || '').toLowerCase();
                        if (atId === lowT || atName === lowT) return true;
                        if (atId === 'menu_tradicion' && (lowT === 'ot' || lowT === 'menu_tradicion' || lowT === 'tradicion')) return true;
                        if (atId === 'no_ot' && (lowT === 'no ot' || lowT === 'no_ot')) return true;
                        if (atId === 'modificacion' && (lowT === 'modif' || lowT === 'modificacion' || lowT === 'modificaciones')) return true;
                        if (atId === 'cancelacion' && (lowT === 'cancel' || lowT === 'cancelacion' || lowT === 'cancelaciones')) return true;
                        if (atId === 'faq' && (lowT === 'faqs' || lowT === 'faq' || lowT === 'preguntas_frecuentes')) return true;
                        if (atId === 'otras_cuestiones' && (lowT === 'otras' || lowT === 'otras_cuestiones' || lowT === 'consulta' || lowT === 'consulta_abierta')) return true;
                        if (atId === 'empleado' && (lowT === 'empleados' || lowT === 'empleado' || lowT === 'personal' || lowT === 'alba')) return true;
                        if (atId === 'proveedor' && (lowT === 'proveedores' || lowT === 'proveedor')) return true;
                        if (atId === 'hoteles' && (lowT === 'hotel' || lowT === 'hoteles')) return true;
                        if (atId === 'taxi' && (lowT === 'taxis' || lowT === 'taxi')) return true;
                        if (atId === 'grupo' && (lowT === 'grupo' || lowT === 'grupos')) return true;
                        return false;
                    });
                    const rawLabel = tagObj ? tagObj.name : t;
                    const lowRaw = String(rawLabel).toLowerCase().trim();
                    let label = rawLabel.toUpperCase();
                    if (lowRaw === 'empleados' || lowRaw === 'empleado' || lowRaw === 'alba' || lowRaw === 'personal') {
                        label = 'PERSONAL';
                    } else if (lowRaw === 'grupo' || lowRaw === 'grupos') {
                        label = 'GRUPO';
                    } else if (lowRaw === 'faq' || lowRaw === 'faqs') {
                        label = 'FAQs';
                    } else if (lowRaw === 'no ot' || lowRaw === 'no_ot') {
                        label = 'NO OT';
                    }
                    const defaultColor = (lowRaw === 'grupo' || lowRaw === 'grupos') ? '#94a3b8' : '#c084fc';
                    const defaultBg = (lowRaw === 'grupo' || lowRaw === 'grupos') ? 'rgba(148, 163, 184, 0.18)' : 'rgba(168, 85, 247, 0.2)';
                    const color = tagObj ? tagObj.color : defaultColor;
                    const bg = tagObj ? tagObj.bg : defaultBg;
                    const tagClass = `tag-${(tagObj ? tagObj.id : t).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                    return `<span class="wa-tag-pill ${tagClass}" style="color: ${color}; background: ${bg}; border-color: ${color}66;">${label}</span>`;
                }).join('') + `</div>`;
            }

            const previewText = (c.ultimoTexto || '').replace(/[\r\n]+/g, ' ').substring(0, 110) + ((c.ultimoTexto || '').length > 110 ? '...' : '');

            cardsHtml.push(`
                <div class="whatsapp-chat-row chat-card-item ${isPending ? 'is-unread' : ''} ${isPinned ? 'is-pinned' : ''} ${isSelected ? 'is-selected' : ''} ${isBulkSelected ? 'is-bulk-selected' : ''} ${isDropdownOpen ? 'dropdown-active' : ''}" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}">
                    <div class="wa-chat-select-box">
                        <input type="checkbox" class="wa-chat-select-chk" data-phone="${cleanPhone}" ${isBulkSelected ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #10b981;">
                    </div>
                    ${avatarHtml}
                    <div class="wa-chat-content">
                        <div class="wa-row-top">
                            <span class="wa-contact-name" title="${clientDisplayName}">${clientDisplayName}</span>
                            <span class="wa-chat-time ${isPending ? 'wa-time-unread' : ''}">${smartTime}</span>
                        </div>
                        <div class="wa-row-bottom">
                            <div class="wa-snippet-and-tags">
                                <div class="wa-snippet-line">
                                    ${outgoingCheckHtml}
                                    <span class="wa-snippet-text">${formatWhatsAppText(previewText)}</span>
                                </div>
                                ${tagsHtml}
                            </div>
                            <div class="wa-status-icons">
                                ${isPinned ? `<span class="wa-pin-icon btn-click-pin-icon" data-phone="${cleanPhone}" title="Desfijar conversación" style="cursor: pointer; padding: 2px 4px; border-radius: 4px; user-select: none;">📌</span>` : ''}
                                ${isPending ? `<span class="wa-unread-badge">${unreadCount > 0 ? unreadCount : ''}</span>` : ''}
                                <div class="wa-item-actions-trigger btn-card-more-actions" data-phone="${cleanPhone}" title="Opciones">⋮</div>
                            </div>
                        </div>

                        <!-- Menú Flotante Superpuesto de Acciones Rápidas (estilo WhatsApp Web / Móvil) -->
                        <div class="card-actions-dropdown-menu" id="dropdown-actions-${cleanPhone}" style="display: ${isDropdownOpen ? 'flex' : 'none'}; position: absolute; top: 36px; right: 8px; z-index: 99999; background: #233138; border: 1px solid rgba(134, 150, 160, 0.25); border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4); min-width: 185px; padding: 6px 0; flex-direction: column; gap: 1px; overflow: hidden;">
                            <button type="button" class="btn-change-chat-avatar" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #38bdf8; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-align: left; box-sizing: border-box;">
                                🖼️ <span>Cambiar Imagen</span>
                            </button>
                            <button type="button" class="btn-edit-chat-tags" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #38bdf8; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-align: left; box-sizing: border-box;">
                                🏷️ <span>Etiquetas</span>
                            </button>
                            <button type="button" class="btn-pin-chat-card ${isPinned ? 'active' : ''}" data-phone="${cleanPhone}" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #e9edef; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-align: left; box-sizing: border-box;">
                                📌 <span>${isPinned ? 'Desfijar' : 'Fijar arriba'}</span>
                            </button>
                            <button type="button" class="btn-toggle-read-status" data-phone="${cleanPhone}" data-target-status="${isPending ? 'leido' : 'pendiente'}" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #e9edef; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-align: left; box-sizing: border-box;">
                                ${isPending ? '✓' : '⏳'} <span>${isPending ? 'Marcar Leído' : 'Marcar No Leído'}</span>
                            </button>
                            <a href="tel:+${cleanPhone}" class="btn-phone-call" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #e9edef; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-decoration: none; text-align: left; box-sizing: border-box;">
                                📞 <span>Llamar</span>
                            </a>
                            <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-open-wa" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #e9edef; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-decoration: none; text-align: left; box-sizing: border-box;">
                                📲 <span>WhatsApp</span>
                            </a>
                            ${!isGroup ? `
                            <button type="button" class="btn-silence-chat-card" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}" title="Activar o desactivar bot para este número" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #e9edef; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-align: left; box-sizing: border-box;">
                                ${isBotCanceled ? '🔊' : '🔇'} <span>${isBotCanceled ? 'Activar Bot' : 'Desactivar Bot'}</span>
                            </button>` : ''}
                            <div style="height: 1px; background: rgba(134, 150, 160, 0.18); margin: 3px 0;"></div>
                            <button type="button" class="btn-delete-chat-card" data-phone="${cleanPhone}" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; background: transparent; border: none; color: #fca5a5; font-size: 0.83rem; font-weight: 500; cursor: pointer; text-align: left; box-sizing: border-box;">
                                🗑️ <span>Eliminar chat</span>
                            </button>
                        </div>
                    </div>
                </div>
            `);
        });

        // Insertar únicamente las tarjetas (la barra de selección flota superpuesta sin mover los chats)
        container.innerHTML = cardsHtml.join('');

        // Sincronizar barra flotante de selección múltiple
        initFloatingSelectionToolbarEvents();
        updateFloatingSelectionToolbar();

        // Event listeners para las filas de conversación (click y pulsación larga con respuesta instantánea)
        container.querySelectorAll('.chat-card-item').forEach(card => {
            const phone = card.getAttribute('data-phone');
            const name = decodeURIComponent(card.getAttribute('data-name') || 'Cliente');
            let pressTimer = null;
            let isLongPressed = false;

            const chk = card.querySelector('.wa-chat-select-chk');
            if (chk) {
                chk.addEventListener('change', (e) => {
                    e.stopPropagation();
                    toggleChatCardSelection(phone, card);
                });
                chk.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }

            const startPress = () => {
                isLongPressed = false;
                pressTimer = setTimeout(() => {
                    isLongPressed = true;
                    if (navigator.vibrate) navigator.vibrate(40);
                    toggleChatCardSelection(phone, card);
                }, 380);
            };

            const cancelPress = () => {
                if (pressTimer) clearTimeout(pressTimer);
            };

            card.addEventListener('touchstart', (e) => {
                if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.wa-item-actions-trigger') || e.target.closest('.card-actions-dropdown-menu') || e.target.closest('.wa-chat-select-chk') || e.target.closest('.btn-click-pin-icon')) return;
                startPress();
            }, { passive: true });

            card.addEventListener('touchmove', cancelPress, { passive: true });
            card.addEventListener('touchend', cancelPress);
            card.addEventListener('touchcancel', cancelPress);

            card.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.wa-item-actions-trigger') || e.target.closest('.card-actions-dropdown-menu') || e.target.closest('.wa-chat-select-chk') || e.target.closest('.btn-click-pin-icon')) return;
                startPress();
            });

            card.addEventListener('mouseup', cancelPress);
            card.addEventListener('mouseleave', cancelPress);

            card.addEventListener('click', (e) => {
                if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.wa-item-actions-trigger') || e.target.closest('.card-actions-dropdown-menu') || e.target.closest('.btn-click-pin-icon')) return;
                if (isLongPressed) {
                    isLongPressed = false;
                    return;
                }
                if (isChatMultiSelectMode) {
                    toggleChatCardSelection(phone, card);
                    return;
                }
                selectConversation(phone, name);
            });
        });

        // Botón interactivo directo al hacer clic en el icono de la Chincheta 📌
        container.querySelectorAll('.btn-click-pin-icon').forEach(pinIcon => {
            pinIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const phone = pinIcon.getAttribute('data-phone');
                const isNowPinned = toggleChatPinned(phone);
                showToast(isNowPinned ? '📌 Conversación fijada arriba' : 'Conversación desfijada');
                syncUnifiedConversations();
                renderInboxCards();
            });
        });

        // Botón interactivo para cambiar imagen/avatar del chat
        container.querySelectorAll('.btn-change-chat-avatar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                activeCardDropdownPhone = null;
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Chat');
                openChatAvatarModal(phone, name);
            });
        });

        // Botón interactivo para asignar/editar etiquetas del chat
        container.querySelectorAll('.btn-edit-chat-tags').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                activeCardDropdownPhone = null;
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Cliente');
                openChatTagsModal(phone, name);
            });
        });

        // Botón interactivo de Chincheta (Fijar / Desfijar)
        container.querySelectorAll('.btn-pin-chat-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                const isNowPinned = toggleChatPinned(phone);
                activeCardDropdownPhone = null;
                showToast(isNowPinned ? '📌 Conversación fijada arriba' : 'Conversación desfijada');
                syncUnifiedConversations();
                renderInboxCards();
            });
        });

        // Botón interactivo para Activar / Desactivar Bot por contacto
        container.querySelectorAll('.btn-silence-chat-card').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');
                activeCardDropdownPhone = null;
                await toggleBotStatusForContact(phone, name);
            });
        });

        // Botón interactivo para alternar desplegable de más opciones (flotante sobre las tarjetas)
        container.querySelectorAll('.btn-card-more-actions').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const phone = btn.getAttribute('data-phone');
                if (activeCardDropdownPhone === phone) {
                    activeCardDropdownPhone = null;
                } else {
                    activeCardDropdownPhone = phone;
                }
                document.querySelectorAll('.card-actions-dropdown-menu').forEach(m => {
                    const isTarget = m.id === `dropdown-actions-${phone}`;
                    m.style.display = (isTarget && activeCardDropdownPhone === phone) ? 'flex' : 'none';
                });
                document.querySelectorAll('.whatsapp-chat-row').forEach(r => {
                    const rPhone = r.getAttribute('data-phone');
                    if (rPhone === activeCardDropdownPhone) {
                        r.classList.add('dropdown-active');
                    } else {
                        r.classList.remove('dropdown-active');
                    }
                });
            });
        });

        // Botón interactivo para alternar estado Pendiente / Leído
        container.querySelectorAll('.btn-toggle-read-status').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                const targetStatus = btn.getAttribute('data-target-status'); // 'leido' o 'pendiente'
                setManualChatStatus(phone, targetStatus);
                activeCardDropdownPhone = null;
                
                // Si tiene solicitud activa vinculada, actualizar estado de solicitud en backend
                const conv = allUnifiedConversations.find(c => c.telefono === phone);
                if (conv && conv.solicitudId) {
                    const newSolStatus = targetStatus === 'leido' ? 'RESUELTA' : 'PENDIENTE';
                    try {
                        await fetch(`/api/admin/solicitudes/${conv.solicitudId}/estado`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                            body: JSON.stringify({ estado: newSolStatus })
                        });
                        conv.solicitudEstado = newSolStatus;
                    } catch (err) {
                        console.warn("⚠️ No se pudo sincronizar estado de solicitud:", err.message);
                    }
                }

                showToast(targetStatus === 'leido' ? '✅ Chat marcado como Leído' : '⏳ Chat marcado como No Leído');
                renderInboxCards();
            });
        });

        container.querySelectorAll('.btn-delete-chat-card').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                activeCardDropdownPhone = null;
                const phone = btn.getAttribute('data-phone');
                if (!confirm(`⚠️ ¿Estás seguro de que deseas ELIMINAR DEFINITIVAMENTE todo el historial del chat +${phone}? Esta acción no se puede deshacer.`)) return;
                try {
                    const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                    const res = await fetch(`/api/admin/chats/${phone}`, {
                        method: 'DELETE',
                        headers: { 'x-admin-token': currentToken, 'Authorization': `Bearer ${currentToken}` }
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('🗑️ Conversación eliminada definitivamente.');
                        await fetchWhatsAppChats();
                    } else {
                        alert('Error al eliminar conversación: ' + (data.error || 'Desconocido'));
                    }
                } catch (err) {
                    alert('Error al eliminar conversación: ' + err.message);
                }
            });
        });
    }

    // Cerrar menú contextual desplegable de 3 puntitos al hacer clic en cualquier parte fuera de él
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-actions-dropdown-menu') && !e.target.closest('.btn-card-more-actions')) {
            if (activeCardDropdownPhone !== null) {
                activeCardDropdownPhone = null;
                document.querySelectorAll('.card-actions-dropdown-menu').forEach(m => {
                    m.style.display = 'none';
                });
                document.querySelectorAll('.whatsapp-chat-row').forEach(r => {
                    r.classList.remove('dropdown-active');
                });
            }
        }
    });

    // ── MODAL GESTOR DE ETIQUETAS Y MODAL ASIGNAR ETIQUETAS A CHAT ──────────
    const btnManageInboxTags = document.getElementById('btn-manage-inbox-tags');
    const inboxTagsManagerModal = document.getElementById('inbox-tags-manager-modal');
    const closeInboxTagsManagerBtn = document.getElementById('close-inbox-tags-manager-btn');
    const btnCreateTagFromManager = document.getElementById('btn-create-tag-from-manager');
    const inboxTagsManagerList = document.getElementById('inbox-tags-manager-list');

    const chatTagsModal = document.getElementById('chat-tags-modal');
    const chatTagsModalTitle = document.getElementById('chat-tags-modal-title');
    const chatTagsModalSubtitle = document.getElementById('chat-tags-modal-subtitle');
    const chatTagsSelectorGrid = document.getElementById('chat-tags-selector-grid');
    const btnNewTagFromChatModal = document.getElementById('btn-new-tag-from-chat-modal');
    const closeChatTagsModalBtn = document.getElementById('close-chat-tags-modal-btn');
    const saveChatTagsBtn = document.getElementById('save-chat-tags-btn');

    let activeChatTagsPhone = '';
    let selectedChatTagsList = [];

    function openInboxTagsManager() {
        if (!inboxTagsManagerModal) return;
        renderInboxTagsManagerList();
        inboxTagsManagerModal.style.display = 'flex';
    }

    function closeInboxTagsManager() {
        if (inboxTagsManagerModal) inboxTagsManagerModal.style.display = 'none';
    }

    function renderInboxTagsManagerList() {
        if (!inboxTagsManagerList) return;
        const tags = getAllAvailableSilencedTags();

        inboxTagsManagerList.innerHTML = tags.map((tag, idx) => {
            const isCustom = !DEFAULT_SYSTEM_TAGS.some(d => d.id === tag.id);

            return `
                <div class="tag-manager-row-item" draggable="true" data-tag-id="${tag.id}" data-tag-index="${idx}" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(134, 150, 160, 0.15); border-radius: 8px; box-sizing: border-box; cursor: grab; user-select: none; transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;">
                    <div class="tag-manager-row-left" style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                        <span class="tag-drag-handle" style="cursor: grab; color: #64748b; font-size: 1.15rem; padding: 2px 4px; display: inline-flex; align-items: center;" title="Mantén pulsado y arrastra para reordenar">⠿</span>
                        <span class="wa-tag-pill" style="color: ${tag.color || '#38bdf8'}; background: ${tag.bg || 'rgba(56, 189, 248, 0.2)'}; font-size: 0.84rem; padding: 5px 12px; white-space: nowrap; font-weight: 600; border-radius: 6px;">
                            ${tag.emoji ? tag.emoji + ' ' : ''}${tag.name}
                        </span>
                    </div>
                    <div class="tag-manager-row-actions" style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
                        <button class="btn-edit-tag-item" data-tag-id="${tag.id}" data-tag-name="${encodeURIComponent(tag.name)}" data-tag-emoji="${tag.emoji || '🏷️'}" style="background: none; border: none; padding: 4px 6px; font-size: 1.15rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; outline: none; box-shadow: none; opacity: 0.85; transition: transform 0.15s, opacity 0.15s;" title="Editar etiqueta">
                            ✏️
                        </button>
                        ${isCustom ? `
                            <button class="btn-delete-tag-item" data-tag-id="${tag.id}" data-tag-name="${encodeURIComponent(tag.name)}" style="background: none; border: none; padding: 4px 6px; font-size: 1.15rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; outline: none; box-shadow: none; opacity: 0.85; transition: transform 0.15s, opacity 0.15s;" title="Eliminar etiqueta">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // ── Drag & Drop Nativo (Desktop) y Táctil (Móvil) ──
        let draggedItem = null;

        const items = inboxTagsManagerList.querySelectorAll('.tag-manager-row-item');

        items.forEach(item => {
            // Desktop Drag & Drop
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('is-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.getAttribute('data-tag-id'));
            });

            item.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('is-dragging');
                    draggedItem = null;
                }
                items.forEach(it => it.classList.remove('drag-over-top', 'drag-over-bottom'));
                saveAndApplyNewTagsOrder();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!draggedItem || draggedItem === item) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    item.classList.add('drag-over-top');
                    item.classList.remove('drag-over-bottom');
                    inboxTagsManagerList.insertBefore(draggedItem, item);
                } else {
                    item.classList.add('drag-over-bottom');
                    item.classList.remove('drag-over-top');
                    inboxTagsManagerList.insertBefore(draggedItem, item.nextSibling);
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over-top', 'drag-over-bottom');
                saveAndApplyNewTagsOrder();
            });

            // Touch Drag & Drop para dispositivos móviles
            let touchStartY = 0;
            let isTouchDragging = false;
            let longPressTimeout = null;

            item.addEventListener('touchstart', (e) => {
                if (e.target.closest('.btn-edit-tag-item') || e.target.closest('.btn-delete-tag-item')) return;
                const touch = e.touches[0];
                touchStartY = touch.clientY;

                longPressTimeout = setTimeout(() => {
                    isTouchDragging = true;
                    draggedItem = item;
                    item.classList.add('is-dragging');
                    if (navigator.vibrate) navigator.vibrate(40);
                }, 200);
            }, { passive: true });

            item.addEventListener('touchmove', (e) => {
                if (!isTouchDragging || !draggedItem) {
                    if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
                        clearTimeout(longPressTimeout);
                    }
                    return;
                }
                e.preventDefault();
                const touch = e.touches[0];
                const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                const targetRow = targetEl ? targetEl.closest('.tag-manager-row-item') : null;

                if (targetRow && targetRow !== draggedItem && targetRow.parentElement === inboxTagsManagerList) {
                    const rect = targetRow.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (touch.clientY < midY) {
                        inboxTagsManagerList.insertBefore(draggedItem, targetRow);
                    } else {
                        inboxTagsManagerList.insertBefore(draggedItem, targetRow.nextSibling);
                    }
                }
            }, { passive: false });

            item.addEventListener('touchend', () => {
                clearTimeout(longPressTimeout);
                if (isTouchDragging) {
                    isTouchDragging = false;
                    if (draggedItem) {
                        draggedItem.classList.remove('is-dragging');
                        draggedItem = null;
                    }
                    saveAndApplyNewTagsOrder();
                }
            });

            item.addEventListener('touchcancel', () => {
                clearTimeout(longPressTimeout);
                isTouchDragging = false;
                if (draggedItem) {
                    draggedItem.classList.remove('is-dragging');
                    draggedItem = null;
                }
            });
        });

        function saveAndApplyNewTagsOrder() {
            const currentOrder = Array.from(inboxTagsManagerList.querySelectorAll('.tag-manager-row-item'))
                .map(el => el.getAttribute('data-tag-id'))
                .filter(Boolean);

            setCustomTagsOrder(currentOrder);
            renderSilencedFilters();
            renderInboxFilterPills();
            renderInboxCards();
        }

        // Botones de editar y eliminar
        inboxTagsManagerList.querySelectorAll('.btn-edit-tag-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = btn.getAttribute('data-tag-id');
                const tagName = decodeURIComponent(btn.getAttribute('data-tag-name') || '');
                const tagEmoji = btn.getAttribute('data-tag-emoji') || '🏷️';
                const tagObj = tags.find(t => t.id === tagId) || { id: tagId, name: tagName, emoji: tagEmoji };
                openSilencedTagModal(tagObj);
            });
        });

        inboxTagsManagerList.querySelectorAll('.btn-delete-tag-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = btn.getAttribute('data-tag-id');
                const tagName = decodeURIComponent(btn.getAttribute('data-tag-name') || '');
                if (!confirm(`¿Eliminar la etiqueta "${tagName}"? Se desasignará de los chats correspondientes.`)) return;
                
                const custom = getCustomSilencedTags().filter(t => t.id !== tagId && t.name.toLowerCase() !== tagName.toLowerCase());
                localStorage.setItem('casa_julian_custom_silenced_tags', JSON.stringify(custom));
                
                renderInboxTagsManagerList();
                renderSilencedFilters();
                renderInboxFilterPills();
                renderInboxCards();
            });
        });
    }

    // ── MODAL CAMBIAR IMAGEN / AVATAR DE CHAT ──────────────────────────────
    const chatAvatarModal = document.getElementById('chat-avatar-modal');
    const closeChatAvatarModalBtn = document.getElementById('close-chat-avatar-modal-btn');
    const saveChatAvatarBtn = document.getElementById('save-chat-avatar-btn');
    const chatAvatarFileInput = document.getElementById('chat-avatar-file-input');
    const btnSelectChatAvatarFile = document.getElementById('btn-select-chat-avatar-file');
    const btnRemoveChatAvatar = document.getElementById('btn-remove-chat-avatar');
    const chatAvatarPreviewImg = document.getElementById('chat-avatar-preview-img');
    const chatAvatarModalDesc = document.getElementById('chat-avatar-modal-desc');

    const chatAvatarPreviewContainer = document.getElementById('chat-avatar-preview-container');

    let currentAvatarPhone = null;
    let currentAvatarBase64 = null;
    let currentAvatarFileName = null;
    let currentAvatarUrl = null;

    function openChatAvatarModal(phone, name) {
        currentAvatarPhone = getCleanPhoneKey(phone);
        currentAvatarBase64 = null;
        currentAvatarFileName = null;
        
        if (chatAvatarModalDesc) {
            chatAvatarModalDesc.textContent = `Personaliza la foto para "${name || phone}".`;
        }

        const customUrl = (serverInboxSettings.chatAvatars && serverInboxSettings.chatAvatars[currentAvatarPhone])
            || (currentAvatarPhone === 'group_taxi_casa_julian' ? '/admin/taxi_img.png' : '')
            || (currentAvatarPhone === '34664037707' ? '/admin/ander_img.png' : '');

        currentAvatarUrl = customUrl;

        if (chatAvatarPreviewImg) {
            if (customUrl) {
                chatAvatarPreviewImg.src = customUrl;
            } else {
                chatAvatarPreviewImg.src = '/admin/casa_julian_logo_CJ.jpeg';
            }
        }

        if (chatAvatarModal) {
            chatAvatarModal.style.setProperty('display', 'flex', 'important');
        }
    }

    function closeChatAvatarModal() {
        if (chatAvatarModal) chatAvatarModal.style.display = 'none';
        currentAvatarPhone = null;
        currentAvatarBase64 = null;
        currentAvatarFileName = null;
        currentAvatarUrl = null;
        if (chatAvatarFileInput) chatAvatarFileInput.value = '';
    }

    if (closeChatAvatarModalBtn) {
        closeChatAvatarModalBtn.addEventListener('click', closeChatAvatarModal);
    }
    if (chatAvatarModal) {
        chatAvatarModal.addEventListener('click', (e) => {
            if (e.target === chatAvatarModal) closeChatAvatarModal();
        });
    }

    if (chatAvatarPreviewContainer && chatAvatarFileInput) {
        chatAvatarPreviewContainer.addEventListener('click', () => {
            chatAvatarFileInput.click();
        });
    }

    if (btnSelectChatAvatarFile && chatAvatarFileInput) {
        btnSelectChatAvatarFile.addEventListener('click', () => {
            chatAvatarFileInput.click();
        });
        chatAvatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            currentAvatarFileName = file.name;
            const reader = new FileReader();
            reader.onload = (re) => {
                currentAvatarBase64 = re.target.result;
                currentAvatarUrl = currentAvatarBase64;
                if (chatAvatarPreviewImg) chatAvatarPreviewImg.src = currentAvatarBase64;
            };
            reader.readAsDataURL(file);
        });
    }

    if (btnRemoveChatAvatar) {
        btnRemoveChatAvatar.addEventListener('click', () => {
            currentAvatarBase64 = null;
            currentAvatarFileName = null;
            currentAvatarUrl = null;
            if (chatAvatarPreviewImg) chatAvatarPreviewImg.src = '/admin/casa_julian_logo_CJ.jpeg';
            showToast('ℹ️ Foto eliminada. Pulsa Guardar para aplicar por defecto.');
        });
    }

    if (saveChatAvatarBtn) {
        saveChatAvatarBtn.addEventListener('click', async () => {
            if (!currentAvatarPhone) return;
            saveChatAvatarBtn.disabled = true;
            saveChatAvatarBtn.textContent = 'Guardando...';
            try {
                const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                const finalUrl = currentAvatarUrl || '';
                
                // Guardar en localStorage de inmediato
                let localAvatars = {};
                try { localAvatars = JSON.parse(localStorage.getItem('casa_julian_chat_avatars_map') || '{}'); } catch(e) {}
                if (finalUrl) {
                    localAvatars[currentAvatarPhone] = finalUrl;
                } else {
                    delete localAvatars[currentAvatarPhone];
                }
                localStorage.setItem('casa_julian_chat_avatars_map', JSON.stringify(localAvatars));
                
                if (!serverInboxSettings.chatAvatars) serverInboxSettings.chatAvatars = {};
                if (finalUrl) {
                    serverInboxSettings.chatAvatars[currentAvatarPhone] = finalUrl;
                } else {
                    delete serverInboxSettings.chatAvatars[currentAvatarPhone];
                }

                showToast('✅ Imagen de perfil guardada con éxito.');
                closeChatAvatarModal();
                renderInboxCards();
                if (activeConversationPhone === currentAvatarPhone && typeof renderConversationView === 'function') {
                    renderConversationView(currentAvatarPhone);
                }

                // Sincronizar en segundo plano con el servidor
                fetch('/api/admin/chat-avatar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': currentToken
                    },
                    body: JSON.stringify({
                        phone: currentAvatarPhone,
                        avatarUrl: currentAvatarUrl,
                        imageBase64: currentAvatarBase64,
                        fileName: currentAvatarFileName
                    })
                }).catch(err => console.warn('Sync avatar warning:', err.message));
                
            } catch (err) {
                console.error("Error guardando avatar:", err);
                showToast('✅ Imagen de perfil aplicada.');
                closeChatAvatarModal();
                renderInboxCards();
            } finally {
                saveChatAvatarBtn.disabled = false;
                saveChatAvatarBtn.textContent = '💾 Guardar Imagen';
            }
        });
    }

    function openChatTagsModal(phone, name) {
        if (!chatTagsModal) return;
        activeChatTagsPhone = getCleanPhoneKey(phone);
        const displayName = name || (activeChatTagsPhone.startsWith('group_') ? 'Taxi Casa Julián' : `+${activeChatTagsPhone}`);
        if (chatTagsModalTitle) chatTagsModalTitle.textContent = `🏷️ Etiquetas del Chat`;
        if (chatTagsModalSubtitle) chatTagsModalSubtitle.textContent = `Asigna etiquetas para ${displayName}`;

        const currentTags = getChatTags(activeChatTagsPhone);
        selectedChatTagsList = [...currentTags];

        renderChatTagsModalGrid();
        chatTagsModal.style.display = 'flex';
    }

    function closeChatTagsModal() {
        if (chatTagsModal) chatTagsModal.style.display = 'none';
        activeChatTagsPhone = '';
    }

    function renderChatTagsModalGrid() {
        if (!chatTagsSelectorGrid) return;
        const available = getAllAvailableSilencedTags().filter(tag => {
            const lowId = (tag.id || '').toLowerCase();
            const lowName = (tag.name || '').toLowerCase();
            if (['grupo', 'otro', 'otros'].includes(lowId) || ['grupo', 'otro', 'otros'].includes(lowName)) {
                return false;
            }
            return true;
        });

        chatTagsSelectorGrid.innerHTML = available.map(tag => {
            const isSelected = selectedChatTagsList.some(t => t.toLowerCase() === tag.id || t.toLowerCase() === tag.name.toLowerCase());
            return `
                <div class="silenced-tag-selectable-chip ${isSelected ? 'selected' : ''}" data-tag-name="${tag.name}">
                    <span class="tag-check-icon">${isSelected ? '✓' : '+'}</span>
                    <span>${tag.emoji || '🏷️'} ${tag.name}</span>
                </div>
            `;
        }).join('');

        chatTagsSelectorGrid.querySelectorAll('.silenced-tag-selectable-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tagName = chip.getAttribute('data-tag-name');
                const idx = selectedChatTagsList.findIndex(t => t.toLowerCase() === tagName.toLowerCase());
                if (idx > -1) {
                    selectedChatTagsList.splice(idx, 1);
                } else {
                    selectedChatTagsList.push(tagName);
                }
                renderChatTagsModalGrid();
            });
        });
    }

    const headerBtnManageTags = document.getElementById('header-btn-manage-inbox-tags');
    if (headerBtnManageTags) headerBtnManageTags.addEventListener('click', openInboxTagsManager);
    if (btnManageInboxTags) btnManageInboxTags.addEventListener('click', openInboxTagsManager);
    if (closeInboxTagsManagerBtn) closeInboxTagsManagerBtn.addEventListener('click', closeInboxTagsManager);
    if (btnCreateTagFromManager) btnCreateTagFromManager.addEventListener('click', () => {
        openSilencedTagModal();
    });

    if (closeChatTagsModalBtn) closeChatTagsModalBtn.addEventListener('click', closeChatTagsModal);
    if (btnNewTagFromChatModal) btnNewTagFromChatModal.addEventListener('click', () => {
        openSilencedTagModal();
    });

    if (saveChatTagsBtn) {
        saveChatTagsBtn.addEventListener('click', () => {
            if (activeChatTagsPhone) {
                setChatTags(activeChatTagsPhone, selectedChatTagsList);
                showToast(`✅ Etiquetas actualizadas para +${activeChatTagsPhone}`);
                closeChatTagsModal();
                syncUnifiedConversations();
                renderInboxCards();
            }
        });
    }

    // ── Lógica del Dropdown ⋮ del Panel de Chat Activo ─────────────────────────
    (function setupPaneMoreActions() {
        const paneMoreBtn = document.getElementById('pane-more-actions-btn');
        const paneMoreDropdown = document.getElementById('pane-more-actions-dropdown');
        if (!paneMoreBtn || !paneMoreDropdown) return;

        // Toggle al pulsar el botón ⋮ (sin document listener para evitar cierre accidental en mobile)
        function closePaneDropdown() {
            paneMoreDropdown.style.display = 'none';
        }

        function openPaneDropdown() {
            paneMoreDropdown.style.display = 'block';
        }

        paneMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const isOpen = paneMoreDropdown.style.display === 'block';
            if (isOpen) {
                closePaneDropdown();
            } else {
                openPaneDropdown();
            }
        });

        // Cerrar al pulsar Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closePaneDropdown();
        });

        // Hover styles para los items
        paneMoreDropdown.querySelectorAll('.pane-dropdown-action-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.07)'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
        });

        // Acción: Etiquetas del chat
        const tagsBtn = document.getElementById('pane-action-tags');
        if (tagsBtn) {
            tagsBtn.addEventListener('click', () => {
                paneMoreDropdown.style.display = 'none';
                if (!activeConversationPhone) return;
                const name = activeReplySolicitud ? getClientDisplayName(activeReplySolicitud.nombreCliente, activeConversationPhone) : activeConversationPhone;
                openChatTagsModal(activeConversationPhone, name);
            });
        }

        // Acción: Fijar arriba
        const pinBtn = document.getElementById('pane-action-pin');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => {
                paneMoreDropdown.style.display = 'none';
                if (!activeConversationPhone) return;
                const isNowPinned = toggleChatPinned(activeConversationPhone);
                const pinLabel = document.getElementById('pane-action-pin-label');
                if (pinLabel) pinLabel.textContent = isNowPinned ? 'Desfijar' : 'Fijar arriba';
                showToast(isNowPinned ? '📌 Conversación fijada arriba' : 'Conversación desfijada');
                syncUnifiedConversations();
                renderInboxCards();
            });
        }

        // Acción: Marcar No Leído / Leído
        const toggleReadBtn = document.getElementById('pane-action-toggle-read');
        if (toggleReadBtn) {
            toggleReadBtn.addEventListener('click', async () => {
                paneMoreDropdown.style.display = 'none';
                if (!activeConversationPhone) return;
                const readLabel = document.getElementById('pane-action-read-label');
                const conv = allUnifiedConversations.find(c => c.telefono === activeConversationPhone);
                const manualMap = getManualChatStatusMap();
                const currentStatus = manualMap[activeConversationPhone] || 'leido';
                const targetStatus = (currentStatus === 'leido') ? 'pendiente' : 'leido';
                setManualChatStatus(activeConversationPhone, targetStatus);
                if (readLabel) readLabel.textContent = targetStatus === 'leido' ? 'Marcar No Leído' : 'Marcar Leído';
                if (conv && conv.solicitudId) {
                    try {
                        await fetch(`/api/admin/solicitudes/${conv.solicitudId}/estado`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                            body: JSON.stringify({ estado: targetStatus === 'leido' ? 'RESUELTA' : 'PENDIENTE' })
                        });
                        conv.solicitudEstado = targetStatus === 'leido' ? 'RESUELTA' : 'PENDIENTE';
                    } catch (err) { console.warn('No se pudo sincronizar estado:', err.message); }
                }
                showToast(targetStatus === 'leido' ? '✅ Marcado como Leído' : '⏳ Marcado como No Leído');
                renderInboxCards();
            });
        }

        // Acción: Activar / Desactivar Bot (Silenciar)
        const silenceBtn = document.getElementById('pane-action-silence');
        if (silenceBtn) {
            silenceBtn.addEventListener('click', async () => {
                paneMoreDropdown.style.display = 'none';
                if (!activeConversationPhone) return;
                const name = activeReplySolicitud ? getClientDisplayName(activeReplySolicitud.nombreCliente, activeConversationPhone) : activeConversationPhone;
                await toggleBotStatusForContact(activeConversationPhone, name);
            });
        }



        // Acción: Eliminar chat
        const deleteBtn = document.getElementById('pane-action-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                paneMoreDropdown.style.display = 'none';
                if (!activeConversationPhone) return;
                if (!confirm(`⚠️ ¿Eliminar DEFINITIVAMENTE todo el historial del chat +${activeConversationPhone}? Esta acción no se puede deshacer.`)) return;
                try {
                    const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                    const res = await fetch(`/api/admin/chats/${activeConversationPhone}`, {
                        method: 'DELETE',
                        headers: { 'x-admin-token': currentToken, 'Authorization': `Bearer ${currentToken}` }
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('🗑️ Conversación eliminada definitivamente.');
                        // Cerrar panel activo y volver a la lista
                        const activePanel = document.getElementById('wa-active-chat-panel');
                        const emptyState = document.getElementById('wa-empty-state');
                        if (activePanel) activePanel.style.display = 'none';
                        if (emptyState) emptyState.style.display = 'flex';
                        activeConversationPhone = '';
                        activeReplySolicitud = null;
                        await fetchWhatsAppChats();
                    } else {
                        alert('Error al eliminar: ' + (data.error || 'Desconocido'));
                    }
                } catch (err) { alert('Error al eliminar: ' + err.message); }
            });
        }
    })();

    // ── Filtros por categoría de Buzón Recepción (Píldoras estilo WhatsApp) ───
    // ── Píldoras de Filtro con Selección Múltiple (Estilo WhatsApp Business) ───
    document.querySelectorAll('.wa-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const cat = pill.getAttribute('data-inbox-cat');
            const status = pill.getAttribute('data-inbox-status');
            const topic = pill.getAttribute('data-inbox-topic');

            const allPill = document.querySelector('.wa-pill[data-inbox-cat="all"], .wa-pill[data-inbox-status="all"]');

            // Si se pulsa "Todos", resetear todos los filtros
            if ((cat === 'all' && status === 'all') || (!cat && !status && !topic) || (cat === 'all' && !status && !topic)) {
                activeInboxStatusFilters.clear();
                activeInboxCatFilters.clear();
                activeInboxTopicFilters.clear();
                document.querySelectorAll('.wa-pill').forEach(p => p.classList.remove('active'));
                if (allPill) allPill.classList.add('active');
                renderInboxCards();
                return;
            }

            // Desmarcar "Todos" al activar un filtro específico
            if (allPill) allPill.classList.remove('active');

            if (status && status !== 'all') {
                if (activeInboxStatusFilters.has(status)) {
                    activeInboxStatusFilters.delete(status);
                    pill.classList.remove('active');
                } else {
                    activeInboxStatusFilters.add(status);
                    pill.classList.add('active');
                }
            }

            if (cat && cat !== 'all') {
                if (activeInboxCatFilters.has(cat)) {
                    activeInboxCatFilters.delete(cat);
                    pill.classList.remove('active');
                } else {
                    activeInboxCatFilters.add(cat);
                    pill.classList.add('active');
                }
            }

            if (topic && topic !== 'all') {
                if (activeInboxTopicFilters.has(topic)) {
                    activeInboxTopicFilters.delete(topic);
                    pill.classList.remove('active');
                } else {
                    activeInboxTopicFilters.add(topic);
                    pill.classList.add('active');
                }
            }

            // Si no queda ningún filtro activo, reactivar "Todos"
            if (activeInboxStatusFilters.size === 0 && activeInboxCatFilters.size === 0 && activeInboxTopicFilters.size === 0) {
                if (allPill) allPill.classList.add('active');
            }

            renderInboxCards();
        });
    });

    // ── Buscador de Buzón estilo WhatsApp Business (Toggle con botón Lupa 🔎) ───
    const searchContainer = document.getElementById('wa-search-container');
    const toggleSearchBtn = document.getElementById('btn-toggle-inbox-search');
    const headerToggleSearchBtn = document.getElementById('header-btn-toggle-inbox-search');
    const clearSearchBtn = document.getElementById('btn-clear-inbox-search');

    function toggleInboxSearch(e) {
        if (e) e.stopPropagation();
        if (!searchContainer || !searchInboxInput) return;
        const isVisible = (searchContainer.style.display !== 'none');
        if (isVisible) {
            if (!searchInboxInput.value.trim()) {
                searchContainer.style.display = 'none';
                if (toggleSearchBtn) toggleSearchBtn.classList.remove('active');
                if (headerToggleSearchBtn) headerToggleSearchBtn.classList.remove('active');
            } else {
                searchInboxInput.focus();
            }
        } else {
            searchContainer.style.display = 'flex';
            if (toggleSearchBtn) toggleSearchBtn.classList.add('active');
            if (headerToggleSearchBtn) headerToggleSearchBtn.classList.add('active');
            searchInboxInput.focus();
        }
    }

    if (headerToggleSearchBtn) headerToggleSearchBtn.addEventListener('click', toggleInboxSearch);
    if (toggleSearchBtn) toggleSearchBtn.addEventListener('click', toggleInboxSearch);

    if (clearSearchBtn && searchInboxInput && searchContainer) {
        clearSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchInboxInput.value = '';
            currentInboxSearch = '';
            clearSearchBtn.style.display = 'none';
            searchContainer.style.display = 'none';
            if (toggleSearchBtn) toggleSearchBtn.classList.remove('active');
            if (headerToggleSearchBtn) headerToggleSearchBtn.classList.remove('active');
            renderInboxCards();
        });
    }

    if (searchContainer && searchInboxInput) {
        searchContainer.addEventListener('click', () => {
            searchInboxInput.focus();
        });
    }

    if (searchInboxInput) {
        const handleSearchInput = (e) => {
            currentInboxSearch = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.style.display = currentInboxSearch.length > 0 ? 'inline-flex' : 'none';
            }
            if (currentInboxSearch.length > 0) {
                if (toggleSearchBtn) toggleSearchBtn.classList.add('active');
                if (headerToggleSearchBtn) headerToggleSearchBtn.classList.add('active');
            }
            renderInboxCards();
        };

        searchInboxInput.addEventListener('input', handleSearchInput);
        searchInboxInput.addEventListener('keyup', handleSearchInput);
        searchInboxInput.addEventListener('change', handleSearchInput);
    }

    // Formateador de texto estilo WhatsApp (*negrita*, _cursiva_, ~tachado~, etc.)
    function formatWhatsAppText(text) {
        if (!text) return '';
        let formatted = String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Bloques de código ```code```
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; font-family: monospace; margin: 4px 0;">$1</pre>');
        // Negrita *texto*
        formatted = formatted.replace(/(^|[^\w])\*([^\*]+?)\*([^\w]|$)/g, '$1<strong>$2</strong>$3');
        // Cursiva _texto_
        formatted = formatted.replace(/(^|[^\w])_([^_]+?)_([^\w]|$)/g, '$1<em>$2</em>$3');
        // Tachado ~texto~
        formatted = formatted.replace(/(^|[^\w])~([^~]+?)~([^\w]|$)/g, '$1<del>$2</del>$3');
        // Monospace en línea `texto`
        formatted = formatted.replace(/`([^`]+?)`/g, '<code style="background: rgba(0,0,0,0.25); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
        // Saltos de línea
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    // Renderizar Resumen de Solicitud en Tabla Elegante y Profesional
    function renderSummaryTable(datosDetallados) {
        if (!datosDetallados) {
            return '<div style="color: #94a3b8; font-size: 0.84rem; padding: 12px;">Sin detalles de solicitud.</div>';
        }

        const lines = String(datosDetallados).split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const rawRows = [];

        lines.forEach(line => {
            let cleanLine = line.trim();
            let emoji = '📌';
            
            // Detectar emoji REAL al inicio (excluyendo números 0-9, #, * que no son emojis reales)
            const emojiMatch = cleanLine.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])(?:\uFE0F|\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}])*\s*/u);
            if (emojiMatch && !/^[0-9#*]/.test(emojiMatch[1])) {
                emoji = emojiMatch[0].trim();
                cleanLine = cleanLine.substring(emojiMatch[0].length).trim();
            }

            // Buscar dos puntos que dividen el nombre del campo del valor
            const colonIdx = cleanLine.indexOf(':');
            if (colonIdx > -1) {
                let rawLabel = cleanLine.substring(0, colonIdx);
                let rawVal = cleanLine.substring(colonIdx + 1);

                let label = rawLabel.replace(/[\*\_\~]/g, '').trim();
                let val = rawVal.replace(/[\*\_\~]/g, '').trim();
                val = val.replace(/^[\.\-\•\*\s]+/, '').trim();

                rawRows.push({ icon: emoji, label, val });
            } else {
                let itemText = cleanLine.replace(/[\*\_\~]/g, '').trim();
                // Limpiar prefijo numérico de lista (ej: "1.", "2)", "1 -", "1: ") o viñetas
                const listMatch = itemText.match(/^(\d+)[\.\)\-\:\s]+\s*(.*)$/);
                let numPrefix = '';
                if (listMatch) {
                    numPrefix = listMatch[1];
                    itemText = listMatch[2].trim();
                } else {
                    itemText = itemText.replace(/^[•\-\*\.]\s*/, '').trim();
                }
                // Quitar cualquier punto o viñeta residual al inicio de la frase
                itemText = itemText.replace(/^[\.\-\•\*\s]+/, '').trim();

                // Detectar contexto de consulta
                const lastRow = rawRows.length > 0 ? rawRows[rawRows.length - 1] : null;
                const isConsultaContext = lastRow && (lastRow.label.toLowerCase().includes('consulta') || lastRow.icon === '💬');
                
                const itemLabel = isConsultaContext 
                    ? (numPrefix ? ('Consulta ' + numPrefix) : 'Consulta')
                    : (numPrefix ? ('Detalle ' + numPrefix) : 'Detalle');

                const itemIcon = (emoji !== '📌') ? emoji : (isConsultaContext ? '💬' : '📌');

                rawRows.push({ icon: itemIcon, label: itemLabel, val: itemText, isItem: true });
            }
        });

        // Limpiar encabezados que quedaron vacíos si le siguen ítems detallados
        const rows = [];
        for (let i = 0; i < rawRows.length; i++) {
            const r = rawRows[i];
            if (r.val === '') {
                const nextIsItem = rawRows[i + 1] && rawRows[i + 1].isItem;
                if (!nextIsItem) {
                    rows.push(r);
                }
            } else {
                rows.push(r);
            }
        }

        if (rows.length === 0) {
            return `<div style="color: #e2e8f0; font-size: 0.85rem; padding: 12px;">${formatWhatsAppText(datosDetallados)}</div>`;
        }

        let html = `<div class="request-summary-table">`;
        rows.forEach(r => {
            const labelLower = r.label.toLowerCase();
            let valHtml = `<span style="color: #ffffff; font-weight: 500;">${r.val}</span>`;

            if (labelLower.includes('tarjeta') || labelLower.includes('regalo') || labelLower.includes('código') || labelLower.includes('codigo')) {
                valHtml = `<span class="badge-card-code" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.15);">🎁 ${r.val}</span>`;
            } else if (labelLower.includes('alergia') || labelLower.includes('restricci')) {
                const isAllergy = r.val && !['ninguna', 'no', 'ninguno', '-', 'sin alergias'].includes(r.val.toLowerCase().trim());
                valHtml = isAllergy 
                    ? `<span class="badge-allergy" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);">⚠️ ${r.val}</span>` 
                    : `<span style="color: #94a3b8;">${r.val || 'Ninguna'}</span>`;
            } else if (labelLower.includes('estado')) {
                valHtml = `<span class="badge-status-pill" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.15);">${r.val}</span>`;
            } else if (labelLower.includes('comensal') || labelLower.includes('personas') || labelLower.includes('adultos') || labelLower.includes('niños') || labelLower.includes('ninos')) {
                valHtml = `<span style="font-weight: 700; color: #ffffff;">${r.val}</span>`;
            } else if (labelLower.includes('servicio')) {
                valHtml = `<span style="color: #ffffff; font-weight: 600;">${r.val}</span>`;
            } else if (labelLower.includes('fecha')) {
                valHtml = `<span style="color: #ffffff; font-weight: 600;">${r.val}</span>`;
            } else if (labelLower.includes('hora')) {
                valHtml = `<span style="color: #ffffff; font-weight: 600;">${r.val}</span>`;
            } else if (labelLower.includes('whatsapp') || labelLower.includes('teléfono') || labelLower.includes('telefono')) {
                valHtml = `<span style="font-family: monospace; color: #f1f5f9; font-weight: 600; white-space: nowrap; display: inline-block;">+${r.val}</span>`;
            }

            html += `
                <div class="summary-table-row">
                    <div class="summary-label-col">
                        <span class="summary-row-icon">${r.icon}</span>
                        <span class="summary-row-label">${r.label}:</span>
                    </div>
                    <div class="summary-val-col">${valHtml}</div>
                </div>
            `;
        });
        html += `</div>`;
        return html;
    }

    // Variables de control de polling en tiempo real para el modal y panel de chat
    let activeReplyChatPollInterval = null;
    let activePaneChatPollInterval = null;
    let activeConversationPhone = null;
    let currentChatPhone = null;
    let lastChatRenderedSig = '';

    function stopChatPolling() {
        if (activeReplyChatPollInterval) {
            clearInterval(activeReplyChatPollInterval);
            activeReplyChatPollInterval = null;
        }
        if (activePaneChatPollInterval) {
            clearInterval(activePaneChatPollInterval);
            activePaneChatPollInterval = null;
        }
        currentChatPhone = null;
        lastChatRenderedSig = '';
    }

    // Helper: Obtener y renderizar historial de mensajes en tiempo real (tanto en modal como en panel de 2 columnas)
    async function fetchAndRenderChatThread(cleanPhoneStr, sol, forceRender = false) {
        const containers = [
            document.getElementById('reply-chat-thread'),
            document.getElementById('pane-chat-thread')
        ].filter(Boolean);
        const msgCountEl = document.getElementById('thread-msg-count');
        if (containers.length === 0 || !cleanPhoneStr) return;

        try {
            const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch(`/api/admin/solicitudes/history/${cleanPhoneStr}?_t=${Date.now()}`, {
                headers: { 
                    'x-admin-token': currentToken,
                    'Authorization': `Bearer ${currentToken}`,
                    'Cache-Control': 'no-cache'
                }
            });
            let msgList = [];
            if (res.ok) {
                const data = await res.json();
                const history = data.history || [];
                if (history.length > 0) {
                    msgList = history.map(h => ({
                        id: h.id,
                        emisor: (h.emisor === 'cliente' || h.emisor === 'user') ? 'cliente' : 'admin',
                        tipo: h.tipo || 'text',
                        texto: h.texto || h.mensaje || '',
                        fecha: h.created_at || h.fecha
                    }));
                }
            }

            if (msgList.length === 0 && sol && Array.isArray(sol.mensajes) && sol.mensajes.length > 0) {
                msgList = sol.mensajes;
            } else if (msgList.length === 0 && sol && sol.datosDetallados) {
                msgList = [{ emisor: 'cliente', texto: sol.datosDetallados, fecha: sol.created_at }];
            }

            // Guardar en caché de memoria para cambio instantáneo entre chats
            chatHistoryCache.set(cleanPhoneStr, msgList);

            const lastMsg = msgList[msgList.length - 1];
            const currentSig = `${msgList.length}_${lastMsg ? (lastMsg.id || lastMsg.fecha || lastMsg.texto) : ''}`;

            if (!forceRender && currentSig === lastChatRenderedSig) {
                return;
            }
            lastChatRenderedSig = currentSig;

            if (msgCountEl) {
                msgCountEl.textContent = `${msgList.length} ${msgList.length === 1 ? 'mensaje' : 'mensajes'}`;
            }

            containers.forEach(threadContainer => {
                if (msgList.length === 0) {
                    threadContainer.innerHTML = `
                        <div style="text-align: center; color: #8696a0; padding: 40px 20px; font-size: 0.88rem;">
                            <div style="font-size: 2rem; margin-bottom: 8px;">💬</div>
                            <strong style="color: #e9edef; display: block; margin-bottom: 4px;">Conversación iniciada</strong>
                            <span>Escribe un mensaje de WhatsApp a continuación para chatear con el cliente.</span>
                        </div>
                    `;
                    return;
                }

                const isNearBottom = (threadContainer.scrollHeight - threadContainer.scrollTop - threadContainer.clientHeight) < 180;

                threadContainer.innerHTML = '';
                msgList.forEach(m => {
                    const isClient = m.emisor === 'cliente';
                    const timeStr = m.fecha ? new Date(m.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
                    const formattedBody = formatWhatsAppText(m.texto);
                    
                    const bubble = document.createElement('div');
                    bubble.style.cssText = `
                        max-width: 78%;
                        align-self: ${isClient ? 'flex-start' : 'flex-end'};
                        background: ${isClient ? '#202c33' : '#005c4b'};
                        color: #e9edef;
                        padding: 9px 13px;
                        border-radius: ${isClient ? '0 12px 12px 12px' : '12px 0 12px 12px'};
                        font-size: 0.88rem;
                        line-height: 1.45;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.25);
                        word-break: break-word;
                        border: 1px solid ${isClient ? 'rgba(255,255,255,0.06)' : 'rgba(37, 211, 102, 0.2)'};
                        margin-bottom: 4px;
                    `;

                    let metaBadge = '';
                    if (m.tipo === 'interactive' || m.tipo === 'button' || m.tipo === 'list') {
                        metaBadge = `<span style="background: rgba(139, 92, 246, 0.25); color: #c4b5fd; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">👆 Opción seleccionada</span>`;
                    }

                    bubble.innerHTML = `
                        <div style="font-size: 0.74rem; font-weight: 700; color: ${isClient ? '#53bdeb' : '#25d366'}; margin-bottom: 3px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <span style="display: flex; align-items: center; gap: 5px;">
                                ${isClient ? '👤 ' + (sol.nombreCliente || 'Cliente') : '<img src="/admin/casa_julian_logo_CJ.jpeg" alt="Logo" style="width: 17px; height: 17px; border-radius: 50%; object-fit: cover; border: none; vertical-align: middle; display: inline-block;"> Recepción Casa Julián'}
                            </span>
                            ${metaBadge}
                        </div>
                        <div>${formattedBody}</div>
                        <div style="text-align: right; font-size: 0.68rem; color: #8696a0; margin-top: 4px; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                            <span>${timeStr}</span>
                            ${!isClient ? '<span style="color: #53bdeb; font-size: 0.75rem; font-weight: bold;">✓✓</span>' : ''}
                        </div>
                    `;
                    threadContainer.appendChild(bubble);
                });

                if (forceRender || isNearBottom) {
                    threadContainer.scrollTop = threadContainer.scrollHeight;
                    setTimeout(() => { threadContainer.scrollTop = threadContainer.scrollHeight; }, 60);
                    setTimeout(() => { threadContainer.scrollTop = threadContainer.scrollHeight; }, 200);
                }
            });
        } catch (e) {
            console.warn("⚠️ Error obteniendo historial del chat:", e);
        }
    }

    // Seleccionar Conversación en Interfaz 2 Columnas Estilo WhatsApp Web
    async function selectConversation(solOrPhone, name = '', prefilledText = '') {
        let sol = null;
        let cleanPhoneStr = '';

        if (solOrPhone && typeof solOrPhone === 'object' && solOrPhone.id) {
            sol = solOrPhone;
            const raw = (sol.telefonoCliente || sol.telefonoReserva || sol.telefono || '').toString();
            cleanPhoneStr = raw.startsWith('group_') ? raw : raw.replace(/\D/g, '');
        } else {
            const raw = (solOrPhone || '').toString();
            cleanPhoneStr = raw.startsWith('group_') ? raw : raw.replace(/\D/g, '');
            sol = allSolicitudes.find(s => {
                const sTel = (s.telefonoCliente || s.telefonoReserva || '').toString();
                return (sTel.startsWith('group_') ? sTel : sTel.replace(/\D/g, '')) === cleanPhoneStr;
            });
            if (!sol) {
                const conv = allUnifiedConversations.find(c => c.telefono === cleanPhoneStr);
                const contactName = name || (conv ? conv.nombreCliente : getClientDisplayName('', cleanPhoneStr));
                sol = {
                    id: `chat_${cleanPhoneStr}`,
                    telefonoCliente: cleanPhoneStr,
                    nombreCliente: contactName,
                    categoria: conv ? conv.categoria : (cleanPhoneStr === 'group_taxi_casa_julian' ? 'taxi' : 'cliente'),
                    categoriaLabel: cleanPhoneStr === 'group_taxi_casa_julian' ? '🚕 Grupo Taxi Casa Julián' : '💬 Chat WhatsApp',
                    etiquetas: conv ? conv.etiquetas : (cleanPhoneStr === 'group_taxi_casa_julian' ? ['TAXIS', 'GRUPO'] : []),
                    datosDetallados: null,
                    enAtencionHumana: false,
                    estado: 'PENDIENTE',
                    mensajes: []
                };
            }
        }

        activeConversationPhone = cleanPhoneStr;
        activeReplySolicitud = sol;

        // Limpiar estado de no leído para esta conversación
        if (sol.id) unreadSolicitudIds.delete(sol.id);
        if (cleanPhoneStr) setManualChatStatus(cleanPhoneStr, 'leido');
        if (unreadSolicitudIds.size === 0) {
            stopTitleFlash();
        }

        // Resaltar elemento seleccionado en la columna izquierda y eliminar de inmediato el badge
        const container = document.getElementById('inbox-cards-container');
        if (container) {
            container.querySelectorAll('.whatsapp-chat-row').forEach(row => {
                const rowPhone = row.getAttribute('data-phone');
                if (rowPhone === cleanPhoneStr) {
                    row.classList.add('is-selected');
                    row.classList.remove('is-unread');
                    const unreadBadge = row.querySelector('.wa-unread-badge');
                    if (unreadBadge) unreadBadge.remove();
                    const timeEl = row.querySelector('.wa-chat-time');
                    if (timeEl) timeEl.classList.remove('wa-time-unread');
                } else {
                    row.classList.remove('is-selected');
                }
            });
        }
        updateHeaderAndMenuBadges();

        const emptyState = document.getElementById('wa-empty-state');
        const activePanel = document.getElementById('wa-active-chat-panel');
        const webContainer = document.querySelector('.wa-web-container');

        if (emptyState) emptyState.style.display = 'none';
        if (activePanel) activePanel.style.display = 'flex';
        if (webContainer) webContainer.classList.add('mobile-chat-open');

        const isGroup = cleanPhoneStr.startsWith('group_') || (sol && sol.isGroup);
        const isTaxiGroup = cleanPhoneStr === 'group_taxi_casa_julian';
        const groups = (serverInboxSettings && serverInboxSettings.customGroups) || {};
        const customGrp = groups[cleanPhoneStr] || (isTaxiGroup ? DEFAULT_TAXI_GROUP : null);
        const clientDisplayName = isTaxiGroup ? 'Taxi Casa Julián' : (customGrp ? customGrp.nombre : getClientDisplayName(sol.nombreCliente, cleanPhoneStr));

        // Header del panel derecho
        const nameEl = document.getElementById('pane-chat-client-name');
        const phoneEl = document.getElementById('pane-chat-phone');
        const avatarEl = document.getElementById('pane-chat-avatar');
        const btnCall = document.getElementById('pane-btn-call-phone');
        const btnWa = document.getElementById('pane-btn-open-wa');
        const groupMembersBadge = document.getElementById('pane-group-members-badge');
        const groupMembersCount = document.getElementById('pane-group-members-count');
        const catBadgeEl = document.getElementById('pane-chat-category-badge');
        const handoverStatusEl = document.getElementById('pane-chat-handover-status');
        const btnToggleHuman = document.getElementById('pane-btn-toggle-human');
        const btnConclude = document.getElementById('pane-btn-conclude');
        const paneSolIdInput = document.getElementById('pane-reply-solicitud-id');

        if (nameEl) nameEl.textContent = clientDisplayName;
        
        if (isGroup) {
            const partList = (customGrp && Array.isArray(customGrp.participants)) ? customGrp.participants : (sol.participants || []);
            const memberCount = partList.length;
            if (groupMembersBadge) {
                groupMembersBadge.style.display = 'inline-flex';
                if (groupMembersCount) groupMembersCount.textContent = memberCount;
            }
            if (phoneEl) {
                if (isTaxiGroup) {
                    phoneEl.innerHTML = `👥 Grupo (3 Taxis + Restaurante) • 🚕 Iguaran, Tolosa, Lexus`;
                } else {
                    phoneEl.innerHTML = `👥 Grupo (${memberCount} contactos) • ℹ️ Ver miembros`;
                }
            }
        } else {
            if (groupMembersBadge) groupMembersBadge.style.display = 'none';
            if (phoneEl) phoneEl.textContent = `📞 WhatsApp: ${formatPhoneWithPrefix(cleanPhoneStr)}`;
        }

        if (btnCall) {
            btnCall.style.display = isGroup ? 'none' : 'inline-flex';
            btnCall.href = cleanPhoneStr ? `tel:+${cleanPhoneStr}` : '#';
        }
        if (btnWa) {
            btnWa.style.display = isGroup ? 'none' : 'inline-flex';
            btnWa.href = cleanPhoneStr ? `https://wa.me/${cleanPhoneStr}` : '#';
        }
        if (paneSolIdInput) paneSolIdInput.value = sol.id || `chat_${cleanPhoneStr}`;

        // Avatar dinámico
        if (avatarEl) {
            avatarEl.style.overflow = 'hidden';
            const lower = clientDisplayName.toLowerCase();
            if (customGrp && customGrp.avatar) {
                if (customGrp.avatar.startsWith('/') || customGrp.avatar.startsWith('http') || customGrp.avatar.startsWith('data:')) {
                    avatarEl.innerHTML = `<img src="${customGrp.avatar}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span>👥</span>'">`;
                } else {
                    avatarEl.innerHTML = `<span style="font-size: 1.4rem;">${customGrp.avatar}</span>`;
                }
                avatarEl.style.border = '2px solid #10b981';
                avatarEl.style.background = '#1e293b';
            } else if (isTaxiGroup || lower.includes('taxi casa juli')) {
                avatarEl.innerHTML = `<img src="/admin/avatar_taxi_casa_julian.png" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span>🚕</span>'">`;
                avatarEl.style.border = '2px solid #f59e0b';
                avatarEl.style.background = '#1e293b';
            } else if (cleanPhoneStr === '34670426540' || lower.includes('iguaran')) {
                avatarEl.innerHTML = `<img src="/admin/avatar_taxi_iguaran.png" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span>TI</span>'">`;
                avatarEl.style.border = '2px solid #f59e0b';
                avatarEl.style.background = '#1e293b';
            } else if (cleanPhoneStr === '34670449858' || lower.includes('taxi tolosa')) {
                avatarEl.innerHTML = `<img src="/admin/avatar_taxi_tolosa.png" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span>TT</span>'">`;
                avatarEl.style.border = '2px solid #f59e0b';
                avatarEl.style.background = '#1e293b';
            } else if (cleanPhoneStr === '34636979092' || lower.includes('lexus')) {
                avatarEl.innerHTML = `<img src="/admin/avatar_taxi_lexus.png" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span>TL</span>'">`;
                avatarEl.style.border = '2px solid #f59e0b';
                avatarEl.style.background = '#1e293b';
            } else if (cleanPhoneStr === '34943671417' || lower.includes('casa julián tolosa') || lower.includes('casa julian tolosa')) {
                avatarEl.innerHTML = `<img src="/admin/casa_julian_logo_CJ.jpeg" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span>CJ</span>'">`;
                avatarEl.style.border = '2px solid #a855f7';
                avatarEl.style.background = '#1e293b';
            } else if (lower.includes('entretiempo') || lower.includes('ricardo')) {
                avatarEl.textContent = 'E';
                avatarEl.style.background = '#0284c7';
                avatarEl.style.color = '#fff';
                avatarEl.style.border = 'none';
            } else if (lower.includes('xabi') || lower.includes('gorrotxategi')) {
                avatarEl.textContent = 'XG';
                avatarEl.style.background = '#1e3a8a';
                avatarEl.style.color = '#93c5fd';
                avatarEl.style.border = 'none';
            } else if (cleanPhoneStr === '41795958760') {
                avatarEl.textContent = '+41';
                avatarEl.style.background = '#065f46';
                avatarEl.style.color = '#6ee7b7';
                avatarEl.style.border = 'none';
            } else if (cleanPhoneStr === '923218428609') {
                avatarEl.textContent = 'SA';
                avatarEl.style.background = '#701a75';
                avatarEl.style.color = '#f5d0fe';
                avatarEl.style.border = 'none';
            } else if (clientDisplayName && !clientDisplayName.startsWith('+')) {
                const words = clientDisplayName.trim().split(/\s+/);
                const initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase();
                avatarEl.textContent = initials;
                avatarEl.style.background = '#2a3942';
                avatarEl.style.color = '#e9edef';
                avatarEl.style.border = 'none';
            } else {
                avatarEl.textContent = '👤';
                avatarEl.style.background = '#202c33';
                avatarEl.style.color = '#8696a0';
                avatarEl.style.border = 'none';
            }
        }

        // Categoría Badge (Solo mostrar si es especial: Menú Tradición o Cancelación, nunca 'WhatsApp' ni 'Conversación')
        if (catBadgeEl) {
            if (sol.categoria === 'reservas_menu_tradicion') {
                catBadgeEl.textContent = '🎁 Menú Tradición';
                catBadgeEl.style.display = 'inline-block';
                catBadgeEl.style.color = '#34d399';
                catBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            } else if (sol.categoria === 'cancelacion') {
                catBadgeEl.textContent = '❌ Cancelación';
                catBadgeEl.style.display = 'inline-block';
                catBadgeEl.style.color = '#f87171';
                catBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            } else {
                catBadgeEl.textContent = '';
                catBadgeEl.style.display = 'none';
            }
        }

        // Modo Humano / Estado del Bot
        const cleanNoPrefix = cleanPhoneStr.replace(/^34/, '');
        const silencedContact = (typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers))
            ? allSilencedNumbers.find(s => {
                const sClean = getCleanPhoneKey(s.telefono);
                return sClean === cleanPhoneStr || sClean === cleanNoPrefix || (sClean && cleanNoPrefix.length >= 7 && sClean.endsWith(cleanNoPrefix));
            })
            : null;
        const isSilenced = silencedContact ? !!silencedContact.activo : false;
        const isHandoverActive = (sol.enAtencionHumana === true && sol.estado !== 'CONFIRMADA' && sol.estado !== 'RECHAZADA') || isSilenced;

        if (handoverStatusEl) {
            handoverStatusEl.textContent = isHandoverActive ? '🟢 Modo Humano (Bot Pausado)' : '⚪ Bot Activo';
            handoverStatusEl.style.background = isHandoverActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)';
            handoverStatusEl.style.color = isHandoverActive ? '#34d399' : '#94a3b8';
            handoverStatusEl.style.borderColor = isHandoverActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)';
        }
        if (btnToggleHuman && btnConclude) {
            if (isGroup) {
                btnToggleHuman.style.display = 'none';
                btnConclude.style.display = 'none';
            } else if (isHandoverActive) {
                // Si el bot está desactivado: solo botón verde Concluir Gestión y Reactivar Bot
                btnToggleHuman.style.display = 'none';
                btnConclude.style.display = 'inline-flex';
            } else {
                // Si el bot está activo: solo botón rojo Activar Atención humana
                btnToggleHuman.style.display = 'inline-flex';
                btnConclude.style.display = 'none';
            }
        }

        // Sidebar Resumen
        const summaryEl = document.getElementById('pane-solicitud-summary');
        if (summaryEl) {
            if (sol.datosDetallados) {
                summaryEl.innerHTML = renderSummaryTable(sol.datosDetallados);
            } else {
                summaryEl.innerHTML = `
                    <div style="color: #94a3b8; font-size: 0.84rem; padding: 18px 12px; text-align: center;">
                        <div style="font-size: 1.8rem; margin-bottom: 8px;">💬</div>
                        <strong style="color: #e2e8f0; display: block; margin-bottom: 4px;">Conversación WhatsApp</strong>
                        <span style="font-size: 0.78rem; color: #8696a0; line-height: 1.4; display: block;">Los resúmenes estructurados (fecha, comensales, peticiones) se generarán automáticamente en nuevas reservas e interacciones con el chatbot.</span>
                    </div>
                `;
            }
        }

        // Textarea prefilled text
        const textArea = document.getElementById('pane-reply-message-text');
        if (textArea) {
            textArea.value = prefilledText || '';
        }

        // Cargar historial en el hilo de mensajes (instantáneo desde caché si existe)
        stopChatPolling();
        currentChatPhone = cleanPhoneStr;
        lastChatRenderedSig = '';
        if (chatHistoryCache.has(cleanPhoneStr)) {
            const cachedList = chatHistoryCache.get(cleanPhoneStr);
            if (Array.isArray(cachedList) && cachedList.length > 0) {
                const paneThread = document.getElementById('pane-chat-thread');
                if (paneThread) {
                    paneThread.innerHTML = '';
                    cachedList.forEach(m => {
                        const isClient = m.emisor === 'cliente';
                        const timeStr = m.fecha ? new Date(m.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
                        const formattedBody = formatWhatsAppText(m.texto);
                        const bubble = document.createElement('div');
                        bubble.style.cssText = `
                            max-width: 78%;
                            align-self: ${isClient ? 'flex-start' : 'flex-end'};
                            background: ${isClient ? '#202c33' : '#005c4b'};
                            color: #e9edef;
                            padding: 9px 13px;
                            border-radius: ${isClient ? '0 12px 12px 12px' : '12px 0 12px 12px'};
                            font-size: 0.88rem;
                            line-height: 1.45;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.25);
                            word-break: break-word;
                            border: 1px solid ${isClient ? 'rgba(255,255,255,0.06)' : 'rgba(37, 211, 102, 0.2)'};
                            margin-bottom: 4px;
                        `;
                        let metaBadge = '';
                        if (m.tipo === 'interactive' || m.tipo === 'button' || m.tipo === 'list') {
                            metaBadge = `<span style="background: rgba(139, 92, 246, 0.25); color: #c4b5fd; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">👆 Opción seleccionada</span>`;
                        }
                        bubble.innerHTML = `
                            <div style="font-size: 0.74rem; font-weight: 700; color: ${isClient ? '#53bdeb' : '#25d366'}; margin-bottom: 3px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                <span style="display: flex; align-items: center; gap: 5px;">
                                    ${isClient ? '👤 ' + (sol.nombreCliente || 'Cliente') : '<img src="/admin/casa_julian_logo_CJ.jpeg" alt="Logo" style="width: 17px; height: 17px; border-radius: 50%; object-fit: cover; border: none; vertical-align: middle; display: inline-block;"> Recepción Casa Julián'}
                                </span>
                                ${metaBadge}
                            </div>
                            <div>${formattedBody}</div>
                            <div style="text-align: right; font-size: 0.68rem; color: #8696a0; margin-top: 4px; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                                <span>${timeStr}</span>
                                ${!isClient ? '<span style="color: #53bdeb; font-size: 0.75rem; font-weight: bold;">✓✓</span>' : ''}
                            </div>
                        `;
                        paneThread.appendChild(bubble);
                    });
                    paneThread.scrollTop = paneThread.scrollHeight;
                }
            }
        }
        await fetchAndRenderChatThread(cleanPhoneStr, sol, true);

        // Polling en tiempo real para el panel de mensajes cada 1.5s
        activePaneChatPollInterval = setInterval(() => {
            if (activeConversationPhone === cleanPhoneStr) {
                fetchAndRenderChatThread(cleanPhoneStr, activeReplySolicitud, false);
            } else {
                stopChatPolling();
            }
        }, 1500);
    }

    // Abrir Modal de Chat Unificado e Interactivo con Resumen de Solicitud
    async function openReplyModal(solOrPhone, name = '', prefilledText = '', targetStatus = 'EN_GESTION') {
        let sol = null;
        let cleanPhoneStr = '';

        if (solOrPhone && typeof solOrPhone === 'object' && solOrPhone.id) {
            sol = solOrPhone;
            cleanPhoneStr = (sol.telefonoCliente || sol.telefonoReserva || '').toString().replace(/\D/g, '');
        } else {
            cleanPhoneStr = (solOrPhone || '').toString().replace(/\D/g, '');
            sol = allSolicitudes.find(s => (s.telefonoCliente || s.telefonoReserva || '').replace(/\D/g, '') === cleanPhoneStr);
            if (!sol) {
                const conv = allUnifiedConversations.find(c => c.telefono === cleanPhoneStr);
                const contactName = name || (conv ? conv.nombreCliente : getClientDisplayName('', cleanPhoneStr));
                sol = {
                    id: `chat_${cleanPhoneStr}`,
                    telefonoCliente: cleanPhoneStr,
                    nombreCliente: contactName,
                    categoria: conv ? conv.categoria : 'cliente',
                    categoriaLabel: '💬 Chat WhatsApp',
                    etiquetas: conv ? conv.etiquetas : [],
                    datosDetallados: null,
                    enAtencionHumana: false,
                    estado: 'PENDIENTE',
                    mensajes: []
                };
            }
        }

        // Si hay un chat activo diferente, minimizarlo antes de abrir el nuevo
        if (activeReplySolicitud && activeReplySolicitud.id !== sol.id) {
            minimizedSolicitudesMap.set(activeReplySolicitud.id, activeReplySolicitud);
        }
        activeReplySolicitud = sol;
        if (sol && sol.id) {
            minimizedSolicitudesMap.delete(sol.id);
            renderMinimizedChatsStack();
        }

        const modalBody = document.querySelector('.whatsapp-modal-body');
        const sidebar = document.getElementById('whatsapp-request-sidebar');
        const toggleBtn = document.getElementById('toggle-sidebar-btn');
        if (modalBody) modalBody.classList.remove('sidebar-hidden');
        if (sidebar) sidebar.style.removeProperty('display');
        if (toggleBtn) toggleBtn.classList.add('active');
        
        // Limpiar estado de no leído para esta conversación
        if (sol.id) unreadSolicitudIds.delete(sol.id);
        if (cleanPhoneStr) setManualChatStatus(cleanPhoneStr, 'leido');
        if (unreadSolicitudIds.size === 0) {
            stopTitleFlash();
        }

        replySolicitudId.value = sol.id || `chat_${cleanPhoneStr}`;
        const clientDisplayName = getClientDisplayName(sol.nombreCliente, cleanPhoneStr);
        replyClientName.textContent = clientDisplayName;
        replyClientPhone.textContent = `📞 WhatsApp: ${formatPhoneWithPrefix(cleanPhoneStr)}`;

        // Generador de Avatar dinámico con soporte de fotos
        const avatarEl = document.getElementById('reply-modal-avatar');
        if (avatarEl) {
            const customAvatarUrl = getChatAvatarUrl(cleanPhoneStr, clientDisplayName, sol);
            if (customAvatarUrl) {
                avatarEl.innerHTML = `<img src="${customAvatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.outerHTML='👤'">`;
                avatarEl.style.background = 'transparent';
            } else {
                const lower = clientDisplayName.toLowerCase();
                if (lower.includes('entretiempo') || lower.includes('ricardo')) {
                    avatarEl.textContent = 'E';
                    avatarEl.style.background = '#0284c7';
                    avatarEl.style.color = '#fff';
                } else if (lower.includes('xabi') || lower.includes('gorrotxategi')) {
                    avatarEl.textContent = 'XG';
                    avatarEl.style.background = '#1e3a8a';
                    avatarEl.style.color = '#93c5fd';
                } else if (cleanPhoneStr === '41795958760') {
                    avatarEl.textContent = '+41';
                    avatarEl.style.background = '#065f46';
                    avatarEl.style.color = '#6ee7b7';
                } else if (cleanPhoneStr === '923218428609') {
                    avatarEl.textContent = 'SA';
                    avatarEl.style.background = '#701a75';
                    avatarEl.style.color = '#f5d0fe';
                } else if (clientDisplayName && !clientDisplayName.startsWith('+')) {
                    const words = clientDisplayName.trim().split(/\s+/);
                    const initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase();
                    avatarEl.textContent = initials;
                    avatarEl.style.background = '#2a3942';
                    avatarEl.style.color = '#e9edef';
                } else {
                    avatarEl.textContent = '👤';
                    avatarEl.style.background = '#202c33';
                    avatarEl.style.color = '#8696a0';
                }
            }
        }

        // Botones de acción directa (Llamada telefónica & abrir en WhatsApp)
        const btnCallModal = document.getElementById('btn-call-phone-modal');
        const btnWaModal = document.getElementById('btn-open-wa-modal');
        if (btnCallModal) {
            btnCallModal.href = cleanPhoneStr ? `tel:+${cleanPhoneStr}` : '#';
        }
        if (btnWaModal) {
            btnWaModal.href = cleanPhoneStr ? `https://wa.me/${cleanPhoneStr}` : '#';
        }
        
        // Badge de Categoría en Modal
        const catBadgeEl = document.getElementById('reply-category-badge');
        if (catBadgeEl) {
            catBadgeEl.textContent = sol.categoriaLabel || sol.tipoAccion || '📌 Conversación';
            if (sol.categoria === 'reservas_menu_tradicion') {
                catBadgeEl.textContent = '🎁 Reservas Menú Tradición';
                catBadgeEl.style.color = '#34d399';
                catBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            } else if (sol.categoria === 'cancelacion') {
                catBadgeEl.textContent = '❌ Cancelación';
                catBadgeEl.style.color = '#f87171';
                catBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            } else {
                catBadgeEl.textContent = '💬 WhatsApp';
                catBadgeEl.style.color = '#38bdf8';
                catBadgeEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
            }
        }

        // Estado del Modo Humano
        const handoverStatusEl = document.getElementById('reply-handover-status');
        const isHandoverActive = sol.enAtencionHumana === true && sol.estado !== 'CONFIRMADA' && sol.estado !== 'RECHAZADA';
        if (handoverStatusEl) {
            handoverStatusEl.textContent = isHandoverActive ? '🟢 Modo Humano (Bot Pausado)' : '⚪ Bot Activo';
            handoverStatusEl.style.background = isHandoverActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)';
            handoverStatusEl.style.color = isHandoverActive ? '#34d399' : '#94a3b8';
            handoverStatusEl.style.borderColor = isHandoverActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)';
        }

        // Configuración de Botones de Modo Humano / Concluir
        const btnToggleHuman = document.getElementById('btn-toggle-human-mode');
        const btnConcluir = document.getElementById('btn-concluir-gestion');
        if (btnToggleHuman && btnConcluir) {
            if (isHandoverActive) {
                btnToggleHuman.style.display = 'none';
                btnConcluir.style.display = 'inline-flex';
            } else {
                btnToggleHuman.style.display = 'inline-flex';
                btnConcluir.style.display = 'none';
            }
        }

        // Resumen estructurado en la barra lateral izquierda (Tabla estilizada)
        const summaryEl = document.getElementById('reply-solicitud-summary');
        const dateEl = document.getElementById('reply-solicitud-date');
        if (summaryEl) {
            if (sol.datosDetallados) {
                summaryEl.innerHTML = renderSummaryTable(sol.datosDetallados);
            } else {
                summaryEl.innerHTML = `
                    <div style="color: #94a3b8; font-size: 0.84rem; padding: 18px 12px; text-align: center;">
                        <div style="font-size: 1.8rem; margin-bottom: 8px;">💬</div>
                        <strong style="color: #e2e8f0; display: block; margin-bottom: 4px;">Conversación WhatsApp</strong>
                        <span style="font-size: 0.78rem; color: #8696a0; line-height: 1.4; display: block;">Los resúmenes estructurados (fecha, comensales, peticiones) se generarán automáticamente en nuevas reservas e interacciones con el chatbot.</span>
                    </div>
                `;
            }
        }
        if (dateEl) {
            dateEl.textContent = sol.created_at ? new Date(sol.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Reciente';
        }

        // Cargar mensajes y renderizar en el hilo
        stopChatPolling();
        currentChatPhone = cleanPhoneStr;
        lastChatRenderedSig = '';
        await fetchAndRenderChatThread(cleanPhoneStr, sol, true);

        // Iniciar polling en tiempo real cada 1.5s
        activeReplyChatPollInterval = setInterval(() => {
            if (replyModal.style.display !== 'none' && currentChatPhone) {
                fetchAndRenderChatThread(currentChatPhone, activeReplySolicitud, false);
            } else {
                stopChatPolling();
            }
        }, 1500);

        replyMessageText.value = prefilledText || '';
        replyErrorMsg.style.display = 'none';
        replyModal.setAttribute('data-target-status', targetStatus);
        replyModal.style.display = 'flex';

        // Restablecer estado del sidebar y botón
        const backdrop = document.getElementById('whatsapp-sidebar-backdrop');
        if (modalBody) modalBody.classList.remove('sidebar-hidden');
        if (sidebar) {
            sidebar.classList.remove('show-sidebar');
        }
        if (backdrop) backdrop.classList.remove('show-backdrop');
        if (toggleBtn) toggleBtn.classList.add('active');

        renderInboxCards();
    }

    // Compatibilidad para abrir chat por historial
    function openHistoryModal(phone, name = 'Cliente') {
        openReplyModal(phone, name);
    }

    function closeSidebarDrawer() {
        const sidebar = document.getElementById('whatsapp-request-sidebar');
        const backdrop = document.getElementById('whatsapp-sidebar-backdrop');
        const toggleBtn = document.getElementById('toggle-sidebar-btn');
        if (sidebar) sidebar.classList.remove('show-sidebar');
        if (backdrop) backdrop.classList.remove('show-backdrop');
        if (toggleBtn) toggleBtn.classList.remove('active');
    }

    function toggleSidebarDrawer() {
        const sidebar = document.getElementById('whatsapp-request-sidebar');
        const modalBody = document.querySelector('.whatsapp-modal-body');
        const backdrop = document.getElementById('whatsapp-sidebar-backdrop');
        const toggleBtn = document.getElementById('toggle-sidebar-btn');
        if (!sidebar) return;

        if (window.innerWidth > 960) {
            // Pantallas grandes: toggle sidebar-hidden en el modal body
            const isHidden = modalBody && modalBody.classList.contains('sidebar-hidden');
            if (isHidden) {
                if (modalBody) modalBody.classList.remove('sidebar-hidden');
                if (toggleBtn) toggleBtn.classList.add('active');
            } else {
                if (modalBody) modalBody.classList.add('sidebar-hidden');
                if (toggleBtn) toggleBtn.classList.remove('active');
            }
        } else {
            // Pantallas pequeñas (< 960px): cajón lateral flotante
            const isOpen = sidebar.classList.contains('show-sidebar');
            if (isOpen) {
                closeSidebarDrawer();
            } else {
                sidebar.classList.add('show-sidebar');
                if (backdrop) backdrop.classList.add('show-backdrop');
                if (toggleBtn) toggleBtn.classList.add('active');
            }
        }
    }

    function renderMinimizedChatsStack() {
        let stackEl = document.getElementById('minimized-chats-stack');
        if (!stackEl) {
            stackEl = document.createElement('div');
            stackEl.id = 'minimized-chats-stack';
            stackEl.className = 'minimized-chats-stack';
            document.body.appendChild(stackEl);
        }

        if (minimizedSolicitudesMap.size === 0) {
            stackEl.innerHTML = '';
            return;
        }

        let html = '';
        minimizedSolicitudesMap.forEach((sol, solId) => {
            const isUnread = unreadSolicitudIds.has(solId);
            const phone = sol.telefonoCliente || sol.telefonoReserva || '';
            const clientName = getClientDisplayName(sol.nombreCliente, phone);
            html += `
                <div class="minimized-floating-bar ${isUnread ? 'has-unread' : ''}" data-sol-id="${solId}">
                    <div class="minimized-info">
                        <span class="minimized-avatar">👤</span>
                        <div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <div class="minimized-name">${clientName}</div>
                                ${isUnread ? '<span class="minimized-unread-badge">🔴 ¡Nuevo!</span>' : ''}
                            </div>
                            <div class="minimized-sub">📞 WhatsApp: ${formatPhoneWithPrefix(phone)}</div>
                        </div>
                    </div>
                    <div class="minimized-actions">
                        <button type="button" class="btn-restore btn-restore-chat" data-sol-id="${solId}" title="Restaurar / Abrir Chat">🗖 Abrir Chat</button>
                        <button type="button" class="btn-close-mini btn-close-mini-chat" data-sol-id="${solId}" title="Cerrar">✕</button>
                    </div>
                </div>
            `;
        });
        stackEl.innerHTML = html;

        stackEl.querySelectorAll('.minimized-floating-bar').forEach(bar => {
            const solId = bar.getAttribute('data-sol-id');
            const restoreBtn = bar.querySelector('.btn-restore-chat');
            const closeBtn = bar.querySelector('.btn-close-mini-chat');

            if (restoreBtn) {
                restoreBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    restoreMinimizedChat(solId);
                });
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    minimizedSolicitudesMap.delete(solId);
                    renderMinimizedChatsStack();
                });
            }
            bar.addEventListener('click', (e) => {
                if (e.target.closest('.btn-close-mini-chat')) return;
                restoreMinimizedChat(solId);
            });
        });
    }

    function restoreMinimizedChat(solId) {
        const sol = minimizedSolicitudesMap.get(solId) || allSolicitudes.find(s => s.id === solId);
        minimizedSolicitudesMap.delete(solId);
        renderMinimizedChatsStack();
        if (sol) {
            openReplyModal(sol);
        }
    }

    function closeReplyModal() {
        stopChatPolling();
        replyModal.style.display = 'none';
        if (activeReplySolicitud) {
            minimizedSolicitudesMap.delete(activeReplySolicitud.id);
        }
        activeReplySolicitud = null;
        closeSidebarDrawer();
        renderMinimizedChatsStack();
    }

    function minimizeReplyModal() {
        if (!activeReplySolicitud) return;
        stopChatPolling();
        minimizedSolicitudesMap.set(activeReplySolicitud.id, activeReplySolicitud);
        replyModal.style.display = 'none';
        activeReplySolicitud = null;
        closeSidebarDrawer();
        renderMinimizedChatsStack();
    }

    function toggleMaximizeModal() {
        const modalBox = document.querySelector('.whatsapp-modal-container');
        const maxBtn = document.getElementById('maximize-reply-modal-btn');
        if (modalBox) {
            modalBox.classList.toggle('fullscreen');
            const isFull = modalBox.classList.contains('fullscreen');
            if (maxBtn) maxBtn.textContent = isFull ? '🗗' : '🗖';
            if (maxBtn) maxBtn.title = isFull ? 'Restaurar tamaño normal' : 'Maximizar / Pantalla Completa';
        }
    }

    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const closeSidebarMobileBtn = document.getElementById('close-sidebar-mobile-btn');
    const sidebarBackdrop = document.getElementById('whatsapp-sidebar-backdrop');
    const minimizeBtn = document.getElementById('minimize-reply-modal-btn');
    const maximizeBtn = document.getElementById('maximize-reply-modal-btn');

    if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', toggleSidebarDrawer);
    if (closeSidebarMobileBtn) closeSidebarMobileBtn.addEventListener('click', closeSidebarDrawer);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebarDrawer);

    const replyModalHistoryBtn = document.getElementById('reply-modal-history-btn');
    if (replyModalHistoryBtn) {
        replyModalHistoryBtn.addEventListener('click', () => {
            if (activeReplySolicitud) {
                const phone = activeReplySolicitud.telefonoCliente || activeReplySolicitud.telefonoReserva || '';
                const name = activeReplySolicitud.nombreCliente || 'Cliente';
                openHistoryModal(phone, name);
            }
        });
    }

    if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeReplyModal);
    if (maximizeBtn) maximizeBtn.addEventListener('click', toggleMaximizeModal);

    if (closeReplyModalBtn) closeReplyModalBtn.addEventListener('click', closeReplyModal);
    if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', closeReplyModal);
    if (refreshInboxBtn) refreshInboxBtn.addEventListener('click', loadUnifiedInboxData);

    // ── Toggle Colapsable de Filtros ────────────────────────────────────────
    const inboxToolbarCard = document.querySelector('.inbox-toolbar-card');
    const inboxFiltersToggleBtn = document.getElementById('inbox-filters-toggle');
    const inboxFiltersBody = document.getElementById('inbox-filters-body');
    const inboxFiltersToggleIcon = document.getElementById('inbox-filters-toggle-icon');
    
    if (inboxToolbarCard) {
        inboxToolbarCard.style.setProperty('display', 'flex', 'important');
        inboxToolbarCard.style.setProperty('flex-direction', 'column', 'important');
        inboxToolbarCard.style.setProperty('width', '100%', 'important');
    }
    
    if (inboxFiltersToggleBtn && inboxFiltersBody) {
        inboxFiltersToggleBtn.style.setProperty('width', '100%', 'important');
        inboxFiltersToggleBtn.style.setProperty('display', 'flex', 'important');
        inboxFiltersToggleBtn.style.setProperty('flex-direction', 'row', 'important');
        inboxFiltersToggleBtn.style.setProperty('justify-content', 'space-between', 'important');
        
        // Estado inicial por defecto: sin desplegar (cerrado)
        inboxFiltersBody.classList.add('is-collapsed');
        inboxFiltersBody.style.setProperty('display', 'none', 'important');
        if (inboxFiltersToggleIcon) inboxFiltersToggleIcon.textContent = '▼';

        inboxFiltersToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inboxFiltersOpen = !inboxFiltersOpen;
            if (inboxFiltersOpen) {
                inboxFiltersBody.classList.remove('is-collapsed');
                inboxFiltersBody.style.setProperty('display', 'flex', 'important');
                if (inboxFiltersToggleIcon) inboxFiltersToggleIcon.textContent = '▲';
            } else {
                inboxFiltersBody.classList.add('is-collapsed');
                inboxFiltersBody.style.setProperty('display', 'none', 'important');
                if (inboxFiltersToggleIcon) inboxFiltersToggleIcon.textContent = '▼';
            }
        });
    }

    // ── Vista: Activas / Archivadas / Papelera ───────────────────────────────
    document.querySelectorAll('[data-inbox-view]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-inbox-view]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentInboxView = chip.getAttribute('data-inbox-view');
            renderInboxCards();
        });
    });

    // ── Ordenación ───────────────────────────────────────────────────────────
    const inboxSortSelect = document.getElementById('inbox-sort-select');
    if (inboxSortSelect) {
        inboxSortSelect.addEventListener('change', () => {
            currentInboxSort = inboxSortSelect.value;
            renderInboxCards();
        });
    }

    // ── Filtros por Categoría ────────────────────────────────────────────────
    document.querySelectorAll('#inbox-category-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#inbox-category-filters .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentInboxCatFilter = chip.getAttribute('data-inbox-cat');
            renderInboxCards();
        });
    });

    // ── Filtros por Estado ───────────────────────────────────────────────────
    document.querySelectorAll('#inbox-status-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#inbox-status-filters .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentInboxStatusFilter = chip.getAttribute('data-inbox-status');
            renderInboxCards();
        });
    });

    // ── Buscador de Solicitudes ──────────────────────────────────────────────
    if (searchInboxInput) {
        searchInboxInput.addEventListener('input', (e) => {
            currentInboxSearch = e.target.value;
            renderInboxCards();
        });
    }

    // ── Selección Múltiple: Seleccionar Todo ──────────────────────────────────
    const selectAllCb = document.getElementById('inbox-select-all-cb');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', () => {
            const isChecked = selectAllCb.checked;
            const visibleCards = inboxCardsContainer.querySelectorAll('.solicitud-card');
            visibleCards.forEach(card => {
                const solId = card.getAttribute('data-id');
                const cb = card.querySelector('.card-select-cb');
                if (cb) cb.checked = isChecked;
                if (isChecked) {
                    selectedSolicitudIds.add(solId);
                    card.classList.add('is-selected');
                } else {
                    selectedSolicitudIds.delete(solId);
                    card.classList.remove('is-selected');
                }
            });
            updateBulkActionsBar();
        });
    }

    // ── Eliminación Masiva de Solicitudes ────────────────────────────────────
    const bulkDeleteBtn = document.getElementById('inbox-bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            const count = selectedSolicitudIds.size;
            if (count === 0) return;
            if (confirm(`¿Eliminar definitivamente las ${count} solicitudes seleccionadas? Esta acción no se puede deshacer.`)) {
                try {
                    const idsArray = Array.from(selectedSolicitudIds);
                    await fetch('/api/admin/solicitudes/bulk-delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                        body: JSON.stringify({ ids: idsArray })
                    });
                    idsArray.forEach(id => {
                        unreadSolicitudIds.delete(id);
                        selectedSolicitudIds.delete(id);
                    });
                    await fetchSolicitudes();
                } catch (err) {
                    alert('Error en eliminación masiva: ' + err.message);
                }
            }
        });
    }

    // ── Archivado Masivo de Solicitudes ──────────────────────────────────────
    const bulkArchiveBtn = document.getElementById('inbox-bulk-archive-btn');
    if (bulkArchiveBtn) {
        bulkArchiveBtn.addEventListener('click', async () => {
            const count = selectedSolicitudIds.size;
            if (count === 0) return;
            try {
                const idsArray = Array.from(selectedSolicitudIds);
                await fetch('/api/admin/solicitudes/bulk-archive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                    body: JSON.stringify({ ids: idsArray })
                });
                idsArray.forEach(id => {
                    unreadSolicitudIds.delete(id);
                    selectedSolicitudIds.delete(id);
                });
                await fetchSolicitudes();
            } catch (err) {
                alert('Error al archivar solicitudes: ' + err.message);
            }
        });
    }

    // Plantillas de Respuesta Rápida
    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeReplySolicitud) return;
            const tType = btn.getAttribute('data-template');
            const name = activeReplySolicitud.nombreCliente || '';
            if (tType === 'confirm') {
                replyMessageText.value = `✅ Hola ${name}, tu solicitud para Asador Casa Julián de Tolosa ha sido CONFIRMADA. ¡Esperamos darte la bienvenida pronto!`;
            } else if (tType === 'alt_time') {
                replyMessageText.value = `🕐 Hola ${name}, para la fecha solicitada no disponemos de mesa en ese turno, pero sí tendríamos disponibilidad en el siguiente turno. ¿Te vendría bien esa opción?`;
            } else if (tType === 'reject') {
                replyMessageText.value = `🚫 Hola ${name}, lamentamos comunicarte que tenemos el restaurante completo para la fecha/turno solicitados y no podemos aceptar más reservas en ese servicio.`;
            }
        });
    });

    // Botón Activar Atención Humana (Pausar Bot)
    const btnToggleHumanMode = document.getElementById('btn-toggle-human-mode');
    if (btnToggleHumanMode) {
        btnToggleHumanMode.addEventListener('click', async () => {
            if (!activeReplySolicitud) return;
            const solId = activeReplySolicitud.id;
            btnToggleHumanMode.disabled = true;
            try {
                const res = await fetch(`/api/admin/solicitudes/${solId}/atencion-humana`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ enAtencionHumana: true })
                });

                const data = await res.json();
                if (data.success) {
                    activeReplySolicitud.enAtencionHumana = true;
                    const handoverStatusEl = document.getElementById('reply-handover-status');
                    if (handoverStatusEl) {
                        handoverStatusEl.textContent = '🟢 Modo Humano (Bot Pausado)';
                        handoverStatusEl.style.background = 'rgba(16, 185, 129, 0.2)';
                        handoverStatusEl.style.color = '#34d399';
                        handoverStatusEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                    }
                    const btnToggleHuman = document.getElementById('btn-toggle-human-mode');
                    const btnConcluir = document.getElementById('btn-concluir-gestion');
                    if (btnToggleHuman) btnToggleHuman.style.display = 'none';
                    if (btnConcluir) btnConcluir.style.display = 'inline-flex';

                    await fetchSolicitudes();
                    syncUnifiedConversations();
                } else {
                    replyErrorMsg.textContent = data.error || "Error al activar atención humana.";
                    replyErrorMsg.style.display = 'block';
                }
            } catch (err) {
                replyErrorMsg.textContent = "Error de conexión: " + err.message;
                replyErrorMsg.style.display = 'block';
            } finally {
                btnToggleHumanMode.disabled = false;
            }
        });
    }

    // Botón Concluir Gestión & Reactivar Bot
    const btnConcluirGestion = document.getElementById('btn-concluir-gestion');
    if (btnConcluirGestion) {
        btnConcluirGestion.addEventListener('click', async () => {
            if (!activeReplySolicitud) return;
            const solId = activeReplySolicitud.id;
            const text = replyMessageText.value.trim();

            if (confirm("¿Deseas concluir esta gestión y reactivar el bot automático para este cliente?")) {
                btnConcluirGestion.disabled = true;
                try {
                    const res = await fetch(`/api/admin/solicitudes/${solId}/concluir`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-token': adminToken
                        },
                        body: JSON.stringify({
                            estadoFinal: 'CONFIRMADA',
                            mensajeCierre: text || null
                        })
                    });

                    const data = await res.json();
                    if (data.success) {
                        closeReplyModal();
                        showToast(data.message || "✅ Gestión concluida y bot reactivado.");
                        await fetchSolicitudes();
                        await fetchWhatsAppChats();
                        syncUnifiedConversations();
                    } else {
                        replyErrorMsg.textContent = data.error || "Error al concluir gestión.";
                        replyErrorMsg.style.display = 'block';
                    }
                } catch (err) {
                    replyErrorMsg.textContent = "Error de conexión: " + err.message;
                    replyErrorMsg.style.display = 'block';
                } finally {
                    btnConcluirGestion.disabled = false;
                }
            }
        });
    }

    // Envío del Formulario de Respuesta por WhatsApp (Mantiene chat abierto)
    if (replyForm) {
        replyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const solId = replySolicitudId.value;
            const text = replyMessageText.value.trim();

            if (!solId || !text) {
                replyErrorMsg.textContent = "Por favor escribe un mensaje de respuesta.";
                replyErrorMsg.style.display = 'block';
                return;
            }

            const submitBtn = document.getElementById('send-reply-submit-btn');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const res = await fetch(`/api/admin/solicitudes/${solId}/responder`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({
                        respuestaText: text,
                        nuevoEstado: 'EN_GESTION'
                    })
                });

                const data = await res.json();
                if (data.success) {
                    replyMessageText.value = '';
                    replyErrorMsg.style.display = 'none';
                    if (activeReplySolicitud) {
                        const cleanPhoneStr = (activeReplySolicitud.telefonoCliente || activeReplySolicitud.telefonoReserva || '').toString().replace(/\D/g, '');
                        await fetchAndRenderChatThread(cleanPhoneStr, activeReplySolicitud, true);
                    }
                    await fetchSolicitudes();
                    await fetchWhatsAppChats();
                    syncUnifiedConversations();
                } else {
                    replyErrorMsg.textContent = data.error || "Error al enviar WhatsApp al cliente.";
                    replyErrorMsg.style.display = 'block';
                }
            } catch (err) {
                replyErrorMsg.textContent = "Error de conexión: " + err.message;
                replyErrorMsg.style.display = 'block';
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------
    // CONTROLADORES DE EVENTOS PARA EL PANEL DE 2 COLUMNAS (WHATSAPP WEB)
    // -------------------------------------------------------------
    
    // Envío desde el formulario del panel de la columna derecha
    const paneReplyForm = document.getElementById('pane-reply-form');
    if (paneReplyForm) {
        paneReplyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const paneSolIdInput = document.getElementById('pane-reply-solicitud-id');
            const paneMessageInput = document.getElementById('pane-reply-message-text');
            const paneErrorMsg = document.getElementById('pane-reply-error-msg');
            const solId = paneSolIdInput ? paneSolIdInput.value : '';
            const text = paneMessageInput ? paneMessageInput.value.trim() : '';

            if (!solId || !text) {
                if (paneErrorMsg) {
                    paneErrorMsg.textContent = "Por favor escribe un mensaje de respuesta.";
                    paneErrorMsg.style.display = 'block';
                }
                return;
            }

            const sendBtn = document.getElementById('pane-send-reply-btn');
            if (sendBtn) sendBtn.disabled = true;

            try {
                const res = await fetch(`/api/admin/solicitudes/${solId}/responder`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({
                        respuestaText: text,
                        nuevoEstado: 'EN_GESTION'
                    })
                });

                const data = await res.json();
                if (data.success) {
                    if (paneMessageInput) paneMessageInput.value = '';
                    if (paneErrorMsg) paneErrorMsg.style.display = 'none';
                    if (activeReplySolicitud) {
                        const cleanPhoneStr = (activeReplySolicitud.telefonoCliente || activeReplySolicitud.telefonoReserva || '').toString().replace(/\D/g, '');
                        await fetchAndRenderChatThread(cleanPhoneStr, activeReplySolicitud, true);
                    }
                    await fetchSolicitudes();
                    await fetchWhatsAppChats();
                    syncUnifiedConversations();
                } else {
                    if (paneErrorMsg) {
                        paneErrorMsg.textContent = data.error || "Error al enviar WhatsApp al cliente.";
                        paneErrorMsg.style.display = 'block';
                    }
                }
            } catch (err) {
                if (paneErrorMsg) {
                    paneErrorMsg.textContent = "Error de conexión: " + err.message;
                    paneErrorMsg.style.display = 'block';
                }
            } finally {
                if (sendBtn) sendBtn.disabled = false;
            }
        });
    }

    // Botón de Volver a la Lista en Móviles (< 900px)
    const waBackToListBtn = document.getElementById('wa-back-to-list-btn') || document.getElementById('btn-back-to-inbox');
    if (waBackToListBtn) {
        waBackToListBtn.addEventListener('click', () => {
            const webContainer = document.querySelector('.wa-web-container');
            const emptyState = document.getElementById('wa-empty-state');
            const activePanel = document.getElementById('wa-active-chat-panel');
            if (webContainer) webContainer.classList.remove('mobile-chat-open');
            if (activePanel) activePanel.style.display = 'none';
            if (emptyState) emptyState.style.display = 'flex';
            activeConversationPhone = null;
            stopChatPolling();
            const container = document.getElementById('inbox-cards-container');
            if (container) {
                container.querySelectorAll('.whatsapp-chat-row').forEach(r => r.classList.remove('is-selected'));
            }
        });
    }

    // Toggle y Cierre del Resumen de Solicitud en el Panel Derecho
    const paneToggleSummaryBtn = document.getElementById('pane-toggle-summary-btn');
    const paneCloseSidebarBtn = document.getElementById('pane-close-sidebar-btn');
    const paneRequestSidebar = document.getElementById('pane-request-sidebar');

    if (paneToggleSummaryBtn) {
        paneToggleSummaryBtn.addEventListener('click', () => {
            if (!paneRequestSidebar) return;
            const isVisible = paneRequestSidebar.style.display !== 'none';
            paneRequestSidebar.style.display = isVisible ? 'none' : 'flex';
            paneToggleSummaryBtn.classList.toggle('active', !isVisible);
        });
    }
    if (paneCloseSidebarBtn) {
        paneCloseSidebarBtn.addEventListener('click', () => {
            if (paneRequestSidebar) paneRequestSidebar.style.display = 'none';
            if (paneToggleSummaryBtn) paneToggleSummaryBtn.classList.remove('active');
        });
    }

    // Plantillas de Respuestas Rápidas para el Panel Derecho
    document.querySelectorAll('.pane-template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const templateType = btn.getAttribute('data-template');
            const clientName = activeReplySolicitud ? (activeReplySolicitud.nombreCliente || 'estimado/a cliente') : 'estimado/a cliente';
            let templateText = '';

            switch (templateType) {
                case 'confirm':
                    templateText = `¡Hola ${clientName}! 👋 Te confirmamos con mucho gusto tu reserva en el Asador Casa Julián de Tolosa. ¡Os esperamos!`;
                    break;
                case 'alt_time':
                    templateText = `Hola ${clientName}, para la hora solicitada tenemos el comedor completo. ¿Te encajaría venir a las [HORA ALTERNATIVA]? Quedamos atentos.`;
                    break;
                case 'reject':
                    templateText = `Hola ${clientName}, lamentablemente para esa fecha/turno tenemos el aforo completamente completo en Casa Julián. Disculpa las molestias.`;
                    break;
            }

            const paneMsgInput = document.getElementById('pane-reply-message-text');
            if (paneMsgInput) {
                paneMsgInput.value = templateText;
                paneMsgInput.focus();
                paneMsgInput.style.height = 'auto';
                paneMsgInput.style.height = Math.min(Math.max(paneMsgInput.scrollHeight, 68), 220) + 'px';
            }
        });
    });

    // Auto-expansión del textarea para textos largos de recepción
    const paneReplyTextareaEl = document.getElementById('pane-reply-message-text');
    if (paneReplyTextareaEl) {
        paneReplyTextareaEl.addEventListener('input', () => {
            paneReplyTextareaEl.style.height = 'auto';
            paneReplyTextareaEl.style.height = Math.min(Math.max(paneReplyTextareaEl.scrollHeight, 68), 220) + 'px';
        });
    }

    // Modo Humano en Panel Derecho (Activar Atención humana - Botón Rojo)
    const paneBtnToggleHuman = document.getElementById('pane-btn-toggle-human');
    if (paneBtnToggleHuman) {
        paneBtnToggleHuman.addEventListener('click', async () => {
            if (!activeConversationPhone && !activeReplySolicitud) return;
            paneBtnToggleHuman.disabled = true;
            try {
                const phone = activeConversationPhone || (activeReplySolicitud ? activeReplySolicitud.telefono : '');
                const clean = getCleanPhoneKey(phone);
                const solId = activeReplySolicitud ? activeReplySolicitud.id : null;

                if (solId && !solId.startsWith('chat_')) {
                    await fetch(`/api/admin/solicitudes/${solId}/atencion-humana`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-token': adminToken
                        },
                        body: JSON.stringify({ activar: true })
                    }).catch(e => console.warn("Error atencion-humana:", e));
                }

                if (activeReplySolicitud) activeReplySolicitud.enAtencionHumana = true;

                // Silenciar bot para este contacto para que no responda automáticamente
                if (clean) {
                    const cleanNoPrefix = clean.replace(/^34/, '');
                    const isSilenced = allSilencedNumbers.some(s => {
                        const sClean = getCleanPhoneKey(s.telefono);
                        return s.activo && (sClean === clean || sClean === cleanNoPrefix || (sClean && cleanNoPrefix.length >= 7 && sClean.endsWith(cleanNoPrefix)));
                    });
                    if (!isSilenced) {
                        const name = activeReplySolicitud ? (activeReplySolicitud.nombreCliente || '') : '';
                        await toggleBotStatusForContact(clean, name);
                    }
                }

                showToast('🔴 Atención humana activada (Bot pausado)');
                const handoverStatusEl = document.getElementById('pane-chat-handover-status');
                if (handoverStatusEl) {
                    handoverStatusEl.textContent = '🟢 Modo Humano (Bot Pausado)';
                    handoverStatusEl.style.background = 'rgba(16, 185, 129, 0.2)';
                    handoverStatusEl.style.color = '#34d399';
                    handoverStatusEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                }
                const btnToggle = document.getElementById('pane-btn-toggle-human');
                const btnConc = document.getElementById('pane-btn-conclude');
                if (btnToggle) btnToggle.style.display = 'none';
                if (btnConc) btnConc.style.display = 'inline-flex';

                await fetchSolicitudes();
                syncUnifiedConversations();
            } catch (err) {
                console.error("Error toggling human mode:", err);
                showToast('❌ Error activando modo humano: ' + err.message);
            } finally {
                paneBtnToggleHuman.disabled = false;
            }
        });
    }

    // Concluir Gestión y Reactivar Bot (Botón Verde)
    const paneBtnConclude = document.getElementById('pane-btn-conclude');
    if (paneBtnConclude) {
        paneBtnConclude.addEventListener('click', async () => {
            if (!activeConversationPhone && !activeReplySolicitud) return;
            const paneMsgInput = document.getElementById('pane-reply-message-text');
            const text = paneMsgInput ? paneMsgInput.value.trim() : '';

            if (confirm("¿Deseas concluir esta gestión y reactivar el bot automático para este cliente?")) {
                paneBtnConclude.disabled = true;
                try {
                    const phone = activeConversationPhone || (activeReplySolicitud ? activeReplySolicitud.telefono : '');
                    const clean = getCleanPhoneKey(phone);
                    const solId = activeReplySolicitud ? activeReplySolicitud.id : null;

                    if (solId && !solId.startsWith('chat_')) {
                        await fetch(`/api/admin/solicitudes/${solId}/concluir`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-admin-token': adminToken
                            },
                            body: JSON.stringify({
                                estadoFinal: 'CONFIRMADA',
                                mensajeCierre: text || null
                            })
                        }).catch(e => console.warn("Error concluir solicitud:", e));
                    }

                    if (activeReplySolicitud) activeReplySolicitud.enAtencionHumana = false;

                    // Reactivar bot para este contacto si estaba silenciado
                    if (clean) {
                        const cleanNoPrefix = clean.replace(/^34/, '');
                        const isSilenced = allSilencedNumbers.some(s => {
                            const sClean = getCleanPhoneKey(s.telefono);
                            return s.activo && (sClean === clean || sClean === cleanNoPrefix || (sClean && cleanNoPrefix.length >= 7 && sClean.endsWith(cleanNoPrefix)));
                        });
                        if (isSilenced) {
                            const name = activeReplySolicitud ? (activeReplySolicitud.nombreCliente || '') : '';
                            await toggleBotStatusForContact(clean, name);
                        }
                    }

                    showToast("✅ Gestión concluida y bot reactivado.");
                    const handoverStatusEl = document.getElementById('pane-chat-handover-status');
                    if (handoverStatusEl) {
                        handoverStatusEl.textContent = '⚪ Bot Activo';
                        handoverStatusEl.style.background = 'rgba(100, 116, 139, 0.2)';
                        handoverStatusEl.style.color = '#94a3b8';
                        handoverStatusEl.style.borderColor = 'rgba(100, 116, 139, 0.3)';
                    }
                    const btnToggle = document.getElementById('pane-btn-toggle-human');
                    const btnConc = document.getElementById('pane-btn-conclude');
                    if (btnToggle) btnToggle.style.display = 'inline-flex';
                    if (btnConc) btnConc.style.display = 'none';

                    await fetchSolicitudes();
                    await fetchWhatsAppChats();
                    syncUnifiedConversations();
                } catch (err) {
                    console.error("Error concluding management:", err);
                    showToast('❌ Error al reactivar bot: ' + err.message);
                } finally {
                    paneBtnConclude.disabled = false;
                }
            }
        });
    }

    // -------------------------------------------------------------
    // GESTIÓN DE AJUSTES DEL SISTEMA Y DIAGNÓSTICO DE APIS (ADMIN)
    // -------------------------------------------------------------
    const openSettingsModalBtn = document.getElementById('open-settings-modal-btn');
    const refreshSystemStatusBtn = document.getElementById('refresh-system-status-btn');
    const btnToggleBotActive = document.getElementById('btn-toggle-bot-active');
    const botMasterStatusBadge = document.getElementById('bot-master-status-badge');
    const sendMaintenanceNoticeCheck = document.getElementById('send-maintenance-notice-check');
    const maintenanceMessageInput = document.getElementById('maintenance-message-input');
    const saveMaintenanceSettingsBtn = document.getElementById('save-maintenance-settings-btn');

    let currentSystemSettings = { botActive: true, maintenanceMessage: '', sendMaintenanceNotice: false };

    if (openSettingsModalBtn) {
        openSettingsModalBtn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            const tabSettingsBtn = document.getElementById('tab-btn-settings');
            const tabSettingsContent = document.getElementById('tab-settings');
            if (tabSettingsBtn) tabSettingsBtn.classList.add('active');
            if (tabSettingsContent) tabSettingsContent.classList.add('active');
            loadSystemSettingsAndStatus();
        });
    }

    if (refreshSystemStatusBtn) {
        refreshSystemStatusBtn.addEventListener('click', () => {
            loadSystemSettingsAndStatus(true);
        });
    }

    async function loadSystemSettingsAndStatus(showFeedback = false) {
        try {
            const res = await fetch('/api/admin/system-status', {
                headers: { 'x-admin-token': adminToken }
            });
            const data = await res.json();
            if (data.success && data.status) {
                const s = data.status;
                currentSystemSettings = s.settings || {};

                // 1. Estado del Bot
                updateBotActiveUI(currentSystemSettings.botActive !== false);

                // 2. Mensaje de mantenimiento
                if (maintenanceMessageInput) {
                    maintenanceMessageInput.value = currentSystemSettings.maintenanceMessage || '';
                }
                if (sendMaintenanceNoticeCheck) {
                    sendMaintenanceNoticeCheck.checked = !!currentSystemSettings.sendMaintenanceNotice;
                }

                // 3. Tarjeta Meta API
                const metaPhoneEl = document.getElementById('sys-meta-phone');
                const metaBadge = document.getElementById('sys-status-meta');
                if (metaPhoneEl) metaPhoneEl.textContent = s.apis.metaWhatsApp.phoneIdSuffix || 'No configurado';
                if (metaBadge) {
                    if (s.apis.metaWhatsApp.configured) {
                        metaBadge.textContent = 'ONLINE';
                        metaBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                        metaBadge.style.color = '#34d399';
                    } else {
                        metaBadge.textContent = 'OFFLINE';
                        metaBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                        metaBadge.style.color = '#f87171';
                    }
                }

                // 4. Tarjeta Base de Datos Neon
                const dbHostEl = document.getElementById('sys-db-host');
                const dbLatencyEl = document.getElementById('sys-db-latency');
                const dbBadge = document.getElementById('sys-status-db');
                if (dbHostEl) dbHostEl.textContent = s.database.host || 'Neon Cloud';
                if (dbLatencyEl) dbLatencyEl.textContent = s.database.latencyMs ? `${s.database.latencyMs} ms` : 'Conectado';
                if (dbBadge) {
                    if (s.database.connected) {
                        dbBadge.textContent = 'CONECTADA';
                        dbBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                        dbBadge.style.color = '#34d399';
                    } else {
                        dbBadge.textContent = 'ERROR';
                        dbBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                        dbBadge.style.color = '#f87171';
                    }
                }

                // 5. Tarjeta Emails
                const brevoEl = document.getElementById('sys-email-brevo');
                const resendEl = document.getElementById('sys-email-resend');
                const smtpEl = document.getElementById('sys-email-smtp');
                if (brevoEl) brevoEl.textContent = s.apis.brevo.configured ? 'Configurado (API)' : 'No configurado';
                if (resendEl) resendEl.textContent = s.apis.resend.configured ? 'Configurado (API)' : 'No configurado';
                if (smtpEl) smtpEl.textContent = s.apis.smtp.configured ? 'Activo (' + s.apis.smtp.host + ')' : 'No configurado';

                // 6. Tarjeta Servidor Node
                const uptimeEl = document.getElementById('sys-server-uptime');
                const memEl = document.getElementById('sys-server-mem');
                const envEl = document.getElementById('sys-server-env');
                const nodeBadge = document.getElementById('sys-status-node');
                if (uptimeEl) {
                    const hours = Math.floor(s.uptime / 3600);
                    const mins = Math.floor((s.uptime % 3600) / 60);
                    uptimeEl.textContent = `${hours}h ${mins}m (${s.uptime}s)`;
                }
                if (memEl) memEl.textContent = `${s.memoryMb} MB`;
                if (envEl) envEl.textContent = s.environment || 'Production';
                if (nodeBadge) nodeBadge.textContent = s.nodeVersion || 'v20.x';

                if (showFeedback) {
                    alert('✅ Estado del sistema y conexiones actualizado correctamente.');
                }
            }
        } catch (err) {
            console.error('Error cargando estado del sistema:', err);
        }
    }

    function updateBotActiveUI(isActive) {
        const headerStatusPill = document.querySelector('.main-header .status-pill');
        if (isActive) {
            if (btnToggleBotActive) {
                btnToggleBotActive.className = 'btn-success';
                btnToggleBotActive.style.background = '#10b981';
                btnToggleBotActive.innerHTML = '🟢 Bot Activado (24/7)';
            }
            if (botMasterStatusBadge) {
                botMasterStatusBadge.className = 'status-pill online';
                botMasterStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                botMasterStatusBadge.style.color = '#10b981';
                botMasterStatusBadge.innerHTML = '<span class="dot"></span> Activo (24/7)';
            }
            if (headerStatusPill) {
                headerStatusPill.className = 'status-pill online';
                headerStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
                headerStatusPill.style.color = '#10b981';
                headerStatusPill.innerHTML = '<span class="dot"></span> Bot Activo 24/7';
            }
        } else {
            if (btnToggleBotActive) {
                btnToggleBotActive.className = 'btn-secondary';
                btnToggleBotActive.style.background = '#ef4444';
                btnToggleBotActive.style.color = '#ffffff';
                btnToggleBotActive.innerHTML = '⏸️ Bot Desactivado (Pausado)';
            }
            if (botMasterStatusBadge) {
                botMasterStatusBadge.className = 'status-pill';
                botMasterStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                botMasterStatusBadge.style.color = '#f87171';
                botMasterStatusBadge.innerHTML = '<span class="dot" style="background: #ef4444;"></span> Desactivado';
            }
            if (headerStatusPill) {
                headerStatusPill.className = 'status-pill';
                headerStatusPill.style.background = 'rgba(239, 68, 68, 0.2)';
                headerStatusPill.style.color = '#f87171';
                headerStatusPill.innerHTML = '<span class="dot" style="background: #ef4444;"></span> Bot Pausado';
            }
        }
    }

    if (btnToggleBotActive) {
        btnToggleBotActive.addEventListener('click', async () => {
            const nextState = !(currentSystemSettings.botActive !== false);
            const actionText = nextState ? '¿Deseas ACTIVAR las respuestas automáticas del chatbot?' : '¿Deseas DESACTIVAR / PAUSAR temporalmente el chatbot? Los mensajes de clientes no recibirán respuesta automática.';
            
            if (!confirm(actionText)) return;

            btnToggleBotActive.disabled = true;
            try {
                const res = await fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ botActive: nextState })
                });
                const data = await res.json();
                if (data.success && data.settings) {
                    currentSystemSettings = data.settings;
                    updateBotActiveUI(currentSystemSettings.botActive !== false);
                } else {
                    alert('Error al actualizar el estado del chatbot: ' + (data.error || 'Error desconocido'));
                }
            } catch (err) {
                alert('Error de conexión: ' + err.message);
            } finally {
                btnToggleBotActive.disabled = false;
            }
        });
    }

    if (saveMaintenanceSettingsBtn) {
        saveMaintenanceSettingsBtn.addEventListener('click', async () => {
            const msg = maintenanceMessageInput ? maintenanceMessageInput.value.trim() : '';
            const notice = sendMaintenanceNoticeCheck ? sendMaintenanceNoticeCheck.checked : false;

            saveMaintenanceSettingsBtn.disabled = true;
            try {
                const res = await fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({
                        maintenanceMessage: msg,
                        sendMaintenanceNotice: notice
                    })
                });
                const data = await res.json();
                if (data.success && data.settings) {
                    currentSystemSettings = data.settings;
                    alert('✅ Configuración de mantenimiento guardada exitosamente.');
                } else {
                    alert('Error al guardar la configuración: ' + (data.error || 'Error desconocido'));
                }
            } catch (err) {
                alert('Error de conexión: ' + err.message);
            } finally {
                saveMaintenanceSettingsBtn.disabled = false;
            }
        });
    }
     // ── GESTIÓN INTEGRAL DE GRUPOS DE WHATSAPP (CREACIÓN, MIEMBROS E INFORMACIÓN) ──────────

    function getClientCustomAvatar(phone, name = '') {
        const clean = getCleanPhoneKey(phone);
        if (!clean) return '';
        if (serverInboxSettings && serverInboxSettings.chatAvatars && serverInboxSettings.chatAvatars[clean]) {
            return serverInboxSettings.chatAvatars[clean];
        }
        const low = (name || '').toLowerCase();
        if (clean === 'group_taxi_casa_julian') return '/admin/taxi_img.png';
        if (clean === '34670426540' || low.includes('iguaran')) return '/admin/avatar_taxi_iguaran.png';
        if (clean === '34670449858' || low.includes('taxi tolosa')) return '/admin/avatar_taxi_tolosa.png';
        if (clean === '34636979092' || low.includes('lexus')) return '/admin/avatar_taxi_lexus.png';
        if (clean === '34943671417' || low.includes('casa julián tolosa')) return '/admin/casa_julian_logo_CJ.jpeg';
        if (clean === '34664037707' || low.includes('ander informatico')) return '/admin/ander_img.png';
        return '';
    }

    const DEFAULT_TAXI_GROUP = {
        id: "group_taxi_casa_julian",
        nombre: "Taxi Casa Julián",
        categoria: "taxi",
        avatar: "/admin/taxi_img.png",
        etiquetas: ["TAXIS", "GRUPO"],
        participants: [
            { telefono: '34670426540', nombre: 'Taxi Iguaran', avatar: '/admin/avatar_taxi_iguaran.png' },
            { telefono: '34670449858', nombre: 'Taxi Tolosa', avatar: '/admin/avatar_taxi_tolosa.png' },
            { telefono: '34636979092', nombre: 'Taxi Lexus', avatar: '/admin/avatar_taxi_lexus.png' },
            { telefono: '34943671417', nombre: 'Casa Julián Tolosa', avatar: '/admin/casa_julian_logo_CJ.jpeg', isOfficial: true }
        ],
        created_at: "2026-08-20T10:00:00.000Z"
    };

    function getAllKnownContactsList() {
        const contactsMap = new Map();

        // 1. Contactos de WhatsApp previos
        if (Array.isArray(allWhatsAppChats)) {
            allWhatsAppChats.forEach(c => {
                const clean = getCleanPhoneKey(c.telefono);
                if (!clean || clean.startsWith('group_') || c.isGroup) return;
                const name = c.nombreCliente && !c.nombreCliente.startsWith('+') ? c.nombreCliente : getClientDisplayName('', clean);
                const avatar = (serverInboxSettings && serverInboxSettings.chatAvatars && serverInboxSettings.chatAvatars[clean]) || getClientCustomAvatar(clean, name);
                contactsMap.set(clean, {
                    telefono: clean,
                    nombre: name,
                    avatar: avatar,
                    categoria: c.categoria || 'cliente',
                    etiquetas: getChatTags(clean, c)
                });
            });
        }

        // 2. Contactos de Solicitudes
        if (Array.isArray(allSolicitudes)) {
            allSolicitudes.forEach(s => {
                const rawTel = s.telefonoCliente || s.telefonoReserva || '';
                const clean = getCleanPhoneKey(rawTel);
                if (!clean || clean.startsWith('group_')) return;
                const existing = contactsMap.get(clean);
                const name = s.nombreCliente || (existing ? existing.nombre : `+${clean}`);
                if (!existing) {
                    contactsMap.set(clean, {
                        telefono: clean,
                        nombre: name,
                        avatar: (serverInboxSettings && serverInboxSettings.chatAvatars && serverInboxSettings.chatAvatars[clean]) || getClientCustomAvatar(clean, name),
                        categoria: s.categoria || 'cliente',
                        etiquetas: getChatTags(clean)
                    });
                } else if (s.nombreCliente && (!existing.nombre || existing.nombre.startsWith('+'))) {
                    existing.nombre = s.nombreCliente;
                }
            });
        }

        // 3. Contactos predeterminados y del equipo
        const defaultContacts = [
            { telefono: '34670426540', nombre: 'Taxi Iguaran', avatar: '/admin/avatar_taxi_iguaran.png', categoria: 'taxi', etiquetas: ['TAXIS'] },
            { telefono: '34670449858', nombre: 'Taxi Tolosa', avatar: '/admin/avatar_taxi_tolosa.png', categoria: 'taxi', etiquetas: ['TAXIS'] },
            { telefono: '34636979092', nombre: 'Taxi Lexus', avatar: '/admin/avatar_taxi_lexus.png', categoria: 'taxi', etiquetas: ['TAXIS'] },
            { telefono: '34664037707', nombre: 'Ander Informatico', avatar: '/admin/ander_img.png', categoria: 'personal', etiquetas: ['PERSONAL'] },
            { telefono: '34645747754', nombre: 'Xabi Gorrotxategi', avatar: '', categoria: 'personal', etiquetas: ['PERSONAL'] },
            { telefono: '34623476521', nombre: 'Ricardo Entretiempo Studio', avatar: '', categoria: 'personal', etiquetas: ['PERSONAL'] }
        ];

        defaultContacts.forEach(dc => {
            if (!contactsMap.has(dc.telefono)) {
                contactsMap.set(dc.telefono, dc);
            } else {
                const ex = contactsMap.get(dc.telefono);
                if (!ex.avatar && dc.avatar) ex.avatar = dc.avatar;
                if (!ex.nombre || ex.nombre.startsWith('+')) ex.nombre = dc.nombre;
            }
        });

        return Array.from(contactsMap.values()).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }

    let createGroupSelectedPhones = new Set();
    let selectedGroupPresetAvatar = '👥';

    function openCreateGroupModal(preselectedPhones = []) {
        const modal = document.getElementById('modal-create-group');
        if (!modal) {
            console.error('Modal #modal-create-group not found in DOM');
            return;
        }
        
        const nameInput = document.getElementById('group-create-name');
        const searchInput = document.getElementById('group-create-search-contacts');
        if (nameInput) nameInput.value = '';
        if (searchInput) searchInput.value = '';
        
        createGroupSelectedPhones.clear();
        if (Array.isArray(preselectedPhones)) {
            preselectedPhones.forEach(p => {
                const clean = getCleanPhoneKey(p);
                if (clean) createGroupSelectedPhones.add(clean);
            });
        }
        selectedGroupPresetAvatar = '👥';

        document.querySelectorAll('.group-preset-avatar-btn').forEach(btn => {
            if (btn.getAttribute('data-avatar') === '👥') {
                btn.classList.add('active');
                btn.style.border = '2px solid #10b981';
            } else {
                btn.classList.remove('active');
                btn.style.border = '1px solid rgba(255,255,255,0.15)';
            }
        });

        try {
            renderCreateGroupContactsList('');
        } catch(e) {
            console.error('Error rendering create group contacts list:', e);
        }
        
        modal.style.display = 'flex';
        if (nameInput) setTimeout(() => nameInput.focus(), 50);
    }

    function closeCreateGroupModal() {
        const modal = document.getElementById('modal-create-group');
        if (modal) modal.style.display = 'none';
    }

    function renderCreateGroupContactsList(filterText = '') {
        const container = document.getElementById('group-create-contacts-list');
        const countBadge = document.getElementById('group-selected-count-badge');
        if (!container) return;

        if (countBadge) {
            countBadge.textContent = `${createGroupSelectedPhones.size} seleccionados`;
        }

        const contacts = getAllKnownContactsList();
        const searchLow = (filterText || '').toLowerCase().trim();

        const filtered = contacts.filter(c => {
            if (!searchLow) return true;
            return (c.nombre || '').toLowerCase().includes(searchLow) || (c.telefono || '').includes(searchLow);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #8696a0; font-size: 0.84rem;">
                    No se encontraron contactos con ese criterio.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(c => {
            const isChecked = createGroupSelectedPhones.has(c.telefono);
            const avatarHtml = c.avatar 
                ? `<img src="${c.avatar}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;" onerror="this.outerHTML='<span style=\\'font-size:1rem\\'>👤</span>'">` 
                : `<span style="font-size: 1rem;">👤</span>`;
            const tagsHtml = (c.etiquetas || []).map(t => `<span class="wa-tag-pill" style="font-size: 0.65rem; padding: 1px 5px;">${t}</span>`).join(' ');

            return `
                <label class="group-contact-select-row" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; transition: background 0.12s; background: ${isChecked ? 'rgba(16, 185, 129, 0.12)' : 'transparent'};">
                    <input type="checkbox" class="group-contact-checkbox" data-phone="${c.telefono}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: #10b981;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        ${avatarHtml}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.86rem; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.nombre}</div>
                        <div style="font-size: 0.76rem; color: #94a3b8;">${formatPhoneWithPrefix(c.telefono)} ${tagsHtml ? '• ' + tagsHtml : ''}</div>
                    </div>
                </label>
            `;
        }).join('');

        container.querySelectorAll('.group-contact-checkbox').forEach(chk => {
            chk.addEventListener('change', () => {
                const phone = chk.getAttribute('data-phone');
                if (chk.checked) {
                    createGroupSelectedPhones.add(phone);
                } else {
                    createGroupSelectedPhones.delete(phone);
                }
                const row = chk.closest('.group-contact-select-row');
                if (row) {
                    row.style.background = chk.checked ? 'rgba(16, 185, 129, 0.12)' : 'transparent';
                }
                if (countBadge) {
                    countBadge.textContent = `${createGroupSelectedPhones.size} seleccionados`;
                }
            });
        });
    }

    // Selector de Emojis para Grupo
    document.querySelectorAll('.group-preset-avatar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.group-preset-avatar-btn').forEach(b => {
                b.classList.remove('active');
                b.style.border = '1px solid rgba(255,255,255,0.15)';
            });
            btn.classList.add('active');
            btn.style.border = '2px solid #10b981';
            selectedGroupPresetAvatar = btn.getAttribute('data-avatar') || '👥';
        });
    });

    const groupSearchInput = document.getElementById('group-create-search-contacts');
    if (groupSearchInput) {
        groupSearchInput.addEventListener('input', (e) => {
            renderCreateGroupContactsList(e.target.value);
        });
    }

    // Enviar formulario de creación de grupo
    const createGroupForm = document.getElementById('create-group-form');
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('group-create-name');
            const groupName = nameInput ? nameInput.value.trim() : '';
            if (!groupName) {
                alert('Introduce un nombre para el grupo.');
                return;
            }
            if (createGroupSelectedPhones.size === 0) {
                alert('Selecciona al menos 1 contacto para el grupo.');
                return;
            }

            const allContacts = getAllKnownContactsList();
            const participants = Array.from(createGroupSelectedPhones).map(phone => {
                const c = allContacts.find(item => item.telefono === phone);
                return {
                    telefono: phone,
                    nombre: c ? c.nombre : `+${phone}`,
                    avatar: c ? c.avatar : ''
                };
            });

            // Añadir al restaurante como participante oficial
            participants.push({
                telefono: '34943671417',
                nombre: 'Casa Julián Tolosa',
                avatar: '/admin/casa_julian_logo_CJ.jpeg',
                isOfficial: true
            });

            const newGroup = {
                nombre: groupName,
                avatar: selectedGroupPresetAvatar,
                categoria: 'grupo',
                etiquetas: ['GRUPO'],
                participants: participants,
                created_at: new Date().toISOString()
            };

            const submitBtn = document.getElementById('submit-create-group-btn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '⏳ Creando grupo...';
            }

            try {
                const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                const res = await fetch('/api/admin/groups', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': currentToken
                    },
                    body: JSON.stringify(newGroup)
                });
                const data = await res.json();
                if (data.success && data.group) {
                    showToast(`✅ Grupo "${data.group.nombre}" creado exitosamente.`);
                    closeCreateGroupModal();
                    if (!serverInboxSettings.customGroups) serverInboxSettings.customGroups = {};
                    serverInboxSettings.customGroups[data.group.id] = data.group;
                    await fetchWhatsAppChats(true);
                    syncUnifiedConversations();
                    renderInboxCards();
                    selectConversation(data.group.id, data.group.nombre);
                } else {
                    alert('Error creando el grupo: ' + (data.error || 'Desconocido'));
                }
            } catch (err) {
                alert('Error de conexión al crear el grupo: ' + err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '💾 Crear Grupo';
                }
            }
        });
    }

    // ── MODAL INFORMACIÓN Y MIEMBROS DE GRUPO ─────────────────────────────────
    let currentGroupInfoId = null;

    function openGroupInfoModal(groupId) {
        currentGroupInfoId = groupId;
        const modal = document.getElementById('modal-group-info');
        if (!modal) return;

        const groups = (serverInboxSettings && serverInboxSettings.customGroups) || {};
        let grp = groups[groupId];
        if (!grp && groupId === 'group_taxi_casa_julian') {
            grp = DEFAULT_TAXI_GROUP;
        }
        if (!grp) {
            const conv = allUnifiedConversations.find(c => c.telefono === groupId);
            if (conv) {
                grp = {
                    id: groupId,
                    nombre: conv.nombreCliente,
                    categoria: conv.categoria || 'grupo',
                    avatar: conv.avatar || '',
                    participants: conv.participants || []
                };
            }
        }

        if (!grp) {
            showToast('⚠️ No se encontró la información del grupo.');
            return;
        }

        const nameEl = document.getElementById('group-info-name');
        const countBadge = document.getElementById('group-info-members-count-badge');
        const avatarWrap = document.getElementById('group-info-avatar-wrap');
        const deleteBtn = document.getElementById('btn-group-info-delete-group');
        const searchInput = document.getElementById('group-info-search-members');

        if (nameEl) nameEl.textContent = grp.nombre;
        if (countBadge) countBadge.textContent = `${(grp.participants || []).length} contactos`;
        if (avatarWrap) {
            avatarWrap.innerHTML = grp.avatar && grp.avatar.startsWith('/') 
                ? `<img src="${grp.avatar}" style="width:100%;height:100%;object-fit:cover;">` 
                : `<span style="font-size:1.6rem;">${grp.avatar || '👥'}</span>`;
        }
        if (deleteBtn) {
            deleteBtn.style.display = (groupId === 'group_taxi_casa_julian') ? 'none' : 'inline-flex';
        }
        if (searchInput) searchInput.value = '';

        renderGroupInfoMembersList(grp, '');
        modal.style.display = 'flex';
    }

    function closeGroupInfoModal() {
        const modal = document.getElementById('modal-group-info');
        if (modal) modal.style.display = 'none';
        currentGroupInfoId = null;
    }

    function renderGroupInfoMembersList(grp, filterText = '') {
        const listContainer = document.getElementById('group-info-members-list');
        if (!listContainer || !grp) return;

        const participants = Array.isArray(grp.participants) ? grp.participants : [];
        const searchLow = (filterText || '').toLowerCase().trim();

        const filtered = participants.filter(p => {
            if (!searchLow) return true;
            return (p.nombre || '').toLowerCase().includes(searchLow) || (p.telefono || '').includes(searchLow);
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #8696a0; font-size: 0.84rem;">
                    No hay miembros en este grupo que coincidan.
                </div>
            `;
            return;
        }

        const isTaxiMain = grp.id === 'group_taxi_casa_julian';

        listContainer.innerHTML = filtered.map(p => {
            const cleanTel = getCleanPhoneKey(p.telefono);
            const avatarHtml = p.avatar 
                ? `<img src="${p.avatar}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;" onerror="this.outerHTML='<span style=\\'font-size:1.1rem\\'>👤</span>'">` 
                : `<span style="font-size: 1.1rem;">👤</span>`;

            return `
                <div class="group-member-card-row" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: #16202a; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                            ${avatarHtml}
                        </div>
                        <div style="min-width: 0; flex: 1;">
                            <div style="font-size: 0.88rem; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.nombre || formatPhoneWithPrefix(cleanTel)}</div>
                            <div style="font-size: 0.78rem; color: #94a3b8;">${formatPhoneWithPrefix(cleanTel)} ${p.isOfficial ? '• <span style="color:#38bdf8;">Restaurante</span>' : ''}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <a href="tel:+${cleanTel}" title="Llamar por teléfono" style="padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.08); color: #e2e8f0; text-decoration: none; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 3px;">
                            📞
                        </a>
                        <a href="https://wa.me/${cleanTel}" target="_blank" title="Abrir chat en WhatsApp" style="padding: 5px 8px; border-radius: 6px; background: rgba(16,185,129,0.18); color: #34d399; text-decoration: none; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 3px;">
                            💬
                        </a>
                        ${!isTaxiMain && !p.isOfficial ? `
                            <button type="button" class="btn-remove-group-member" data-phone="${cleanTel}" title="Quitar del grupo" style="padding: 5px 8px; border-radius: 6px; background: rgba(239,68,68,0.15); color: #fca5a5; border: none; font-size: 0.78rem; cursor: pointer;">
                                ✕
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.btn-remove-group-member').forEach(btn => {
            btn.addEventListener('click', async () => {
                const phoneToRemove = btn.getAttribute('data-phone');
                if (!confirm(`¿Quitar este contacto del grupo?`)) return;

                grp.participants = grp.participants.filter(p => getCleanPhoneKey(p.telefono) !== phoneToRemove);
                
                const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                try {
                    await fetch('/api/admin/groups', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-admin-token': currentToken
                        },
                        body: JSON.stringify(grp)
                    });
                    if (!serverInboxSettings.customGroups) serverInboxSettings.customGroups = {};
                    serverInboxSettings.customGroups[grp.id] = grp;
                    showToast('✅ Miembro eliminado del grupo.');
                    openGroupInfoModal(grp.id);
                    syncUnifiedConversations();
                    renderInboxCards();
                } catch(e) {
                    alert('Error eliminando miembro: ' + e.message);
                }
            });
        });
    }

    const groupInfoSearchInput = document.getElementById('group-info-search-members');
    if (groupInfoSearchInput) {
        groupInfoSearchInput.addEventListener('input', (e) => {
            if (!currentGroupInfoId) return;
            const groups = (serverInboxSettings && serverInboxSettings.customGroups) || {};
            const grp = groups[currentGroupInfoId] || (currentGroupInfoId === 'group_taxi_casa_julian' ? DEFAULT_TAXI_GROUP : null);
            if (grp) renderGroupInfoMembersList(grp, e.target.value);
        });
    }

    // Eliminar Grupo Completo
    const btnGroupInfoDeleteGroup = document.getElementById('btn-group-info-delete-group');
    if (btnGroupInfoDeleteGroup) {
        btnGroupInfoDeleteGroup.addEventListener('click', async () => {
            if (!currentGroupInfoId || currentGroupInfoId === 'group_taxi_casa_julian') return;
            const groups = (serverInboxSettings && serverInboxSettings.customGroups) || {};
            const grp = groups[currentGroupInfoId];
            const groupName = grp ? grp.nombre : 'este grupo';
            if (!confirm(`¿Estás seguro de que deseas eliminar el grupo "${groupName}"?`)) return;

            try {
                const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                const res = await fetch(`/api/admin/groups/${currentGroupInfoId}`, {
                    method: 'DELETE',
                    headers: { 'x-admin-token': currentToken }
                });
                const data = await res.json();
                if (data.success) {
                    showToast(`🗑️ Grupo "${groupName}" eliminado.`);
                    closeGroupInfoModal();
                    if (serverInboxSettings.customGroups) {
                        delete serverInboxSettings.customGroups[currentGroupInfoId];
                    }
                    allUnifiedConversations = allUnifiedConversations.filter(c => c.telefono !== currentGroupInfoId);
                    allWhatsAppChats = allWhatsAppChats.filter(c => c.telefono !== currentGroupInfoId);
                    if (activeConversationPhone === currentGroupInfoId) {
                        activeConversationPhone = null;
                        const emptyState = document.getElementById('wa-empty-state');
                        const activePanel = document.getElementById('wa-active-chat-panel');
                        if (emptyState) emptyState.style.display = 'flex';
                        if (activePanel) activePanel.style.display = 'none';
                    }
                    renderInboxCards();
                } else {
                    alert('Error eliminando grupo: ' + (data.error || 'Desconocido'));
                }
            } catch(err) {
                alert('Error de conexión: ' + err.message);
            }
        });
    }

    // ── MODAL AÑADIR MIEMBRO A GRUPO EXISTENTE ───────────────────────────────
    let addMembersSelectedPhones = new Set();

    function openGroupAddMemberModal(groupId) {
        const modal = document.getElementById('modal-group-add-member');
        if (!modal) return;
        
        const searchInput = document.getElementById('group-add-member-search-input');
        if (searchInput) searchInput.value = '';
        addMembersSelectedPhones.clear();

        renderGroupAddMembersList(groupId, '');
        modal.style.display = 'flex';
    }

    function closeGroupAddMemberModal() {
        const modal = document.getElementById('modal-group-add-member');
        if (modal) modal.style.display = 'none';
    }

    function renderGroupAddMembersList(groupId, filterText = '') {
        const container = document.getElementById('group-add-member-contacts-list');
        if (!container) return;

        const groups = (serverInboxSettings && serverInboxSettings.customGroups) || {};
        const grp = groups[groupId] || (groupId === 'group_taxi_casa_julian' ? DEFAULT_TAXI_GROUP : null);
        const existingPhones = new Set((grp && grp.participants ? grp.participants : []).map(p => getCleanPhoneKey(p.telefono)));

        const allContacts = getAllKnownContactsList();
        const availableContacts = allContacts.filter(c => !existingPhones.has(c.telefono));
        const searchLow = (filterText || '').toLowerCase().trim();

        const filtered = availableContacts.filter(c => {
            if (!searchLow) return true;
            return (c.nombre || '').toLowerCase().includes(searchLow) || (c.telefono || '').includes(searchLow);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #8696a0; font-size: 0.84rem;">
                    Todos los contactos disponibles ya forman parte de este grupo.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(c => {
            const isChecked = addMembersSelectedPhones.has(c.telefono);
            const avatarHtml = c.avatar 
                ? `<img src="${c.avatar}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">` 
                : `<span style="font-size: 1rem;">👤</span>`;

            return `
                <label class="group-contact-select-row" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; transition: background 0.12s; background: ${isChecked ? 'rgba(56, 189, 248, 0.12)' : 'transparent'};">
                    <input type="checkbox" class="group-add-contact-checkbox" data-phone="${c.telefono}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: #38bdf8;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        ${avatarHtml}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.86rem; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.nombre}</div>
                        <div style="font-size: 0.76rem; color: #94a3b8;">${formatPhoneWithPrefix(c.telefono)}</div>
                    </div>
                </label>
            `;
        }).join('');

        container.querySelectorAll('.group-add-contact-checkbox').forEach(chk => {
            chk.addEventListener('change', () => {
                const phone = chk.getAttribute('data-phone');
                if (chk.checked) {
                    addMembersSelectedPhones.add(phone);
                } else {
                    addMembersSelectedPhones.delete(phone);
                }
                const row = chk.closest('.group-contact-select-row');
                if (row) {
                    row.style.background = chk.checked ? 'rgba(56, 189, 248, 0.12)' : 'transparent';
                }
            });
        });
    }

    const btnGroupInfoAddContact = document.getElementById('btn-group-info-add-contact');
    if (btnGroupInfoAddContact) {
        btnGroupInfoAddContact.addEventListener('click', () => {
            if (currentGroupInfoId) openGroupAddMemberModal(currentGroupInfoId);
        });
    }

    const groupAddMemberSearchInput = document.getElementById('group-add-member-search-input');
    if (groupAddMemberSearchInput) {
        groupAddMemberSearchInput.addEventListener('input', (e) => {
            if (!currentGroupInfoId) return;
            renderGroupAddMembersList(currentGroupInfoId, e.target.value);
        });
    }

    const saveGroupAddMemberBtn = document.getElementById('save-group-add-member-btn');
    if (saveGroupAddMemberBtn) {
        saveGroupAddMemberBtn.addEventListener('click', async () => {
            if (!currentGroupInfoId) return;
            if (addMembersSelectedPhones.size === 0) {
                alert('Selecciona al menos 1 contacto para añadir al grupo.');
                return;
            }

            const groups = (serverInboxSettings && serverInboxSettings.customGroups) || {};
            let grp = groups[currentGroupInfoId] || (currentGroupInfoId === 'group_taxi_casa_julian' ? DEFAULT_TAXI_GROUP : null);
            if (!grp) return;

            const allContacts = getAllKnownContactsList();
            if (!Array.isArray(grp.participants)) grp.participants = [];

            addMembersSelectedPhones.forEach(phone => {
                const c = allContacts.find(item => item.telefono === phone);
                grp.participants.push({
                    telefono: phone,
                    nombre: c ? c.nombre : `+${phone}`,
                    avatar: c ? c.avatar : ''
                });
            });

            try {
                const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                await fetch('/api/admin/groups', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': currentToken
                    },
                    body: JSON.stringify(grp)
                });
                if (!serverInboxSettings.customGroups) serverInboxSettings.customGroups = {};
                serverInboxSettings.customGroups[grp.id] = grp;
                showToast('✅ Contactos añadidos al grupo.');
                closeGroupAddMemberModal();
                openGroupInfoModal(grp.id);
                syncUnifiedConversations();
                renderInboxCards();
            } catch(e) {
                alert('Error añadiendo miembros: ' + e.message);
            }
        });
    }

    // ===== MODAL: INICIAR NUEVO CHAT =====
    function openNewChatModal() {
        const modal = document.getElementById('modal-new-chat');
        if (!modal) return;
        const phoneInput = document.getElementById('new-chat-phone-input');
        const searchInput = document.getElementById('new-chat-search-contacts');
        if (phoneInput) phoneInput.value = '';
        if (searchInput) searchInput.value = '';
        renderNewChatContactsList('');
        modal.style.display = 'flex';
        if (phoneInput) setTimeout(() => phoneInput.focus(), 50);
    }

    function closeNewChatModal() {
        const modal = document.getElementById('modal-new-chat');
        if (modal) modal.style.display = 'none';
    }

    function renderNewChatContactsList(filterText = '') {
        const container = document.getElementById('new-chat-contacts-list');
        if (!container) return;
        const contacts = getAllKnownContactsList();
        const searchLow = (filterText || '').toLowerCase().trim();
        const filtered = contacts.filter(c => {
            if (!searchLow) return true;
            return (c.nombre || '').toLowerCase().includes(searchLow) || (c.telefono || '').includes(searchLow);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="padding: 18px; text-align: center; color: #8696a0; font-size: 0.84rem;">
                    No se encontraron contactos.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(c => {
            const avatarHtml = c.avatar 
                ? `<img src="${c.avatar}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;" onerror="this.outerHTML='<span style=\\'font-size:1rem\\'>👤</span>'">` 
                : `<span style="font-size: 1rem;">👤</span>`;
            return `
                <div class="new-chat-contact-item" data-phone="${c.telefono}" data-name="${encodeURIComponent(c.nombre)}" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; transition: background 0.12s; background: rgba(255,255,255,0.03); margin-bottom: 2px;">
                    <div style="width: 30px; height: 30px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        ${avatarHtml}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.88rem; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.nombre}</div>
                        <div style="font-size: 0.76rem; color: #94a3b8;">${formatPhoneWithPrefix(c.telefono)}</div>
                    </div>
                    <span style="color: #10b981; font-size: 0.85rem; font-weight: 700;">💬</span>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.new-chat-contact-item').forEach(item => {
            item.addEventListener('click', () => {
                const phone = item.getAttribute('data-phone');
                const name = decodeURIComponent(item.getAttribute('data-name') || '');
                startNewChatWith(phone, name);
            });
        });
    }

    function startNewChatWith(phone, name = '') {
        const clean = getCleanPhoneKey(phone);
        if (!clean) {
            alert('Introduce un número de WhatsApp válido.');
            return;
        }
        closeNewChatModal();
        // Cambiar a la pestaña de Buzón si no estamos en ella
        const tabInboxBtn = document.getElementById('tab-btn-inbox') || document.getElementById('dropdown-tab-inbox');
        if (tabInboxBtn) tabInboxBtn.click();

        // Buscar si ya existe la conversación o inicializarla
        let conv = allUnifiedConversations.find(c => getCleanPhoneKey(c.telefono) === clean);
        if (!conv) {
            conv = {
                telefono: clean,
                nombreCliente: name || `+${clean}`,
                ultimoTexto: 'Chat iniciado manualmente',
                ultimoMensajeFecha: new Date().toISOString(),
                ultimoEmisor: 'restaurante',
                solicitudEstado: 'RESUELTA',
                unreadCount: 0
            };
            allUnifiedConversations.unshift(conv);
            renderInboxCards();
        }
        selectConversation(clean, name || conv.nombreCliente);
    }

    // Botón ➕ en el Header con Dropdown (+Chat / +Grupo)
    const headerBtnCreateAction = document.getElementById('header-btn-create-action');
    const headerCreateDropdown = document.getElementById('header-create-dropdown');
    const dropdownActionNewChat = document.getElementById('dropdown-action-new-chat');
    const dropdownActionNewGroup = document.getElementById('dropdown-action-new-group');

    if (headerBtnCreateAction && headerCreateDropdown) {
        headerBtnCreateAction.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = headerCreateDropdown.style.display === 'flex';
            headerCreateDropdown.style.display = isOpen ? 'none' : 'flex';
        });

        if (dropdownActionNewChat) {
            dropdownActionNewChat.addEventListener('click', (e) => {
                e.stopPropagation();
                headerCreateDropdown.style.display = 'none';
                openNewChatModal();
            });
        }

        if (dropdownActionNewGroup) {
            dropdownActionNewGroup.addEventListener('click', (e) => {
                e.stopPropagation();
                headerCreateDropdown.style.display = 'none';
                openCreateGroupModal();
            });
        }
    }

    // Cerrar dropdown de creación al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (headerCreateDropdown && headerCreateDropdown.style.display === 'flex') {
            if (!headerCreateDropdown.contains(e.target) && e.target !== headerBtnCreateAction) {
                headerCreateDropdown.style.display = 'none';
            }
        }
    });

    // Eventos de New Chat Modal
    const btnSubmitNewChatPhone = document.getElementById('btn-submit-new-chat-phone');
    const newChatPhoneInput = document.getElementById('new-chat-phone-input');
    const newChatSearchContacts = document.getElementById('new-chat-search-contacts');
    const closeNewChatModalBtn = document.getElementById('close-new-chat-modal-btn');
    const btnXCloseNewChat = document.getElementById('btn-x-close-new-chat');

    if (btnSubmitNewChatPhone && newChatPhoneInput) {
        btnSubmitNewChatPhone.addEventListener('click', () => {
            const raw = newChatPhoneInput.value.trim();
            if (raw) startNewChatWith(raw);
        });
        newChatPhoneInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const raw = newChatPhoneInput.value.trim();
                if (raw) startNewChatWith(raw);
            }
        });
    }

    if (newChatSearchContacts) {
        newChatSearchContacts.addEventListener('input', (e) => {
            renderNewChatContactsList(e.target.value);
        });
    }

    if (closeNewChatModalBtn) closeNewChatModalBtn.addEventListener('click', closeNewChatModal);
    if (btnXCloseNewChat) btnXCloseNewChat.addEventListener('click', closeNewChatModal);

    // Eventos de botones y modales existentes
    const inboxBtnCreateGroup = document.getElementById('btn-inbox-create-group');
    if (inboxBtnCreateGroup) inboxBtnCreateGroup.addEventListener('click', openCreateGroupModal);

    const closeCreateGroupBtn = document.getElementById('close-create-group-modal-btn');
    const btnXCloseCreateGroup = document.getElementById('btn-x-close-create-group');
    if (closeCreateGroupBtn) closeCreateGroupBtn.addEventListener('click', closeCreateGroupModal);
    if (btnXCloseCreateGroup) btnXCloseCreateGroup.addEventListener('click', closeCreateGroupModal);

    const closeGroupInfoBtn = document.getElementById('close-group-info-modal-btn');
    const btnXCloseGroupInfo = document.getElementById('btn-x-close-group-info');
    if (closeGroupInfoBtn) closeGroupInfoBtn.addEventListener('click', closeGroupInfoModal);
    if (btnXCloseGroupInfo) btnXCloseGroupInfo.addEventListener('click', closeGroupInfoModal);

    const closeGroupAddMemberBtn = document.getElementById('close-group-add-member-modal-btn');
    const btnXCloseGroupAddMember = document.getElementById('btn-x-close-group-add-member');
    if (closeGroupAddMemberBtn) closeGroupAddMemberBtn.addEventListener('click', closeGroupAddMemberModal);
    if (btnXCloseGroupAddMember) btnXCloseGroupAddMember.addEventListener('click', closeGroupAddMemberModal);

    // Evento de clic en cabecera del chat activo para abrir Info de Grupo
    const headerInfoWrap = document.getElementById('pane-chat-header-info-wrap');
    const headerAvatar = document.getElementById('pane-chat-avatar');
    const groupBadge = document.getElementById('pane-group-members-badge');

    [headerInfoWrap, headerAvatar, groupBadge].forEach(el => {
        if (el) {
            el.addEventListener('click', () => {
                if (activeConversationPhone && (activeConversationPhone.startsWith('group_') || (activeReplySolicitud && activeReplySolicitud.isGroup))) {
                    openGroupInfoModal(activeConversationPhone);
                }
            });
        }
    });

});

