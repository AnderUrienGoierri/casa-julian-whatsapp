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
    let currentInboxCatFilter = 'all';
    let currentInboxStatusFilter = 'all';
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

        // Navegación a pestañas desde el menú desplegable
        headerMenuDropdown.querySelectorAll('[data-tab-target]').forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab-target');
                const matchingTabBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
                if (matchingTabBtn) {
                    matchingTabBtn.click();
                } else {
                    tabBtns.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    const targetEl = document.getElementById(targetTab);
                    if (targetEl) targetEl.classList.add('active');
                    if (targetTab === 'tab-inbox') fetchSolicitudes();
                    if (targetTab === 'tab-chats') fetchWhatsAppChats();
                    if (targetTab === 'tab-silenced') fetchSilencedNumbers();
                }
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
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const targetEl = document.getElementById(tabId);
            if (targetEl) targetEl.classList.add('active');

            if (tabId === 'tab-inbox') fetchSolicitudes();
            if (tabId === 'tab-chats') fetchWhatsAppChats();
            if (tabId === 'tab-silenced') fetchSilencedNumbers();
            if (tabId === 'tab-flow') renderUseCasesFlow();
            if (tabId === 'tab-texts') renderTextsGrid();
            if (tabId === 'tab-menu') renderMenuTable();
            if (tabId === 'tab-faqs') renderFaqsList();
            if (tabId === 'tab-rules') renderCustomRulesTable();
            if (tabId === 'tab-publish') renderDraftChangesTable();
            if (tabId === 'tab-settings') loadSystemSettingsAndStatus();
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
                ? `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 3px 8px; border-radius: 12px; font-size: 0.74rem; font-weight: 700;">🔇 Silenciado (Bypass)</span>`
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
                            <button class="btn-toggle-silence" data-id="${item.id}" data-active="${isSilencedActive}" style="background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); font-size: 0.76rem; padding: 5px 10px; border-radius: 6px; cursor: pointer;" title="${isSilencedActive ? 'Desactivar silencio (reactivar bot)' : 'Activar silencio permanente'}">
                                ${isSilencedActive ? '🔔 Activar Bot' : '🔇 Silenciar'}
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
                if (!confirm(`¿Eliminar a "${name}" de la lista de números silenciados? El bot volverá a responderle con menús automáticos.`)) return;
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
                    alert(`✅ Número ${phone} (${name}) guardado exitosamente en Modo Silencioso.`);
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
            // RECEPCIÓN: Buzón de Solicitudes, Chats WhatsApp y Números Silenciados visibles
            document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
                const t = btn.getAttribute('data-tab');
                btn.style.display = (t === 'tab-inbox' || t === 'tab-chats' || t === 'tab-silenced') ? 'inline-block' : 'none';
            });
            // Ocultar el simulador de móvil (no necesario para recepción)
            document.body.classList.add('mode-recepcion');
            // Activar la pestaña inbox directamente
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const inboxContent = document.getElementById('tab-inbox');
            if (inboxContent) inboxContent.classList.add('active');
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

                    // Si la barra flotante minimizada está visible, encender indicador de nuevo mensaje
                    const miniWidget = document.getElementById('minimized-chat-widget');
                    const miniBadge = document.getElementById('minimized-unread-badge');
                    if (miniWidget && miniWidget.style.display !== 'none') {
                        miniWidget.classList.add('has-unread');
                        if (miniBadge) miniBadge.style.display = 'inline-block';
                    }

                    // Si el modal está abierto con este mismo cliente, actualizar el chat en vivo
                    if (activeReplySolicitud && activeReplySolicitud.id === latestClientMsgInfo.solId) {
                        const updatedActiveSol = allSolicitudes.find(s => s.id === latestClientMsgInfo.solId);
                        if (updatedActiveSol) {
                            activeReplySolicitud = updatedActiveSol;
                            renderChatThreadInModal(updatedActiveSol);
                        }
                    }
                }

                renderInboxCards();
                renderMinimizedChatsStack();
            }
        } catch (err) {
            console.error("⚠️ Error cargando solicitudes del buzón:", err);
        }
    }

    // Conjunto de IDs seleccionados para acciones masivas
    let selectedSolicitudIds = new Set();

    // Actualiza la barra de acciones masivas
    function updateBulkActionsBar() {
        const countEl = document.getElementById('inbox-selected-count');
        const bulkDeleteBtn = document.getElementById('inbox-bulk-delete-btn');
        const bulkArchiveBtn = document.getElementById('inbox-bulk-archive-btn');
        const selectAllCb = document.getElementById('inbox-select-all-cb');

        const totalSelected = selectedSolicitudIds.size;
        if (countEl) countEl.textContent = totalSelected;

        document.querySelectorAll('.bulk-count-num').forEach(el => {
            el.textContent = totalSelected;
        });

        if (bulkDeleteBtn) {
            bulkDeleteBtn.style.display = totalSelected > 0 ? 'inline-flex' : 'none';
        }
        if (bulkArchiveBtn) {
            // Mostrar botón archivar seleccionadas solo si estamos en vista Activas
            bulkArchiveBtn.style.display = (totalSelected > 0 && currentInboxView === 'active') ? 'inline-flex' : 'none';
        }

        // Marcar/desmarcar checkbox global
        const visibleCheckboxes = document.querySelectorAll('.card-select-cb');
        if (selectAllCb) {
            if (visibleCheckboxes.length > 0 && totalSelected === visibleCheckboxes.length) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else if (totalSelected > 0 && totalSelected < visibleCheckboxes.length) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            }
        }
    }

    // Actualiza el resumen de filtros activos en el header del toggle
    function updateFiltersSummary() {
        const el = document.getElementById('inbox-active-filters-summary');
        if (!el) return;
        const parts = [];
        if (currentInboxView === 'ARCHIVADA') parts.push('📦 Archivadas');
        if (currentInboxCatFilter !== 'all') parts.push(currentInboxCatFilter);
        if (currentInboxStatusFilter !== 'all') parts.push(currentInboxStatusFilter);
        if (currentInboxSearch.trim()) parts.push(`"${currentInboxSearch.trim()}"`);
        el.textContent = parts.length ? `— ${parts.join(' · ')}` : '';
    }

    // ── Estado de Chats WhatsApp ──────────────────────────────────────────
    let allWhatsAppChats = [];
    let searchChatsFilter = '';

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
                console.log("💬 [Chats WhatsApp] Cargadas conversaciones:", allWhatsAppChats.length, allWhatsAppChats);
                
                // Actualizar badge de contador en la pestaña y en el menú desplegable
                const chatsCountBadge = document.getElementById('chats-count-badge');
                const dropdownChatsBadge = document.getElementById('dropdown-chats-badge');
                if (chatsCountBadge) {
                    chatsCountBadge.textContent = allWhatsAppChats.length;
                    chatsCountBadge.style.display = allWhatsAppChats.length > 0 ? 'inline-block' : 'none';
                }
                if (dropdownChatsBadge) {
                    dropdownChatsBadge.textContent = allWhatsAppChats.length;
                    dropdownChatsBadge.style.display = allWhatsAppChats.length > 0 ? 'inline-block' : 'none';
                }

                renderWhatsAppChats();
            } else {
                console.warn("⚠️ [Chats WhatsApp] Error HTTP en /api/admin/chats:", res.status);
            }
        } catch (err) {
            console.error("⚠️ Error cargando conversaciones de WhatsApp:", err);
        }
    }

    function renderWhatsAppChats() {
        const container = document.getElementById('whatsapp-chats-container');
        const summaryEl = document.getElementById('chats-total-summary');
        if (!container) return;

        let filtered = allWhatsAppChats;
        if (searchChatsFilter.trim()) {
            const q = searchChatsFilter.toLowerCase().trim();
            filtered = filtered.filter(c => 
                (c.telefono && c.telefono.toLowerCase().includes(q)) ||
                (c.nombreCliente && c.nombreCliente.toLowerCase().includes(q)) ||
                (c.ultimoTexto && c.ultimoTexto.toLowerCase().includes(q))
            );
        }

        if (summaryEl) {
            summaryEl.textContent = `${filtered.length} de ${allWhatsAppChats.length} conversaciones`;
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 50px 20px; grid-column: 1 / -1; background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-color);">
                    <div style="font-size: 2.2rem; margin-bottom: 10px;">💬</div>
                    <div style="font-size: 1.05rem; font-weight: 700; color: #fff;">No hay chats registrados</div>
                    <p style="font-size: 0.85rem; margin-top: 6px; color: #94a3b8;">Cuando cualquier cliente escriba al WhatsApp del restaurante, su conversación aparecerá aquí desde el primer mensaje.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(c => {
            const cleanPhone = (c.telefono || '').replace(/\D/g, '');
            const clientDisplayName = getClientDisplayName(c.nombreCliente, cleanPhone);
            const timeStr = c.ultimoMensajeFecha ? new Date(c.ultimoMensajeFecha).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Reciente';
            const isFromClient = c.ultimoEmisor === 'cliente';
            const emisorBadge = isFromClient 
                ? `<span style="background: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.15); font-size: 0.72rem; padding: 2px 7px; border-radius: 6px; font-weight: 600;">👤 Cliente</span>`
                : `<span style="background: rgba(255, 255, 255, 0.06); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12); font-size: 0.72rem; padding: 2px 7px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><img src="/admin/casa_julian_logo_CJ.jpeg" alt="Logo" style="width: 13px; height: 13px; border-radius: 50%; object-fit: cover;"> Bot</span>`;

            const previewText = (c.ultimoTexto || '').replace(/[\r\n]+/g, ' ').substring(0, 110) + ((c.ultimoTexto || '').length > 110 ? '...' : '');

            return `
                <div class="solicitud-card chat-card-item" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}" style="border-left: 3px solid rgba(255, 255, 255, 0.25); cursor: pointer;">
                    <div class="solicitud-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="card-avatar" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 1.2rem; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1);">
                                ${isFromClient ? '👤' : '💬'}
                            </div>
                            <div>
                                <h3 class="solicitud-client-name" style="font-size: 1rem; font-weight: 700; color: #fff; margin: 0;">${clientDisplayName}</h3>
                                <div class="solicitud-client-phone" style="font-size: 0.8rem; color: #cbd5e1; font-family: monospace;">📞 +${cleanPhone}</div>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                            <span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.12); font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; font-weight: 600;">
                                ${c.totalInteracciones} ${c.totalInteracciones === 1 ? 'mensaje' : 'mensajes'}
                            </span>
                            <span style="font-size: 0.7rem; color: #94a3b8;">${timeStr}</span>
                        </div>
                    </div>

                    <div class="solicitud-body" style="margin: 12px 0 14px 0; background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px;">
                            <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">Última interacción:</span>
                            ${emisorBadge}
                        </div>
                        <div style="font-size: 0.84rem; color: #e2e8f0; line-height: 1.4; word-break: break-word;">
                            ${formatWhatsAppText(previewText)}
                        </div>
                    </div>

                    <div class="solicitud-footer" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                        <div style="display: flex; gap: 6px; align-items: center; width: 100%; flex-wrap: wrap;">
                            <a href="tel:+${cleanPhone}" class="btn-phone-call" style="padding: 6px 10px; font-size: 0.75rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14);" title="Llamar directamente">
                                📞 Llamar
                            </a>
                            <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-open-wa" style="padding: 6px 10px; font-size: 0.75rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14);" title="Abrir en WhatsApp">
                                📲 WhatsApp
                            </a>
                            <button class="btn-silence-chat-card" data-phone="${cleanPhone}" data-name="${encodeURIComponent(c.nombreCliente || 'Contacto')}" style="padding: 6px 10px; font-size: 0.75rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14);" title="Silenciar respuestas automáticas del bot para este contacto">
                                🔇 Silenciar
                            </button>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center; width: 100%;">
                            <button class="btn-open-chat-modal btn-primary" data-phone="${cleanPhone}" data-name="${encodeURIComponent(clientDisplayName)}" data-solid="${c.solicitudId || ''}" style="flex: 1; padding: 6px 10px; font-size: 0.78rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; background: #1f232b; color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer;">
                                💬 Abrir Chat &amp; Responder
                            </button>
                            <button class="btn-archive-chat-card" data-phone="${cleanPhone}" style="padding: 6px 8px; font-size: 0.72rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14); white-space: nowrap;" title="Archivar esta conversación">
                                📦 Archivar
                            </button>
                            <button class="btn-delete-chat-card" data-phone="${cleanPhone}" style="padding: 6px 8px; font-size: 0.72rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); white-space: nowrap;" title="Eliminar conversación e historial definitivamente">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Event listeners para los botones de las tarjetas de chat
        container.querySelectorAll('.chat-card-item').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('a') || e.target.closest('button')) return;
                const phone = card.getAttribute('data-phone');
                const name = decodeURIComponent(card.getAttribute('data-name') || 'Cliente');
                openHistoryModal(phone, name);
            });
        });

        container.querySelectorAll('.btn-silence-chat-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Contacto');
                openSilencedModal(phone, name);
            });
        });

        container.querySelectorAll('.btn-archive-chat-card').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                if (!confirm(`¿Deseas archivar la conversación del teléfono +${phone}?`)) return;
                try {
                    const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
                    const res = await fetch(`/api/admin/chats/${phone}/archive`, {
                        method: 'POST',
                        headers: { 'x-admin-token': currentToken, 'Authorization': `Bearer ${currentToken}` }
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('📦 Conversación archivada.');
                        loadRealtimeChats();
                    } else {
                        alert('Error al archivar conversación: ' + (data.error || 'Desconocido'));
                    }
                } catch (err) {
                    alert('Error al archivar conversación: ' + err.message);
                }
            });
        });

        container.querySelectorAll('.btn-delete-chat-card').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
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
                        loadRealtimeChats();
                    } else {
                        alert('Error al eliminar conversación: ' + (data.error || 'Desconocido'));
                    }
                } catch (err) {
                    alert('Error al eliminar conversación: ' + err.message);
                }
            });
        });

        container.querySelectorAll('.btn-open-chat-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Cliente');
                const solId = btn.getAttribute('data-solid');
                
                // Si tiene una solicitud activa vinculada, abrir el modal de respuesta completa
                if (solId) {
                    const sol = allSolicitudes.find(s => s.id === solId);
                    if (sol) {
                        openReplyModal(sol);
                        return;
                    }
                }
                // Si es un chat general, abrir el historial de chat interactivo
                openHistoryModal(phone, name);
            });
        });
    }

    // Filtrar y Renderizar Tarjetas de Solicitudes
    function renderInboxCards() {
        if (!inboxCardsContainer) return;

        let filtered = [...allSolicitudes];

        // 0. Filtrar por VISTA (activas / archivadas)
        if (currentInboxView === 'active') {
            filtered = filtered.filter(s => s.estado !== 'ARCHIVADA' && s.estado !== 'ELIMINADA');
        } else {
            filtered = filtered.filter(s => s.estado === 'ARCHIVADA');
        }

        // 1. Filtrar por categoría
        if (currentInboxCatFilter !== 'all') {
            if (currentInboxCatFilter === 'modificaciones') {
                filtered = filtered.filter(s => 
                    s.categoria === 'modificaciones' || 
                    s.categoria === 'mod_comensales' || 
                    s.categoria === 'mod_dia' || 
                    s.categoria === 'mod_hora' || 
                    s.categoria === 'mod_general'
                );
            } else {
                filtered = filtered.filter(s => s.categoria === currentInboxCatFilter);
            }
        }

        // 2. Filtrar por estado (solo aplica en vista activas)
        if (currentInboxView === 'active' && currentInboxStatusFilter !== 'all') {
            filtered = filtered.filter(s => s.estado === currentInboxStatusFilter);
        }

        // 3. Filtrar por texto de búsqueda
        if (currentInboxSearch.trim()) {
            const q = currentInboxSearch.toLowerCase().trim();
            filtered = filtered.filter(s =>
                (s.nombreCliente || '').toLowerCase().includes(q) ||
                (s.telefonoCliente || '').toLowerCase().includes(q) ||
                (s.telefonoReserva || '').toLowerCase().includes(q) ||
                (s.datosDetallados || '').toLowerCase().includes(q) ||
                (s.tipoAccion || '').toLowerCase().includes(q)
            );
        }

        // 4. Ordenar
        const estadoOrder = { 'PENDIENTE': 0, 'EN_GESTION': 1, 'RESPONDIDA': 2, 'CONFIRMADA': 3, 'RECHAZADA': 4 };
        filtered.sort((a, b) => {
            if (currentInboxSort === 'date_asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            if (currentInboxSort === 'alpha_asc') return (a.nombreCliente || '').localeCompare(b.nombreCliente || '', 'es');
            if (currentInboxSort === 'alpha_desc') return (b.nombreCliente || '').localeCompare(a.nombreCliente || '', 'es');
            if (currentInboxSort === 'estado') return (estadoOrder[a.estado] ?? 9) - (estadoOrder[b.estado] ?? 9);
            return new Date(b.created_at || 0) - new Date(a.created_at || 0); // date_desc por defecto
        });

        // Actualizar resumen de filtros
        updateFiltersSummary();

        // Actualizar Badge de Contador Pendientes
        const pendingCount = allSolicitudes.filter(s => s.estado === 'PENDIENTE').length;
        if (inboxCountBadge) {
            inboxCountBadge.textContent = pendingCount;
            inboxCountBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
        const dropdownInboxBadge = document.getElementById('dropdown-inbox-badge');
        if (dropdownInboxBadge) {
            dropdownInboxBadge.textContent = pendingCount;
            dropdownInboxBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }

        // Limpiar seleccionados que ya no existen o no están visibles si cambió la vista
        const currentFilteredIds = new Set(filtered.map(s => s.id));
        for (const selId of selectedSolicitudIds) {
            if (!currentFilteredIds.has(selId)) {
                selectedSolicitudIds.delete(selId);
            }
        }
        updateBulkActionsBar();

        // Empty state
        const emptyIcon = currentInboxView === 'ARCHIVADA' ? '📦' : '📥';
        const emptyLabel = currentInboxView === 'ARCHIVADA' ? 'No hay solicitudes archivadas' : 'No hay solicitudes que coincidan con los filtros';
        if (filtered.length === 0) {
            inboxCardsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 50px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">${emptyIcon}</div>
                    <div style="font-size: 1.1rem; font-weight: 600; color: #fff;">${emptyLabel}</div>
                    <p style="font-size: 0.85rem; margin-top: 4px;">Las nuevas peticiones enviadas por los clientes desde WhatsApp aparecerán aquí automáticamente.</p>
                </div>
            `;
            return;
        }

        let html = '';
        const isArchiveView = currentInboxView === 'ARCHIVADA';

        filtered.forEach(sol => {
            const dateStr = sol.created_at ? new Date(sol.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Reciente';
            const isUnread = unreadSolicitudIds.has(sol.id);
            const isSelected = selectedSolicitudIds.has(sol.id);

            // Badge de Categoría sobrio y elegante
            let catTagHtml = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); font-weight: 600; padding: 3px 10px; border-radius: 16px; font-size: 0.76rem;">📌 ${sol.categoriaLabel || sol.tipoAccion || 'Solicitud'}</span>`;
            if (sol.categoria === 'reservas_menu_tradicion') {
                catTagHtml = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); font-weight: 600; padding: 3px 10px; border-radius: 16px; font-size: 0.76rem;">🎁 Menú Tradición</span>`;
            } else if (sol.categoria === 'modificaciones' || sol.categoria === 'mod_comensales' || sol.categoria === 'mod_dia' || sol.categoria === 'mod_hora' || sol.categoria === 'mod_general') {
                catTagHtml = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); font-weight: 600; padding: 3px 10px; border-radius: 16px; font-size: 0.76rem;">🔄 Modificaciones</span>`;
            } else if (sol.categoria === 'cancelacion') {
                catTagHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600; padding: 3px 10px; border-radius: 16px; font-size: 0.76rem;">❌ Cancelaciones</span>`;
            } else if (sol.categoria === 'faqs') {
                catTagHtml = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); font-weight: 600; padding: 3px 10px; border-radius: 16px; font-size: 0.76rem;">❓ Preguntas Frecuentes</span>`;
            } else if (sol.categoria === 'consulta_abierta') {
                catTagHtml = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); font-weight: 600; padding: 3px 10px; border-radius: 16px; font-size: 0.76rem;">💬 Consultas Abiertas</span>`;
            }

            // Badge de Estado
            let statusBadgeHtml = `<span style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2); padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;">⏳ PENDIENTE</span>`;
            if (sol.estado === 'RESPONDIDA') {
                statusBadgeHtml = `<span style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15); padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 600;">💬 RESPONDIDA</span>`;
            } else if (sol.estado === 'CONFIRMADA') {
                statusBadgeHtml = `<span style="background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 600;">✅ CONFIRMADA</span>`;
            } else if (sol.estado === 'RECHAZADA') {
                statusBadgeHtml = `<span style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 600;">🚫 RECHAZADA</span>`;
            } else if (sol.estado === 'ARCHIVADA') {
                statusBadgeHtml = `<span style="background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1); padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 600;">📦 ARCHIVADA</span>`;
            }

            const phoneFormatted = sol.telefonoCliente || sol.telefonoReserva || 'Desconocido';
            const isHandoverActive = sol.enAtencionHumana === true && sol.estado !== 'CONFIRMADA' && sol.estado !== 'RECHAZADA';
            const handoverBadgeHtml = isHandoverActive
                ? `<span style="background: rgba(16, 185, 129, 0.14); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 600;">🟢 Modo Humano</span>`
                : `<span style="background: rgba(255, 255, 255, 0.06); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.12); padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 500;">⚪ Bot Activo</span>`;

            const msgList = Array.isArray(sol.mensajes) ? sol.mensajes : [];
            const msgCountStr = msgList.length > 0 ? `💬 ${msgList.length} ${msgList.length === 1 ? 'mensaje' : 'mensajes'}` : '💬 1 mensaje';
            const unreadPillHtml = isUnread ? `<span class="card-unread-pill" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35);">🔴 ¡Nuevo mensaje!</span>` : '';

            const cleanPhoneNum = (sol.telefonoCliente || sol.telefonoReserva || '').toString().replace(/\D/g, '');
            const callHref = cleanPhoneNum ? `tel:+${cleanPhoneNum}` : '#';
            const waHref = cleanPhoneNum ? `https://wa.me/${cleanPhoneNum}` : '#';

            // Botones de llamada y WhatsApp rápido
            const quickContactBtnsHtml = cleanPhoneNum ? `
                <a href="${callHref}" class="btn-quick-call" title="Llamar por teléfono tradicional al cliente" style="background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14); text-decoration: none; font-size: 0.76rem; padding: 4px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px;" onclick="event.stopPropagation();">
                    📞
                </a>
                <a href="${waHref}" target="_blank" class="btn-quick-wa" title="Abrir chat en la aplicación de WhatsApp" style="background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14); text-decoration: none; font-size: 0.76rem; padding: 4px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px;" onclick="event.stopPropagation();">
                    📲
                </a>
            ` : '';

            // Botón Historial Chatbot
            const historyBtnHtml = `
                <button class="btn-view-chat-history" data-phone="${phoneFormatted}" data-name="${sol.nombreCliente || 'Cliente'}" style="background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14); font-size: 0.76rem; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Ver historial completo de interacción con el chatbot">
                    📜 Historial Bot
                </button>
            `;

            // Botón Silenciar Chatbot (Bypass)
            const silenceBtnHtml = `
                <button class="btn-silence-contact-quick" data-phone="${cleanPhoneNum}" data-name="${encodeURIComponent(sol.nombreCliente || 'Contacto')}" style="background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14); font-size: 0.76rem; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Silenciar respuestas automáticas del bot para este contacto (Proveedores, Empleados...)">
                    🔇 Silenciar
                </button>
            `;

            // Botones de acción superior (A la derecha del nombre del cliente)
            let topActionBtnsHtml = '';
            if (isArchiveView) {
                topActionBtnsHtml = `
                    <button class="btn-restore-solicitud" data-id="${sol.id}" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.18); font-size: 0.78rem; padding: 4px 9px; border-radius: 6px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;" title="Restaurar a Activas">↩️ Restaurar</button>
                    <button class="btn-delete-solicitud" data-id="${sol.id}" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Eliminar definitivamente este mensaje">🗑️</button>
                `;
            } else {
                topActionBtnsHtml = `
                    <button class="btn-archive-solicitud" data-id="${sol.id}" style="background: rgba(255, 255, 255, 0.06); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.14); font-size: 0.78rem; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Archivar solicitud">📦</button>
                    <button class="btn-delete-solicitud" data-id="${sol.id}" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Eliminar definitivamente este mensaje">🗑️</button>
                `;
            }

            // Fila inferior de botones de interacción rápida
            const bottomActionBtnsHtml = `
                <span class="msg-count-chip">${msgCountStr}</span>
                ${quickContactBtnsHtml}
                ${historyBtnHtml}
                ${silenceBtnHtml}
            `;

            html += `
                <div class="whatsapp-inbox-card solicitud-card ${isUnread ? 'has-unread-msg' : ''} ${isArchiveView ? 'card-archived' : ''} ${isSelected ? 'is-selected' : ''}" data-id="${sol.id}">
                    <div class="card-top-header">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <input type="checkbox" class="card-select-cb" data-id="${sol.id}" ${isSelected ? 'checked' : ''} title="Seleccionar para acción masiva">
                            ${catTagHtml}
                            ${statusBadgeHtml}
                            ${handoverBadgeHtml}
                            ${unreadPillHtml}
                        </div>
                        <span style="font-size: 0.78rem; color: #94a3b8;">⏰ ${dateStr}</span>
                    </div>

                    <div class="card-main-content">
                        <!-- Fila del Nombre del Cliente + Botones Archivar y Eliminar a la derecha -->
                        <div class="card-user-info-row">
                            <div class="card-user-info">
                                <div class="card-avatar">👤</div>
                                <div class="card-user-text">
                                    <div class="card-client-name">${getClientDisplayName(sol.nombreCliente, phoneFormatted)}</div>
                                    <div class="card-client-phone">📞 WhatsApp: +${phoneFormatted}</div>
                                </div>
                            </div>
                            <div class="card-top-actions">
                                ${topActionBtnsHtml}
                            </div>
                        </div>

                        <!-- Fila inferior: Mensajes, Llamada, WhatsApp, Historial Bot, Silenciar -->
                        <div class="card-badges-bottom-row">
                            ${bottomActionBtnsHtml}
                        </div>
                    </div>
                </div>
            `;
        });

        inboxCardsContainer.innerHTML = html;

        // Checkbox individual de cada tarjeta
        document.querySelectorAll('.card-select-cb').forEach(cb => {
            cb.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            cb.addEventListener('change', (e) => {
                const solId = cb.getAttribute('data-id');
                const card = cb.closest('.solicitud-card');
                if (cb.checked) {
                    selectedSolicitudIds.add(solId);
                    if (card) card.classList.add('is-selected');
                } else {
                    selectedSolicitudIds.delete(solId);
                    if (card) card.classList.remove('is-selected');
                }
                updateBulkActionsBar();
            });
        });

        // Botón Ver Historial Chatbot
        document.querySelectorAll('.btn-view-chat-history').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                const name = btn.getAttribute('data-name');
                openHistoryModal(phone, name);
            });
        });

        // Event listener: abrir modal al click en la tarjeta
        document.querySelectorAll('.solicitud-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-solicitud') || e.target.closest('.btn-archive-solicitud') || e.target.closest('.btn-restore-solicitud') || e.target.closest('.btn-view-chat-history') || e.target.closest('.card-select-cb')) return;
                const solId = card.getAttribute('data-id');
                const sol = allSolicitudes.find(s => s.id === solId);
                if (sol) openReplyModal(sol);
            });
        });

        // Botón Eliminar individual (uno a uno definitivo)
        document.querySelectorAll('.btn-delete-solicitud').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                if (confirm('¿Eliminar definitivamente esta solicitud? Esta acción no se puede deshacer.')) {
                    try {
                        await fetch(`/api/admin/solicitudes/${solId}`, {
                            method: 'DELETE',
                            headers: { 'x-admin-token': adminToken }
                        });
                        unreadSolicitudIds.delete(solId);
                        selectedSolicitudIds.delete(solId);
                        await fetchSolicitudes();
                    } catch (err) {
                        alert('Error al eliminar solicitud: ' + err.message);
                    }
                }
            });
        });

        // Botón Archivar → gestión concluida
        document.querySelectorAll('.btn-archive-solicitud').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                try {
                    await fetch(`/api/admin/solicitudes/${solId}/archivar`, {
                        method: 'POST',
                        headers: { 'x-admin-token': adminToken }
                    });
                    unreadSolicitudIds.delete(solId);
                    selectedSolicitudIds.delete(solId);
                    await fetchSolicitudes();
                } catch (err) {
                    alert('Error al archivar solicitud: ' + err.message);
                }
            });
        });

        // Botón Silenciar Contacto Rápido
        document.querySelectorAll('.btn-silence-contact-quick').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const phone = btn.getAttribute('data-phone');
                const name = decodeURIComponent(btn.getAttribute('data-name') || 'Contacto');
                openSilencedModal(phone, name);
            });
        });

        // Botón Restaurar → volver a vista Activas (PENDIENTE)
        document.querySelectorAll('.btn-restore-solicitud').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                try {
                    await fetch(`/api/admin/solicitudes/${solId}/restaurar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
                        body: JSON.stringify({ estadoDestino: 'PENDIENTE' })
                    });
                    selectedSolicitudIds.delete(solId);
                    await fetchSolicitudes();
                } catch (err) {
                    alert('Error al restaurar solicitud: ' + err.message);
                }
            });
        });
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
                valHtml = `<span style="font-family: monospace; color: #f1f5f9; font-weight: 600;">+${r.val}</span>`;
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

    // Helper: Renderizar Hilo de Chat en el Modal de Recepción
    function renderChatThreadInModal(sol) {
        const threadContainer = document.getElementById('reply-chat-thread');
        const msgCountEl = document.getElementById('thread-msg-count');
        const msgList = Array.isArray(sol.mensajes) && sol.mensajes.length > 0 
            ? sol.mensajes 
            : [{ emisor: 'cliente', texto: sol.datosDetallados || 'Solicitud inicial.', fecha: sol.created_at }];

        if (msgCountEl) msgCountEl.textContent = `${msgList.length} ${msgList.length === 1 ? 'mensaje' : 'mensajes'}`;

        if (threadContainer) {
            threadContainer.innerHTML = '';
            msgList.forEach(m => {
                const isClient = m.emisor === 'cliente';
                const timeStr = m.fecha ? new Date(m.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
                const formattedBody = formatWhatsAppText(m.texto);
                
                const bubble = document.createElement('div');
                bubble.style.cssText = `
                    max-width: 80%;
                    align-self: ${isClient ? 'flex-start' : 'flex-end'};
                    background: ${isClient ? '#005c4b' : '#025144'};
                    color: #e9edef;
                    padding: 10px 14px;
                    border-radius: ${isClient ? '0 12px 12px 12px' : '12px 0 12px 12px'};
                    font-size: 0.88rem;
                    line-height: 1.45;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.25);
                    word-break: break-word;
                    border: 1px solid rgba(255,255,255,0.05);
                `;
                bubble.innerHTML = `
                    <div style="font-size: 0.74rem; font-weight: 700; color: ${isClient ? '#53bdeb' : '#25d366'}; margin-bottom: 3px; display: flex; align-items: center; gap: 5px;">
                        ${isClient ? '👤 ' + (sol.nombreCliente || 'Cliente') : '<img src="/admin/casa_julian_logo_CJ.jpeg" alt="Logo" style="width: 17px; height: 17px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(217, 119, 6, 0.7); vertical-align: middle; display: inline-block;"> Recepción Casa Julián'}
                    </div>
                    <div>${formattedBody}</div>
                    <div style="text-align: right; font-size: 0.68rem; color: #8696a0; margin-top: 4px;">${timeStr}</div>
                `;
                threadContainer.appendChild(bubble);
            });

            setTimeout(() => { threadContainer.scrollTop = threadContainer.scrollHeight; }, 60);
        }
    }

    // Abrir Modal de Respuesta Manual y Chat
    function openReplyModal(sol, prefilledText = '', targetStatus = 'EN_GESTION') {
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
        
        // Limpiar estado de no leído para esta solicitud
        unreadSolicitudIds.delete(sol.id);
        if (unreadSolicitudIds.size === 0) {
            stopTitleFlash();
        }

        replySolicitudId.value = sol.id;
        const cleanPhoneStr = (sol.telefonoCliente || sol.telefonoReserva || '').toString().replace(/\D/g, '');
        replyClientName.textContent = getClientDisplayName(sol.nombreCliente, cleanPhoneStr);
        replyClientPhone.textContent = `📞 WhatsApp: +${cleanPhoneStr}`;

        // Configurar botones de acción directa de llamada y WhatsApp
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
            catBadgeEl.textContent = sol.categoriaLabel || sol.tipoAccion || '📌 Solicitud';
            if (sol.categoria === 'reservas_menu_tradicion') {
                catBadgeEl.textContent = '🎁 Reservas Menú Tradición';
                catBadgeEl.style.color = '#34d399';
                catBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            } else if (sol.categoria === 'cancelacion') {
                catBadgeEl.textContent = '❌ Cancelación';
                catBadgeEl.style.color = '#f87171';
                catBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
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
            summaryEl.innerHTML = renderSummaryTable(sol.datosDetallados);
        }
        if (dateEl) {
            dateEl.textContent = sol.created_at ? new Date(sol.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Reciente';
        }

        // Renderizar Hilo de Mensajes con estilo WhatsApp
        renderChatThreadInModal(sol);

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

    // Variables de control de polling en tiempo real para el modal de Historial
    let activeHistoryPollInterval = null;
    let currentHistoryPhone = null;
    let currentHistoryName = 'Cliente';
    let lastRenderedSig = '';

    // Función de renderizado y refresco automático continuo (cada 1s)
    async function fetchAndRenderHistory(isInitial = false) {
        const historyModal = document.getElementById('history-modal');
        const historyMsgCount = document.getElementById('history-msg-count');
        const historyViewport = document.getElementById('history-chat-viewport');

        if (!historyModal || !historyViewport || historyModal.style.display === 'none' || !currentHistoryPhone) {
            stopHistoryPolling();
            return;
        }

        try {
            const currentToken = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch(`/api/admin/solicitudes/history/${currentHistoryPhone}?_t=${Date.now()}`, {
                headers: { 
                    'x-admin-token': currentToken,
                    'Authorization': `Bearer ${currentToken}`,
                    'Cache-Control': 'no-cache'
                }
            });
            const data = await res.json();
            const history = data.history || [];

            // Signature única para detectar cambios reales en cantidad o en último ID
            const lastMsg = history[history.length - 1];
            const currentSig = `${history.length}_${lastMsg ? (lastMsg.id || lastMsg.created_at) : ''}`;

            if (!isInitial && currentSig === lastRenderedSig) {
                return;
            }

            lastRenderedSig = currentSig;

            if (historyMsgCount) {
                historyMsgCount.textContent = `${history.length} ${history.length === 1 ? 'interacción' : 'interacciones'}`;
            }

            if (history.length === 0) {
                historyViewport.innerHTML = `
                    <div style="text-align: center; color: #94a3b8; padding: 40px 20px;">
                        <div style="font-size: 2rem; margin-bottom: 8px;">🤖</div>
                        <div style="font-size: 0.95rem; font-weight: 600; color: #fff;">Sin historial registrado previo</div>
                        <p style="font-size: 0.8rem; margin-top: 4px;">Las nuevas interacciones de este cliente con el chatbot aparecerán aquí en tiempo real.</p>
                    </div>
                `;
                return;
            }

            // Comprobar si el usuario estaba abajo para hacer auto-scroll inteligente
            const isNearBottom = (historyViewport.scrollHeight - historyViewport.scrollTop - historyViewport.clientHeight) < 200;

            historyViewport.innerHTML = '';
            history.forEach(item => {
                const isClient = item.emisor !== 'bot';
                const timeStr = item.created_at ? new Date(item.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '';
                const bubble = document.createElement('div');
                bubble.style.cssText = `
                    max-width: 82%;
                    align-self: ${isClient ? 'flex-end' : 'flex-start'};
                    background: ${isClient ? '#005c4b' : '#1e293b'};
                    color: #e9edef;
                    padding: 10px 14px;
                    border-radius: ${isClient ? '12px 0 12px 12px' : '0 12px 12px 12px'};
                    font-size: 0.86rem;
                    line-height: 1.45;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.25);
                    word-break: break-word;
                    border: 1px solid ${isClient ? 'rgba(37, 211, 102, 0.2)' : 'rgba(255,255,255,0.08)'};
                `;

                const formattedText = formatWhatsAppText(item.texto);
                let metaBadge = '';
                if (item.tipo === 'interactive' || item.tipo === 'button' || item.tipo === 'list') {
                    metaBadge = `<span style="background: rgba(139, 92, 246, 0.25); color: #c4b5fd; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">👆 Opción seleccionada</span>`;
                } else if (item.tipo === 'interactive_buttons') {
                    metaBadge = `<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔘 Menú de Botones</span>`;
                } else if (item.tipo === 'interactive_list') {
                    metaBadge = `<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">📋 Menú Desplegable</span>`;
                }

                bubble.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: ${isClient ? '#4ade80' : '#38bdf8'}; display: flex; align-items: center; gap: 5px;">
                            ${isClient ? '👤 ' + (currentHistoryName || 'Cliente') : '<img src="/admin/casa_julian_logo_CJ.jpeg" alt="Logo" style="width: 17px; height: 17px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(217, 119, 6, 0.7); vertical-align: middle; display: inline-block;"> Chatbot Casa Julián'}
                        </span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${metaBadge}
                            <span style="font-size: 0.68rem; color: #94a3b8;">${timeStr}</span>
                        </div>
                    </div>
                    <div style="color: #f1f5f9; font-size: 0.85rem; line-height: 1.45;">${formattedText}</div>
                `;
                historyViewport.appendChild(bubble);
            });

            // Auto-scroll al final en carga inicial o cuando el scroll esté abajo
            if (isInitial || isNearBottom) {
                historyViewport.scrollTop = historyViewport.scrollHeight;
                setTimeout(() => { historyViewport.scrollTop = historyViewport.scrollHeight; }, 60);
                setTimeout(() => { historyViewport.scrollTop = historyViewport.scrollHeight; }, 200);
            }
        } catch (err) {
            if (isInitial) {
                historyViewport.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">Error al cargar historial: ${err.message}</div>`;
            }
        }
    }

    function stopHistoryPolling() {
        if (activeHistoryPollInterval) {
            clearInterval(activeHistoryPollInterval);
            activeHistoryPollInterval = null;
        }
        currentHistoryPhone = null;
        lastRenderedSig = '';
    }

    // Abrir Modal de Historial Completo del Chatbot con un Cliente
    async function openHistoryModal(phone, name = 'Cliente') {
        const historyModal = document.getElementById('history-modal');
        const historyClientName = document.getElementById('history-client-name');
        const historyClientPhone = document.getElementById('history-client-phone');
        const historyMsgCount = document.getElementById('history-msg-count');
        const historyViewport = document.getElementById('history-chat-viewport');

        if (!historyModal || !historyViewport) return;

        const cleanPhone = (phone || '').replace(/\D/g, '');
        const clientDisplayName = getClientDisplayName(name, cleanPhone);
        currentHistoryPhone = cleanPhone;
        currentHistoryName = clientDisplayName;
        lastRenderedSig = '';

        if (historyClientName) historyClientName.textContent = `Historial: ${clientDisplayName}`;
        if (historyClientPhone) historyClientPhone.textContent = `📞 WhatsApp: +${cleanPhone}`;
        if (historyMsgCount) historyMsgCount.textContent = 'Cargando...';
        historyViewport.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px;">⏳ Cargando historial en tiempo real...</div>';

        historyModal.style.display = 'flex';

        // Detener cualquier polling previo
        stopHistoryPolling();
        currentHistoryPhone = cleanPhone;
        currentHistoryName = name || 'Cliente';

        // Carga inicial inmediata
        await fetchAndRenderHistory(true);

        // Iniciar refresco automático cada 1 segundo exacto mientras el modal esté abierto
        activeHistoryPollInterval = setInterval(() => {
            fetchAndRenderHistory(false);
        }, 1000);
    }

    // Listener cerrar modal de historial
    const closeHistoryBtn = document.getElementById('close-history-modal-btn');
    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', () => {
            stopHistoryPolling();
            const historyModal = document.getElementById('history-modal');
            if (historyModal) historyModal.style.display = 'none';
        });
    }

    // Listener maximizar / restaurar modal de historial
    const maxHistoryBtn = document.getElementById('maximize-history-modal-btn');
    if (maxHistoryBtn) {
        maxHistoryBtn.addEventListener('click', () => {
            const historyModal = document.getElementById('history-modal');
            if (!historyModal) return;
            const container = historyModal.querySelector('.whatsapp-modal-container');
            if (!container) return;
            const isMax = container.classList.toggle('fullscreen');
            maxHistoryBtn.textContent = isMax ? '🗗' : '🗖';
            maxHistoryBtn.title = isMax ? 'Restaurar tamaño normal' : 'Maximizar pantalla completa';
            setTimeout(() => {
                const vp = historyModal.querySelector('#history-chat-viewport');
                if (vp) vp.scrollTop = vp.scrollHeight;
            }, 100);
        });
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

    // ==========================================
    // SECCIÓN: CHATS WHATSAPP (HISTÓRICO Y EN VIVO)
    // ==========================================
    let allWhatsAppChats = [];
    let currentChatCategoryFilter = 'all';
    let searchChatsFilter = '';

    async function fetchWhatsAppChats() {
        try {
            const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch('/api/admin/chats', {
                headers: { 'x-admin-token': tokenToUse }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.chats)) {
                    allWhatsAppChats = data.chats;
                    renderWhatsAppChats();
                }
            }
        } catch (err) {
            console.error("⚠️ Error cargando chats de WhatsApp:", err.message);
        }
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

    function formatChatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const now = new Date();
            const isToday = d.toDateString() === now.toDateString();
            const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            if (isToday) return `Hoy ${timeStr}`;
            const day = d.getDate();
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const month = months[d.getMonth()];
            const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
            return `${day} ${month}${year}, ${timeStr}`;
        } catch (e) {
            return dateStr;
        }
    }

    function renderWhatsAppChats() {
        const container = document.getElementById('whatsapp-chats-container');
        if (!container) return;

        // Actualizar contadores globales
        const total = allWhatsAppChats.length;
        const countCli = allWhatsAppChats.filter(c => !c.categoria || c.categoria === 'cliente').length;
        const countProv = allWhatsAppChats.filter(c => c.categoria === 'proveedor').length;
        const countAlba = allWhatsAppChats.filter(c => c.categoria === 'alba').length;
        const countHoteles = allWhatsAppChats.filter(c => c.categoria === 'hoteles' || c.categoria === 'hotel').length;
        const countTaxi = allWhatsAppChats.filter(c => c.categoria === 'taxi').length;

        const badgeNav = document.getElementById('chats-count-badge');
        if (badgeNav) {
            badgeNav.textContent = total;
            badgeNav.style.display = total > 0 ? 'inline-block' : 'none';
        }
        const badgeDropdown = document.getElementById('dropdown-chats-badge');
        if (badgeDropdown) {
            badgeDropdown.textContent = total;
            badgeDropdown.style.display = total > 0 ? 'inline-block' : 'none';
        }
        const totalSummary = document.getElementById('chats-total-summary');
        if (totalSummary) {
            totalSummary.textContent = `${total} conversaciones registradas`;
        }

        const cAll = document.getElementById('count-chat-all');
        const cCli = document.getElementById('count-chat-cli');
        const cProv = document.getElementById('count-chat-prov');
        const cAlba = document.getElementById('count-chat-alba');
        const cHoteles = document.getElementById('count-chat-hoteles');
        const cTaxi = document.getElementById('count-chat-taxi');
        if (cAll) cAll.textContent = total;
        if (cCli) cCli.textContent = countCli;
        if (cProv) cProv.textContent = countProv;
        if (cAlba) cAlba.textContent = countAlba;
        if (cHoteles) cHoteles.textContent = countHoteles;
        if (cTaxi) cTaxi.textContent = countTaxi;

        let filtered = [...allWhatsAppChats];

        // Filtro por categoría
        if (currentChatCategoryFilter !== 'all') {
            if (currentChatCategoryFilter === 'cliente') {
                filtered = filtered.filter(c => !c.categoria || c.categoria === 'cliente');
            } else if (currentChatCategoryFilter === 'hoteles') {
                filtered = filtered.filter(c => c.categoria === 'hoteles' || c.categoria === 'hotel');
            } else {
                filtered = filtered.filter(c => c.categoria === currentChatCategoryFilter);
            }
        }

        // Filtro por búsqueda
        if (searchChatsFilter.trim()) {
            const q = searchChatsFilter.toLowerCase().trim();
            filtered = filtered.filter(c => 
                (c.nombreCliente || '').toLowerCase().includes(q) ||
                (c.telefono || '').toLowerCase().includes(q) ||
                (c.ultimoTexto || '').toLowerCase().includes(q)
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 50px 20px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
                    <div style="font-size: 1.05rem; font-weight: 600; color: #cbd5e1;">No se encontraron conversaciones</div>
                    <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 4px;">Prueba a cambiar el término de búsqueda o el filtro de categoría.</div>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(chat => {
            const cleanTel = (chat.telefono || '').replace(/\D/g, '');
            const displayTel = cleanTel.startsWith('34') || cleanTel.length > 9 ? `+${cleanTel}` : cleanTel;
            const displayName = chat.nombreCliente || displayTel || 'Cliente WhatsApp';
            const catBadge = getCategoryBadgeHtml(chat.categoria);
            const dateStr = formatChatDate(chat.ultimoMensajeFecha);
            const lastMsgText = chat.ultimoTexto || '(Sin mensajes previos)';
            const isFromClient = chat.ultimoEmisor === 'cliente';
            const emisorPrefix = isFromClient ? '👤 <em>Cliente:</em> ' : '💬 <em>Recepción:</em> ';

            return `
                <div class="solicitud-card chat-card" data-phone="${cleanTel}" style="cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease;">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                            <div class="whatsapp-avatar" style="width: 38px; height: 38px; font-size: 1.1rem; flex-shrink: 0; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                👤
                            </div>
                            <div style="min-width: 0;">
                                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${displayName}
                                </h4>
                                <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">
                                    📞 ${displayTel}
                                </div>
                            </div>
                        </div>
                        <div style="flex-shrink: 0;">
                            ${catBadge}
                        </div>
                    </div>

                    <div class="card-body" style="margin: 12px 0 10px 0; background: rgba(15, 23, 42, 0.5); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.83rem; color: #cbd5e1; line-height: 1.4; max-height: 70px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        ${emisorPrefix}${lastMsgText}
                    </div>

                    <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #94a3b8;">
                            <span>🕒 ${dateStr}</span>
                            <span>•</span>
                            <span class="chat-count-badge" style="background: rgba(100, 116, 139, 0.25); color: #cbd5e1; padding: 2px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 600;">
                                ${chat.totalInteracciones || 1} msgs
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${cleanTel.length >= 7 ? `
                                <a href="https://wa.me/${cleanTel}" target="_blank" class="badge-wa" style="text-decoration: none; padding: 4px 8px; font-size: 0.75rem; border-radius: 6px; background: rgba(37, 211, 102, 0.15); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.35);" title="Abrir en WhatsApp Web">
                                    📲
                                </a>
                            ` : ''}
                            <button type="button" class="btn-primary btn-open-chat" data-phone="${cleanTel}" data-name="${displayName}" style="padding: 4px 10px; font-size: 0.78rem; background: linear-gradient(135deg, #10b981, #059669); border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                💬 Ver Chat
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Event listeners para abrir chat
        container.querySelectorAll('.btn-open-chat, .chat-card').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.tagName === 'A' || e.target.closest('a')) return;
                const card = el.classList.contains('chat-card') ? el : el.closest('.chat-card');
                if (!card) return;
                const phone = card.getAttribute('data-phone');
                const name = card.querySelector('h4') ? card.querySelector('h4').textContent.trim() : phone;
                openClientChatHistoryModal(phone, name);
            });
        });
    }

    // Modal de Historial Completo del Cliente
    async function openClientChatHistoryModal(telefono, nombre) {
        const modal = document.getElementById('history-modal');
        const nameEl = document.getElementById('history-client-name');
        const phoneEl = document.getElementById('history-client-phone');
        const viewport = document.getElementById('history-chat-viewport');
        const msgCountEl = document.getElementById('history-msg-count');
        if (!modal || !viewport) return;

        const cleanTel = (telefono || '').replace(/\D/g, '');
        const displayTel = cleanTel.startsWith('34') || cleanTel.length > 9 ? `+${cleanTel}` : cleanTel;
        
        if (nameEl) nameEl.textContent = `Historial: ${nombre || displayTel}`;
        if (phoneEl) phoneEl.textContent = `📞 WhatsApp: ${displayTel}`;
        if (msgCountEl) msgCountEl.textContent = 'Cargando...';

        viewport.innerHTML = `
            <div style="text-align: center; color: #94a3b8; padding: 40px;">
                <div style="font-size: 1.8rem; margin-bottom: 8px;">⏳</div>
                Cargando historial de mensajes...
            </div>
        `;
        modal.style.display = 'flex';

        try {
            const tokenToUse = adminToken || localStorage.getItem('casa_julian_admin_token') || '';
            const res = await fetch(`/api/admin/solicitudes/history/${cleanTel}`, {
                headers: { 'x-admin-token': tokenToUse }
            });
            const data = await res.json();

            if (data.success && Array.isArray(data.history) && data.history.length > 0) {
                if (msgCountEl) msgCountEl.textContent = `${data.history.length} mensajes`;

                viewport.innerHTML = data.history.map(msg => {
                    const isClient = msg.emisor === 'cliente';
                    const emisorName = isClient ? (nombre || 'Cliente') : 'Recepción Casa Julián';
                    const timeFormatted = formatChatDate(msg.created_at);
                    const textHtml = (msg.texto || '').replace(/\n/g, '<br>');

                    return `
                        <div class="chat-bubble-row ${isClient ? 'from-client' : 'from-bot'}" style="margin-bottom: 12px; display: flex; flex-direction: column; align-items: ${isClient ? 'flex-start' : 'flex-end'};">
                            <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 2px; padding: 0 4px;">
                                ${emisorName}
                            </div>
                            <div class="chat-bubble ${isClient ? 'bubble-client' : 'bubble-bot'}" style="max-width: 80%; padding: 10px 14px; border-radius: 12px; background: ${isClient ? 'rgba(30, 41, 59, 0.9)' : 'linear-gradient(135deg, #065f46, #047857)'}; color: #f8fafc; font-size: 0.88rem; line-height: 1.4; border: 1px solid ${isClient ? 'rgba(255,255,255,0.1)' : 'rgba(16, 185, 129, 0.3)'};">
                                <div>${textHtml}</div>
                                <div style="text-align: right; font-size: 0.68rem; color: rgba(255,255,255,0.6); margin-top: 4px;">
                                    ${timeFormatted} ${!isClient ? '✓✓' : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                setTimeout(() => {
                    viewport.scrollTop = viewport.scrollHeight;
                }, 50);
            } else {
                if (msgCountEl) msgCountEl.textContent = '0 mensajes';
                viewport.innerHTML = `
                    <div style="text-align: center; color: #94a3b8; padding: 40px;">
                        No hay mensajes registrados para este cliente.
                    </div>
                `;
            }
        } catch (err) {
            console.error("Error cargando historial de chat:", err);
            viewport.innerHTML = `
                <div style="text-align: center; color: #f87171; padding: 40px;">
                    Error al cargar el historial: ${err.message}
                </div>
            `;
        }
    }

    // Cerrar modal de historial
    const closeHistoryModalBtn = document.getElementById('close-history-modal-btn');
    if (closeHistoryModalBtn) {
        closeHistoryModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('history-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Filtros por chips en pestaña de chats
    document.querySelectorAll('[data-chat-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-chat-filter]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentChatCategoryFilter = chip.getAttribute('data-chat-filter');
            renderWhatsAppChats();
        });
    });

    // ── Buscador y Refresco de Chats WhatsApp ─────────────────────────────────
    const searchChatsInput = document.getElementById('search-chats-input');
    if (searchChatsInput) {
        searchChatsInput.addEventListener('input', (e) => {
            searchChatsFilter = e.target.value;
            renderWhatsAppChats();
        });
    }

    const refreshChatsBtn = document.getElementById('refresh-chats-btn');
    if (refreshChatsBtn) {
        refreshChatsBtn.addEventListener('click', async () => {
            refreshChatsBtn.disabled = true;
            refreshChatsBtn.textContent = '⏳ Cargando...';
            await fetchWhatsAppChats();
            refreshChatsBtn.disabled = false;
            refreshChatsBtn.innerHTML = '🔄 Actualizar Chats';
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
                    await fetchSolicitudes();
                    const updatedSol = allSolicitudes.find(s => s.id === solId);
                    if (updatedSol) {
                        openReplyModal(updatedSol);
                    }
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
                        alert(data.message || "✅ Gestión concluida y bot reactivado.");
                        await fetchSolicitudes();
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
                    await fetchSolicitudes();
                    // Actualizar el hilo en el modal abierto
                    const updatedSol = allSolicitudes.find(s => s.id === solId);
                    if (updatedSol) {
                        openReplyModal(updatedSol);
                    } else {
                        closeReplyModal();
                    }
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

