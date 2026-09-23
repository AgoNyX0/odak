/* Ezber kartları (Tekrarlar ekranı): Kartlar → ders → konu (ya da "Tüm konular" karışık) → çevrilebilir kartlar.
   Kart içeriği cards.js'teki window.ODAK_CARDS'tan gelir; herkes için aynıdır, kullanıcı verisine yazılmaz. */
(function () {
  const DECKS = Array.isArray(window.ODAK_CARDS) ? window.ODAK_CARDS : [];
  const COLORS = { Edebiyat: '#ff7aa2', Fizik: '#3b9dd8', Kimya: '#ad8cff', Biyoloji: '#58d6a6' };
  const ICONS = { Edebiyat: '✎', Fizik: '⚛', Kimya: '⚗', Biyoloji: '❦' };
  const body = $('#flashBody');
  const entry = $('#flashOpen');
  if (!body || !entry) return;

  // view: 'subjects' | 'units' | 'study'
  const ui = { view: 'subjects', subject: null, unitId: null, deck: [], index: 0, flipped: false };

  const deckOf = name => DECKS.find(deck => deck.subject === name) || { subject: name, units: [] };
  const cardCount = deck => deck.units.reduce((sum, unit) => sum + unit.cards.length, 0);
  const color = name => COLORS[name] || 'var(--primary)';

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function open() {
    entry.setAttribute('aria-expanded', 'true');
    body.classList.remove('hidden');
    ui.view = 'subjects';
    render();
  }

  function close() {
    entry.setAttribute('aria-expanded', 'false');
    body.classList.add('hidden');
    entry.focus();
  }

  function back() {
    if (ui.view === 'study') ui.view = 'units';
    else if (ui.view === 'units') ui.view = 'subjects';
    else return close();
    render();
  }

  function head(title, crumbs) {
    return `<div class="flash-head">
      <button class="flash-icon-btn" type="button" data-flash="back" aria-label="Geri">←</button>
      <div class="flash-head-copy"><p class="section-kicker">${crumbs.map(escapeHTML).join(' · ')}</p><h3>${escapeHTML(title)}</h3></div>
      <button class="close-btn" type="button" data-flash="close" aria-label="Kartları kapat">×</button>
    </div>`;
  }

  function renderSubjects() {
    const names = ['Edebiyat', 'Fizik', 'Kimya', 'Biyoloji'];
    body.innerHTML = head('Hangi dersi tekrar edelim?', ['KARTLAR']) + `<div class="flash-subjects">${names.map(name => {
      const deck = deckOf(name), count = cardCount(deck);
      const info = count ? `${deck.units.length} konu · ${count} kart` : 'Yakında';
      return `<button class="flash-subject" type="button" data-flash="subject" data-subject="${escapeHTML(name)}" style="--flash-color:${color(name)}">
        <span class="flash-subject-icon" aria-hidden="true">${ICONS[name] || '•'}</span>
        <strong>${escapeHTML(name)}</strong><small>${escapeHTML(info)}</small>
      </button>`;
    }).join('')}</div>`;
  }

  function renderUnits() {
    const deck = deckOf(ui.subject), total = cardCount(deck);
    if (!total) {
      body.innerHTML = head(ui.subject, ['KARTLAR']) + `<div class="flash-empty" style="--flash-color:${color(ui.subject)}"><strong>${escapeHTML(ui.subject)} kartları hazırlanıyor</strong><span>Bu dersin kartları yakında eklenecek.</span></div>`;
      return;
    }
    body.innerHTML = head(ui.subject, ['KARTLAR', `${deck.units.length} KONU`]) + `<div class="flash-units" style="--flash-color:${color(ui.subject)}">
      ${deck.units.map((unit, index) => `<button class="flash-unit" type="button" data-flash="unit" data-unit="${escapeHTML(unit.id)}">
        <span class="flash-unit-no">${index + 1}</span><strong>${escapeHTML(unit.name)}</strong><small>${unit.cards.length} kart</small><span class="flash-unit-arrow" aria-hidden="true">→</span>
      </button>`).join('')}
      <button class="flash-unit flash-unit-all" type="button" data-flash="unit" data-unit="all">
        <span class="flash-unit-no" aria-hidden="true">⤨</span><strong>Tüm konular</strong><small>${total} kart · karışık</small><span class="flash-unit-arrow" aria-hidden="true">→</span>
      </button>
    </div>`;
  }

  function startDeck(unitId) {
    const deck = deckOf(ui.subject);
    ui.unitId = unitId;
    if (unitId === 'all') ui.deck = shuffle(deck.units.flatMap(unit => unit.cards.map(card => ({ ...card, unit: unit.name }))));
    else {
      const unit = deck.units.find(item => item.id === unitId);
      if (!unit) return;
      ui.deck = unit.cards.map(card => ({ ...card, unit: unit.name }));
    }
    ui.index = 0;
    ui.flipped = false;
    ui.view = 'study';
    render();
  }

  function unitTitle() {
    if (ui.unitId === 'all') return 'Tüm konular';
    return deckOf(ui.subject).units.find(unit => unit.id === ui.unitId)?.name || '';
  }

  function renderStudy() {
    const done = ui.index >= ui.deck.length;
    const shell = head(unitTitle(), ['KARTLAR', ui.subject.toLocaleUpperCase('tr-TR')]);
    if (done) {
      body.innerHTML = shell + `<div class="flash-finish" style="--flash-color:${color(ui.subject)}">
        <span aria-hidden="true">✓</span><strong>Deste bitti!</strong><small>${ui.deck.length} kartın hepsine baktın.</small>
        <div><button class="secondary-btn" type="button" data-flash="shuffle">Karıştırıp tekrar</button><button class="primary-btn compact" type="button" data-flash="restart">Baştan başla</button></div>
      </div>`;
      return;
    }
    const card = ui.deck[ui.index];
    const percent = Math.round((ui.index + 1) / ui.deck.length * 100);
    body.innerHTML = shell + `<div class="flash-study" style="--flash-color:${color(ui.subject)}">
      <div class="flash-progress"><span>${ui.index + 1} / ${ui.deck.length}</span><div class="flash-bar"><i style="width:${percent}%"></i></div><button class="flash-text-btn" type="button" data-flash="shuffle">⤨ Karıştır</button></div>
      <button class="flash-card${ui.flipped ? ' flipped' : ''}" type="button" data-flash="flip" aria-label="${ui.flipped ? 'Kartın ön yüzüne dön' : 'Cevabı göster'}">
        <span class="flash-face flash-front" aria-hidden="${ui.flipped}"><small>${escapeHTML(ui.unitId === 'all' ? card.unit : 'Soru')}</small><strong>${escapeHTML(card.f)}</strong><em>Cevap için dokun</em></span>
        <span class="flash-face flash-back" aria-hidden="${!ui.flipped}"><small>Cevap</small><strong>${escapeHTML(card.b)}</strong><em>Soruya dönmek için dokun</em></span>
      </button>
      <div class="flash-nav">
        <button class="secondary-btn" type="button" data-flash="prev" ${ui.index === 0 ? 'disabled' : ''}>← Önceki</button>
        <button class="primary-btn compact" type="button" data-flash="next">${ui.index === ui.deck.length - 1 ? 'Bitir' : 'Sonraki →'}</button>
      </div>
      <p class="flash-hint">Klavye: boşluk çevirir, ← → kartlar arasında geçer.</p>
    </div>`;
  }

  function render() {
    if (ui.view === 'subjects') renderSubjects();
    else if (ui.view === 'units') renderUnits();
    else renderStudy();
  }

  function focusCard() {
    const card = body.querySelector('.flash-card');
    if (card) card.focus({ preventScroll: true });
  }

  function flip() { ui.flipped = !ui.flipped; render(); focusCard(); }
  function go(step) {
    const next = ui.index + step;
    if (next < 0 || next > ui.deck.length) return;
    ui.index = next;
    ui.flipped = false;
    render();
    focusCard();
  }

  entry.addEventListener('click', () => (body.classList.contains('hidden') ? open() : close()));

  body.addEventListener('click', event => {
    const button = event.target.closest('[data-flash]');
    if (!button || button.disabled) return;
    const action = button.dataset.flash;
    if (action === 'close') close();
    else if (action === 'back') back();
    else if (action === 'subject') { ui.subject = button.dataset.subject; ui.view = 'units'; render(); }
    else if (action === 'unit') startDeck(button.dataset.unit);
    else if (action === 'flip') flip();
    else if (action === 'prev') go(-1);
    else if (action === 'next') go(1);
    else if (action === 'restart') { ui.index = 0; ui.flipped = false; render(); focusCard(); }
    else if (action === 'shuffle') { ui.deck = shuffle(ui.deck); ui.index = 0; ui.flipped = false; render(); focusCard(); }
  });

  // Klavye: sadece çalışma ekranındayken ve bir yazı alanında değilken.
  document.addEventListener('keydown', event => {
    if (ui.view !== 'study' || body.classList.contains('hidden') || document.body.dataset.view !== 'reviews') return;
    const target = event.target instanceof Element ? event.target : document.body;
    if (target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-backdrop:not(.hidden)')) return;
    if (ui.index >= ui.deck.length) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    // Odak bir düğmedeyse boşluğu tarayıcı zaten o düğmeye tıklatır (kartın kendisi de bir düğme).
    else if (event.key === ' ' && !target.closest('button, a')) { event.preventDefault(); flip(); }
  });

  // Telefonda sola/sağa kaydırarak kart değiştir.
  let touchX = null, touchY = null;
  body.addEventListener('touchstart', event => {
    if (!event.target.closest('.flash-card')) return;
    touchX = event.touches[0].clientX; touchY = event.touches[0].clientY;
  }, { passive: true });
  body.addEventListener('touchend', event => {
    if (touchX === null) return;
    const dx = event.changedTouches[0].clientX - touchX, dy = event.changedTouches[0].clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });
})();
