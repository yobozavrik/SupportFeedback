import { createThemeManager } from './theme.js';
import { createFeedbackManager } from './feedback.js';
import { createAiAssistant } from './ai.js';

const WEBHOOK_URL = 'https://n8n.dmytrotovstytskyi.online/webhook/supporttest';
const GEMINI_API_KEY = '';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
const MOCK_PRODUCT_LIST = [
  'Пельмені зі свининою',
  'Пельмені з яловичиною',
  'Пельмені з куркою',
  'Пельмені дитячі',
  "Вареники з картоплею",
  'Вареники з капустою',
  "Вареники з вишнею",
  'Вареники з сиром солодкі',
  "Хінкалі",
  'Равіолі',
  "Млинці з м'ясом",
  'Млинці з сиром',
  'Сирники',
  'Котлети домашні',
  'Голубці',
  'Перець фарширований',
  'Чебуреки',
  'Борщ',
  'Суп-харчо',
];
const SECRET_SHOPPER_GOAL = 3;

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  const prefersDarkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const themeManager = createThemeManager({
    toggleButton: document.getElementById('theme-toggle'),
    sunIcon: document.getElementById('theme-toggle-sun'),
    moonIcon: document.getElementById('theme-toggle-moon'),
    label: document.getElementById('theme-toggle-label'),
    prefersDarkMedia,
  });
  themeManager.initialize();

  const feedbackManager = createFeedbackManager({
    webhookUrl: WEBHOOK_URL,
    mockProductList: MOCK_PRODUCT_LIST,
    secretShopperGoal: SECRET_SHOPPER_GOAL,
  });

  const { handleAiAssist } = createAiAssistant({
    geminiApiUrl: GEMINI_API_URL,
    showLoading: feedbackManager.showLoading,
  });

  feedbackManager.init({ aiAssistHandler: handleAiAssist });
});
