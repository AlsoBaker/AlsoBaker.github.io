import '@fontsource-variable/sofia-sans';
import '@fontsource-variable/sofia-sans-extra-condensed';
import '@fontsource/mrs-saint-delafield';
import './styles.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createStage } from './scene/stage.js';
import { initFire } from './demos/fire.js';
import { initXray } from './demos/xray.js';
import { initRedis } from './demos/redis.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const narrow = matchMedia('(max-width: 900px)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const root = document.documentElement;

/* ---------- text splitting ---------- */
function splitChars(el, cls) {
  const text = el.textContent;
  el.textContent = '';
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(s);
  }
}
$$('.bd-line').forEach((line) => {
  const inner = document.createElement('span');
  inner.className = 'bd-in';
  inner.textContent = line.textContent;
  line.textContent = '';
  line.appendChild(inner);
  if (line.closest('.bd-hero')) splitChars(inner, 'bd-char');
});
$$('[data-rise]').forEach((el) => {
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', words.join(' '));
  el.textContent = '';
  words.forEach((w, i) => {
    const word = document.createElement('span');
    word.className = 'rise-word';
    word.setAttribute('aria-hidden', 'true');
    word.textContent = w;
    splitChars(word, 'rise-char');
    el.appendChild(word);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
});
$$('[data-words]').forEach((el) => {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  words.forEach((w, i) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = w;
    el.appendChild(s);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
});
$$('.marquee-row').forEach((row) => {
  row.textContent = row.textContent.repeat(4);
});

/* ---------- size the giant backdrop words to the viewport ---------- */
const heroIntro = $('.hero-intro');
function fitBackdrop() {
  const vw = root.clientWidth;
  const vh = window.innerHeight;
  $$('.bd').forEach((bd) => {
    const lines = $$('.bd-in', bd);
    bd.style.fontSize = '100px';
    const widest = Math.max(...lines.map((l) => l.getBoundingClientRect().width));
    const pad = parseFloat(getComputedStyle(bd).paddingLeft) * 2;
    let size = (100 * Math.min(vw * Number(bd.dataset.fit), vw - pad)) / widest;
    let maxBlock = (lines.length > 1 ? 0.5 : 0.3) * vh;
    if (bd.classList.contains('bd-hero')) {
      // the name must start below the intro paragraph, never under it
      const gapBelow = parseFloat(getComputedStyle(bd).bottom);
      const room = vh - gapBelow - (heroIntro.offsetTop + heroIntro.offsetHeight) - 28;
      maxBlock = Math.max(0.2 * vh, Math.min(maxBlock, room));
    }
    size = Math.min(size, maxBlock / (lines.length * 0.85));
    bd.style.fontSize = `${size.toFixed(1)}px`;
  });
}
fitBackdrop();

/* ---------- the tree ---------- */
let stage = null;
try {
  stage = createStage($('#stage'), { mobile: narrow.matches });
} catch (err) {
  console.warn('WebGL is unavailable, so the tree is not shown.', err);
  root.classList.add('no-webgl');
}

/* ---------- smooth scrolling ---------- */
const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95 });
lenis.on('scroll', ScrollTrigger.update);
lenis.stop();
if (import.meta.env.DEV) { window.__lenis = lenis; window.__stage = stage; }
// On slow graphics the frosted panes fall back to plain translucent ones.
if (stage) stage.onLite = () => root.classList.add('lite');
window.scrollTo(0, 0);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

$$('[data-scroll]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { duration: 1.6 });
  });
});

/* ---------- scroll choreography ----------
   Triggers are created top to bottom, in page order. The projects section is
   pinned, and anything created before it would ignore the space it adds. */
const riseIn = (el) => gsap.from($$('.rise-char', el), {
  yPercent: 112, duration: 0.95, ease: 'power4.out', stagger: 0.018,
  scrollTrigger: { trigger: el, start: 'top 90%', once: true },
});

gsap.to('.bd-hero', {
  yPercent: -40, opacity: 0, ease: 'none',
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 20%', scrub: true },
});
gsap.to('.statement .w', {
  opacity: 1, ease: 'none', stagger: 0.1,
  scrollTrigger: { trigger: '.statement', start: 'top 78%', end: 'bottom 48%', scrub: true },
});
riseIn($('.work [data-rise]'));
gsap.timeline({ scrollTrigger: { trigger: '.dusk', start: 'top 75%', end: 'bottom 15%', scrub: true } })
  .fromTo('.bd-dusk', { opacity: 0, yPercent: 18 }, { opacity: 1, yPercent: 0, ease: 'none', duration: 0.4 })
  .to('.bd-dusk', { opacity: 1, duration: 0.3 })
  .to('.bd-dusk', { opacity: 0, yPercent: -14, ease: 'none', duration: 0.3 });

const progressBar = $('.projects-progress i');
const mm = gsap.matchMedia();
mm.add('(min-width: 901px)', () => {
  const track = $('.track');
  const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
  gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      id: 'projects', trigger: '.projects-pin', pin: true, scrub: true,
      start: 'top top', end: () => `+=${dist()}`, invalidateOnRefresh: true,
      onUpdate: (self) => { progressBar.style.transform = `scaleX(${self.progress.toFixed(4)})`; },
    },
  });
  ScrollTrigger.sort();
});

riseIn($('.wins [data-rise]'));
$$('.marquee-row').forEach((row) => {
  const dir = Number(row.dataset.dir);
  gsap.fromTo(row, { xPercent: dir < 0 ? 0 : -22 }, {
    xPercent: dir < 0 ? -22 : 0, ease: 'none',
    scrollTrigger: { trigger: '.skills', start: 'top bottom', end: 'bottom top', scrub: true },
  });
});
gsap.fromTo('.bd-contact', { opacity: 0, yPercent: 20 }, {
  opacity: 1, yPercent: 0, ease: 'none',
  scrollTrigger: { trigger: '.contact', start: 'top 45%', end: 'bottom bottom', scrub: true },
});
ScrollTrigger.sort();

/* ---------- map scroll position to the tree's story ---------- */
let stops = [];
function computeStops() {
  const vh = window.innerHeight;
  const max = ScrollTrigger.maxScroll(window);
  const list = $$('[data-stop]').map((el) => ({
    t: Number(el.dataset.stop),
    y: Math.max(0, el.getBoundingClientRect().top + window.scrollY - vh * 0.1),
  }));
  const pin = ScrollTrigger.getById('projects');
  if (pin) {
    list.push({ t: 5, y: pin.start }, { t: 6, y: pin.end });
  } else {
    const el = $('.projects');
    const top = el.getBoundingClientRect().top + window.scrollY;
    list.push({ t: 5, y: top }, { t: 6, y: top + el.offsetHeight - vh });
  }
  list.sort((a, b) => a.t - b.t);
  list[0].y = 0;
  for (let i = 1; i < list.length; i++) list[i].y = Math.max(list[i].y, list[i - 1].y + 1);
  const last = list[list.length - 1];
  if (last.y > max && max > 0) {
    const k = max / last.y;
    list.forEach((s) => { s.y *= k; });
  }
  stops = list;
}
function storyAt(y) {
  if (!stops.length) return 0;
  if (y <= stops[0].y) return stops[0].t;
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i].y) {
      const a = stops[i - 1];
      const b = stops[i];
      return a.t + ((b.t - a.t) * (y - a.y)) / (b.y - a.y);
    }
  }
  return stops[stops.length - 1].t;
}
ScrollTrigger.addEventListener('refresh', computeStops);

/* ---------- frame loop ---------- */
const themeMeta = $('meta[name="theme-color"]');
let theme = 'day';
let skyTop = '';
let skyHor = '';

gsap.ticker.lagSmoothing(0);
gsap.ticker.add((time, delta) => {
  lenis.raf(time * 1000);
  const y = window.scrollY;
  const vel = lenis.velocity;
  const target = storyAt(y);

  if (stage) {
    stage.state.story += (target - stage.state.story) * (1 - Math.exp(-Math.min(delta, 1000) * 0.009));
    stage.render(delta / 1000, vel);
    if (stage.sky.top !== skyTop) { skyTop = stage.sky.top; root.style.setProperty('--sky-top', skyTop); }
    if (stage.sky.hor !== skyHor) { skyHor = stage.sky.hor; root.style.setProperty('--sky-hor', skyHor); }
    root.style.setProperty('--moon', Math.max(0, (stage.state.night - 0.45) / 0.55).toFixed(3));
    const next = stage.state.night > 0.5 ? 'night' : 'day';
    if (next !== theme) {
      theme = next;
      root.dataset.theme = theme;
      themeMeta.setAttribute('content', theme === 'night' ? '#070B24' : '#F2F5FB');
    }
  }
});

window.addEventListener('resize', () => {
  fitBackdrop();
  if (stage) stage.resize();
});

/* ---------- pointer: camera drift, cursor, magnetic buttons ---------- */
if (finePointer) {
  const cursor = $('.cursor');
  const cx = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
  window.addEventListener('pointermove', (e) => {
    cursor.classList.add('is-on');
    cx(e.clientX);
    cy(e.clientY);
    if (stage) stage.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  });
  document.addEventListener('pointerover', (e) => {
    cursor.classList.toggle('is-link', Boolean(e.target.closest('a, button')));
  });
  $$('.magnet').forEach((el) => {
    const mx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const my = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - (r.left + r.width / 2)) * 0.3);
      my((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    el.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
}

/* ---------- project demos run only while on screen ---------- */
const demos = new Map([
  [$('.demo-fire'), initFire($('.demo-fire'))],
  [$('.demo-xray'), initXray($('.demo-xray'))],
  [$('.demo-redis'), initRedis($('.demo-redis'))],
]);
const video = $('.demo-video');
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const demo = demos.get(entry.target);
    if (demo) {
      if (entry.isIntersecting) demo.start();
      else demo.stop();
    } else if (entry.target === video && !video.controls) {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }
  });
}, { threshold: 0.35 });
demos.forEach((_, el) => io.observe(el));
io.observe(video);

const videoToggle = $('.video-toggle');
videoToggle.addEventListener('click', () => {
  video.controls = true;
  video.muted = false;
  video.loop = false;
  video.currentTime = 0;
  video.play().catch(() => {});
  videoToggle.remove();
});

/* ---------- copy email ---------- */
const copyBtn = $('.copy');
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(copyBtn.dataset.copy);
    copyBtn.textContent = 'Copied to clipboard';
  } catch {
    copyBtn.textContent = copyBtn.dataset.copy;
  }
  setTimeout(() => { copyBtn.textContent = 'Copy email address'; }, 2200);
});

/* ---------- load, then grow the tree ---------- */
const loader = $('.loader');
const loaderNum = $('.loader-num');
const heroBits = ['.nav', '.hero-intro'];

function intro() {
  lenis.start();
  fitBackdrop();
  ScrollTrigger.refresh();
  if (stage) gsap.to(stage.state, { grow: 1, duration: 3.6, ease: 'power2.out' });
  gsap.from('.bd-hero .bd-char', { yPercent: 115, duration: 1.3, ease: 'power4.out', stagger: 0.028, delay: 0.15 });
  gsap.from(heroBits, { opacity: 0, y: 18, duration: 1, ease: 'power3.out', stagger: 0.08, delay: 0.9, clearProps: 'transform' });
}

// Ask for the fonts by name: fonts.ready alone can resolve before they are requested.
const ready = Promise.all([
  document.fonts.load('900 100px "Sofia Sans Extra Condensed Variable"'),
  document.fonts.load('600 16px "Sofia Sans Variable"'),
  $('.portrait img').decode().catch(() => {}),
]).catch(() => {}).then(() => document.fonts.ready).then(() => {
  fitBackdrop();
  ScrollTrigger.refresh();
});
document.fonts.addEventListener('loadingdone', fitBackdrop);

const count = { v: 0 };
const counting = gsap.to(count, {
  v: 100, duration: 1.7, ease: 'power2.inOut',
  onUpdate: () => { loaderNum.textContent = Math.round(count.v); },
});
Promise.all([ready, counting.then()]).then(() => {
  gsap.to(loader, {
    yPercent: -100, duration: 0.95, ease: 'power4.inOut',
    onStart: intro,
    onComplete: () => loader.remove(),
  });
});
