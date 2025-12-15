// --- Page flip sound ---
const flipSounds = [
  new Audio('assets/sounds/page-flip.wav'),
  new Audio('assets/sounds/page-flip.wav'),
  new Audio('assets/sounds/page-flip.wav'),
];
flipSounds.forEach(a => { a.preload = 'auto'; a.volume = 0.35; });

let soundUnlocked = false;
function unlockSoundOnce() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  const a = flipSounds[0];
  a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
}
['pointerdown', 'touchstart', 'click'].forEach(evt => {
  window.addEventListener(evt, unlockSoundOnce, { once: true, passive: true });
});

let sIdx = 0;
function playFlipSound() {
  if (!soundUnlocked) return;
  const a = flipSounds[sIdx++ % flipSounds.length];
  try {
    a.pause();
    a.currentTime = 0;
    a.playbackRate = 0.95 + Math.random() * 0.1;
    a.play().catch(() => {});
  } catch {}
}

// --- Helpers ---
function loadImage(src, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(img);
    };

    const t = setTimeout(finish, timeoutMs);

    img.onload = () => { clearTimeout(t); finish(); };
    img.onerror = () => { clearTimeout(t); finish(); };

    // attach handlers before src
    img.src = src;

    // cached case
    if (img.complete) {
      clearTimeout(t);
      finish();
    }
  });
}

// --- Main app ---
/* global St */
(async function () {
  const $ = (id) => document.getElementById(id);

  const status = $('status');
  const bookEl = $('book');
  const titleEl = $('bookTitle');
  const prevBtn = $('prevBtn');
  const nextBtn = $('nextBtn');
  const fsBtn = $('fsBtn');
  const pdfLink = $('pdfLink');
  const pageNow = $('pageNow');
  const pageTotal = $('pageTotal');

  function setStatus(msg) {
    if (!status) return;
    status.textContent = msg;
    status.style.display = msg ? 'block' : 'none';
  }

  function isFullscreen() {
    return !!document.fullscreenElement;
  }

  async function toggleFullscreen() {
    try {
      if (isFullscreen()) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      console.warn(e);
    }
  }

  try {
    if (!bookEl) {
      console.error('Missing #book element');
      return;
    }

    if (!window.St || !window.St.PageFlip) {
      setStatus('Error: PageFlip library did not load.');
      return;
    }

    // Load manifest
    let manifest;
    try {
      const res = await fetch('manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (e) {
      setStatus('Error: Could not load manifest.json.');
      console.error(e);
      return;
    }

    document.title = manifest.title || 'Flipbook';
    if (titleEl) titleEl.textContent = manifest.title || 'Flipbook';

    if (pdfLink) {
      if (manifest.originalPdf) {
        pdfLink.href = manifest.originalPdf;
        pdfLink.hidden = false;
      } else {
        pdfLink.hidden = true;
      }
    }

    const pages = (manifest.pages || []).map((p) => String(p));
    if (!pages.length) {
      setStatus('No pages found in manifest.');
      return;
    }

    const isMobile = window.matchMedia('(max-width: 640px)').matches;

    // Safe preload first real page for ratio
    setStatus('Loading pages…');
    const first = await loadImage(pages[0]);
    const ratio = (first.naturalHeight && first.naturalWidth)
      ? (first.naturalHeight / first.naturalWidth)
      : (11 / 8.5);

    // Build HTML pages
    bookEl.style.visibility = 'hidden';
    bookEl.innerHTML = '';

    // Tokens for filler pages (rendered as HTML with your logo.svg)
    const INSIDE_COVER = '__INSIDE_COVER__';
    const INSIDE_BACK  = '__INSIDE_BACK__';

    // Physical page list:
    // [cover] [inside-cover] [page2] [page3] ... [last] [+optional inside-back to keep even]
    const physicalSrcs = [];
    physicalSrcs.push(pages[0]);       // cover
    physicalSrcs.push(INSIDE_COVER);   // inside cover (HTML)
    for (let i = 1; i < pages.length; i++) physicalSrcs.push(pages[i]);

    // If odd number of physical pages, add inside-back filler so last real page isn’t single/stiff
    let addedEndFiller = false;
    if (physicalSrcs.length % 2 === 1) {
      physicalSrcs.push(INSIDE_BACK);
      addedEndFiller = true;
    }

    function addInsideCoverPage(kind /* 'cover' | 'back' */) {
      const page = document.createElement('div');
      page.className = 'page filler';

      const inner = document.createElement('div');
      inner.className = 'inside-cover';

      const logo = document.createElement('img');
      logo.src = 'assets/logo.png';     // ✅ your logo path
      logo.alt = 'BASIC logo';
      logo.draggable = false;
      logo.decoding = 'async';

      const subtitle = document.createElement('div');
      subtitle.className = 'inside-cover-subtitle';
      subtitle.textContent = (kind === 'cover') ? 'Report Card' : 'Thank you for supporting local students';

      inner.appendChild(logo);
      inner.appendChild(subtitle);

      page.appendChild(inner);
      bookEl.appendChild(page);
    }

    function addImagePage(src, alt, eager = false) {
      const page = document.createElement('div');
      page.className = 'page';

      const img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      img.draggable = false;
      img.decoding = 'async';
      img.loading = eager ? 'eager' : 'lazy';
      img.decode?.().catch(() => {});

      page.appendChild(img);
      bookEl.appendChild(page);
    }

    function addPage(src, alt, eager = false) {
      if (src === INSIDE_COVER) return addInsideCoverPage('cover');
      if (src === INSIDE_BACK)  return addInsideCoverPage('back');
      return addImagePage(src, alt, eager);
    }

    for (let i = 0; i < physicalSrcs.length; i++) {
      addPage(physicalSrcs[i], `Page ${i + 1}`, i < 4); // eager a few
    }

    const logicalCount = pages.length;                 // your real PDF pages
    const physicalCount = physicalSrcs.length;
    const lastRealPhysicalIdx = (physicalCount - 1) - (addedEndFiller ? 1 : 0);

    // Base size (stretch fits container)
    const baseWidth = Math.min(first.naturalWidth || 1200, 1400);
    const baseHeight = Math.round(baseWidth * ratio);

    const pageFlip = new St.PageFlip(bookEl, {
      width: baseWidth,
      height: baseHeight,
      size: 'stretch',
      minWidth: 320,
      maxWidth: 2500,
      minHeight: Math.round(320 * ratio),
      maxHeight: Math.round(2500 * ratio),

      // Mobile perf
      drawShadow: !isMobile,
      flippingTime: isMobile ? 520 : 700,

      usePortrait: true,

      // ✅ keep cover SOFT (hard covers happen when showCover=true)
      showCover: false,

      mobileScrollSupport: true,
    });

    // Load HTML pages
    const items = Array.from(bookEl.querySelectorAll('.page'));
    if (typeof pageFlip.loadFromHTML === 'function') pageFlip.loadFromHTML(items);
    else if (typeof pageFlip.loadFromHtml === 'function') pageFlip.loadFromHtml(items);
    else throw new Error('No HTML loader found on PageFlip instance');

    // UI totals (real pages only)
    if (pageTotal) pageTotal.textContent = String(logicalCount);

    function logicalFromPhysical(pIdx) {
      // physical: 0=cover, 1=inside-cover filler, 2=real page 2, ...
      if (pIdx <= 1) return 0;
      const li = pIdx - 1;
      return Math.min(logicalCount - 1, li);
    }

    // Preload neighbors to reduce black “render” frames on mobile
    const preloadCache = new Map();
    function warmLogical(li) {
      if (li < 0 || li >= logicalCount) return;
      const src = pages[li];
      if (preloadCache.has(src)) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      img.decode?.().catch(() => {});
      preloadCache.set(src, img);
    }
    function warmAroundLogical(li) {
      warmLogical(li);
      warmLogical(li + 1);
      warmLogical(li + 2);
      warmLogical(li - 1);
    }

    function updatePager() {
      const pIdx = pageFlip.getCurrentPageIndex();

      // prevent landing beyond last real page (into inside-back filler)
      if (pIdx > lastRealPhysicalIdx) {
        pageFlip.turnToPage(lastRealPhysicalIdx);
        return;
      }

      const lIdx = logicalFromPhysical(pIdx);

      if (pageNow) pageNow.textContent = String(lIdx + 1);
      if (prevBtn) prevBtn.disabled = pIdx <= 0;
      if (nextBtn) nextBtn.disabled = pIdx >= lastRealPhysicalIdx;

      warmAroundLogical(lIdx);
    }

    pageFlip.on('flip', () => {
      playFlipSound();
      updatePager();
    });

    pageFlip.on('init', () => {
      warmAroundLogical(0);
      updatePager();
      setStatus('');
      bookEl.style.visibility = 'visible';
    });

    if (prevBtn) prevBtn.addEventListener('click', () => pageFlip.flipPrev());
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (pageFlip.getCurrentPageIndex() < lastRealPhysicalIdx) pageFlip.flipNext();
    });
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);

    window.addEventListener('keydown', (e) => {
      const idx = pageFlip.getCurrentPageIndex();
      if (e.key === 'ArrowLeft') pageFlip.flipPrev();
      if (e.key === 'ArrowRight' && idx < lastRealPhysicalIdx) pageFlip.flipNext();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });
  } catch (err) {
    console.error(err);
    setStatus('Error: Flipbook failed to start. Open DevTools Console for details.');
    const bookEl = document.getElementById('book');
    if (bookEl) bookEl.style.visibility = 'visible';
  }
})();

// Allow Esc to close the modal when embedded in an iframe
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.parent?.postMessage({ type: 'flipbook:close' }, 'https://www.borregobasic.org');
    window.parent?.postMessage({ type: 'flipbook:close' }, '*');
  }
});