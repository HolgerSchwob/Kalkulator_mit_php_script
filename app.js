// Erst unser Code, danach Cloudflare – damit Klicks (Kalkulator, Modals) nicht von Email-Decode abgefangen werden
(function(){ var _=console; _.log('[bamadi] Script gestartet'); })();
// Kalkulator Fullscreen-Overlay
(function(){
  var overlay = document.getElementById('kalkulator-overlay');
  var iframe = document.getElementById('kalkulator-iframe');
  console.log('[bamadi] Kalkulator-IIFE: overlay=', !!overlay, 'iframe=', !!iframe);
  var closeBtn = document.querySelector('.kalkulator-overlay-close');
  var calcUrl = 'kalkulator/index.html';
  var modalOverlayCount = 0;

  function updateCloseButtonVisibility() {
    if (closeBtn) closeBtn.style.display = modalOverlayCount > 0 ? 'none' : '';
  }

  function openKalkulatorOverlay() {
    if (!overlay || !iframe) return;
    modalOverlayCount = 0;
    updateCloseButtonVisibility();
    iframe.src = calcUrl;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeKalkulatorOverlay() {
    if (!overlay || !iframe) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    iframe.src = '';
  }

  function requestClose() {
    if (!iframe || !iframe.contentWindow) { closeKalkulatorOverlay(); return; }
    var timeout = setTimeout(function() { closeKalkulatorOverlay(); }, 400);
    var done = function() { clearTimeout(timeout); };
    var onMessage = function(e) {
      if (e.data && (e.data.type === 'kalkulator-can-close' || e.data.type === 'kalkulator-close-blocked')) {
        done();
        window.removeEventListener('message', onMessage);
      }
    };
    window.addEventListener('message', onMessage);
    iframe.contentWindow.postMessage({ type: 'kalkulator-close-requested' }, window.location.origin);
  }

  var closeBlockedToast = null;
  window.addEventListener('message', function(e) {
    if (!e.data || e.origin !== window.location.origin) return;
    if (iframe && iframe.contentWindow && e.source !== iframe.contentWindow) return;
    if (e.data.type === 'kalkulator-modal-opened') {
      modalOverlayCount++;
      updateCloseButtonVisibility();
    }
    if (e.data.type === 'kalkulator-modal-closed') {
      modalOverlayCount = Math.max(0, modalOverlayCount - 1);
      updateCloseButtonVisibility();
    }
    if (e.data.type === 'kalkulator-can-close') closeKalkulatorOverlay();
    if (e.data.type === 'kalkulator-close-blocked') {
      if (closeBlockedToast) clearTimeout(closeBlockedToast);
      var t = document.createElement('div');
      t.setAttribute('role', 'status');
      t.className = 'kalkulator-close-blocked-toast';
      t.textContent = 'Bitte zuerst den geöffneten Dialog (Editor oder Lieferzeitenrechner) schließen.';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--navy-deep);color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:1001;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90%;text-align:center;';
      document.body.appendChild(t);
      closeBlockedToast = setTimeout(function(){ t.remove(); closeBlockedToast = null; }, 3500);
    }
  });

  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.getAttribute('href') && a.getAttribute('href').indexOf('kalkulator') !== -1) {
      console.log('[bamadi] Klick auf Kalkulator-Link, öffne Overlay');
      e.preventDefault();
      e.stopPropagation();
      openKalkulatorOverlay();
    }
  }, true);

  if (closeBtn) closeBtn.addEventListener('click', requestClose);

  document.addEventListener('keydown', function(e) {
    if (!overlay) return;
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) requestClose();
  });
})();
console.log('[bamadi] Kalkulator-IIFE fertig');

// Nav scroll
(function(){
  var nav = document.getElementById('nav');
  console.log('[bamadi] Nav-IIFE: nav=', !!nav);
  if (!nav) return;
  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
})();
console.log('[bamadi] Nav-IIFE fertig');

// Mobile Nav: Ausklappmenü
(function(){
  var nav = document.getElementById('nav');
  var btn = document.querySelector('.nav-toggle');
  var backdrop = document.querySelector('.nav-backdrop');
  var menu = document.getElementById('nav-menu');
  console.log('[bamadi] MobileNav-IIFE: nav=', !!nav, 'btn=', !!btn);
  if (!btn || !nav) return;
  function open() { nav.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', 'Menü schließen'); document.body.style.overflow = 'hidden'; }
  function close() { nav.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Menü öffnen'); document.body.style.overflow = ''; }
  function toggle() { nav.classList.contains('is-open') ? close() : open(); }
  btn.addEventListener('click', toggle);
  if (backdrop) backdrop.addEventListener('click', close);
  if (menu) menu.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', close); });
})();
console.log('[bamadi] MobileNav-IIFE fertig');

// Countdown
function tick() {
  const el = document.getElementById('cdTimer');
  if (!el) return;
  const now = new Date(), cut = new Date();
  cut.setHours(14,0,0,0);
  if (now >= cut) { el.textContent = '✓ Morgen'; return; }
  const d = cut - now;
  const h = String(Math.floor(d/3600000)).padStart(2,'0');
  const m = String(Math.floor((d%3600000)/60000)).padStart(2,'0');
  const s = String(Math.floor((d%60000)/1000)).padStart(2,'0');
  el.textContent = h+':'+m+':'+s;
}
tick(); setInterval(tick, 1000);

// FAQ (global für onclick; Name toggleFaq, damit id=faq nicht überschreibt)
function toggleFaq(btn) {
  var a = btn.nextElementSibling, open = a && a.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(function(el) { el.classList.remove('open'); });
  document.querySelectorAll('.faq-q').forEach(function(b) { b.classList.remove('open'); });
  if (!open && a) {
    a.classList.add('open');
    btn.classList.add('open');
  }
}
window.toggleFaq = toggleFaq;
console.log('[bamadi] toggleFaq auf window gesetzt');

// Hero Book Slider
(function(){
  var slider = document.getElementById('heroSlider');
  console.log('[bamadi] HeroSlider-IIFE: slider=', !!slider);
  if (!slider) return;
  var slides = slider.querySelectorAll('.book-slide');
  var dotsEl = document.getElementById('heroDots');
  var fill = document.getElementById('heroProgress');
  if (!slides.length || !dotsEl || !fill) return;
  var DURATION = 4200;
  var current = 0;
  var timer;

  slides.forEach(function(_, i){
    var d = document.createElement('div');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', function(){ goTo(i); });
    dotsEl.appendChild(d);
  });

  function goTo(n){
    slides[current].classList.remove('active');
    dotsEl.children[current].classList.remove('active');
    current = (n + slides.length) % slides.length;
    slides[current].classList.add('active');
    dotsEl.children[current].classList.add('active');
    resetProgress();
  }

  function next(){ goTo(current + 1); }

  function resetProgress(){
    fill.style.transition = 'none';
    fill.style.width = '0%';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        fill.style.transition = 'width '+DURATION+'ms linear';
        fill.style.width = '100%';
      });
    });
    clearInterval(timer);
    timer = setInterval(next, DURATION);
  }

  resetProgress();
})();
console.log('[bamadi] HeroSlider-IIFE fertig');

// Legal Modal (Impressum, Datenschutz, AGB, Widerruf)
(function(){
  var overlay = document.getElementById('legal-overlay');
  console.log('[bamadi] Legal-IIFE: overlay=', !!overlay);
  if (!overlay) return;
  var tabs = document.querySelectorAll('.legal-tab');
  var panes = document.querySelectorAll('.legal-pane');
  var closeBtn = document.querySelector('.legal-modal-close');
  var kalkOverlay = document.getElementById('kalkulator-overlay');

  function switchTab(tabName) {
    tabs.forEach(function(t){
      var isActive = t.dataset.tab === tabName;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive);
    });
    panes.forEach(function(p){
      var isActive = p.id === 'legal-' + tabName;
      p.classList.toggle('active', isActive);
      p.hidden = !isActive;
    });
  }

  function openLegal(tabName) {
    if (kalkOverlay && kalkOverlay.classList.contains('is-open')) return;
    tabName = tabName || 'impressum';
    switchTab(tabName);
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var body = overlay.querySelector('.legal-modal-body');
    if (body) body.scrollTop = 0;
    setTimeout(function(){ if (closeBtn) closeBtn.focus(); }, 50);
  }

  function closeLegal() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    history.replaceState(null, '', window.location.pathname);
  }

  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      switchTab(tab.dataset.tab);
      history.replaceState(null, '', '#' + tab.dataset.tab);
    });
  });

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href="#impressum"], a[href="#datenschutz"], a[href="#agb"], a[href="#widerruf"]');
    if (a) {
      e.preventDefault();
      if (kalkOverlay && kalkOverlay.classList.contains('is-open')) return;
      var tab = a.getAttribute('href').replace('#', '');
      openLegal(tab);
      history.replaceState(null, '', '#' + tab);
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeLegal);
  overlay.addEventListener('click', function(e){
    if (e.target === overlay) closeLegal();
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeLegal();
  });

  var legalTabs = ['impressum', 'datenschutz', 'agb', 'widerruf'];
  var hash = window.location.hash.replace('#', '');
  if (legalTabs.indexOf(hash) !== -1) openLegal(hash);
})();
console.log('[bamadi] Legal-IIFE fertig');

// Bindungs-Modal
const bindings = [
  {
    slides: [
      {
        visual: '<div class=\"book-lg\" style=\"background:linear-gradient(155deg,#1A3A5C,#244d78)\"><div class=\"book-lg-inner\"><div class=\"book-lg-tag\" style=\"color:#E8A000\">Masterarbeit · 2026</div><div class=\"book-lg-rule\" style=\"background:#E8A000\"></div><div class=\"book-lg-title\" style=\"color:rgba(255,255,255,.9)\">Nachhaltige Mobilität im urbanen Kontext</div><div class=\"book-lg-author\" style=\"color:#fff\">M. Hoffmann · TU Darmstadt</div></div><div class=\"book-pages-lg\"></div></div>',
        bg: 'linear-gradient(145deg,#1A3A5C,#0F2338)',
        eyebrow: 'Hardcover Modern',
        title: 'Hardcover Modern',
        body: 'Vollfarbcover mit Lay-flat-Bindung und 120 g/m² säurefreiem Papier.',
        cta: true
      }
    ]
  },
  {
    slides: [
      {
        visual: '<div class=\"book-lg\" style=\"background:linear-gradient(160deg,#1e3d28,#264d32)\"><div class=\"book-lg-inner\"><div class=\"book-lg-tag\" style=\"color:rgba(255,255,255,.5)\">Dissertation</div><div class=\"book-lg-rule\" style=\"background:rgba(255,255,255,.25)\"></div><div class=\"book-lg-title\" style=\"color:rgba(255,255,255,.85)\">Efalin-Leineneinband</div><div class=\"book-lg-author\" style=\"color:#fff\">Dr. S. Weber · Uni Marburg</div></div><div class=\"book-pages-lg\"></div></div>',
        bg: 'linear-gradient(145deg,#1e3d28,#112218)',
        eyebrow: 'Hardcover Klassik',
        title: 'Hardcover Klassik',
        body: 'Efalin-Leineneinband mit derselben Lay-flat-Innenbindung wie beim Modern.',
        cta: true
      }
    ]
  },
  {
    slides: [
      {
        visual: '<div class=\"book-lg\" style=\"background:linear-gradient(155deg,#3d1e14,#5a2e1e)\"><div class=\"book-lg-inner\"><div class=\"book-lg-tag\" style=\"color:rgba(255,200,180,.5)\">Bachelorarbeit</div><div class=\"book-lg-rule\" style=\"background:rgba(255,200,180,.3)\"></div><div class=\"book-lg-title\" style=\"color:rgba(255,255,255,.85)\">Nachhaltige Lieferketten</div><div class=\"book-lg-author\" style=\"color:#fff\">T. Braun · FH Frankfurt</div></div><div class=\"book-pages-lg\"></div></div>',
        bg: 'linear-gradient(145deg,#3d1e14,#2a1510)',
        eyebrow: 'Paperback Folie',
        title: 'Paperback Folie',
        body: 'Klebebindung mit laminiertem Umschlag — leicht, robust und günstig.',
        cta: true
      }
    ]
  },
  {
    slides: [
      {
        visual: '<div class=\"book-lg\" style=\"background:linear-gradient(160deg,#1e1e2d,#2a2a3a)\"><div class=\"book-lg-inner\"><div class=\"book-lg-tag\" style=\"color:rgba(150,200,255,.5)\">Seminararbeit</div><div class=\"book-lg-rule\" style=\"background:rgba(150,200,255,.3)\"></div><div class=\"book-lg-title\" style=\"color:rgba(255,255,255,.85)\">Analyse digitaler Geschäftsmodelle</div><div class=\"book-lg-author\" style=\"color:#fff\">K. Fischer · WHU</div></div><div class=\"book-pages-lg\"></div></div>',
        bg: 'linear-gradient(145deg,#1e1e2d,#111118)',
        eyebrow: 'Ringbindung',
        title: 'Ringbindung',
        body: 'Spiralbindung mit Transparent-Cover — 360° aufklappbar und perfekt für Präsentationen.',
        cta: true
      }
    ]
  }
];

// optional: im Debug-Fall auch auf window legen
window.bindings = bindings;
console.log('[bamadi] bindings geladen, openModal/closeModal werden gesetzt');

let activeBinding = 0;
let activeSlide   = 0;

window.openModal = function(bindingIdx) {
  activeBinding = bindingIdx;
  activeSlide   = 0;
  renderModal();
  const ov = document.getElementById('overlay');
  if (ov) ov.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeModal = function() {
  const ov = document.getElementById('overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
};

window.closeOnBg = function(e) {
  const ov = document.getElementById('overlay');
  if (!ov) return;
  if (e.target === ov) closeModal();
};
console.log('[bamadi] openModal, closeModal, closeOnBg auf window gesetzt');

function renderModal() {
  const binding = bindings[activeBinding];
  const slides  = binding.slides;
  const track   = document.getElementById('track');
  const dots    = document.getElementById('navDots');
  if (!track || !dots) return;

  track.innerHTML = slides.map(function(s){
    return '' +
      '<div class=\"slide\">' +
        '<div class=\"slide-visual\" style=\"background:' + (s.bg || '#1A3A5C') + '\">' + s.visual + '</div>' +
        '<div class=\"slide-text\">' +
          '<div class=\"slide-eyebrow\">' + s.eyebrow + '</div>' +
          '<h2 class=\"slide-h\">' + s.title + '</h2>' +
          (s.body ? '<p class=\"slide-p\">' + s.body + '</p>' : '') +
          (s.cta ? '<button class=\"slide-cta\" onclick=\"closeModal()\">Jetzt konfigurieren →</button>' : '') +
        '</div>' +
      '</div>';
  }).join('');

  dots.innerHTML = slides.map(function(_, i){
    return '<div class=\"nav-dot' + (i === 0 ? ' active' : '') + '\" onclick=\"goToSlide(' + i + ')\"></div>';
  }).join('');

  goToSlide(0);
}

function goToSlide(n) {
  const binding = bindings[activeBinding];
  const count   = binding.slides.length;
  activeSlide   = Math.max(0, Math.min(n, count - 1));
  const track = document.getElementById('track');
  if (!track) return;
  track.style.transform = 'translateX(-' + (activeSlide * 100) + '%)';
  document.querySelectorAll('.nav-dot').forEach(function(d, i){
    d.classList.toggle('active', i === activeSlide);
  });
  const counter = document.getElementById('slideCounter');
  if (counter) counter.textContent = (activeSlide + 1) + ' / ' + count;
  const prev = document.getElementById('btnPrev');
  const next = document.getElementById('btnNext');
  if (prev) prev.disabled = activeSlide === 0;
  if (next) next.disabled = activeSlide === count - 1;
}

function prevSlide(){ goToSlide(activeSlide - 1); }
function nextSlide(){ goToSlide(activeSlide + 1); }
console.log('[bamadi] prevSlide, nextSlide definiert');

document.addEventListener('keydown', function(e){
  const ov = document.getElementById('overlay');
  if (!ov || !ov.classList.contains('open')) return;
  if (e.key === 'Escape')    closeModal();
  if (e.key === 'ArrowLeft') prevSlide();
  if (e.key === 'ArrowRight')nextSlide();
});

(function(){
  const track = document.getElementById('track');
  if (!track) return;
  let touchStartX = 0;
  track.addEventListener('touchstart', function(e){
    touchStartX = e.touches[0].clientX;
  }, {passive:true});
  track.addEventListener('touchend', function(e){
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) (dx < 0 ? nextSlide() : prevSlide());
  });
})();

// Klicks auf Bindungskarten + Kalkulator: eine Delegation auf document (Capture-Phase)
(function(){
  document.addEventListener('click', function(e) {
    var card = e.target.closest('.prod-card[data-binding]');
    if (card) {
      var idx = parseInt(card.getAttribute('data-binding'), 10);
      console.log('[bamadi] Klick auf .prod-card, data-binding=', idx, 'openModal=', typeof window.openModal);
      if (!isNaN(idx) && typeof window.openModal === 'function') {
        e.preventDefault();
        e.stopPropagation();
        window.openModal(idx);
      }
      return;
    }
  }, true);
  console.log('[bamadi] Prod-Card-Listener registriert, Script-Ende');
})();
