document.addEventListener('DOMContentLoaded', () => {
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

    // Helper unificado para obtener el nombre del cliente o su teléfono si no tiene nombre registrado
    function getClientDisplayName(name, phone) {
        const cleanPhone = (phone || '').toString().replace(/\D/g, '');
        const phoneWithPlus = cleanPhone ? `+${cleanPhone}` : '';
        if (!name || typeof name !== 'string') return phoneWithPlus || 'Cliente';
        const trimmed = name.trim();
        const lower = trimmed.toLowerCase();
        if (!trimmed || lower.startsWith('cliente whatsapp') || lower === 'cliente' || lower === 'contacto' || lower === 'cliente wa') {
            return phoneWithPlus || 'Cliente';
        }
        return trimmed;
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
            const data = await res.json();

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

    // Título de la pestaña activa en el Header
    function updateHeaderActiveTab(tabId) {
        currentActiveTabId = tabId;

        document.body.classList.toggle('is-inbox-active-body', tabId === 'tab-inbox');

        const mainLayout = document.querySelector('.main-layout');
        if (mainLayout) {
            mainLayout.classList.toggle('is-inbox-active', tabId === 'tab-inbox');
        }

        const iconEl = document.getElementById('header-active-tab-icon');
        const nameEl = document.getElementById('header-active-tab-name');
        const badgeEl = document.getElementById('header-active-tab-badge');
        if (!nameEl) return;

        if (tabId === 'tab-inbox') {
            if (iconEl) iconEl.textContent = '📥';
            nameEl.textContent = 'Buzón';
            if (badgeEl) {
                const count = getPendingConversationsCount();
                badgeEl.textContent = count;
                badgeEl.style.background = '#ef4444';
                badgeEl.style.color = '#fff';
                badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
            }
        } else if (tabId === 'tab-silenced') {
            if (iconEl) iconEl.textContent = '🔇';
            nameEl.textContent = 'Números Bot Cancelados';
            if (badgeEl) {
                const count = (typeof allSilencedNumbers !== 'undefined' && Array.isArray(allSilencedNumbers)) 
                    ? allSilencedNumbers.length 
                    : 0;
                badgeEl.textContent = count;
                badgeEl.style.background = '#a855f7';
                badgeEl.style.color = '#fff';
                badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
            }
        } else if (tabId === 'tab-flow') {
            if (iconEl) iconEl.textContent = '🌳';
            nameEl.textContent = 'Estructura & Árbol de Flujos';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-texts') {
            if (iconEl) iconEl.textContent = '📝';
            nameEl.textContent = 'Editor de Mensajes & Textos';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-rules') {
            if (iconEl) iconEl.textContent = '⚙️';
            nameEl.textContent = 'Flujo & Respuestas Clave';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-publish') {
            if (iconEl) iconEl.textContent = '🚀';
            nameEl.textContent = 'Comprobar y Subir';
            if (badgeEl) badgeEl.style.display = 'none';
        } else if (tabId === 'tab-settings') {
            if (iconEl) iconEl.textContent = '⚙️';
            nameEl.textContent = 'Diagnóstico & Ajustes';
            if (badgeEl) badgeEl.style.display = 'none';
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
                fetchSolicitudes();
                fetchWhatsAppChats();
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
        { id: 30, telefono: "34658704257", nombre: "Personal", categoria: "empleado", notas: "Personal / Empleado", activo: true }
    ];

    // ==========================================
    // SECCIÓN: GESTIÓN DE NÚMEROS SILENCIADOS (PROVEEDORES / EMPLEADOS / ALBA)
    // ==========================================
    let allSilencedNumbers = [...DEFAULT_INITIAL_SILENCED];
    let currentSilencedFilter = 'all';
    let currentSilencedSearch = '';

    const searchSilencedInput = document.getElementById('search-silenced-input');
    const refreshSilencedBtn = document.getElementById('refresh-silenced-btn');
    const addSilencedNumberBtn = document.getElementById('add-silenced-number-btn');
    const silencedModal = document.getElementById('silenced-modal');
    const silencedModalTitle = document.getElementById('silenced-modal-title');
    const silencedNumberForm = document.getElementById('silenced-number-form');
    const silencedPhoneInput = document.getElementById('silenced-phone-input');
    const silencedNameInput = document.getElementById('silenced-name-input');
    const silencedCatSelect = document.getElementById('silenced-cat-select');
    const silencedNotesInput = document.getElementById('silenced-notes-input');
    const closeSilencedModalBtn = document.getElementById('close-silenced-modal-btn');

    async function fetchSilencedNumbers() {
        // Pintar de inmediato los datos locales
        renderSilencedNumbersTable();
        try {
            const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch('/api/admin/silenced-numbers', {
                headers: { 'x-admin-token': tokenToUse }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.numbers) && data.numbers.length > 0) {
                    allSilencedNumbers = data.numbers;
                    renderSilencedNumbersTable();
                }
            }
        } catch (err) {
            console.error("⚠️ Error cargando números silenciados:", err.message);
        }
    }

    function renderSilencedNumbersTable() {
        const tbody = document.getElementById('silenced-numbers-table-body');
        const badge = document.getElementById('silenced-count-badge');
        if (!tbody) return;

        // Actualizar contadores
        const total = allSilencedNumbers.length;
        const countProv = allSilencedNumbers.filter(n => n.categoria === 'proveedor').length;
        const countEmp = allSilencedNumbers.filter(n => n.categoria === 'empleado' || n.categoria === 'alba').length;
        const countOtro = allSilencedNumbers.filter(n => n.categoria !== 'proveedor' && n.categoria !== 'empleado' && n.categoria !== 'alba').length;

        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline-block' : 'none';
        }
        const dropdownSilencedBadge = document.getElementById('dropdown-silenced-badge');
        if (dropdownSilencedBadge) {
            dropdownSilencedBadge.textContent = total;
            dropdownSilencedBadge.style.display = total > 0 ? 'inline-block' : 'none';
        }
        const cAll = document.getElementById('count-silenced-all');
        const cProv = document.getElementById('count-silenced-prov');
        const cEmp = document.getElementById('count-silenced-emp');
        const cOtro = document.getElementById('count-silenced-otro');
        if (cAll) cAll.textContent = total;
        if (cProv) cProv.textContent = countProv;
        if (cEmp) cEmp.textContent = countEmp;
        if (cOtro) cOtro.textContent = countOtro;

        let filtered = [...allSilencedNumbers];

        // Filtrar por categoría
        if (currentSilencedFilter !== 'all') {
            if (currentSilencedFilter === 'empleado') {
                filtered = filtered.filter(n => n.categoria === 'empleado' || n.categoria === 'alba');
            } else if (currentSilencedFilter === 'otro') {
                filtered = filtered.filter(n => n.categoria !== 'proveedor' && n.categoria !== 'empleado' && n.categoria !== 'alba');
            } else {
                filtered = filtered.filter(n => n.categoria === currentSilencedFilter);
            }
        }

        // Filtrar por búsqueda
        if (currentSilencedSearch.trim()) {
            const q = currentSilencedSearch.toLowerCase().trim();
            filtered = filtered.filter(n => 
                (n.nombre || '').toLowerCase().includes(q) ||
                (n.telefono || '').toLowerCase().includes(q) ||
                (n.notas || '').toLowerCase().includes(q)
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #94a3b8; padding: 40px;">
                        No se encontraron números silenciados con los filtros actuales.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(item => {
            let catBadge = `<span style="background: rgba(168, 85, 247, 0.2); color: #c084fc; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700;">🚚 Proveedor</span>`;
            if (item.categoria === 'empleado' || item.categoria === 'alba') {
                catBadge = `<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700;">👷 Empleado / Personal</span>`;
            } else if (item.categoria !== 'proveedor') {
                catBadge = `<span style="background: rgba(234, 179, 8, 0.2); color: #fde047; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700;">📌 ${item.categoria}</span>`;
            }

            const cleanPhone = (item.telefono || '').toString().replace(/\D/g, '');
            const isSilencedActive = item.activo !== false;
            const statusHtml = isSilencedActive
                ? `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 3px 8px; border-radius: 12px; font-size: 0.74rem; font-weight: 700;">🔇 Bot Cancelado</span>`
                : `<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 3px 8px; border-radius: 12px; font-size: 0.74rem; font-weight: 700;">🤖 Bot Activo</span>`;

            return `
                <tr class="silenced-row-item" style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                    <td class="col-name" style="padding: 12px 16px; font-weight: 600; color: #f8fafc;">
                        <div class="silenced-mobile-header">
                            <span class="silenced-contact-name">${item.nombre || 'Contacto'}</span>
                            <span class="silenced-cat-badge mobile-only-cat">${catBadge}</span>
                        </div>
                    </td>
                    <td class="col-phone" style="padding: 12px 16px; color: #38bdf8; font-family: monospace;">
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="silenced-phone-link" style="color: #38bdf8; text-decoration: none;">
                            📞 +${item.telefono}
                        </a>
                    </td>
                    <td class="col-cat desktop-only-cell" style="padding: 12px 16px;">
                        ${catBadge}
                    </td>
                    <td class="col-notes" style="padding: 12px 16px; color: #94a3b8; font-size: 0.84rem;">
                        <span class="silenced-notes-text">${item.notas ? '📝 ' + item.notas : '-'}</span>
                    </td>
                    <td class="col-status" style="padding: 12px 16px; text-align: center;">
                        ${statusHtml}
                    </td>
                    <td class="col-actions" style="padding: 12px 16px; text-align: right; white-space: nowrap;">
                        <div class="silenced-actions-group">
                            <button class="btn-toggle-silence" data-id="${item.id}" data-active="${isSilencedActive}" style="background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); font-size: 0.76rem; padding: 5px 10px; border-radius: 6px; cursor: pointer;" title="${isSilencedActive ? 'Reactivar chatbot para este número' : 'Cancelar respuestas automáticas del bot'}">
                                ${isSilencedActive ? '🔔 Activar Bot' : '🔇 Cancelar Bot'}
                            </button>
                            <button class="btn-delete-silence" data-id="${item.id}" data-name="${encodeURIComponent(item.nombre || 'Contacto')}" style="background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.76rem; padding: 5px 10px; border-radius: 6px; cursor: pointer;" title="Eliminar de la lista">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Listeners para acciones de la tabla
        tbody.querySelectorAll('.btn-toggle-silence').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const currentActive = btn.getAttribute('data-active') === 'true';
                try {
                    await fetch(`/api/admin/silenced-numbers/${id}/toggle`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                        body: JSON.stringify({ activo: !currentActive })
                    });
                    await fetchSilencedNumbers();
                } catch (err) {
                    alert('Error cambiando estado: ' + err.message);
                }
            });
        });

        tbody.querySelectorAll('.btn-delete-silence').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Contacto');
                if (!confirm(`¿Eliminar a "${name}" de la lista de números con bot cancelado? El bot volverá a responderle con menús automáticos.`)) return;
                try {
                    await fetch(`/api/admin/silenced-numbers/${id}`, {
                        method: 'DELETE',
                        headers: { 'x-admin-token': adminToken }
                    });
                    await fetchSilencedNumbers();
                } catch (err) {
                    alert('Error al eliminar: ' + err.message);
                }
            });
        });
    }

    function openSilencedModal(prefillPhone = '', prefillName = '') {
        if (!silencedModal) return;
        if (silencedPhoneInput) silencedPhoneInput.value = prefillPhone;
        if (silencedNameInput) silencedNameInput.value = prefillName;
        if (silencedCatSelect) silencedCatSelect.value = 'proveedor';
        if (silencedNotesInput) silencedNotesInput.value = '';
        silencedModal.style.display = 'flex';
    }

    function closeSilencedModal() {
        if (silencedModal) silencedModal.style.display = 'none';
    }

    if (closeSilencedModalBtn) closeSilencedModalBtn.addEventListener('click', closeSilencedModal);
    if (addSilencedNumberBtn) addSilencedNumberBtn.addEventListener('click', () => openSilencedModal());
    if (refreshSilencedBtn) refreshSilencedBtn.addEventListener('click', fetchSilencedNumbers);

    if (searchSilencedInput) {
        searchSilencedInput.addEventListener('input', (e) => {
            currentSilencedSearch = e.target.value;
            renderSilencedNumbersTable();
        });
    }

    document.querySelectorAll('[data-silenced-cat]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-silenced-cat]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentSilencedFilter = chip.getAttribute('data-silenced-cat');
            renderSilencedNumbersTable();
        });
    });

    if (silencedNumberForm) {
        silencedNumberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = silencedPhoneInput ? silencedPhoneInput.value.trim() : '';
            const name = silencedNameInput ? silencedNameInput.value.trim() : '';
            const cat = silencedCatSelect ? silencedCatSelect.value : 'proveedor';
            const notes = silencedNotesInput ? silencedNotesInput.value.trim() : '';

            if (!phone || !name) {
                alert('Por favor, introduce al menos el teléfono y el nombre.');
                return;
            }

            try {
                const res = await fetch('/api/admin/silenced-numbers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                    body: JSON.stringify({ telefono: phone, nombre: name, categoria: cat, notas })
                });
                const data = await res.json();
                if (data.success) {
                    closeSilencedModal();
                    await fetchSilencedNumbers();
                    alert(`✅ Número ${phone} (${name}) guardado exitosamente en la lista de Números Bot Cancelados.`);
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
            if (typeof updateHeaderActiveTab === 'function') updateHeaderActiveTab('tab-inbox');
            // Cargar solicitudes, chats y números silenciados y empezar polling en tiempo real cada 3.5s
            await fetchSolicitudes();
            await fetchWhatsAppChats();
            await fetchSilencedNumbers();
            if (!inboxPollingInterval) {
                inboxPollingInterval = setInterval(() => {
                    fetchSolicitudes();
                    fetchWhatsAppChats();
                    fetchSilencedNumbers();
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

        // Iniciar polling continuo en tiempo real (cada 3.5s) tanto para solicitudes como para chats
        await fetchSolicitudes();
        await fetchWhatsAppChats();
        await fetchSilencedNumbers();
        if (!inboxPollingInterval) {
            inboxPollingInterval = setInterval(() => {
                fetchSolicitudes();
                fetchWhatsAppChats();
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

    // ── Chats Fijados con Chincheta ──────────────────────────────────────────
    let activeCardDropdownPhone = null;

    function getPinnedChatsMap() {
        try {
            const saved = localStorage.getItem('casa_julian_pinned_chats');
            let map = saved ? JSON.parse(saved) : null;
            if (!map || typeof map !== 'object' || Object.keys(map).length === 0) {
                // Valores por defecto alineados con los chats destacados de WhatsApp Business
                map = {
                    "34645747754": true, // Xabi Gorrotxategi
                    "34623476521": true, // Ricardo Entretiempo Studio
                    "41795958760": true  // +41 79 595 87 60
                };
                localStorage.setItem('casa_julian_pinned_chats', JSON.stringify(map));
            }
            return map;
        } catch (e) {
            return {
                "34645747754": true,
                "34623476521": true,
                "41795958760": true
            };
        }
    }

    function toggleChatPinned(phone) {
        const clean = (phone || '').replace(/\D/g, '');
        if (!clean) return false;
        const map = getPinnedChatsMap();
        if (map[clean]) {
            delete map[clean];
            localStorage.setItem('casa_julian_pinned_chats', JSON.stringify(map));
            return false;
        } else {
            map[clean] = true;
            localStorage.setItem('casa_julian_pinned_chats', JSON.stringify(map));
            return true;
        }
    }

    function isChatPinned(phone) {
        const clean = (phone || '').replace(/\D/g, '');
        const map = getPinnedChatsMap();
        return !!map[clean];
    }

    // ── Estado Unificado del Buzón de Recepción ──────────────────────────────

    // Mapa de estados manuales (persistido en localStorage)
    function getManualChatStatusMap() {
        try {
            return JSON.parse(localStorage.getItem('casa_julian_manual_chat_status') || '{}');
        } catch (e) {
            return {};
        }
    }

    function setManualChatStatus(phone, status) {
        const map = getManualChatStatusMap();
        const clean = (phone || '').replace(/\D/g, '');
        if (clean) {
            map[clean] = status; // 'pendiente' o 'leido'
            localStorage.setItem('casa_julian_manual_chat_status', JSON.stringify(map));
        }
    }

    function getConversationStatus(c) {
        const cleanPhone = (c.telefono || '').replace(/\D/g, '');
        const manualMap = getManualChatStatusMap();
        if (manualMap[cleanPhone]) {
            return manualMap[cleanPhone]; // 'pendiente' o 'leido'
        }
        // Por defecto: si tiene solicitud activa en PENDIENTE o EN_ATENCION, o último mensaje del cliente
        if (c.solicitudEstado === 'PENDIENTE' || c.solicitudEstado === 'EN_ATENCION') {
            return 'pendiente';
        }
        if (c.ultimoEmisor === 'cliente' || c.ultimoEmisor === 'user') {
            return 'pendiente';
        }
        return 'leido';
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

    // Cargar Solicitudes desde Backend y Detectar Mensajes Nuevos en Tiempo Real
    async function fetchSolicitudes() {
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

                syncUnifiedConversations();
                renderInboxCards();
                renderMinimizedChatsStack();
            }
        } catch (err) {
            console.error("⚠️ Error cargando solicitudes del buzón:", err);
        }
    }

    async function fetchWhatsAppChats() {
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
                syncUnifiedConversations();
                renderInboxCards();
            } else {
                console.warn("⚠️ [Chats WhatsApp] Error HTTP en /api/admin/chats:", res.status);
            }
        } catch (err) {
            console.error("⚠️ Error cargando conversaciones de WhatsApp:", err);
        }
    }

    // Combina chats de historial con solicitudes y contactos para tener la lista completa
    function syncUnifiedConversations() {
        const map = new Map();

        // 1. Agregar todas las conversaciones de WhatsApp
        allWhatsAppChats.forEach(c => {
            const phoneClean = (c.telefono || '').replace(/\D/g, '');
            if (!phoneClean) return;
            map.set(phoneClean, {
                telefono: phoneClean,
                nombreCliente: c.nombreCliente || `+${phoneClean}`,
                categoria: c.categoria || 'cliente',
                ultimoMensajeFecha: c.ultimoMensajeFecha || new Date().toISOString(),
                ultimoTexto: c.ultimoTexto || '',
                ultimoEmisor: c.ultimoEmisor || 'cliente',
                totalInteracciones: c.totalInteracciones || 1,
                solicitudId: c.solicitudId || null,
                solicitudEstado: c.solicitudEstado || null,
                tipoSolicitud: c.tipoSolicitud || null
            });
        });

        // 2. Vincular o insertar solicitudes activas
        allSolicitudes.forEach(sol => {
            const phoneClean = (sol.telefonoCliente || sol.telefonoReserva || '').replace(/\D/g, '');
            if (!phoneClean) return;
            if (map.has(phoneClean)) {
                const item = map.get(phoneClean);
                item.solicitudId = sol.id;
                item.solicitudEstado = sol.estado;
                item.tipoSolicitud = sol.tipoAccion || sol.categoria;
                if (sol.nombreCliente && (!item.nombreCliente || item.nombreCliente.startsWith('+'))) {
                    item.nombreCliente = sol.nombreCliente;
                }
                if (new Date(sol.created_at || 0) > new Date(item.ultimoMensajeFecha)) {
                    item.ultimoMensajeFecha = sol.created_at;
                }
            } else {
                map.set(phoneClean, {
                    telefono: phoneClean,
                    nombreCliente: sol.nombreCliente || `+${phoneClean}`,
                    categoria: sol.categoria || 'cliente',
                    ultimoMensajeFecha: sol.created_at || new Date().toISOString(),
                    ultimoTexto: sol.datosDetallados || 'Nueva solicitud',
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
            const cleanA = (a.telefono || '').replace(/\D/g, '');
            const cleanB = (b.telefono || '').replace(/\D/g, '');
            const pinA = !!pinnedMap[cleanA];
            const pinB = !!pinnedMap[cleanB];
            if (pinA && !pinB) return -1;
            if (!pinA && pinB) return 1;
            const tA = new Date(a.ultimoMensajeFecha || 0).getTime();
            const tB = new Date(b.ultimoMensajeFecha || 0).getTime();
            return tB - tA;
        });

        // 4. Actualizar contadores del header y dropdown
        updateHeaderAndMenuBadges();
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
        const tags = Array.isArray(c.etiquetas) ? c.etiquetas.map(t => String(t).toLowerCase()) : [];
        if (cat === 'proveedor' || cat === 'proveedores' || tags.some(t => t.includes('prov'))) return 'proveedor';
        if (cat === 'hoteles' || cat === 'hotel' || tags.some(t => t.includes('hotel'))) return 'hoteles';
        if (cat === 'empleado' || cat === 'empleados' || cat === 'alba' || cat === 'personal' || tags.some(t => t.includes('alba') || t.includes('emplead') || t.includes('personal'))) return 'empleado';
        if (cat === 'otro' || cat === 'taxi' || cat === 'taxis' || tags.some(t => t.includes('taxi') || t.includes('otro'))) return 'otro';
        return 'cliente';
    }

    function getConversationTopic(c) {
        const tipo = (c.tipoSolicitud || '').toUpperCase();
        const text = (c.ultimoTexto || '').toLowerCase();
        const tags = Array.isArray(c.etiquetas) ? c.etiquetas.map(t => String(t).toLowerCase()) : [];

        if (tipo === 'MENU_TRADICION' || tags.some(t => t.includes('menu') || t.includes('tradici')) || /men[uú]|tradici[oó]n|degustaci|carta|chuleta|txuleta|txuleton/i.test(text)) {
            return 'menu_tradicion';
        }
        if (tipo === 'MODIFICACION' || tags.some(t => t.includes('modif')) || /modifi|cambi|hora|personas|ampliar|retras/i.test(text)) {
            return 'modificacion';
        }
        if (tipo === 'CANCELACION' || tags.some(t => t.includes('cancel')) || /cancel|anul|no podemos ir|no podre/i.test(text)) {
            return 'cancelacion';
        }
        if (tipo === 'PREGUNTAS_FRECUENTES' || tipo === 'FAQ' || tags.some(t => t.includes('faq') || t.includes('pregunt')) || /horario|donde|d[oó]nde|ubicaci[oó]n|c[oó]mo llegar|aparc|parking|direccion/i.test(text)) {
            return 'faq';
        }
        if (tipo === 'OTRAS_CUESTIONES' || tipo === 'DUDA' || tags.some(t => t.includes('otra')) || /otra|cuesti|duda|consulta|evento|grupo|alergia|celiac/i.test(text)) {
            return 'otras_cuestiones';
        }
        return 'otras_cuestiones';
    }

    // Renderizar Tarjetas Unificadas de Conversación en Buzón Recepción
    function renderInboxCards() {
        const container = document.getElementById('inbox-cards-container');
        const summaryEl = document.getElementById('inbox-total-summary');
        if (!container) return;

        // Calcular contadores Fila 1: Contactos y Estado
        const total = allUnifiedConversations.length;
        const countPend = allUnifiedConversations.filter(c => getConversationStatus(c) === 'pendiente').length;
        const countProv = allUnifiedConversations.filter(c => getConversationCategory(c) === 'proveedor').length;
        const countHoteles = allUnifiedConversations.filter(c => getConversationCategory(c) === 'hoteles').length;
        const countEmpleados = allUnifiedConversations.filter(c => getConversationCategory(c) === 'empleado').length;
        const countCli = allUnifiedConversations.filter(c => getConversationCategory(c) === 'cliente').length;
        const countOtros = allUnifiedConversations.filter(c => getConversationCategory(c) === 'otro').length;

        const cAll = document.getElementById('count-cat-all');
        const cStatPend = document.getElementById('count-status-pend');
        const cProv = document.getElementById('count-cat-prov');
        const cHoteles = document.getElementById('count-cat-hoteles');
        const cEmpleados = document.getElementById('count-cat-empleados');
        const cCli = document.getElementById('count-cat-cli');
        const cOtros = document.getElementById('count-cat-otros');

        if (cAll) cAll.textContent = total;
        if (cStatPend) cStatPend.textContent = countPend;
        if (cProv) cProv.textContent = countProv;
        if (cHoteles) cHoteles.textContent = countHoteles;
        if (cEmpleados) cEmpleados.textContent = countEmpleados;
        if (cCli) cCli.textContent = countCli;
        if (cOtros) cOtros.textContent = countOtros;

        // Calcular contadores Fila 2: Tipos de Solicitud y Temáticas
        const countTopicMenu = allUnifiedConversations.filter(c => getConversationTopic(c) === 'menu_tradicion').length;
        const countTopicMod = allUnifiedConversations.filter(c => getConversationTopic(c) === 'modificacion').length;
        const countTopicCancel = allUnifiedConversations.filter(c => getConversationTopic(c) === 'cancelacion').length;
        const countTopicOtras = allUnifiedConversations.filter(c => getConversationTopic(c) === 'otras_cuestiones').length;
        const countTopicFaq = allUnifiedConversations.filter(c => getConversationTopic(c) === 'faq').length;

        const cTopicMenu = document.getElementById('count-topic-menu');
        const cTopicMod = document.getElementById('count-topic-mod');
        const cTopicCancel = document.getElementById('count-topic-cancel');
        const cTopicOtras = document.getElementById('count-topic-otras');
        const cTopicFaq = document.getElementById('count-topic-faq');

        if (cTopicMenu) cTopicMenu.textContent = countTopicMenu;
        if (cTopicMod) cTopicMod.textContent = countTopicMod;
        if (cTopicCancel) cTopicCancel.textContent = countTopicCancel;
        if (cTopicOtras) cTopicOtras.textContent = countTopicOtras;
        if (cTopicFaq) cTopicFaq.textContent = countTopicFaq;

        updateHeaderAndMenuBadges();

        let filtered = [...allUnifiedConversations];

        // 1. Filtrar por categoría (Fila 1)
        if (currentInboxCatFilter !== 'all') {
            filtered = filtered.filter(c => getConversationCategory(c) === currentInboxCatFilter);
        }

        // 2. Filtrar por estado (Fila 1)
        if (currentInboxStatusFilter !== 'all') {
            filtered = filtered.filter(c => getConversationStatus(c) === currentInboxStatusFilter);
        }

        // 3. Filtrar por temática / tipo de solicitud (Fila 2)
        if (currentInboxTopicFilter !== 'all') {
            filtered = filtered.filter(c => getConversationTopic(c) === currentInboxTopicFilter);
        }

        // 4. Filtrar por buscador (Soporta números con o sin espacios, ej: +44 7879 488933 y +447879488933)
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

                // Coincidencia por dígitos del teléfono (permite "+44 7879 488933", "+447879488933", etc.)
                const digitsMatch = qDigits.length >= 3 && (telDigits.includes(qDigits) || nameDigits.includes(qDigits));
                
                // Coincidencia por texto literal (nombre, mensaje, teléfono, tipo)
                const textMatch = rawTel.includes(q) || rawName.includes(q) || rawText.includes(q) || rawTipo.includes(q);

                return digitsMatch || textMatch;
            });
        }

        if (summaryEl) {
            summaryEl.textContent = `${filtered.length} de ${total} conversaciones`;
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 50px 20px; background: #111b21; border-radius: 0 0 12px 12px; border: 1px dashed rgba(134, 150, 160, 0.2);">
                    <div style="font-size: 2.2rem; margin-bottom: 10px;">💬</div>
                    <div style="font-size: 1.05rem; font-weight: 700; color: #e9edef;">No hay chats en este filtro</div>
                    <p style="font-size: 0.85rem; margin-top: 6px; color: #8696a0;">Los mensajes de WhatsApp Business aparecerán organizados por fecha y estado.</p>
                </div>
            `;
            return;
        }

        const cardsHtml = [];

        filtered.forEach(c => {
            const cleanPhone = (c.telefono || '').replace(/\D/g, '');
            const clientDisplayName = getClientDisplayName(c.nombreCliente, cleanPhone);
            const smartTime = formatSmartDateTime(c.ultimoMensajeFecha);
            const isFromClient = c.ultimoEmisor === 'cliente' || c.ultimoEmisor === 'user';
            const status = getConversationStatus(c);
            const isPending = status === 'pendiente';
            const isPinned = isChatPinned(cleanPhone);
            const isSelected = activeConversationPhone === cleanPhone;
            const isDropdownOpen = (activeCardDropdownPhone === cleanPhone);

            // Icono de doble check si es mensaje enviado por recepción
            const outgoingCheckHtml = !isFromClient 
                ? `<span class="wa-check-double" title="Entregado y Leído">✓✓</span> ` 
                : '';

            // Generador de Avatar estilo WhatsApp Business
            let avatarHtml = '';
            const lowerName = (clientDisplayName || '').toLowerCase();
            if (lowerName.includes('entretiempo') || lowerName.includes('ricardo')) {
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

            // Etiquetas WhatsApp Business (Píldoras de colores)
            let tagsHtml = '';
            const tags = Array.isArray(c.etiquetas) && c.etiquetas.length > 0 ? [...c.etiquetas] : [];
            const cat = (c.categoria || '').toLowerCase();
            if (tags.length === 0) {
                if (cat === 'alba') tags.push('ALBA');
                else if (cat === 'proveedor' || cat === 'proveedores') tags.push('PROVEEDORES');
                else if (cat === 'hoteles' || cat === 'hotel') tags.push('HOTELES');
                else if (cat === 'taxi' || cat === 'taxis') tags.push('TAXIS');
            }

            if (tags.length > 0) {
                tagsHtml = `<div class="wa-tags-container">` + tags.map(t => {
                    const tagClass = `tag-${t.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                    return `<span class="wa-tag-pill ${tagClass}">${t}</span>`;
                }).join('') + `</div>`;
            }

            const previewText = (c.ultimoTexto || '').replace(/[\r\n]+/g, ' ').substring(0, 110) + ((c.ultimoTexto || '').length > 110 ? '...' : '');

            cardsHtml.push(`
                <div class="whatsapp-chat-row chat-card-item ${isPending ? 'is-unread' : ''} ${isPinned ? 'is-pinned' : ''} ${isSelected ? 'is-selected' : ''}" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}">
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
                                ${isPinned ? '<span class="wa-pin-icon" title="Conversación fijada arriba">📌</span>' : ''}
                                ${isPending ? '<span class="wa-unread-badge">1</span>' : ''}
                                <div class="wa-item-actions-trigger btn-card-more-actions" data-phone="${cleanPhone}" title="Opciones">⋮</div>
                            </div>
                        </div>

                        <!-- Dropdown de Acciones Rápidas -->
                        <div class="card-actions-dropdown-menu" id="dropdown-actions-${cleanPhone}" style="display: ${isDropdownOpen ? 'flex' : 'none'}; padding-top: 8px; margin-top: 6px; border-top: 1px solid rgba(134, 150, 160, 0.15); flex-wrap: wrap; gap: 6px; width: 100%;">
                            <button class="btn-pin-chat-card ${isPinned ? 'active' : ''}" data-phone="${cleanPhone}" style="padding: 4px 8px; font-size: 0.73rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.08); color: #e9edef; border: 1px solid rgba(255, 255, 255, 0.15);">
                                ${isPinned ? '📌 Desfijar' : '📌 Fijar arriba'}
                            </button>
                            <button class="btn-toggle-read-status" data-phone="${cleanPhone}" data-target-status="${isPending ? 'leido' : 'pendiente'}" style="padding: 4px 8px; font-size: 0.73rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.08); color: #e9edef; border: 1px solid rgba(255, 255, 255, 0.15);">
                                ${isPending ? '✓ Marcar Leído' : '⏳ Marcar No Leído'}
                            </button>
                            <a href="tel:+${cleanPhone}" class="btn-phone-call" style="padding: 4px 8px; font-size: 0.73rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.08); color: #e9edef; border: 1px solid rgba(255, 255, 255, 0.15);">
                                📞 Llamar
                            </a>
                            <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-open-wa" style="padding: 4px 8px; font-size: 0.73rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.08); color: #e9edef; border: 1px solid rgba(255, 255, 255, 0.15);">
                                📲 WhatsApp
                            </a>
                            <button class="btn-silence-chat-card" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}" title="Cancelar bot para este número" style="padding: 4px 8px; font-size: 0.73rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.08); color: #e9edef; border: 1px solid rgba(255, 255, 255, 0.15);">
                                🔇 Cancelar Bot
                            </button>
                            <button class="btn-delete-chat-card" data-phone="${cleanPhone}" style="padding: 4px 8px; font-size: 0.73rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            `);
        });

        container.innerHTML = cardsHtml.join('');

        // Event listeners para las filas de conversación (click para seleccionar en 2 columnas o abrir chat)
        container.querySelectorAll('.chat-card-item').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.wa-item-actions-trigger') || e.target.closest('.card-actions-dropdown-menu')) return;
                const phone = card.getAttribute('data-phone');
                const name = decodeURIComponent(card.getAttribute('data-name') || 'Cliente');
                selectConversation(phone, name);
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

        // Botón interactivo para alternar desplegable de más opciones (persistente, no se cierra solo por polling)
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
                            method: 'PATCH',
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

        container.querySelectorAll('.btn-silence-chat-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                activeCardDropdownPhone = null;
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Contacto');
                openSilencedModal(phone, name);
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
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                            body: JSON.stringify({ estado: targetStatus === 'leido' ? 'RESUELTA' : 'PENDIENTE' })
                        });
                    } catch (err) { console.warn('No se pudo sincronizar estado:', err.message); }
                }
                showToast(targetStatus === 'leido' ? '✅ Marcado como Leído' : '⏳ Marcado como No Leído');
                renderInboxCards();
            });
        }

        // Acción: Cancelar Bot (Silenciar)
        const silenceBtn = document.getElementById('pane-action-silence');
        if (silenceBtn) {
            silenceBtn.addEventListener('click', () => {
                paneMoreDropdown.style.display = 'none';
                if (!activeConversationPhone) return;
                const name = activeReplySolicitud ? getClientDisplayName(activeReplySolicitud.nombreCliente, activeConversationPhone) : activeConversationPhone;
                openSilencedModal(activeConversationPhone, name);
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
    document.querySelectorAll('[data-inbox-cat]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-inbox-cat]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentInboxCatFilter = chip.getAttribute('data-inbox-cat') || 'all';
            renderInboxCards();
        });
    });

    // ── Píldoras de Filtro Horizontales (Estilo WhatsApp Business en 2 Filas)
    document.querySelectorAll('.wa-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.wa-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const cat = pill.getAttribute('data-inbox-cat');
            const status = pill.getAttribute('data-inbox-status');
            const topic = pill.getAttribute('data-inbox-topic');

            if (cat === 'all' && status === 'all' && (!topic || topic === 'all')) {
                currentInboxCatFilter = 'all';
                currentInboxStatusFilter = 'all';
                currentInboxTopicFilter = 'all';
            } else if (topic) {
                currentInboxTopicFilter = topic;
                currentInboxCatFilter = 'all';
                currentInboxStatusFilter = 'all';
            } else if (status) {
                currentInboxStatusFilter = status;
                currentInboxCatFilter = 'all';
                currentInboxTopicFilter = 'all';
            } else if (cat) {
                currentInboxCatFilter = cat;
                currentInboxStatusFilter = 'all';
                currentInboxTopicFilter = 'all';
            }

            renderInboxCards();
        });
    });

    // ── Buscador de Buzón estilo WhatsApp Business (Toggle con botón Lupa 🔍) ───
    const searchContainer = document.getElementById('wa-search-container');
    const toggleSearchBtn = document.getElementById('btn-toggle-inbox-search');
    const clearSearchBtn = document.getElementById('btn-clear-inbox-search');

    if (toggleSearchBtn && searchContainer && searchInboxInput) {
        toggleSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = (searchContainer.style.display !== 'none');
            if (isVisible) {
                if (!searchInboxInput.value.trim()) {
                    searchContainer.style.display = 'none';
                    toggleSearchBtn.classList.remove('active');
                } else {
                    searchInboxInput.focus();
                }
            } else {
                searchContainer.style.display = 'flex';
                toggleSearchBtn.classList.add('active');
                searchInboxInput.focus();
            }
        });
    }

    if (clearSearchBtn && searchInboxInput && searchContainer && toggleSearchBtn) {
        clearSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchInboxInput.value = '';
            currentInboxSearch = '';
            clearSearchBtn.style.display = 'none';
            searchContainer.style.display = 'none';
            toggleSearchBtn.classList.remove('active');
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
            if (toggleSearchBtn) {
                if (currentInboxSearch.length > 0) {
                    toggleSearchBtn.classList.add('active');
                }
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

        activeConversationPhone = cleanPhoneStr;
        activeReplySolicitud = sol;

        // Limpiar estado de no leído para esta conversación
        if (sol.id) unreadSolicitudIds.delete(sol.id);
        if (cleanPhoneStr) setManualChatStatus(cleanPhoneStr, 'leido');
        if (unreadSolicitudIds.size === 0) {
            stopTitleFlash();
        }

        // Resaltar elemento seleccionado en la columna izquierda
        const container = document.getElementById('inbox-cards-container');
        if (container) {
            container.querySelectorAll('.whatsapp-chat-row').forEach(row => {
                const rowPhone = row.getAttribute('data-phone');
                if (rowPhone === cleanPhoneStr) {
                    row.classList.add('is-selected');
                    row.classList.remove('is-unread');
                    const unreadBadge = row.querySelector('.wa-unread-badge');
                    if (unreadBadge) unreadBadge.remove();
                } else {
                    row.classList.remove('is-selected');
                }
            });
        }

        const emptyState = document.getElementById('wa-empty-state');
        const activePanel = document.getElementById('wa-active-chat-panel');
        const webContainer = document.querySelector('.wa-web-container');

        if (emptyState) emptyState.style.display = 'none';
        if (activePanel) activePanel.style.display = 'flex';
        if (webContainer) webContainer.classList.add('mobile-chat-open');

        const clientDisplayName = getClientDisplayName(sol.nombreCliente, cleanPhoneStr);

        // Header del panel derecho
        const nameEl = document.getElementById('pane-chat-client-name');
        const phoneEl = document.getElementById('pane-chat-phone');
        const avatarEl = document.getElementById('pane-chat-avatar');
        const btnCall = document.getElementById('pane-btn-call-phone');
        const btnWa = document.getElementById('pane-btn-open-wa');
        const catBadgeEl = document.getElementById('pane-chat-category-badge');
        const handoverStatusEl = document.getElementById('pane-chat-handover-status');
        const btnToggleHuman = document.getElementById('pane-btn-toggle-human');
        const btnConclude = document.getElementById('pane-btn-conclude');
        const paneSolIdInput = document.getElementById('pane-reply-solicitud-id');

        if (nameEl) nameEl.textContent = clientDisplayName;
        if (phoneEl) phoneEl.textContent = `📞 WhatsApp: +${cleanPhoneStr}`;
        if (btnCall) btnCall.href = cleanPhoneStr ? `tel:+${cleanPhoneStr}` : '#';
        if (btnWa) btnWa.href = cleanPhoneStr ? `https://wa.me/${cleanPhoneStr}` : '#';
        if (paneSolIdInput) paneSolIdInput.value = sol.id || `chat_${cleanPhoneStr}`;

        // Avatar dinámico
        if (avatarEl) {
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

        // Modo Humano
        const isHandoverActive = sol.enAtencionHumana === true && sol.estado !== 'CONFIRMADA' && sol.estado !== 'RECHAZADA';
        if (handoverStatusEl) {
            handoverStatusEl.textContent = isHandoverActive ? '🟢 Modo Humano (Bot Pausado)' : '⚪ Bot Activo';
            handoverStatusEl.style.background = isHandoverActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)';
            handoverStatusEl.style.color = isHandoverActive ? '#34d399' : '#94a3b8';
            handoverStatusEl.style.borderColor = isHandoverActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)';
        }
        if (btnToggleHuman && btnConclude) {
            if (isHandoverActive) {
                btnToggleHuman.style.display = 'none';
                btnConclude.style.display = 'inline-flex';
            } else {
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

        // Cargar historial en el hilo de mensajes
        stopChatPolling();
        currentChatPhone = cleanPhoneStr;
        lastChatRenderedSig = '';
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
        replyClientPhone.textContent = `📞 WhatsApp: +${cleanPhoneStr}`;

        // Generador de Avatar dinámico
        const avatarEl = document.getElementById('reply-modal-avatar');
        if (avatarEl) {
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
                            <div class="minimized-sub">📞 WhatsApp: +${phone}</div>
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
    if (refreshInboxBtn) refreshInboxBtn.addEventListener('click', fetchSolicitudes);

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

    // Modo Humano en Panel Derecho
    const paneBtnToggleHuman = document.getElementById('pane-btn-toggle-human');
    if (paneBtnToggleHuman) {
        paneBtnToggleHuman.addEventListener('click', async () => {
            if (!activeReplySolicitud) return;
            const solId = activeReplySolicitud.id;
            paneBtnToggleHuman.disabled = true;
            try {
                const res = await fetch(`/api/admin/solicitudes/${solId}/atencion-humana`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-token': adminToken
                    },
                    body: JSON.stringify({ activar: true })
                });
                const data = await res.json();
                if (data.success) {
                    activeReplySolicitud.enAtencionHumana = true;
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
                }
            } catch (err) {
                console.error("Error toggling human mode:", err);
            } finally {
                paneBtnToggleHuman.disabled = false;
            }
        });
    }

    const paneBtnConclude = document.getElementById('pane-btn-conclude');
    if (paneBtnConclude) {
        paneBtnConclude.addEventListener('click', async () => {
            if (!activeReplySolicitud) return;
            const solId = activeReplySolicitud.id;
            const paneMsgInput = document.getElementById('pane-reply-message-text');
            const text = paneMsgInput ? paneMsgInput.value.trim() : '';

            if (confirm("¿Deseas concluir esta gestión y reactivar el bot automático para este cliente?")) {
                paneBtnConclude.disabled = true;
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
                        showToast(data.message || "✅ Gestión concluida y bot reactivado.");
                        activeReplySolicitud.enAtencionHumana = false;
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
                    }
                } catch (err) {
                    console.error("Error concluding management:", err);
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

});

