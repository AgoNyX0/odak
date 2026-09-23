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

  // Çalışmayı tarihine göre doğru güne koyar; gün yoksa açar, günler tarihe göre sıralanır.
  function addItem(date, item) {
    state.program ||= { start: date, days: [], links: {}, kicker: 'ÇALIŞMA PROGRAMI', legend: '' };
    state.program.days ||= [];
    let day = state.program.days.find(entry => entry.date === date);
    if (!day) { day = { day: 0, date, items: [] }; state.program.days.push(day); }
    day.items.push(item);
    state.program.days.sort((a, b) => a.date.localeCompare(b.date));
    state.program.days.forEach((entry, index) => { entry.day = index + 1; });
    state.program.start = state.program.days[0].date;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

  function collect() {
    const subjectEntry = subjectIndex.get($('#entrySubject').value);
    const type = $('#entryType').value;
    const minutes = $('#entryMinutes').value === '' ? 0 : clamp($('#entryMinutes').value, 1, 600);
    const amount = UNIT_LABEL[type] ? clamp($('#entryAmount').value, 1, 500) : 0;
    const custom = $('#entryCustomSubject').value.trim();
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
      },
    };
  }

  function submit(keepOpen) {
    const error = $('#entryError');
    // "Ekle ve devam et" type=button olduğu için tarayıcı doğrulaması kendiliğinden çalışmıyordu (eksi süre, dev adet).
    if (!$('#entryForm').reportValidity()) return;
    const { date, item } = collect();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2020-01-01' || date > '2100-12-31' || !item.topic) {
      error.textContent = 'Geçerli bir tarih ve konu gerekli.';
      error.classList.remove('hidden');
      return;
    }
    error.classList.add('hidden');
    addItem(date, item);
    let added = 1;
    if ($('#entryRepeat').checked) {
      const every = clamp($('#entryRepeatEvery').value, 1, 120);
      const count = clamp($('#entryRepeatCount').value, 1, 30);
      for (let index = 1; index <= count; index++) {
        addItem(addDaysKey(date, every * index), { ...item, id: uid(), repeatOf: item.id, practice: item.practice || 'Tekrar' });
        added++;
      }
    }
    programWeekTarget = date; // eklenen çalışmanın haftasını göster
    render();
    toast(added > 1 ? `${added} çalışma eklendi (tekrarlarla)` : 'Çalışma eklendi');
    if (keepOpen) {
      $('#entryTopic').value = '';
      $('#entryNote').value = '';
      $('#entryTopic').focus();
    } else {
      closeModal('programEntry');
    }
  }

  // Her açılışta form temiz gelir (önceki tekrar/adet/tarih farkında olmadan tekrar kullanılmasın); sadece ders korunur.
  function openEntry(date) {
    $('#entryError').classList.add('hidden');
    $('#entryDate').value = date || todayKey();
    $('#entryTopic').value = '';
    $('#entryType').value = 'video';
    $('#entryAmount').value = 1;
    $('#entryMinutes').value = '';
    $('#entryNote').value = '';
    $('#entryRepeat').checked = false;
    $('#entryRepeatEvery').value = 7;
    $('#entryRepeatCount').value = 3;
    if (!$('#entrySubject').options.length) fillSubjects();
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
    const id = event.target.dataset.removeItem;
    if (!id) return;
    event.preventDefault();
    const days = state.program?.days || [];
    const day = days.find(entry => entry.items.some(item => item.id === id));
    if (!day) return;
    const removed = day.items.find(item => item.id === id);
    const wasDone = Boolean(state.programCompleted[id]);
    day.items = day.items.filter(item => item.id !== id);
    delete state.programCompleted[id];
    // Boş kalan günü programdan çıkar. Program nesnesi kalır (oynatma listesi bağlantıları vb. kaybolmasın).
    if (!day.items.length) {
      state.program.days = days.filter(entry => entry !== day);
      state.program.days.forEach((entry, index) => { entry.day = index + 1; });
    }
    render();
    // Tek dokunuşla yanlışlıkla silmeye karşı: "Geri al".
    toast('Çalışma silindi', { label: 'Geri al', run: () => {
      addItem(day.date, removed);
      if (wasDone) state.programCompleted[removed.id] = true;
      programWeekTarget = day.date;
      render();
      toast('Çalışma geri alındı');
    } });
  });
})();
