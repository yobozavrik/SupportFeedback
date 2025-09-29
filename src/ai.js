function assertElements(elements) {
  return elements.every(Boolean);
}

export function createAiAssistant({ geminiApiUrl, showLoading }) {
  const textInput = document.getElementById('feedback-text');
  const resultsSection = document.getElementById('ai-results-section');
  const sentimentEl = document.getElementById('ai-sentiment');
  const summaryEl = document.getElementById('ai-summary');
  const suggestionsEl = document.getElementById('ai-suggestions');

  const getAiAnalysis = async (text) => {
    const systemPrompt = "Ти — доброзичливий AI-асистент компанії 'Галя Балувана'. Твоя мета — допомогти клієнтам написати чіткий та конструктивний відгук. Проаналізуй текст користувача та надай настрій відгуку, коротке резюме та три конкретні поради щодо покращення українською мовою. Відповідай ТІЛЬКИ у форматі JSON згідно зі схемою.";

    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            sentiment: { type: 'STRING' },
            summary: { type: 'STRING' },
            suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['sentiment', 'summary', 'suggestions'],
        },
      },
    };

    const response = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini API Error Response:', errorBody);
      throw new Error('Не вдалося отримати відповідь від AI.');
    }

    const result = await response.json();
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      throw new Error('Відповідь AI має невірний формат.');
    }

    return JSON.parse(jsonText);
  };

  const handleAiAssist = async () => {
    if (!textInput || !resultsSection || !assertElements([sentimentEl, summaryEl, suggestionsEl])) {
      console.warn('AI assistant UI elements are missing.');
      return;
    }

    const text = textInput.value;
    if (text.trim().length < 10) {
      alert('Будь ласка, напишіть хоча б декілька слів для аналізу.');
      return;
    }

    if (typeof showLoading === 'function') {
      showLoading(true, 'ai');
    }
    resultsSection.classList.add('hidden');

    try {
      const analysis = await getAiAnalysis(text);
      sentimentEl.textContent = `Настрій відгуку: ${analysis.sentiment || 'Не визначено'}`;
      summaryEl.textContent = `Ключова думка: ${analysis.summary || '–'}`;
      suggestionsEl.innerHTML = '';
      (analysis.suggestions || []).forEach((suggestion) => {
        const li = document.createElement('li');
        li.textContent = suggestion;
        suggestionsEl.appendChild(li);
      });
      resultsSection.classList.remove('hidden');
    } catch (error) {
      console.error('AI Assist Error:', error);
      alert(`Помилка аналізу: ${error.message}`);
    } finally {
      if (typeof showLoading === 'function') {
        showLoading(false, 'ai');
      }
    }
  };

  return { handleAiAssist };
}
