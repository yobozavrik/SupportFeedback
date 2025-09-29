const MIN_TEXT_LEN = 15;
const MAX_TEXT_LEN = 800;
const SUBMIT_COOLDOWN_MS = 15_000;
const PER_USER_RATE_LIMIT = { windowMs: 60_000, max: 5 };
const STORAGE_LAST_SUBMIT = 'gala-last-submit';
const STORAGE_SUBMIT_WINDOW = 'gala-submit-window';
const STORAGE_SUBMIT_COUNT = 'gala-submit-count';
const STORAGE_USER_ID = 'gala-userId';
const STORAGE_ACHIEVEMENTS = 'gala-userAchievements';
const STORAGE_TEST_KEY = 'gala-test-mode';

const SECRET_SHOPPER_KEY = 'secretShopper';

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
    try {
      return await createImageBitmap(blob);
    } catch (error) {
      // Fallback below
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event);
    };
    img.src = url;
  });
};

const resizeImageBlob = async (blob, { maxSize = 1600, quality = 0.82 } = {}) => {
  try {
    const bitmap = await loadImageBitmap(blob);
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (!width || !height) return null;

    let targetW = width;
    let targetH = height;
    if (Math.max(width, height) > maxSize) {
      const scale = maxSize / Math.max(width, height);
      targetW = Math.round(width * scale);
      targetH = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const blobOut = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blobOut;
  } catch (error) {
    console.warn('Unable to resize image, using original file.', error);
    return null;
  }
};

const debounce = (fn, delay = 150) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const getFocusableElements = (container) =>
  container.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );

const postWithRetry = async (url, options, retryCfg = {}) => {
  const { retries = 2, timeoutMs = 10_000, backoffMs = 800 } = retryCfg;
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'follow',
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
      attempt += 1;
    }
  }

  throw lastError || new Error('Request failed');
};

export function createFeedbackManager({ webhookUrl, mockProductList, secretShopperGoal, testWebhookUrl } = {}) {
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

  const prodWebhookUrl = webhookUrl;
  const testUrl = testWebhookUrl || webhookUrl;
  let currentWebhookUrl = prodWebhookUrl;

  let currentCategory = '';
  let selectedFile = null;
  let storeId = 'unknown_store';
  let satisfactionRating = 0;
  let userGeolocation = null;
  let userId = null;
  let userAchievements = null;
  let lastFocusedElement = null;
  let activeTrap = null;

  const applyTestMode = (enable) => {
    currentWebhookUrl = enable ? testUrl : prodWebhookUrl;
    if (enable) {
      localStorage.setItem(STORAGE_TEST_KEY, '1');
    } else {
      localStorage.removeItem(STORAGE_TEST_KEY);
    }
    const chip = document.getElementById('test-chip');
    if (chip) {
      chip.classList.toggle('hidden', !enable);
    }
  };

  const setTestMode = (enable) => {
    applyTestMode(enable);
  };

  const restoreTestMode = () => {
    const stored = localStorage.getItem(STORAGE_TEST_KEY);
    const enabled = stored === '1' || stored === 'true';
    applyTestMode(enabled);
  };

  const showLoading = (isLoading, element = 'submit') => {
    const submitBtn = document.getElementById('submit-btn');
    const submitText = document.getElementById('submit-btn-text');
    const submitLoader = document.getElementById('submit-loader');
    const aiBtn = document.getElementById('ai-assist-btn');
    const aiText = document.getElementById('ai-assist-btn-text');
    const aiLoader = document.getElementById('ai-assist-loader');

    if (element === 'submit' && submitBtn && submitText && submitLoader) {
      submitText.classList.toggle('hidden', isLoading);
      submitLoader.classList.toggle('hidden', !isLoading);
      submitBtn.disabled = isLoading;
    } else if (element === 'ai' && aiBtn && aiText && aiLoader) {
      aiText.classList.toggle('hidden', isLoading);
      aiLoader.classList.toggle('hidden', !isLoading);
      aiBtn.disabled = isLoading;
    }
  };

  const showToast = (message, type = 'success') => {
    if (!toastContainer) return;
    const toastId = `toast-${Date.now()}`;
    const icon = type === 'achievement' ? '🏆' : '✅';
    const toneClass = type === 'achievement' ? 'toast-achievement' : 'toast-success';

    const toastElement = document.createElement('div');
    toastElement.id = toastId;
    toastElement.className = `toast-message ${toneClass} toast-enter`;
    toastElement.innerHTML = `<p>${icon} ${message}</p>`;

    toastContainer.appendChild(toastElement);

    setTimeout(() => {
      toastElement.classList.add('toast-leave');
      toastElement.classList.remove('toast-enter');
      setTimeout(() => toastElement.remove(), 500);
    }, 5000);
  };

  const updateFeedbackCounter = (len) => {
    const counterEl = document.getElementById('feedback-counter');
    if (counterEl) {
      counterEl.textContent = `${len} / ${MAX_TEXT_LEN}`;
    }
    const hintEl = document.getElementById('feedback-hint');
    if (hintEl) {
      hintEl.textContent = len < MIN_TEXT_LEN ? `Мін. ${MIN_TEXT_LEN} символів` : 'Дякуємо за деталі!';
    }
  };

  const initializeUser = () => {
    userId = localStorage.getItem(STORAGE_USER_ID);
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(STORAGE_USER_ID, userId);
    }

    const achievementsData = localStorage.getItem(STORAGE_ACHIEVEMENTS);
    if (!achievementsData) {
      userAchievements = {
        [SECRET_SHOPPER_KEY]: { earned: false, stores: [] },
      };
      localStorage.setItem(STORAGE_ACHIEVEMENTS, JSON.stringify(userAchievements));
    } else {
      try {
        userAchievements = JSON.parse(achievementsData);
      } catch (error) {
        console.warn('Unable to parse achievements data, resetting.', error);
        userAchievements = {
          [SECRET_SHOPPER_KEY]: { earned: false, stores: [] },
        };
        localStorage.setItem(STORAGE_ACHIEVEMENTS, JSON.stringify(userAchievements));
      }
    }
  };

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
        },
      );
    }
  };

  const focusFirstElement = (container) => {
    lastFocusedElement = document.activeElement;
    const focusables = getFocusableElements(container);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else if (typeof container.focus === 'function') {
      container.focus();
    }
  };

  const handleKeydown = (event) => {
    if (!activeTrap) return;
    if (event.key === 'Escape') {
      closeModal(activeTrap);
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(getFocusableElements(activeTrap));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
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

  const openModal = (category) => {
    if (!modal || !modalTitle) return;

    currentCategory = category;
    modalTitle.textContent = category;

    const productInputSection = document.getElementById('product-input-section');
    const complaintReasonSection = document.getElementById('complaint-reason-section');
    const photoUploadSection = document.getElementById('photo-upload-section');

    if (productInputSection) productInputSection.classList.add('hidden');
    if (complaintReasonSection) complaintReasonSection.classList.add('hidden');
    if (photoUploadSection) photoUploadSection.classList.add('hidden');

    if (category === 'Скарга') {
      complaintReasonSection?.classList.remove('hidden');
      photoUploadSection?.classList.remove('hidden');
    }

    if (category === 'Немає продукції') {
      productInputSection?.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('modal-enter');
    modal.classList.remove('modal-leave');
    setupFocusTrap(modal);
    focusFirstElement(modal);
    getGeolocation();
  };

  const resetForm = () => {
    if (!feedbackForm) return;
    feedbackForm.reset();
    document.getElementById('product-input-section')?.classList.add('hidden');
    document.getElementById('complaint-reason-section')?.classList.add('hidden');
    document.getElementById('photo-upload-section')?.classList.add('hidden');
    document.getElementById('photo-preview-container')?.classList.add('hidden');
    document.getElementById('ai-results-section')?.classList.add('hidden');

    const suggestions = document.getElementById('product-suggestions');
    if (suggestions) {
      suggestions.innerHTML = '';
      suggestions.classList.add('hidden');
    }

    const preview = document.getElementById('photo-preview');
    if (preview) preview.src = '';

    const complaintReasonSelect = document.getElementById('complaint-reason-select');
    if (complaintReasonSelect) complaintReasonSelect.selectedIndex = 0;

    selectedFile = null;
    currentCategory = '';
    satisfactionRating = 0;
    userGeolocation = null;
    updateStarRating(0);
    updateFeedbackCounter(0);
  };

  const closeModal = (modalElement) => {
    if (!modalElement) return;
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

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isImage = file.type && file.type.startsWith('image/');
    const maxSizeBytes = 5 * 1024 * 1024;
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

    const ab = await fileToArrayBuffer(file.slice(0, 16));
    const bytes = new Uint8Array(ab);
    const isJPEG = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWEBP =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;
    const isHEIC = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    if (!(isJPEG || isPNG || isWEBP || isHEIC)) {
      alert('Неподдерживаемый формат. Разрешены JPEG/PNG/WEBP/HEIC.');
      event.target.value = '';
      return;
    }

    let finalBlob = file;
    const resized = await resizeImageBlob(file, { maxSize: 1600, quality: 0.82 });
    if (resized && resized.size > 0 && resized.size < file.size) {
      finalBlob = new File([resized], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
    }

    selectedFile = finalBlob;
    const previewEl = document.getElementById('photo-preview');
    const previewContainer = document.getElementById('photo-preview-container');
    if (previewEl && previewContainer) {
      const dataUrl = await fileToDataURL(finalBlob);
      previewEl.src = dataUrl;
      previewContainer.classList.remove('hidden');
    }
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

  const updateStarRating = (rating) => {
    document.querySelectorAll('#satisfaction-rating .star').forEach((star) => {
      star.classList.toggle('selected', Number(star.dataset.value) <= rating);
    });
  };

  const trackStoreVisit = (id) => {
    if (id === 'unknown_store' || !userAchievements?.[SECRET_SHOPPER_KEY]) return;
    const achievement = userAchievements[SECRET_SHOPPER_KEY];
    if (!achievement.stores.includes(id)) {
      achievement.stores.push(id);
      userAchievements[SECRET_SHOPPER_KEY].stores = achievement.stores;
      localStorage.setItem(STORAGE_ACHIEVEMENTS, JSON.stringify(userAchievements));
      checkSecretShopperAchievement();
    }
  };

  const checkSecretShopperAchievement = () => {
    const achievement = userAchievements?.[SECRET_SHOPPER_KEY];
    if (!achievement) return;
    if (!achievement.earned && achievement.stores.length >= secretShopperGoal) {
      achievement.earned = true;
      localStorage.setItem(STORAGE_ACHIEVEMENTS, JSON.stringify(userAchievements));
      showToast("Ви отримали досягнення 'Таємний покупець'!", 'achievement');
    }
  };

  const renderAchievements = () => {
    const achievement = userAchievements?.[SECRET_SHOPPER_KEY];
    if (!achievementsList || !achievement) return;
    const progress = Math.min(achievement.stores.length, secretShopperGoal);
    const isCompleted = achievement.earned || progress >= secretShopperGoal;

    const achievementHTML = `
      <div class="border rounded-lg p-4 ${
        isCompleted
          ? 'bg-green-50 border-green-200 dark:bg-emerald-900/40 dark:border-emerald-500/40'
          : 'bg-gray-50 border-gray-200 dark:bg-slate-900/60 dark:border-slate-700/60'
      }">
        <div class="flex items-center">
          <div class="text-4xl mr-4">${isCompleted ? '🏆' : '🕵️'}</div>
          <div>
            <h3 class="font-bold text-lg ${
              isCompleted ? 'text-green-700 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-100'
            }">Таємний покупець</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">Залиште відгуки з ${secretShopperGoal} різних магазинів.</p>
          </div>
        </div>
        <div class="mt-3">
          <div class="flex justify-between text-sm font-medium ${
            isCompleted ? 'text-green-700 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-200'
          } mb-1">
            <span>Прогрес</span>
            <span>${progress} / ${secretShopperGoal}</span>
          </div>
          <div class="achievement-progress-bar">
            <div class="achievement-progress" style="width: ${(progress / secretShopperGoal) * 100}%"></div>
          </div>
        </div>
      </div>
    `;
    achievementsList.innerHTML = achievementHTML;
  };

  const openAchievementsModal = () => {
    renderAchievements();
    achievementsModal?.classList.remove('hidden');
    achievementsModal?.classList.remove('modal-leave');
    achievementsModal?.classList.add('modal-enter');
  };

  const handleProductAutocomplete = (event) => {
    const value = event.target.value.toLowerCase();
    const suggestionsEl = document.getElementById('product-suggestions');
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = '';
    if (value.length < 2) {
      suggestionsEl.classList.add('hidden');
      return;
    }

    const filteredProducts = (mockProductList || []).filter((product) => product.toLowerCase().includes(value));
    if (filteredProducts.length === 0) {
      suggestionsEl.classList.add('hidden');
      return;
    }

    suggestionsEl.classList.remove('hidden');
    filteredProducts.forEach((product) => {
      const div = document.createElement('div');
      div.textContent = product;
      div.className = 'p-2 cursor-pointer transition-colors duration-200 text-gray-700 dark:text-gray-200';
      div.onclick = () => {
        const input = document.getElementById('product-input');
        if (input) input.value = product;
        suggestionsEl.innerHTML = '';
        suggestionsEl.classList.add('hidden');
      };
      suggestionsEl.appendChild(div);
    });
  };

  const handleProductAutocompleteDebounced = debounce(handleProductAutocomplete, 180);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const honeypot = document.getElementById('website');
    if (honeypot && honeypot.value && honeypot.value.trim().length > 0) {
      alert('Помилка відправки.');
      return;
    }

    const textEl = document.getElementById('feedback-text');
    const raw = (textEl?.value || '').trim();
    const sanitized = raw
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/<\s*script/gi, '&lt;script')
      .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/on[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/on[a-z]+\s*=\s*[^\s>]+/gi, '');

    if (sanitized.length < MIN_TEXT_LEN) {
      alert(`Будь ласка, додайте більше деталей (мінімум ${MIN_TEXT_LEN} символів).`);
      return;
    }
    if (sanitized.length > MAX_TEXT_LEN) {
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
    const clientToken = btoa(`${userId}.${applicationId}.${storeId}.${Date.now()}`);

    formData.append('userId', userId);
    formData.append('applicationId', applicationId);
    formData.append('storeId', storeId);
    formData.append('clientToken', clientToken);
    formData.append('category', currentCategory);
    formData.append('rating', satisfactionRating);

    const productValue = currentCategory === 'Немає продукції' ? document.getElementById('product-input')?.value : '';
    const complaintReason = currentCategory === 'Скарга' ? document.getElementById('complaint-reason-select')?.value : '';

    formData.append('product', productValue || '');
    formData.append('complaintReason', complaintReason || '');
    formData.append('text', sanitized);
    formData.append('phone', document.getElementById('phone-input')?.value || null);
    if (userGeolocation) {
      formData.append('geolocation', JSON.stringify(userGeolocation));
    }
    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    try {
      await postWithRetry(
        currentWebhookUrl,
        {
          method: 'POST',
          body: formData,
        },
        { retries: 2, timeoutMs: 12_000, backoffMs: 600 },
      );

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

  const bindEventListeners = (aiAssistHandler) => {
    categoryButtons.forEach((button) => {
      button.addEventListener('click', () => openModal(button.dataset.category));
    });

    closeModalBtn?.addEventListener('click', () => closeModal(modal));
    modal?.addEventListener('click', (event) => {
      if (event.target.id === 'feedback-modal') closeModal(modal);
    });

    achievementsBtn?.addEventListener('click', openAchievementsModal);
    closeAchievementsModalBtn?.addEventListener('click', () => closeModal(achievementsModal));
    achievementsModal?.addEventListener('click', (event) => {
      if (event.target.id === 'achievements-modal') closeModal(achievementsModal);
    });

    faqItems.forEach((item) => {
      const question = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');
      if (!question || !answer) return;
      question.addEventListener('click', () => {
        answer.classList.toggle('hidden');
        question.classList.toggle('open');
      });
    });

    feedbackForm?.addEventListener('submit', handleSubmit);

    if (typeof aiAssistHandler === 'function') {
      document.getElementById('ai-assist-btn')?.addEventListener('click', aiAssistHandler);
    }

    document.getElementById('photo-upload-btn')?.addEventListener('click', () => {
      document.getElementById('photo-upload-input')?.click();
    });
    document.getElementById('photo-upload-input')?.addEventListener('change', handleFileSelect);
    document.getElementById('product-input')?.addEventListener('input', handleProductAutocompleteDebounced);

    document.getElementById('feedback-text')?.addEventListener('input', (event) => {
      const value = (event.target.value || '').slice(0, MAX_TEXT_LEN);
      if (value !== event.target.value) {
        event.target.value = value;
      }
      updateFeedbackCounter(value.length);
    });

    const stars = document.querySelectorAll('#satisfaction-rating .star');
    stars.forEach((star) => {
      star.addEventListener('click', () => {
        satisfactionRating = parseInt(star.dataset.value, 10);
        const container = document.getElementById('satisfaction-rating');
        if (container) container.dataset.rating = satisfactionRating;
        updateStarRating(satisfactionRating);
      });
      star.addEventListener('mouseover', () => {
        const rating = parseInt(star.dataset.value, 10);
        updateStarRating(rating);
      });
    });

    document.getElementById('satisfaction-rating')?.addEventListener('mouseleave', () => {
      updateStarRating(satisfactionRating);
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
  };

  const init = ({ aiAssistHandler } = {}) => {
    const urlParams = new URLSearchParams(window.location.search);
    storeId = urlParams.get('store_id') || 'unknown_store';
    initializeUser();
    restoreTestMode();
    updateFeedbackCounter(0);
    bindEventListeners(aiAssistHandler);
  };

  return {
    init,
    showLoading,
    showToast,
    updateFeedbackCounter,
  };
}
