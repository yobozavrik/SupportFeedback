import './styles/tailwind.css';

document.addEventListener('DOMContentLoaded', () => {
    // Service Worker registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.warn);
    }
    // --- CONFIGURATION ---
    // ВЕБХУК: всегда прод-режим
    let N8N_WEBHOOK_URL = 'https://n8n.dmytrotovstytskyi.online/webhook/supporttest';
    const GEMINI_API_KEY = ''; // The build environment will provide this key.
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const MOCK_PRODUCT_LIST = [
        "Пельмені зі свининою", "Пельмені з яловичиною", "Пельмені з куркою", "Пельмені дитячі",
        "Вареники з картоплею", "Вареники з капустою", "Вареники з вишнею", "Вареники з сиром солодкі",
        "Хінкалі", "Равіолі", "Млинці з м'ясом", "Млинці з сиром", "Сирники", "Котлети домашні",
        "Голубці", "Перець фарширований", "Чебуреки", "Борщ", "Суп-харчо"
    ];
    const SECRET_SHOPPER_GOAL = 3;

    // --- DOM ELEMENTS ---
    const categoryButtons = document.querySelectorAll('.category-btn');
    const modal = document.getElementById('feedback-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalTitle = document.getElementById('modal-title');
    const feedbackForm = document.getElementById('feedback-form');
    const toastContainer = document.getElementById('toast');
    const faqItems = document.querySelectorAll('.faq-item');
    const achievementsBtn = document.getElementById('achievements-btn');
    const achievementsModal = document.getElementById('achievements-modal');
    const closeAchievementsModalBtn = document.getElementById('close-achievements-modal-btn');
    const achievementsList = document.getElementById('achievements-list');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeToggleSun = document.getElementById('theme-toggle-sun');
    const themeToggleMoon = document.getElementById('theme-toggle-moon');
    const themeToggleLabel = document.getElementById('theme-toggle-label');
    const prefersDarkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const THEME_STORAGE_KEY = 'gala-theme';

    // --- STATE ---
    let currentCategory = '';
    let selectedFile = null;
    let storeId = 'unknown_store';
    let satisfactionRating = 0;
    let userGeolocation = null;
    let userId = null;
    let userAchievements = null;
    let lastFocusedElement = null;
    // Anti-spam state
    const MIN_TEXT_LEN = 15;
    const MAX_TEXT_LEN = 800;
    const SUBMIT_COOLDOWN_MS = 15000; // 15s
    const PER_USER_RATE_LIMIT = { windowMs: 60_000, max: 5 }; // 5 отправок в минуту
    const STORAGE_LAST_SUBMIT = 'gala-last-submit';
    const STORAGE_SUBMIT_WINDOW = 'gala-submit-window';
    const STORAGE_SUBMIT_COUNT = 'gala-submit-count';

    const getStoredTheme = () => {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY);
        } catch (error) {
            console.warn('Unable to read stored theme preference.', error);
            return null;
        }
    };

    const storeTheme = (theme) => {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (error) {
            console.warn('Unable to persist theme preference.', error);
        }
    };

    const applyTheme = (theme, options = {}) => {
        const { persist = true } = options;
        const themeToApply = theme === 'dark' ? 'dark' : 'light';
        const root = document.documentElement;
        const isDark = themeToApply === 'dark';
        root.classList.toggle('dark', isDark);

        if (themeToggleBtn) {
            themeToggleBtn.setAttribute('aria-pressed', String(isDark));
        }
        if (themeToggleSun && themeToggleMoon) {
            themeToggleSun.classList.toggle('hidden', !isDark);
            themeToggleMoon.classList.toggle('hidden', isDark);
        }
        if (themeToggleLabel) {
            themeToggleLabel.textContent = isDark ? 'Світла тема' : 'Темна тема';
        }

        if (persist) {
            storeTheme(themeToApply);
        }
    };

    const initializeTheme = () => {
        const storedTheme = getStoredTheme();
        if (storedTheme === 'dark' || storedTheme === 'light') {
            applyTheme(storedTheme, { persist: false });
        } else {
            const prefersDark = prefersDarkMedia ? prefersDarkMedia.matches : false;
            applyTheme(prefersDark ? 'dark' : 'light', { persist: false });
        }

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
                applyTheme(nextTheme);
            });
        }

        if (prefersDarkMedia) {
            const syncWithSystem = (event) => {
                if (!getStoredTheme()) {
                    applyTheme(event.matches ? 'dark' : 'light', { persist: false });
                }
            };
            if (typeof prefersDarkMedia.addEventListener === 'function') {
                prefersDarkMedia.addEventListener('change', syncWithSystem);
            } else if (typeof prefersDarkMedia.addListener === 'function') {
                prefersDarkMedia.addListener(syncWithSystem);
            }
        }
    };

    // --- INITIALIZATION ---
    const initializeUser = () => {
        userId = localStorage.getItem('gala-userId');
        if (!userId) {
            userId = crypto.randomUUID();
            localStorage.setItem('gala-userId', userId);
        }

        const achievementsData = localStorage.getItem('gala-userAchievements');
        if (!achievementsData) {
            userAchievements = {
                secretShopper: { earned: false, stores: [] }
            };
            localStorage.setItem('gala-userAchievements', JSON.stringify(userAchievements));
        } else {
            userAchievements = JSON.parse(achievementsData);
        }
    };

    const urlParams = new URLSearchParams(window.location.search);
    storeId = urlParams.get('store_id') || 'unknown_store';
    initializeUser();
    initializeTheme();


    // --- FUNCTIONS ---
    const getGeolocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userGeolocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    };
                },
                (error) => {
                    console.warn(`Geolocation error: ${error.message}`);
                    userGeolocation = null;
                }
            );
        }
    };

    const openModal = (category) => {
        currentCategory = category;
        modalTitle.textContent = category;

        const productInputSection = document.getElementById('product-input-section');
        const complaintReasonSection = document.getElementById('complaint-reason-section');
        const photoUploadSection = document.getElementById('photo-upload-section');

        productInputSection.classList.add('hidden');
        complaintReasonSection.classList.add('hidden');
        photoUploadSection.classList.add('hidden');

        if (category === 'Скарга') {
            complaintReasonSection.classList.remove('hidden');
            photoUploadSection.classList.remove('hidden');
        }

        if (category === 'Немає продукції') {
            productInputSection.classList.remove('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('modal-enter');
        modal.classList.remove('modal-leave');
        setupFocusTrap(modal);
        focusFirstElement(modal);
        getGeolocation();
    };

    const closeModal = (modalElement) => {
        modalElement.classList.add('modal-leave');
        modalElement.classList.remove('modal-enter');
        setTimeout(() => {
            modalElement.classList.add('hidden');
            if (modalElement.id === 'feedback-modal') {
                resetForm();
            }
            releaseFocusTrap();
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                lastFocusedElement.focus();
            }
        }, 300);
    };

    const resetForm = () => {
        feedbackForm.reset();
        document.getElementById('product-input-section').classList.add('hidden');
        document.getElementById('complaint-reason-section').classList.add('hidden');
        document.getElementById('photo-upload-section').classList.add('hidden');
        document.getElementById('photo-preview-container').classList.add('hidden');
        document.getElementById('ai-results-section').classList.add('hidden');
        document.getElementById('product-suggestions').innerHTML = '';
        document.getElementById('product-suggestions').classList.add('hidden');
        document.getElementById('photo-preview').src = '';
        const complaintReasonSelect = document.getElementById('complaint-reason-select');
        if (complaintReasonSelect) {
            complaintReasonSelect.selectedIndex = 0;
        }
        selectedFile = null;
        currentCategory = '';
        satisfactionRating = 0;
        userGeolocation = null;
        updateStarRating(0);
        updateFeedbackCounter(0);
    };

    // ---- Image helpers: resize/compress ----
    const fileToArrayBuffer = (blob) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsArrayBuffer(blob);
    });
    const fileToDataURL = (blob) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
    });
    const loadImageBitmap = async (blob) => {
        if ('createImageBitmap' in window) {
            try { return await createImageBitmap(blob); } catch (e) { /* fallthrough */ }
        }
        // Fallback via HTMLImageElement
        return await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    };
    const resizeImageBlob = async (blob, { maxSize = 1600, quality = 0.82 } = {}) => {
        try {
            const bitmap = await loadImageBitmap(blob);
            const w = bitmap.width || bitmap.naturalWidth;
            const h = bitmap.height || bitmap.naturalHeight;
            if (!w || !h) return null;
            let targetW = w, targetH = h;
            if (Math.max(w, h) > maxSize) {
                const scale = maxSize / Math.max(w, h);
                targetW = Math.round(w * scale);
                targetH = Math.round(h * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = targetW; canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, targetW, targetH);
            const blobOut = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
            return blobOut;
        } catch (_) {
            return null;
        }
    };

    const handleFileSelect = async (event) => {
        const file = event.target.files[0];
        if (file) {
            const isImage = file.type && file.type.startsWith('image/');
            const maxSizeBytes = 5 * 1024 * 1024; // 5MB
            if (!isImage) {
                alert('Пожалуйста, выберите файл изображения.');
                event.target.value = '';
                return;
            }
            if (file.size > maxSizeBytes) {
                alert('Файл слишком большой. Максимум 5 МБ.');
                event.target.value = '';
                return;
            }
            // Magic bytes validation
            const ab = await fileToArrayBuffer(file.slice(0, 16));
            const bytes = new Uint8Array(ab);
            const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
            const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
            const isWEBP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
            const isHEIC = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
            if (!(isJPEG || isPNG || isWEBP || isHEIC)) {
                alert('Неподдерживаемый формат. Разрешены JPEG/PNG/WEBP/HEIC.');
                event.target.value = '';
                return;
            }

            // Resize/compress if beneficial
            let finalBlob = file;
            const resized = await resizeImageBlob(file, { maxSize: 1600, quality: 0.82 });
            if (resized && resized.size > 0 && resized.size < file.size) {
                finalBlob = new File([resized], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
            }
            selectedFile = finalBlob;
            const dataUrl = await fileToDataURL(finalBlob);
            document.getElementById('photo-preview').src = dataUrl;
            document.getElementById('photo-preview-container').classList.remove('hidden');
        }
    };

    const showLoading = (isLoading, element = 'submit') => {
        const btn = document.getElementById('submit-btn');
        const btnText = document.getElementById('submit-btn-text');
        const loader = document.getElementById('submit-loader');

        const aiBtn = document.getElementById('ai-assist-btn');
        const aiBtnText = document.getElementById('ai-assist-btn-text');
        const aiLoader = document.getElementById('ai-assist-loader');

         if (element === 'submit') {
            btnText.classList.toggle('hidden', isLoading);
            loader.classList.toggle('hidden', !isLoading);
            btn.disabled = isLoading;
        } else if (element === 'ai') {
            aiBtnText.classList.toggle('hidden', isLoading);
            aiLoader.classList.toggle('hidden', !isLoading);
            aiBtn.disabled = isLoading;
        }
    };

    const showToast = (message, type = 'success') => {
        const toastId = `toast-${Date.now()}`;
        const icon = type === 'achievement' ? '🏆' : '✅';
        const toastElement = document.createElement('div');
        toastElement.id = toastId;
        const toneClass = type === 'achievement' ? 'toast-achievement' : 'toast-success';
        toastElement.className = `toast-message ${toneClass} toast-enter`;
        toastElement.innerHTML = `<p>${icon} ${message}</p>`;

        toastContainer.appendChild(toastElement);

        setTimeout(() => {
            toastElement.classList.add('toast-leave');
            toastElement.classList.remove('toast-enter');
            setTimeout(() => toastElement.remove(), 500);
        }, 5000);
    };

    const getAiAnalysis = async (text) => {
        const systemPrompt = "Ти — доброзичливий AI-асистент компанії 'Галя Балувана'. Твоя мета — допомогти клієнтам написати чіткий та конструктивний відгук. Проаналізуй текст користувача та надай настрій відгуку, коротке резюме та три конкретні поради щодо покращення українською мовою. Відповідай ТІЛЬКИ у форматі JSON згідно зі схемою.";
        const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        sentiment: { type: "STRING" },
                        summary: { type: "STRING" },
                        suggestions: { type: "ARRAY", items: { type: "STRING" } }
                    },
                    required: ["sentiment", "summary", "suggestions"]
                }
            }
        };

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Gemini API Error Response:", errorBody);
            throw new Error('Не вдалося отримати відповідь від AI.');
        }
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
           throw new Error('Відповідь AI має невірний формат.');
        }
        return JSON.parse(jsonText);
    };

    const postWithRetry = async (url, options, retryCfg = {}) => {
        const { retries = 2, timeoutMs = 10000, backoffMs = 800 } = retryCfg;
        let attempt = 0;
        let lastError = null;
        while (attempt <= retries) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const resp = await fetch(url, { ...options, signal: controller.signal, credentials: 'omit', redirect: 'follow' });
                clearTimeout(id);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return resp;
            } catch (err) {
                clearTimeout(id);
                lastError = err;
                if (attempt === retries) break;
                await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
                attempt += 1;
            }
        }
        throw lastError || new Error('Request failed');
    };

    // ---- Anti-spam helpers ----
    const updateFeedbackCounter = (len) => {
        const counterEl = document.getElementById('feedback-counter');
        if (counterEl) counterEl.textContent = `${len} / ${MAX_TEXT_LEN}`;
        const hintEl = document.getElementById('feedback-hint');
        if (hintEl) hintEl.textContent = len < MIN_TEXT_LEN ? `Мін. ${MIN_TEXT_LEN} символів` : 'Дякуємо за деталі!';
    };

    const isUnderCooldown = () => {
        const last = parseInt(localStorage.getItem(STORAGE_LAST_SUBMIT) || '0', 10);
        return Date.now() - last < SUBMIT_COOLDOWN_MS;
    };

    const canPassRateLimit = () => {
        const now = Date.now();
        const windowStart = parseInt(localStorage.getItem(STORAGE_SUBMIT_WINDOW) || '0', 10);
        let count = parseInt(localStorage.getItem(STORAGE_SUBMIT_COUNT) || '0', 10);
        if (now - windowStart > PER_USER_RATE_LIMIT.windowMs) {
            localStorage.setItem(STORAGE_SUBMIT_WINDOW, String(now));
            localStorage.setItem(STORAGE_SUBMIT_COUNT, '0');
            count = 0;
        }
        return count < PER_USER_RATE_LIMIT.max;
    };

    const incrementRateCounter = () => {
        const now = Date.now();
        const windowStart = parseInt(localStorage.getItem(STORAGE_SUBMIT_WINDOW) || '0', 10);
        let count = parseInt(localStorage.getItem(STORAGE_SUBMIT_COUNT) || '0', 10);
        if (now - windowStart > PER_USER_RATE_LIMIT.windowMs) {
            localStorage.setItem(STORAGE_SUBMIT_WINDOW, String(now));
            count = 0;
        }
        localStorage.setItem(STORAGE_SUBMIT_COUNT, String(count + 1));
        localStorage.setItem(STORAGE_SUBMIT_WINDOW, windowStart ? String(windowStart) : String(now));
        localStorage.setItem(STORAGE_LAST_SUBMIT, String(now));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        // Honeypot: если заполнено — блокируем
        const hp = document.getElementById('website');
        if (hp && hp.value && hp.value.trim().length > 0) {
            alert('Помилка відправки.');
            return;
        }
        // Минимальная задержка до отправки после открытия модалки
        // (простая эвристика против ботов)
        const openDelayOk = true; // можно расширить, если нужно
        if (!openDelayOk) return;

        const textEl = document.getElementById('feedback-text');
        const raw = (textEl.value || '').trim();
        // Простая санитаризация от опасных HTML/JS
        const textVal = raw
            .replace(/[\u0000-\u001F\u007F]/g, '')
            .replace(/<\s*script/gi, '&lt;script')
            .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, '')
            .replace(/on[a-z]+\s*=\s*'[^']*'/gi, '')
            .replace(/on[a-z]+\s*=\s*[^\s>]+/gi, '');
        if (textVal.length < MIN_TEXT_LEN) {
            alert(`Будь ласка, додайте більше деталей (мінімум ${MIN_TEXT_LEN} символів).`);
            return;
        }
        if (textVal.length > MAX_TEXT_LEN) {
            alert(`Будь ласка, скоротіть повідомлення до ${MAX_TEXT_LEN} символів.`);
            return;
        }
        if (isUnderCooldown()) {
            alert('Занадто часті відправки. Будь ласка, зачекайте кілька секунд.');
            return;
        }
        if (!canPassRateLimit()) {
            alert('Досягнуто ліміт відправок. Спробуйте пізніше.');
            return;
        }
        showLoading(true, 'submit');

        const applicationId = `GB-${Date.now().toString(36).toUpperCase()}`;
        const formData = new FormData();
        // client token: привязка к userId и времени
        const clientToken = btoa(`${userId}.${applicationId}.${storeId}.${Date.now()}`);

        formData.append('userId', userId);
        formData.append('applicationId', applicationId);
        formData.append('storeId', storeId);
        formData.append('clientToken', clientToken);
        formData.append('category', currentCategory);
        formData.append('rating', satisfactionRating);
        const productValue = currentCategory === 'Немає продукції' ? document.getElementById('product-input').value : '';
        const complaintReason = currentCategory === 'Скарга' ? document.getElementById('complaint-reason-select').value : '';
        formData.append('product', productValue || '');
        formData.append('complaintReason', complaintReason || '');
        formData.append('text', textVal);
        formData.append('phone', document.getElementById('phone-input').value || null);
        if (userGeolocation) {
            formData.append('geolocation', JSON.stringify(userGeolocation));
        }
        if (selectedFile) {
            formData.append('file', selectedFile);
        }

        try {
            const response = await postWithRetry(N8N_WEBHOOK_URL, {
                method: 'POST',
                body: formData,
            }, { retries: 2, timeoutMs: 12000, backoffMs: 600 });

            closeModal(modal);
            showToast(`Дякуємо! Номер вашого звернення: ${applicationId}`);
            trackStoreVisit(storeId);
            incrementRateCounter();

        } catch (error) {
            console.error('There was a problem:', error);
            alert(`Виникла помилка під час відправки: ${error.message}. Спробуйте, будь ласка, ще раз.`);
        } finally {
            showLoading(false, 'submit');
        }
    };

     const handleAiAssist = async () => {
        const text = document.getElementById('feedback-text').value;
        if (text.trim().length < 10) {
            alert('Будь ласка, напишіть хоча б декілька слів для аналізу.');
            return;
        }
        showLoading(true, 'ai');
        document.getElementById('ai-results-section').classList.add('hidden');

        try {
            const analysis = await getAiAnalysis(text);
            document.getElementById('ai-sentiment').textContent = `Настрій відгуку: ${analysis.sentiment || 'Не визначено'}`;
            document.getElementById('ai-summary').textContent = `Ключова думка: ${analysis.summary || '–'}`;
            const suggestionsEl = document.getElementById('ai-suggestions');
            suggestionsEl.innerHTML = '';
            (analysis.suggestions || []).forEach(suggestion => {
                const li = document.createElement('li');
                li.textContent = suggestion;
                suggestionsEl.appendChild(li);
            });
            document.getElementById('ai-results-section').classList.remove('hidden');
        } catch (error) {
            console.error('AI Assist Error:', error);
            alert(`Помилка аналізу: ${error.message}`);
        } finally {
            showLoading(false, 'ai');
        }
    };

    // Small perf win: debounce autocomplete
    const debounce = (fn, delay = 150) => {
        let t = null;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), delay);
        };
    };

    const handleProductAutocomplete = (event) => {
        const value = event.target.value.toLowerCase();
        const suggestionsEl = document.getElementById('product-suggestions');
        suggestionsEl.innerHTML = '';
        if (value.length < 2) {
            suggestionsEl.classList.add('hidden');
            return;
        }

        const filteredProducts = MOCK_PRODUCT_LIST.filter(p => p.toLowerCase().includes(value));

        if (filteredProducts.length > 0) {
            suggestionsEl.classList.remove('hidden');
            filteredProducts.forEach(product => {
                const div = document.createElement('div');
                div.textContent = product;
                div.className = 'p-2 cursor-pointer transition-colors duration-200 text-gray-700 dark:text-gray-200';
                div.onclick = () => {
                    document.getElementById('product-input').value = product;
                    suggestionsEl.innerHTML = '';
                    suggestionsEl.classList.add('hidden');
                };
                suggestionsEl.appendChild(div);
            });
        } else {
            suggestionsEl.classList.add('hidden');
        }
    };
    const handleProductAutocompleteDebounced = debounce(handleProductAutocomplete, 180);

    // --- ACCESSIBILITY: focus trap and Esc-close for modals ---
    let activeTrap = null;
    const getFocusableElements = (container) => {
        return container.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
    };
    const focusFirstElement = (container) => {
        lastFocusedElement = document.activeElement;
        const focusables = getFocusableElements(container);
        if (focusables.length > 0) {
            focusables[0].focus();
        } else {
            container.focus();
        }
    };
    const handleKeydown = (e) => {
        if (!activeTrap) return;
        if (e.key === 'Escape') {
            closeModal(activeTrap);
            return;
        }
        if (e.key === 'Tab') {
            const focusables = Array.from(getFocusableElements(activeTrap));
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    const setupFocusTrap = (container) => {
        activeTrap = container;
        document.addEventListener('keydown', handleKeydown);
    };
    const releaseFocusTrap = () => {
        document.removeEventListener('keydown', handleKeydown);
        activeTrap = null;
    };

    const updateStarRating = (rating) => {
        document.querySelectorAll('#satisfaction-rating .star').forEach(star => {
            star.classList.toggle('selected', star.dataset.value <= rating);
        });
    };

    const trackStoreVisit = (storeId) => {
        if (storeId === 'unknown_store' || !userAchievements.secretShopper) return;

        const { stores, earned } = userAchievements.secretShopper;
        if (!stores.includes(storeId)) {
            stores.push(storeId);
            userAchievements.secretShopper.stores = stores;
            localStorage.setItem('gala-userAchievements', JSON.stringify(userAchievements));
            checkSecretShopperAchievement();
        }
    };

    const checkSecretShopperAchievement = () => {
        const { stores, earned } = userAchievements.secretShopper;
        if (!earned && stores.length >= SECRET_SHOPPER_GOAL) {
            userAchievements.secretShopper.earned = true;
            localStorage.setItem('gala-userAchievements', JSON.stringify(userAchievements));
            showToast("Ви отримали досягнення 'Таємний покупець'!", 'achievement');
        }
    };

    const renderAchievements = () => {
        const { stores, earned } = userAchievements.secretShopper;
        const progress = Math.min(stores.length, SECRET_SHOPPER_GOAL);
        const isCompleted = earned || progress >= SECRET_SHOPPER_GOAL;

        const achievementHTML = `
            <div class="border rounded-lg p-4 ${isCompleted
                ? 'bg-green-50 border-green-200 dark:bg-emerald-900/40 dark:border-emerald-500/40'
                : 'bg-gray-50 border-gray-200 dark:bg-slate-900/60 dark:border-slate-700/60'}">
                <div class="flex items-center">
                    <div class="text-4xl mr-4">${isCompleted ? '🏆' : '🕵️'}</div>
                    <div>
                        <h3 class="font-bold text-lg ${isCompleted ? 'text-green-700 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-100'}">Таємний покупець</h3>
                        <p class="text-sm text-gray-600 dark:text-gray-300">Залиште відгуки з ${SECRET_SHOPPER_GOAL} різних магазинів.</p>
                    </div>
                </div>
                <div class="mt-3">
                    <div class="flex justify-between text-sm font-medium ${isCompleted ? 'text-green-700 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-200'} mb-1">
                        <span>Прогрес</span>
                        <span>${progress} / ${SECRET_SHOPPER_GOAL}</span>
                    </div>
                    <div class="achievement-progress-bar">
                        <div class="achievement-progress" style="width: ${(progress / SECRET_SHOPPER_GOAL) * 100}%"></div>
                    </div>
                </div>
            </div>
        `;
        achievementsList.innerHTML = achievementHTML;
    };

    const openAchievementsModal = () => {
        renderAchievements();
        achievementsModal.classList.remove('hidden');
        achievementsModal.classList.remove('modal-leave');
        achievementsModal.classList.add('modal-enter');
    };

    // --- EVENT LISTENERS BINDING ---
    categoryButtons.forEach(button => button.addEventListener('click', () => openModal(button.dataset.category)));
    closeModalBtn.addEventListener('click', () => closeModal(modal));
    modal.addEventListener('click', (e) => { if (e.target.id === 'feedback-modal') closeModal(modal); });

    achievementsBtn.addEventListener('click', openAchievementsModal);
    closeAchievementsModalBtn.addEventListener('click', () => closeModal(achievementsModal));
    achievementsModal.addEventListener('click', (e) => { if (e.target.id === 'achievements-modal') closeModal(achievementsModal); });

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        question.addEventListener('click', () => {
            answer.classList.toggle('hidden');
            question.classList.toggle('open');
        });
    });

    feedbackForm.addEventListener('submit', handleSubmit);
    document.getElementById('ai-assist-btn').addEventListener('click', handleAiAssist);
    document.getElementById('photo-upload-btn').addEventListener('click', () => document.getElementById('photo-upload-input').click());
    document.getElementById('photo-upload-input').addEventListener('change', handleFileSelect);
    document.getElementById('product-input').addEventListener('input', handleProductAutocompleteDebounced);
    // live counter
    document.getElementById('feedback-text').addEventListener('input', (e) => {
        const val = (e.target.value || '').slice(0, MAX_TEXT_LEN);
        if (val !== e.target.value) e.target.value = val;
        updateFeedbackCounter(val.length);
    });
    const testToggleBtn = document.getElementById('test-toggle-btn');
    if (testToggleBtn) {
        testToggleBtn.addEventListener('click', () => {
            const enabled = !!localStorage.getItem(STORAGE_TEST_KEY);
            setTestMode(!enabled);
            showToast(`Режим переключен: ${!enabled ? 'TEST' : 'PROD'}`);
        });
    }
    const persistentTestChip = document.getElementById('test-chip');
    if (persistentTestChip) {
        persistentTestChip.addEventListener('click', () => {
            const enabled = !!localStorage.getItem(STORAGE_TEST_KEY);
            setTestMode(!enabled);
            showToast(`Режим переключен: ${!enabled ? 'TEST' : 'PROD'}`);
        });
    }

    document.querySelectorAll('#satisfaction-rating .star').forEach(star => {
        star.addEventListener('click', () => {
            satisfactionRating = parseInt(star.dataset.value);
            document.getElementById('satisfaction-rating').dataset.rating = satisfactionRating;
            updateStarRating(satisfactionRating);
        });
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.dataset.value);
            updateStarRating(rating);
        });
    });
    document.getElementById('satisfaction-rating').addEventListener('mouseleave', () => {
        updateStarRating(satisfactionRating);
    });
});
