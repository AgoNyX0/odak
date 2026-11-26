/* Program düzenleyici: kullanıcı çalışmaları tek tek kendisi ekler (tarih, ders, konu, ne yapacağı, kaç tane).
   Konu önerileri curriculum.js'ten gelir ama zorunlu değildir; kullanıcı kendi konusunu yazabilir.
   Program kullanıcının kendi verisinde (state.program) durur ve bulutla eşitlenir. */
(function () {
  const TOPICS = window.YKS_TOPICS || {};
  const UNIT_LABEL = { video: 'Kaç video', test: 'Kaç test', soru: 'Kaç soru', deneme: 'Kaç deneme' };
  const SHORT = { 'Temel Matematik': 'Matematik', 'Türk Dili ve Edebiyatı': 'Edebiyat', 'Din Kültürü ve Ahlak Bilgisi': 'Din Kültürü', 'Felsefe Grubu': 'Felsefe' };
  const subjectIndex = new Map(); // "GRUP · Ders" -> {group, subject, topics}

  function fillSubjects() {
    const select = $('#entrySubject');
    subjectIndex.clear();
    const groups = Object.entries(TOPICS).map(([group, subjects]) => {
      const options = Object.entries(subjects).map(([subject, topics]) => {
        const value = `${group}|${subject}`;
        subjectIndex.set(value, { group, subject, topics });
        return `<option value="${escapeHTML(value)}">${escapeHTML(SHORT[subject] || subject)}</option>`;
      }).join('');
      return `<optgroup label="${escapeHTML(group)}">${options}</optgroup>`;
    }).join('');
    select.innerHTML = `${groups}<optgroup label="Diğer"><option value="">Listede yok (kendim yazacağım)</option></optgroup>`;
  }

  function fillTopics() {
    const entry = subjectIndex.get($('#entrySubject').value);
    $('#entryTopicList').innerHTML = (entry?.topics || []).map(topic => `<option value="${escapeHTML(topic)}"></option>`).join('');
  }

  // Gizlenen alanlar devre dışı kalır; yoksa tarayıcı doğrulaması görünmeyen bir alanda takılır.
  function syncTypeFields() {
    const type = $('#entryType').value;
    const label = UNIT_LABEL[type];
    $('#entryAmountLabel').classList.toggle('hidden', !label);
    $('#entryAmount').disabled = !label;
    if (label) $('#entryAmountLabel').firstChild.textContent = label;
    const isVideo = type === 'video';
    $('#entryVideosLabel').classList.toggle('hidden', !isVideo);
    $('#entryVideos').disabled = !isVideo;
  }

  function syncCustomSubject() {
    const custom = !$('#entrySubject').value;
    $('#entryCustomLabel').classList.toggle('hidden', !custom);
    $('#entryCustomSubject').disabled = !custom;
  }

  function updateRepeatNote() {
    const on = $('#entryRepeat').checked;
    $('#entryRepeatFields').classList.toggle('hidden', !on);
    ['#entryRepeatEvery', '#entryRepeatCount'].forEach(id => { $(id).disabled = !on; });
    if (!on) return;
    const every = Math.max(1, Number($('#entryRepeatEvery').value) || 1);
    const count = Math.max(1, Number($('#entryRepeatCount').value) || 1);
    const start = $('#entryDate').value || todayKey();
    const dates = Array.from({ length: count }, (_, index) => formatShortDate(addDaysKey(start, every * (index + 1))));
    $('#entryRepeatNote').textContent = `Tekrar günleri: ${dates.slice(0, 4).join(', ')}${dates.length > 4 ? ` … (+${dates.length - 4})` : ''}`;
  }

  // Çalışmayı seçili programın (TYT veya AYT) tarihine göre doğru güne koyar; gün yoksa açar, günler tarihe göre sıralanır.
  function addItem(date, item, track = activeProgramKey()) {
    const key = track === 'ayt' ? 'ayt' : 'tyt';
    state.programs ||= { tyt: null, ayt: null };
    state.programs[key] ||= { start: date, days: [], links: {}, kicker: PROGRAM_TRACKS[key].defaultKicker, legend: '' };
    const program = state.programs[key];
    program.days ||= [];
    let day = program.days.find(entry => entry.date === date);
    if (!day) { day = { day: 0, date, items: [] }; program.days.push(day); }
    day.items.push(item);
    program.days.sort((a, b) => a.date.localeCompare(b.date));
    program.days.forEach((entry, index) => { entry.day = index + 1; });
    program.start = program.days[0].date;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

  function collect() {
    const subjectEntry = subjectIndex.get($('#entrySubject').value);
    const type = $('#entryType').value;
    const minutes = $('#entryMinutes').value === '' ? 0 : clamp($('#entryMinutes').value, 1, 600);
    const amount = UNIT_LABEL[type] ? clamp($('#entryAmount').value, 1, 500) : 0;
    const custom = $('#entryCustomSubject').value.trim();
    const videoLines = type === 'video'
      ? $('#entryVideos').value.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 30)
      : [];
    const prevByTitle = new Map((editingVideos || []).map(v => [v.title, v]));
    const videos = videoLines.map(title => prevByTitle.get(title) || { title });
    return {
      date: $('#entryDate').value,
      item: {
        id: uid(),
        subject: subjectEntry ? (SHORT[subjectEntry.subject] || subjectEntry.subject) : (custom || 'Diğer'),
        range: subjectEntry?.group || '',
        topic: $('#entryTopic').value.trim(),
        type,
        amount,
        practice: $('#entryNote').value.trim(),
        durationSeconds: minutes * 60,
        ...(videos.length ? { videos } : {}),
      },
    };
  }

  // Bir çalışmayı bulur: {track, program, day, item}
  function findItem(id) {
    for (const track of ['tyt', 'ayt']) {
      const program = state.programs?.[track];
      const day = (program?.days || []).find(entry => entry.items.some(item => item.id === id));
      if (day) return { track, program, day, item: day.items.find(item => item.id === id) };
    }
    return null;
  }

  // Çalışmayı gününden çıkarır; boş kalan gün programdan silinir (program nesnesi kalır).
  function detachItem(id) {
    const found = findItem(id);
    if (!found) return null;
    found.day.items = found.day.items.filter(item => item.id !== id);
    if (!found.day.items.length) {
      found.program.days = found.program.days.filter(entry => entry !== found.day);
      found.program.days.forEach((entry, index) => { entry.day = index + 1; });
    }
    return found;
  }

  // Düzenleme: aynı kimlik korunur, böylece tamamlanma işareti (programCompleted[id]) kaybolmaz.
  function saveEdit(date, fields, nextTrack) {
    const found = findItem(editingId);
    if (!found) { closeModal('programEntry'); return; }
    const before = JSON.stringify(state.programs);
    const old = found.item;
    const next = { ...old, ...fields, id: old.id };
    // Ders aynı kaldıysa eski aralık bilgisi (ör. "M49–56") korunur.
    if (fields.subject === old.subject) next.range = old.range;
    // Eski biçimdeki video sayısı artık adet alanında; ikisi çelişmesin.
    delete next.videoCount;
    if (!fields.videos) delete next.videos;
    detachItem(old.id);
    addItem(date, next, nextTrack);
    state.activeProgram = nextTrack;
    programWeekTarget = date;
    render();
    closeModal('programEntry');
    toast('Çalışma güncellendi', { label: 'Geri al', run: () => {
      state.programs = JSON.parse(before);
      state.activeProgram = found.track;
      programWeekTarget = found.day.date;
      render();
      toast('Değişiklik geri alındı');
    } });
  }

  function submit(keepOpen) {
    const error = $('#entryError');
    // "Ekle ve devam et" type=button olduğu için tarayıcı doğrulaması kendiliğinden çalışmıyordu (eksi süre, dev adet).
    if (!$('#entryForm').reportValidity()) return;
    const track = $('#entryProgram').value === 'ayt' ? 'ayt' : 'tyt';
    const { date, item } = collect();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2020-01-01' || date > '2100-12-31' || !item.topic) {
      error.textContent = 'Geçerli bir tarih ve konu gerekli.';
      error.classList.remove('hidden');
      return;
    }
    error.classList.add('hidden');
    if (editingId) { const { id, ...fields } = item; saveEdit(date, fields, track); return; }
    addItem(date, item, track);
    let added = 1;
    if ($('#entryRepeat').checked) {
      const every = clamp($('#entryRepeatEvery').value, 1, 120);
      const count = clamp($('#entryRepeatCount').value, 1, 30);
      for (let index = 1; index <= count; index++) {
        addItem(addDaysKey(date, every * index), { ...item, id: uid(), repeatOf: item.id, practice: item.practice || 'Tekrar' }, track);
        added++;
      }
    }
    state.activeProgram = track;
    programWeekTarget = date; // eklenen çalışmanın haftasını göster
    render();
    toast(added > 1 ? `${added} çalışma eklendi (tekrarlarla)` : 'Çalışma eklendi');
    if (keepOpen) {
      $('#entryTopic').value = '';
      $('#entryNote').value = '';
      $('#entryVideos').value = '';
      $('#entryTopic').focus();
    } else {
      closeModal('programEntry');
    }
  }

  let editingId = null; // düzenlenen çalışmanın kimliği; null ise yeni ekleme
  let editingVideos = [];

  // Form başlığı/düğmeleri ekleme ile düzenleme arasında değişir; düzenlemede "tekrar" ve "Ekle ve devam et" yok.
  function setMode(editing) {
    $('#entryTitle').textContent = editing ? 'Çalışmayı düzenle' : 'Çalışma ekle';
    $('#entrySubmit').textContent = editing ? 'Kaydet' : 'Ekle';
    $('#entrySaveMore').classList.toggle('hidden', editing);
    document.querySelector('.entry-repeat-toggle').classList.toggle('hidden', editing);
  }

  function openEdit(id) {
    const found = findItem(id);
    if (!found) return;
    const { track, day, item } = found;
    openEntry(day.date, track);
    editingId = id;
    setMode(true);
    $('#entryProgram').value = track;
    // Dersi listede bul (aynı grup önce); bulunamazsa "Listede yok" + kendi adı.
    const matches = [...subjectIndex.entries()].filter(([, entry]) => (SHORT[entry.subject] || entry.subject) === item.subject);
    const match = matches.find(([, entry]) => entry.group === item.range) || matches[0];
    $('#entrySubject').value = match ? match[0] : '';
    $('#entryCustomSubject').value = match ? '' : item.subject;
    fillTopics();
    syncCustomSubject();
    const type = PROGRAM_TYPES[item.type] ? item.type : 'video';
    $('#entryType').value = type;
    syncTypeFields();
    $('#entryTopic').value = item.topic || '';
    $('#entryAmount').value = Number(item.amount) || Number(item.videoCount) || 1;
    $('#entryMinutes').value = item.durationSeconds ? Math.round(item.durationSeconds / 60) : '';
    $('#entryNote').value = item.practice || '';
    editingVideos = Array.isArray(item.videos) ? item.videos : [];
    $('#entryVideos').value = editingVideos.map(v => v.title).join('\n');
  }

  // Her açılışta form temiz gelir (önceki tekrar/adet/tarih farkında olmadan tekrar kullanılmasın); sadece ders korunur.
  function openEntry(date, track = activeProgramKey()) {
    const key = track === 'ayt' ? 'ayt' : 'tyt';
    editingId = null;
    editingVideos = [];
    setMode(false);
    $('#entryError').classList.add('hidden');
    $('#entryProgram').value = key;
    $('#entryDate').value = date || todayKey();
    $('#entryTopic').value = '';
    $('#entryType').value = 'video';
    $('#entryAmount').value = 1;
    $('#entryMinutes').value = '';
    $('#entryNote').value = '';
    $('#entryVideos').value = '';
    $('#entryRepeat').checked = false;
    $('#entryRepeatEvery').value = 7;
    $('#entryRepeatCount').value = 3;
    if (!$('#entrySubject').options.length) fillSubjects();
    if (key === 'ayt' && $('#entrySubject').value.startsWith('TYT|') && subjectIndex.has('AYT|Matematik')) {
      $('#entrySubject').value = 'AYT|Matematik';
    } else if (key === 'tyt' && $('#entrySubject').value.startsWith('AYT|') && subjectIndex.has('TYT|Türkçe')) {
      $('#entrySubject').value = 'TYT|Türkçe';
    }
    fillTopics();
    syncTypeFields();
    syncCustomSubject();
    updateRepeatNote();
    openModal('programEntry', '#entryTopic');
  }

  fillSubjects();
  $('#entryDate').value = todayKey();
  fillTopics();
  syncTypeFields();
  syncCustomSubject();
  updateRepeatNote();

  // Ders değişince eski konu yazısı kalmasın: öneri listesi ona takılıyor ve kullanıcı elle silmek zorunda kalıyordu.
  $('#entrySubject').onchange = () => {
    $('#entryTopic').value = '';
    fillTopics();
    syncCustomSubject();
    (!$('#entrySubject').value ? $('#entryCustomSubject') : $('#entryTopic')).focus();
  };
  // Kutuya dokununca mevcut yazı seçili gelsin; yazmaya başlayınca kendiliğinden değişir.
  // Tarayıcı odaklanmanın hemen ardından seçimi sıfırlıyor; bir tik sonra seç.
  $('#entryTopic').addEventListener('focus', event => setTimeout(() => event.target.select(), 0));
  $('#entryType').onchange = syncTypeFields;
  $('#entryRepeat').onchange = updateRepeatNote;
  ['#entryRepeatEvery', '#entryRepeatCount', '#entryDate'].forEach(id => $(id).addEventListener('input', updateRepeatNote));
  $('#openEntry').onclick = () => openEntry();
  $('#openEntryEmpty').onclick = () => openEntry();
  $('#entrySaveMore').onclick = () => submit(true);
  $('#entryForm').addEventListener('submit', event => { event.preventDefault(); submit(false); });

  $('#programList').addEventListener('click', event => {
    const addDate = event.target.dataset.addItem;
    if (addDate) { openEntry(addDate); return; }
    const editId = event.target.dataset.editItem;
    if (editId) { event.preventDefault(); openEdit(editId); return; }
    const id = event.target.dataset.removeItem;
    if (!id) return;
    event.preventDefault();
    const wasDone = state.programCompleted[id];
    // Boş kalan gün programdan çıkar. Program nesnesi kalır (oynatma listesi bağlantıları vb. kaybolmasın).
    const found = detachItem(id);
    if (!found) return;
    const { track, day, item: removed } = found;
    delete state.programCompleted[id];
    render();
    // Tek dokunuşla yanlışlıkla silmeye karşı: "Geri al".
    toast('Çalışma silindi', { label: 'Geri al', run: () => {
      addItem(day.date, removed, track);
      if (wasDone) state.programCompleted[removed.id] = wasDone;
      state.activeProgram = track;
      programWeekTarget = day.date;
      render();
      toast('Çalışma geri alındı');
    } });
  });
})();
