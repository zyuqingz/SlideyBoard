import { W, H, C, COLORS, FONT } from './theme.js';
import { getLang, loadLang, setLang } from './i18n.js';
import { introCopy } from './intro-copy.js';

const intro = document.getElementById('intro');
const deck = intro.querySelector('.intro-deck');
const slides = [...intro.querySelectorAll('.intro-slide')];
const dots = [...intro.querySelectorAll('.intro-dots button')];
const previous = intro.querySelector('.intro-prev');
const next = intro.querySelector('.intro-next');
const start = intro.querySelector('.start-game');
const language = intro.querySelector('.intro-language');
const startLabel = start.querySelector('[data-copy]');
const listeners = new AbortController();
const options = { signal: listeners.signal };
let current = 0;
let startup = 'start';

// Use the same theme tokens as the canvas, including the surrounding background.
for (const [key, value] of Object.entries(C)) intro.style.setProperty(`--game-${key}`, value);
COLORS.forEach((color, i) => intro.style.setProperty(`--game-color-${i}`, color));
intro.style.setProperty('--game-font', FONT);

function translate() {
  const lang = getLang();
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  intro.querySelectorAll('[data-copy]').forEach(el => {
    el.textContent = introCopy(el.dataset.copy, lang);
  });
  for (const attr of ['aria-label', 'alt']) {
    for (const el of [intro, ...intro.querySelectorAll(`[data-copy-${attr}]`)]) {
      const key = el.getAttribute(`data-copy-${attr}`);
      if (key) el.setAttribute(attr, introCopy(key, lang));
    }
  }
  startLabel.textContent = introCopy(startup, lang);
  language.textContent = lang === 'en' ? '中文' : 'EN';
  language.lang = lang === 'en' ? 'zh-CN' : 'en';
  language.setAttribute('aria-label', lang === 'en' ? 'Switch to Chinese' : '切换为英文');
}

language.addEventListener('click', () => {
  setLang(getLang() === 'en' ? 'zh' : 'en');
  translate();
}, options);

function resize() {
  const style = getComputedStyle(intro);
  const width = intro.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = intro.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  deck.style.setProperty('--intro-width', `${W}px`);
  deck.style.setProperty('--intro-height', `${H}px`);
  deck.style.setProperty('--intro-scale', Math.min(width / W, height / H));
}

function show(index) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => { slide.hidden = i !== current; });
  dots.forEach((dot, i) => {
    if (i === current) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  });
  previous.disabled = current === 0;
  next.disabled = current === slides.length - 1;
  intro.querySelector('.intro-count').textContent = `0${current + 1} / 0${slides.length}`;
  slides[current].querySelector('h1').focus({ preventScroll: true });
}

previous.addEventListener('click', () => show(current - 1), options);
next.addEventListener('click', () => show(current + 1), options);
dots.forEach((dot, i) => dot.addEventListener('click', () => show(i), options));
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const destinations = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1 };
  if (!(event.key in destinations)) return;
  event.preventDefault();
  show(destinations[event.key]);
}, options);

start.addEventListener('click', async () => {
  start.disabled = true;
  startup = 'starting';
  translate();
  try {
    // Load the game only on demand so input and opening animations start here.
    await import('./main.js');
    document.getElementById('game').hidden = false;
    listeners.abort();
    intro.remove();
    document.getElementById('game').focus({ preventScroll: true });
  } catch (error) {
    console.error('Game startup failed', error);
    startup = 'startFailed';
    translate();
    intro.querySelector('.intro-start-error').hidden = false;
  }
}, options);

window.addEventListener('resize', resize, options);
loadLang();
translate();
resize();
