/* Ders ilerlemesi: programdaki konu videolarının ve testlerin yüzde kaçı tamamlandı (ders ders).
   Kısa hâli Program ekranının üstünde (#programSubjectProgress), ayrıntılı hâli İlerleme ekranında (#subjectProgressList).
   Hesap kullanıcının kendi programından yapılır; programda olmayan konular (ör. bilinen ve elenmiş konular) sayılmaz. */
function subjectProgress() {
  const rows = new Map();
  programDays().forEach(day => day.items.forEach(item => {
    if (item.type === 'deneme') return;
    const name = canonicalSubject(item.subject) || String(item.subject || 'Diğer');
    const row = rows.get(name) || { name, videos: 0, videosDone: 0, tests: 0, testsDone: 0 };
    const done = Boolean(state.programCompleted[item.id]);
    const videos = itemVideoCount(item);
    if (videos) { row.videos += videos; if (done) row.videosDone += videos; }
    if (item.type === 'test') { const tests = Number(item.amount) || 0; row.tests += tests; if (done) row.testsDone += tests; }
    rows.set(name, row);
  }));
  const order = SUBJECTS.map(subject => subject.name);
  return [...rows.values()].filter(row => row.videos || row.tests)
    .sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
}

const progressPct = (done, total) => total ? Math.round(done / total * 100) : 0;

function renderSubjectProgress() {
  const rows = subjectProgress();
  const mini = document.querySelector('#programSubjectProgress');
  const list = document.querySelector('#subjectProgressList');
  if (mini) {
    mini.classList.toggle('hidden', !rows.length);
    mini.innerHTML = rows.map(row => {
      const color = subjectMeta(row.name).color, konu = progressPct(row.videosDone, row.videos);
      const test = row.tests ? `<small>Test %${progressPct(row.testsDone, row.tests)}</small>` : '<small>&nbsp;</small>';
      return `<div class="sp-mini" style="--sp-color:${color}" title="${escapeHTML(row.name)}: konu videolarının %${konu}'i${row.tests ? `, testlerin %${progressPct(row.testsDone, row.tests)}'i` : ''} tamamlandı">
        <span>${escapeHTML(row.name)}</span><strong>%${konu}</strong><div class="sp-bar"><i style="width:${konu}%"></i></div>${test}
      </div>`;
    }).join('');
  }
  if (list) {
    document.querySelector('#subjectProgressEmpty')?.classList.toggle('hidden', rows.length > 0);
    list.innerHTML = rows.map(row => {
      const color = subjectMeta(row.name).color;
      const bar = (label, done, total, unit) => `<div class="sp-line"><span>${label}</span><div class="sp-bar"><i style="width:${progressPct(done, total)}%"></i></div><b>%${progressPct(done, total)}</b><small>${done}/${total} ${unit}</small></div>`;
      return `<div class="sp-row" style="--sp-color:${color}">
        <strong>${escapeHTML(row.name)}</strong>
        ${row.videos ? bar('Konu', row.videosDone, row.videos, 'video') : ''}
        ${row.tests ? bar('Test', row.testsDone, row.tests, 'test') : ''}
      </div>`;
    }).join('');
  }
}
renderSubjectProgress();
