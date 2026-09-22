/* Program oluşturucu.
   Konu listeleri curriculum.js'te (genel YKS müfredatı, kişiye özel değil).
   Üretilen program kullanıcının kendi verisine (state.program) yazılır ve bulutla eşitlenir. */
(function () {
  const TOPICS = window.YKS_TOPICS || {};
  // Alanlara göre dersler. null = o gruptaki tüm dersler.
  const FIELDS = {
    tyt: { label: 'TYT', groups: { TYT: null } },
    say: { label: 'AYT · Sayısal', groups: { TYT: null, AYT: ['Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'] } },
    ea: { label: 'AYT · Eşit Ağırlık', groups: { TYT: null, AYT: ['Matematik', 'Geometri', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya'] } },
    soz: { label: 'AYT · Sözel', groups: { TYT: null, AYT: ['Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Felsefe Grubu', 'Din Kültürü ve Ahlak Bilgisi'] } },
    dil: { label: 'YDT · Dil', groups: { TYT: null, YDT: null } },
  };
  // Program kartlarında kısa isim kullan.
  const SHORT = {
    'Temel Matematik': 'Matematik',
    'Türk Dili ve Edebiyatı': 'Edebiyat',
    'Din Kültürü ve Ahlak Bilgisi': 'Din Kültürü',
    'Felsefe Grubu': 'Felsefe',
  };
  const shortName = name => SHORT[name] || name;
  const groupsOf = field => {
    const config = FIELDS[field] || FIELDS.tyt;
    const list = [];
    for (const [group, only] of Object.entries(config.groups)) {
      const subjects = TOPICS[group] || {};
      for (const [subject, topics] of Object.entries(subjects)) {
        if (only && !only.includes(subject)) continue;
        if (Array.isArray(topics) && topics.length) list.push({ group, subject, topics });
      }
    }
    return list;
  };

  const selection = new Map(); // "GRUP|Ders" -> Set(konu)
  const keyOf = entry => `${entry.group}|${entry.subject}`;
  let entries = [];

  function renderSubjects() {
    const list = $('#builderSubjects');
    list.innerHTML = entries.map(entry => {
      const key = keyOf(entry), chosen = selection.get(key) || new Set();
      const topics = entry.topics.map((topic, index) => `<label class="builder-topic ${chosen.has(topic) ? 'on' : ''}"><input type="checkbox" data-topic="${escapeHTML(key)}" value="${escapeHTML(topic)}" ${chosen.has(topic) ? 'checked' : ''}><span>${index + 1}. ${escapeHTML(topic)}</span></label>`).join('');
      return `<details class="builder-subject" ${chosen.size ? 'open' : ''}>
        <summary><span class="builder-subject-name">${escapeHTML(shortName(entry.subject))}<small>${entry.group}</small></span><span class="builder-subject-count">${chosen.size}/${entry.topics.length}</span></summary>
        <div class="builder-subject-actions"><button type="button" class="secondary-btn" data-select-all="${escapeHTML(key)}">Tümünü seç</button><button type="button" class="secondary-btn" data-select-none="${escapeHTML(key)}">Temizle</button></div>
        <div class="builder-topics">${topics}</div>
      </details>`;
    }).join('') || '<p class="builder-empty">Bu sınav için konu listesi bulunamadı.</p>';
    updateSummary();
  }

  const plan = () => {
    const perDay = Math.max(1, Number($('#builderPerDay').value) || 1);
    const start = $('#builderStart').value || todayKey();
    const minutes = Math.max(5, Number($('#builderMinutes').value) || 45);
    const rest = $('#builderRest').value === '' ? null : Number($('#builderRest').value);
    const wanted = Math.max(1, Number($('#builderDays').value) || 1);
    const queues = entries
      .map(entry => ({ subject: shortName(entry.subject), group: entry.group, topics: entry.topics.filter(topic => (selection.get(keyOf(entry)) || new Set()).has(topic)) }))
      .filter(queue => queue.topics.length);
    const total = queues.reduce((sum, queue) => sum + queue.topics.length, 0);
    const days = [];
    let cursor = start, turn = 0, guard = 0;
    while (queues.some(queue => queue.topics.length) && guard++ < 2000) {
      if (rest !== null && dateFromKey(cursor).getDay() === rest) { cursor = addDaysKey(cursor, 1); continue; }
      const items = [];
      while (items.length < perDay && queues.some(queue => queue.topics.length)) {
        const queue = queues[turn % queues.length];
        turn++;
        if (!queue.topics.length) continue;
        items.push({ subject: queue.subject, range: queue.group, topic: queue.topics.shift(), practice: '', videoCount: 0, durationSeconds: minutes * 60 });
      }
      days.push({ day: days.length + 1, date: cursor, items });
      cursor = addDaysKey(cursor, 1);
    }
    return { days, total, wanted, start, minutes };
  };

  function updateSummary() {
    const chosen = [...selection.values()].reduce((sum, set) => sum + set.size, 0);
    $('#builderSelectedCount').textContent = `${chosen} konu seçildi`;
    if (!chosen) { $('#builderSummary').textContent = 'Başlamak için en az bir konu seç.'; return; }
    const { days, total, wanted } = plan();
    const last = days.at(-1);
    const range = `${formatShortDate(days[0].date)} – ${formatShortDate(last.date)}`;
    const note = days.length > wanted ? ` (seçtiğin konular ${wanted} güne sığmadığı için ${days.length} güne yayıldı)` : '';
    const minutes = days.reduce((sum, day) => sum + day.items.reduce((s, item) => s + item.durationSeconds / 60, 0), 0);
    $('#builderSummary').textContent = `${total} konu · ${days.length} gün · ${range} · toplam ${Math.round(minutes / 60)} saat${note}`;
  }

  function openBuilder() {
    const program = state.program;
    entries = groupsOf($('#builderExam').value);
    selection.clear();
    $('#builderError').classList.add('hidden');
    $('#builderTitle').textContent = program ? 'Programı yenile' : 'Çalışma programı oluştur';
    $('#builderSubmit').textContent = program ? 'Programı yenile' : 'Programı oluştur';
    if (!$('#builderStart').value) $('#builderStart').value = todayKey();
    renderSubjects();
    openModal('programBuilder');
  }

  document.addEventListener('DOMContentLoaded', () => {});

  $('#builderExam').innerHTML = Object.entries(FIELDS).map(([value, field]) => `<option value="${value}">${escapeHTML(field.label)}</option>`).join('');
  $('#builderStart').value = todayKey();
  $('#builderExam').onchange = () => { entries = groupsOf($('#builderExam').value); selection.clear(); renderSubjects(); };
  ['#builderDays', '#builderPerDay', '#builderMinutes', '#builderRest', '#builderStart'].forEach(id => $(id).addEventListener('input', updateSummary));

  $('#builderSubjects').addEventListener('change', event => {
    const key = event.target.dataset.topic;
    if (!key) return;
    const set = selection.get(key) || new Set();
    if (event.target.checked) set.add(event.target.value); else set.delete(event.target.value);
    set.size ? selection.set(key, set) : selection.delete(key);
    event.target.closest('.builder-topic')?.classList.toggle('on', event.target.checked);
    const count = event.target.closest('.builder-subject')?.querySelector('.builder-subject-count');
    if (count) count.textContent = `${set.size}/${event.target.closest('.builder-subject').querySelectorAll('[data-topic]').length}`;
    updateSummary();
  });
  // Not: liste yeniden çizilirse açık dersler kapanır; sadece o dersin kutucuklarını güncelle.
  $('#builderSubjects').addEventListener('click', event => {
    const all = event.target.dataset.selectAll, none = event.target.dataset.selectNone;
    if (!all && !none) return;
    const key = all || none;
    const entry = entries.find(item => keyOf(item) === key);
    if (!entry) return;
    if (all) selection.set(key, new Set(entry.topics)); else selection.delete(key);
    const block = event.target.closest('.builder-subject');
    block.querySelectorAll('[data-topic]').forEach(input => {
      input.checked = Boolean(all);
      input.closest('.builder-topic').classList.toggle('on', Boolean(all));
    });
    block.querySelector('.builder-subject-count').textContent = `${all ? entry.topics.length : 0}/${entry.topics.length}`;
    block.open = true;
    updateSummary();
  });

  $('#openBuilderEmpty').onclick = openBuilder;
  $('#openBuilder').onclick = openBuilder;

  $('#builderForm').addEventListener('submit', event => {
    event.preventDefault();
    const chosen = [...selection.values()].reduce((sum, set) => sum + set.size, 0);
    if (!chosen) { $('#builderError').textContent = 'En az bir konu seçmelisin.'; $('#builderError').classList.remove('hidden'); return; }
    const { days } = plan();
    const field = FIELDS[$('#builderExam').value] || FIELDS.tyt;
    state.program = {
      start: days[0].date,
      examType: $('#builderExam').value,
      kicker: `${field.label} PROGRAMI`,
      legend: 'Konular müfredat sırasına göre sıralandı',
      links: state.program?.links || {},
      days,
      createdAt: new Date().toISOString(),
    };
    state.programCompleted = {};
    closeModal('programBuilder');
    render();
    toast(`Program hazır · ${days.length} gün`);
    location.hash = 'plan';
  });

  // Gün kartlarına çalışma ekleme / silme
  let pendingDay = null;
  $('#programList').addEventListener('click', event => {
    const addDay = event.target.dataset.addItem;
    if (addDay) {
      pendingDay = Number(addDay);
      $('#programItemSubject').innerHTML = [...new Set(programDays().flatMap(day => day.items.map(item => item.subject)))]
        .concat(SUBJECTS.map(subject => subject.name))
        .filter((value, index, list) => list.indexOf(value) === index)
        .map(name => `<option>${escapeHTML(name)}</option>`).join('');
      openModal('programItemDialog', '#programItemTopic');
      return;
    }
    const remove = event.target.dataset.removeItem;
    if (remove) {
      event.preventDefault();
      const [dayNumber, index] = remove.split('-').map(Number);
      const day = programDays().find(item => item.day === dayNumber);
      if (!day) return;
      // Silinen maddeden sonrakilerin sırası kayar; tamamlanma işaretlerini birlikte kaydır.
      const marks = day.items.map((_, i) => Boolean(state.programCompleted[`${dayNumber}-${i}`]));
      day.items.splice(index, 1);
      marks.splice(index, 1);
      day.items.forEach((_, i) => {
        if (marks[i]) state.programCompleted[`${dayNumber}-${i}`] = true;
        else delete state.programCompleted[`${dayNumber}-${i}`];
      });
      delete state.programCompleted[`${dayNumber}-${day.items.length}`];
      render();
      toast('Çalışma silindi');
    }
  });
  $('#programItemForm').addEventListener('submit', event => {
    event.preventDefault();
    const day = programDays().find(item => item.day === pendingDay);
    if (!day) { closeModal('programItemDialog'); return; }
    day.items.push({
      subject: $('#programItemSubject').value,
      topic: $('#programItemTopic').value.trim(),
      practice: $('#programItemPractice').value.trim(),
      videoCount: 0,
      durationSeconds: Math.max(5, Number($('#programItemMinutes').value) || 45) * 60,
    });
    event.currentTarget.reset();
    $('#programItemMinutes').value = 45;
    closeModal('programItemDialog');
    render();
    toast('Çalışma eklendi');
  });
})();
