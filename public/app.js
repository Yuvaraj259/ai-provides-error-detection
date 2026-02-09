// DOM Elements
const analyzeBtn = document.getElementById('analyzeBtn');
const resetBtn = document.getElementById('resetBtn');
const codeEl = document.getElementById('code');
const statusEl = document.getElementById('status');
const currentLangEl = document.getElementById('currentLang');
const resultsContentEl = document.getElementById('resultsContent');
const errorDetailsEl = document.getElementById('errorDetails');
const correctedCodeEl = document.getElementById('correctedCode');
const copyBtn = document.getElementById('copyBtn');
const fixedContentEl = document.getElementById('fixedContent');
const speakBtn = document.getElementById('speakBtn');

// Error detail elements
const errorTypeEl = document.getElementById('errorType');
const errorReasonEl = document.getElementById('errorReason');
const errorLineEl = document.getElementById('errorLine');

// Language buttons
const langButtons = document.querySelectorAll('.lang-btn');

let currentLanguage = 'python';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateLineNumbers();
  setupEventListeners();
});

function setupEventListeners() {
  // Language selection
  langButtons.forEach(btn => {
    btn.addEventListener('click', () => selectLanguage(btn.dataset.lang));
  });

  // Action buttons
  analyzeBtn.addEventListener('click', analyze);
  resetBtn.addEventListener('click', reset);

  // Copy button
  copyBtn.addEventListener('click', copyCorrectedCode);

  // Speak button
  speakBtn.addEventListener('click', toggleSpeech);

  // Code editor events
  codeEl.addEventListener('input', updateLineNumbers);
  codeEl.addEventListener('scroll', syncLineNumbers);
}

function selectLanguage(lang) {
  currentLanguage = lang;

  // Update active button
  langButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Update current language display
  const displayNames = {
    python: 'Python',
    javascript: 'JavaScript',
    java: 'Java',
    c: 'C'
  };
  currentLangEl.textContent = displayNames[lang];
}

function updateLineNumbers() {
  const lineCount = codeEl.value.split('\n').length;
  const lineNumbersEl = document.querySelector('.line-numbers');
  lineNumbersEl.innerHTML = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
}

function syncLineNumbers() {
  const lineNumbersEl = document.querySelector('.line-numbers');
  lineNumbersEl.scrollTop = codeEl.scrollTop;
}

function setStatus(text, duration = 3000) {
  statusEl.textContent = text;
  statusEl.classList.add('show');

  if (text) {
    setTimeout(() => {
      statusEl.classList.remove('show');
    }, duration);
  }
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function hideResults() {
  resultsContentEl.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-icon">
        <i class="fas fa-code"></i>
      </div>
      <h3>Ready to Help!</h3>
      <p>Write or paste your code, then click 'Analyze Code' to find errors and get helpful explanations.</p>
    </div>
  `;
  errorDetailsEl.classList.add('hidden');
  correctedCodeEl.classList.add('hidden');
}

function showErrorDetails(error) {
  const { type, reason, line } = error;

  errorTypeEl.textContent = type || 'UnknownError';
  errorReasonEl.textContent = reason || 'Unknown';
  errorLineEl.textContent = line === null || line === undefined ? 'Unknown' : `Line ${line}`;

  errorDetailsEl.classList.remove('hidden');
}

function showCorrectedCode(code) {
  if (code && code.trim()) {
    fixedContentEl.textContent = code;
    correctedCodeEl.classList.remove('hidden');
  } else {
    correctedCodeEl.classList.add('hidden');
  }
}

function showNoError() {
  resultsContentEl.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-icon" style="background: linear-gradient(135deg, #10b981, #22c55e);">
        <i class="fas fa-check"></i>
      </div>
      <h3>No Errors Found!</h3>
      <p>Your code looks great! No errors were detected.</p>
    </div>
  `;
  errorDetailsEl.classList.add('hidden');
  correctedCodeEl.classList.add('hidden');
}

function reset() {
  codeEl.value = '';
  hideResults();
  updateLineNumbers();
  setStatus('');
  stopSpeaking();
}

// Voice Explanation
let isSpeaking = false;

function toggleSpeech() {
  if (isSpeaking) {
    stopSpeaking();
  } else {
    speakError();
  }
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  speakBtn.classList.remove('speaking');
  speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> Listen to Explanation';
}

function speakError() {
  const type = errorTypeEl.textContent;
  const reason = errorReasonEl.textContent;
  const line = errorLineEl.textContent;

  if (!type || !reason) return;

  const text = `Error detected. ${type}. ${reason}. ${line !== 'Unknown' ? 'on ' + line : ''}`;

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.onstart = () => {
    isSpeaking = true;
    speakBtn.classList.add('speaking');
    speakBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Speaking';
  };

  utterance.onend = () => {
    stopSpeaking();
  };

  // Select a good voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang.includes('en') && v.name.includes('Google')) || voices[0];
  if (preferredVoice) utterance.voice = preferredVoice;

  window.speechSynthesis.speak(utterance);
}

async function analyze() {
  const code = codeEl.value.trim();

  if (!code) {
    setStatus('Please write or paste some code first.');
    return;
  }

  analyzeBtn.disabled = true;
  setStatus('Analyzing your code...');

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: currentLanguage, code }),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg = data?.error || 'Request failed';
      const details = data?.details || '';
      const isRateLimit = data?.isRateLimit || false;

      if (isRateLimit) {
        resultsContentEl.innerHTML = `
          <div class="placeholder">
            <div class="placeholder-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
              <i class="fas fa-clock"></i>
            </div>
            <h3>Rate Limit Exceeded</h3>
            <p>${escapeHtml(msg)}</p>
            <p><strong>Details:</strong> ${escapeHtml(details)}</p>
          </div>
        `;
      } else {
        resultsContentEl.innerHTML = `
          <div class="placeholder">
            <div class="placeholder-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Analysis Failed</h3>
            <p>${escapeHtml(msg)}</p>
          </div>
        `;
      }

      errorDetailsEl.classList.add('hidden');
      correctedCodeEl.classList.add('hidden');
      return;
    }

    if (!data || typeof data.hasError !== 'boolean') {
      resultsContentEl.innerHTML = `
        <div class="placeholder">
          <div class="placeholder-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
            <i class="fas fa-question-circle"></i>
          </div>
          <h3>Unexpected Response</h3>
          <p>Received an unexpected response from the server.</p>
        </div>
      `;
      errorDetailsEl.classList.add('hidden');
      correctedCodeEl.classList.add('hidden');
      return;
    }

    if (!data.hasError) {
      showNoError();
      setStatus('Analysis complete - no errors found!');
      return;
    }

    // Show error details
    resultsContentEl.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
          <i class="fas fa-bug"></i>
        </div>
        <h3>Errors Detected!</h3>
        <p>We found issues in your code. See the details below.</p>
      </div>
    `;

    showErrorDetails(data.error || { type: 'UnknownError', reason: 'Unknown', line: null });
    showCorrectedCode(data.correctedCode);

    setStatus('Analysis complete - errors found and fixes provided!');

  } catch (e) {
    resultsContentEl.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
          <i class="fas fa-wifi"></i>
        </div>
        <h3>Connection Error</h3>
        <p>${escapeHtml(e instanceof Error ? e.message : String(e))}</p>
      </div>
    `;
    errorDetailsEl.classList.add('hidden');
    correctedCodeEl.classList.add('hidden');
    stopSpeaking();
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function copyCorrectedCode() {
  const text = fixedContentEl.textContent || '';
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    setStatus('Code copied to clipboard!');
  } catch {
    setStatus('Failed to copy code');
  }
}
