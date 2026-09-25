/* Çalışma serisi ekranı (#streak): üstte güncel seri, altında ayın günleri (her kutu bir gün).
   Kutunun rengi o günkü çalışma süresine göre: sarı → yeşil → mavi → mor (app.js → studyMinutes).
   Seri günleri app.js → activeDays() ile aynı; üstteki 🔥 sayacıyla her zaman tutarlı. */
const STREAK_LEVELS = [
  { min: 270, name: 'Efsane', label: '4,5 sa ve üstü', color: '#b388ff' },
  { min: 150, name: 'Çok iyi', label: '2,5–4,5 sa', color: '#4ea8ff' },
  { min: 60, name: 'İyi', label: '1–2,5 sa', color: '#58d6a6' },
  { min: 0, name: 'Başladın', label: '1 saatten az', color: '#ffd166' },
];
const FLAME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.7 3.3 5.6 5.7 5.6 11.1a5.6 5.6 0 0 1-11.2 0c0-2.5 1.1-4.2 2.5-5.4.2 2 1 3.1 2.2 3.5-.4-3.5.3-6.5.9-9.2Z"/></svg>';
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
let streakMonthOffset = 0; // 0 = bu ay, -1 = geçen ay …

// Günün seviyesi: seri günü değilse null; seri günüyse süresine göre (süresi olmayan seri günü de "Başladın").
function streakLevel(key, active) {
  if (!active.has(key)) return null;
  const minutes = studyMinutes(key).total;
  return STREAK_LEVELS.find(level => minutes >= level.min);
}

function longestStreak(active) {
  let best = 0;
  active.forEach(key => {
    if (active.has(addDaysKey(key, -1))) return; // sadece serilerin ilk gününden say
    let length = 0, day = key;
    while (active.has(day)) { length++; day = addDaysKey(day, 1); }
    best = Math.max(best, length);
  });
  return best;
}

function renderStreakView() {
  const root = document.querySelector('#streakView');
  if (!root) return;
  const active = activeDays(), today = todayKey(), streak = currentStreak(active);
  const todayLevel = streakLevel(today, active);
  const flameColor = todayLevel ? todayLevel.color : 'var(--muted)';
  // Üst çubuktaki alev de bugünün rengini alır.
  document.querySelectorAll('.streak-flame').forEach(el => { el.style.color = flameColor; });

  const now = new Date();
  const earliest = [...active].sort()[0] || today;
  const minOffset = (Number(earliest.slice(0, 4)) - now.getFullYear()) * 12 + (Number(earliest.slice(5, 7)) - 1 - now.getMonth());
  streakMonthOffset = Math.min(0, Math.max(minOffset, streakMonthOffset));
  const first = new Date(now.getFullYear(), now.getMonth() + streakMonthOffset, 1);
  const year = first.getFullYear(), month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Pazartesi başlangıçlı hafta
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  let activeCount = 0, monthMinutes = 0;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="streak-day is-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${monthKey}-${String(day).padStart(2, '0')}`;
    const level = streakLevel(key, active);
    const minutes = level ? studyMinutes(key).total : 0;
    if (level) { activeCount++; monthMinutes += minutes; }
    const classes = ['streak-day', level ? 'is-active' : '', key === today ? 'is-today' : '', key > today ? 'is-future' : ''].filter(Boolean).join(' ');
    const label = `${day} ${MONTHS[month]}: ${level ? `${level.name}${minutes ? `, ${formatMinutes(minutes)}` : ''}` : key > today ? 'henüz gelmedi' : 'çalışma yok'}`;
    cells.push(`<span class="${classes}" style="${level ? `--day-color:${level.color}` : ''}" title="${label}" role="img" aria-label="${label}"><b>${day}</b>${level ? FLAME_SVG : ''}</span>`);
  }

  const best = Math.max(longestStreak(active), streak);
  root.innerHTML = `
    <article class="panel streak-hero" style="--flame:${flameColor}">
      <span class="streak-hero-flame">${FLAME_SVG}</span>
      <div class="streak-hero-copy">
        <p class="section-kicker">ÇALIŞMA SERİSİ</p>
        <h2><strong>${streak}</strong> günlük seri</h2>
        <p>${streak ? (active.has(today) ? 'Bugün de çalıştın, seri sürüyor!' : 'Seriyi korumak için bugün de bir şey çalış.') : 'Bugün çalışarak yeni bir seri başlat.'}</p>
      </div>
      <dl class="streak-stats">
        <div><dt>En uzun seri</dt><dd>${best} gün</dd></div>
        <div><dt>${MONTHS[month]} ayında</dt><dd>${activeCount} gün</dd></div>
        <div><dt>Aylık süre</dt><dd>${formatMinutes(monthMinutes)}</dd></div>
      </dl>
    </article>
    <article class="panel streak-calendar">
      <div class="streak-month">
        <button class="streak-nav" type="button" data-streak-month="-1" aria-label="Önceki ay" ${streakMonthOffset <= minOffset ? 'disabled' : ''}>←</button>
        <h3>${MONTHS[month]} ${year}</h3>
        <button class="streak-nav" type="button" data-streak-month="1" aria-label="Sonraki ay" ${streakMonthOffset >= 0 ? 'disabled' : ''}>→</button>
      </div>
      <div class="streak-grid streak-weekdays" aria-hidden="true">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="streak-grid">${cells.join('')}</div>
      <ul class="streak-legend" aria-label="Renklerin anlamı">
        ${[...STREAK_LEVELS].reverse().map(level => `<li style="--day-color:${level.color}">${FLAME_SVG}<span><b>${level.name}</b> ${level.label}</span></li>`).join('')}
      </ul>
      <p class="streak-note">Çalışma süresi odak sayacından ve programda tiklediğin çalışmalardan gelir (video süresi, test başına 10 dk). Görev, deneme ya da tekrar yaptığın günler de seriye sayılır.</p>
    </article>`;
}

document.querySelector('#streakView')?.addEventListener('click', event => {
  const button = event.target.closest('[data-streak-month]');
  if (!button || button.disabled) return;
  streakMonthOffset += Number(button.dataset.streakMonth);
  renderStreakView();
});
renderStreakView();
