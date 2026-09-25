// Bulut eşitleme: localStorage'daki çalışma verisini Supabase'teki tek satırla eşitler.
// app.js'ten bağımsızdır; burada bir şey ters giderse uygulama yerel kayıtla çalışmaya devam eder.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20260925-2';

const DATA_KEY = 'odak-study-v1';
const META_KEY = 'odak-sync-meta';          // {userId, version, base, adoptBase}
const PREVIOUS_KEY = 'odak-study-v1-onceki'; // buluttan yüklemeden önceki yerel verinin kopyası
const $ = s => document.querySelector(s);

// Anahtar sırasından bağımsız karşılaştırma (Postgres jsonb anahtarları yeniden sıralar).
const stable = value => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {})
    : v);
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } };
const writeMeta = meta => localStorage.setItem(META_KEY, JSON.stringify(meta));
const localData = () => { try { return JSON.parse(localStorage.getItem(DATA_KEY)); } catch { return null; } };

const timeLabel = date => new Date(date).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const count = (data, key) => Array.isArray(data?.[key]) ? data[key].length : 0;
const programSize = data => {
  const days = Array.isArray(data?.program?.days) ? data.program.days : [];
  return { days: days.length, items: days.reduce((sum, day) => sum + (Array.isArray(day.items) ? day.items.length : 0), 0) };
};
// Çakışma ekranındaki özet: program ve hata defterleri de sayılır (önceden "0 görev" diye boş görünüyordu).
const summary = data => {
  const program = programSize(data);
  const parts = [
    program.days ? `program: ${program.days} gün / ${program.items} çalışma` : 'program yok',
    `${count(data, 'tasks')} görev`, `${count(data, 'sessions')} oturum`, `${count(data, 'exams')} deneme`,
    `${count(data, 'reviewItems')} tekrar`,
  ];
  if (count(data, 'mistakePacks')) parts.push(`${count(data, 'mistakePacks')} hata defteri`);
  return parts.join(', ');
};
// Cihazda korunmaya değer bir şey yoksa (yeni cihaz, boş başlangıç) buluttaki sormadan uygulanabilir.
const isEmptyData = data => !data || (
  ['tasks', 'sessions', 'exams', 'errorEntries', 'reviewItems', 'reviewHistory', 'weeklyReviews', 'mistakePacks'].every(key => !count(data, key))
  && !programSize(data).days);
// Geri alınabilsin diye bir tarafın kopyasını app.js'in "Önceki veriyi geri yükle" kutusuna bırakır.
const keepUndo = (reason, data) => {
  try { localStorage.setItem(DATA_KEY + '-geri-al', JSON.stringify({ reason, savedAt: new Date().toISOString(), data })); } catch {}
};
function setStatus(text, tone = '') {
  const el = $('#syncStatus');
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}
function errorText(error) {
  if (!navigator.onLine) return 'İnternet bağlantısı yok.';
  if (error?.status === 429) return 'Çok fazla deneme yapıldı; biraz bekleyip tekrar dene.';
  return error?.message || 'Bilinmeyen hata.';
}

let supabase = null;
let user = null;
let busy = false;
let again = false;
let timer = null;

// Başka bir cihazın verisi az önce yüklendiyse, app.js'in normalleştirdiği hâli taban kabul et.
{
  const meta = readMeta();
  if (meta.adoptBase) {
    const data = localData();
    meta.base = data ? stable(data) : null;
    delete meta.adoptBase;
    writeMeta(meta);
  }
}

// "Beni hatırla" işaretlenmeden giriş yapıldıysa oturum yalnızca bu tarayıcı oturumu boyunca sürer:
// girişte süresiz (oturum) bir çerez bırakılır; tarayıcı kapanıp açılınca çerez gitmiştir → oturum kapatılır.
// Buluta gönderilmiş yerel kopya da silinir (paylaşılan bilgisayar); gönderilmemiş değişiklik varsa kaybolmasın diye kalır.
const REMEMBER_KEY = 'odak-remember';
const LIVE_COOKIE = 'odak-canli';
const FORGOT_NOTE = 'odak-oturum-kapandi';
const markBrowserSession = () => { document.cookie = `${LIVE_COOKIE}=1; path=/; SameSite=Lax`; };
const browserSessionAlive = () => document.cookie.split('; ').includes(`${LIVE_COOKIE}=1`);
{
  if (localStorage.getItem(REMEMBER_KEY) === '0' && !browserSessionAlive()) {
    Object.keys(localStorage).filter(key => key.startsWith('odak-auth')).forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(REMEMBER_KEY);
    const meta = readMeta(), data = localData(), localStable = data ? stable(data) : null;
    const clean = !data || (meta.base && (localStable === meta.base || differsOnlyByNormalization(localStable, meta.base)));
    try { sessionStorage.setItem(FORGOT_NOTE, clean ? 'silindi' : 'kaldi'); } catch {}
    if (clean && data) {
      [DATA_KEY, META_KEY, PREVIOUS_KEY, DATA_KEY + '-geri-al', DATA_KEY + '-bozuk'].forEach(key => localStorage.removeItem(key));
      location.reload(); // app.js veriyi çoktan belleğe aldı; boş hâliyle yeniden başlasın
    }
  }
}
function showForgotNote() {
  let note = null;
  try { note = sessionStorage.getItem(FORGOT_NOTE); sessionStorage.removeItem(FORGOT_NOTE); } catch {}
  if (note === 'silindi') setStatus('"Beni hatırla" seçilmediği için oturumun kapatıldı ve bu tarayıcıdaki kopya silindi. Verilerin bulutta; giriş yapınca geri gelir.');
  else if (note === 'kaldi') setStatus('"Beni hatırla" seçilmediği için oturumun kapatıldı. Buluta gönderilmemiş değişikliklerin bu tarayıcıda duruyor; giriş yapınca eşitlenecek.', 'error');
}

function schedule(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => sync(), delay);
}
const PERSONAL_BUCKET = 'kisisel'; // gizli; her kullanıcı sadece <kullanıcı id>/ klasörüne erişir (supabase/kisisel-dosyalar.sql)

// Kişisel dosyayı (ör. hata defteri) gizli klasörden indirir. HTML, yeni sekme yerine sayfa içindeki
// tam ekran pencerede açılır (bazı mobil/uygulama içi tarayıcılar açılır pencereleri engelliyor).
function openPersonalFile(relPath, { type = 'application/octet-stream', download = '', title = '' } = {}) {
  if (!supabase || !user) { window.toast?.('Bu dosyayı açmak için bulut hesabına giriş yap'); return; }
  window.toast?.('Dosya açılıyor…');
  supabase.storage.from(PERSONAL_BUCKET).download(`${user.id}/${relPath}`).then(async ({ data, error }) => {
    if (error || !data) throw error || new Error('Dosya bulunamadı');
    if (type === 'text/html') {
      // Dosyanın kendi üst menüsü (siteye dön / indir) pencere içinde anlamsız; kaldır.
      const doc = new DOMParser().parseFromString(await data.text(), 'text/html');
      doc.querySelector('nav.actions')?.remove();
      $('#personalViewerTitle').textContent = title || 'Hata defteri';
      $('#personalViewerFrame').srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
      $('#personalViewer').classList.remove('hidden');
      $('#closePersonalViewer').focus();
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = download || relPath.split('/').pop();
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }).catch(error => {
    window.toast?.(`Dosya açılamadı: ${errorText(error)}`);
  });
}
const closePersonalViewer = () => { $('#personalViewer').classList.add('hidden'); $('#personalViewerFrame').srcdoc = ''; };
$('#closePersonalViewer').onclick = closePersonalViewer;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#personalViewer').classList.contains('hidden')) closePersonalViewer(); });

async function listPersonalFiles(prefix) {
  const { data, error } = await supabase.storage.from(PERSONAL_BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error; // sessizce "dosya yok" sayma: hesap silme dosyaları geride bırakırdı
  if (!data) return [];
  const paths = [];
  for (const entry of data) {
    const full = `${prefix}/${entry.name}`;
    if (entry.id) paths.push(full); else paths.push(...await listPersonalFiles(full)); // id yoksa klasör
  }
  return paths;
}

window.odakSync = { changed: () => { if (user) schedule(); }, openPersonalFile };

async function fetchRemote() {
  const { data, error } = await supabase.from('study_data')
    .select('data,version,updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function push(expectedVersion) {
  const snapshot = localData();
  if (!snapshot) return true;
  let result;
  if (expectedVersion === null) {
    result = await supabase.from('study_data')
      .insert({ user_id: user.id, data: snapshot, version: 1 }).select('version');
    if (result.error?.code === '23505') return false; // başka bir cihaz az önce oluşturdu
  } else {
    result = await supabase.from('study_data')
      .update({ data: snapshot, version: expectedVersion + 1 })
      .eq('user_id', user.id).eq('version', expectedVersion).select('version');
  }
  if (result.error) throw result.error;
  if (!result.data?.length) return false; // araya başka bir kayıt girdi
  writeMeta({ ...readMeta(), userId: user.id, version: result.data[0].version, base: stable(snapshot) });
  return true;
}

function applyRemote(remote, { keepPrevious = true } = {}) {
  const current = localStorage.getItem(DATA_KEY);
  if (keepPrevious && current) localStorage.setItem(PREVIOUS_KEY, current);
  localStorage.setItem(DATA_KEY, JSON.stringify(remote.data));
  writeMeta({ userId: user.id, version: remote.version, adoptBase: true });
  location.reload();
}

// Sürüm güncellemesinin yaptığı normalleştirme (ör. alan düzeltme) tek başına "değişiklik" sayılmasın.
function differsOnlyByNormalization(localStable, base) {
  if (!base || typeof window.normalizeState !== 'function') return false;
  try { return stable(window.normalizeState(JSON.parse(base))) === localStable; } catch { return false; }
}

// Eşitleme kararı (saf fonksiyon; ağ ve depolama yok, test edilebilir).
// meta: bu tarayıcının son eşitleme bilgisi (userId = verinin sahibi), local/remote: veriler.
export function decide({ meta, userId, local, remote }) {
  // Bu tarayıcıdaki veri başka bir hesaba aitse (o kişi çıkış yaptı, sen girdin) ASLA bu hesaba gönderilmez.
  if (meta.userId && meta.userId !== userId) return 'wipe-foreign';
  const own = meta.userId === userId ? meta : { version: 0, base: null };
  const localStable = local ? stable(local) : null;
  const dirty = localStable !== null && localStable !== own.base && !differsOnlyByNormalization(localStable, own.base);
  if (!remote) return local ? 'insert' : 'none';
  if (remote.version === own.version) return dirty ? 'update' : 'none';
  if (localStable === stable(remote.data)) return 'adopt';
  // Bu cihazda yeni bir şey yok ya da cihaz yeni ve boş: buluttakini sormadan al.
  if ((!dirty && own.version > 0) || (own.version === 0 && isEmptyData(local))) return 'apply';
  return 'conflict';
}

async function sync() {
  if (!supabase || !user) return;
  if (!$('#syncConflict').classList.contains('hidden')) return; // seçim bekleniyor
  // Çevrimdışı: ağa gitme; değişiklikler localStorage'da, 'online' olayı gelince eşitlenir.
  if (!navigator.onLine) { setStatus('Çevrimdışısın — değişikliklerin bu cihazda duruyor, internet gelince eşitlenecek.'); return; }
  if (busy) { again = true; return; }
  busy = true;
  setStatus('Eşitleniyor…');
  try {
    const meta = readMeta();
    if (meta.userId !== user.id) writeMeta({ userId: user.id, version: 0, base: null });
    const remote = await fetchRemote();
    const local = localData();
    const action = decide({ meta, userId: user.id, local, remote });
    if (action === 'wipe-foreign') {
      // Önceki kişinin verisi ve geri alma/yedek kopyaları bu hesaba kalmasın.
      [PREVIOUS_KEY, DATA_KEY + '-geri-al', DATA_KEY + '-bozuk'].forEach(key => localStorage.removeItem(key));
      if (remote) { applyRemote(remote, { keepPrevious: false }); return; }
      // Yeni hesabın bulutta verisi yok: temiz başla (sadece görünüm ayarları kalsın).
      localStorage.setItem(DATA_KEY, JSON.stringify({ settings: local?.settings || {} }));
      writeMeta({ userId: user.id, version: 0, base: null });
      location.reload();
      return;
    }
    if (action === 'insert' && !(await push(null))) { again = true; return; }
    if (action === 'update' && !(await push(remote.version))) { again = true; return; }
    if (action === 'adopt') writeMeta({ userId: user.id, version: remote.version, base: stable(local) });
    if (action === 'apply') {
      // Açık pencere / yazılan alan varken sayfayı yenileme; kullanıcının yarım işi kaybolmasın.
      if (window.odakBusy?.()) { setStatus('Başka cihazdan yeni veri var; açık pencereyi kapatınca uygulanacak.'); schedule(15000); return; }
      applyRemote(remote);
      return;
    }
    if (action === 'conflict') { showConflict(remote, local); return; }
    setStatus(`Eşitlendi · ${timeLabel(Date.now())}`, 'ok');
  } catch (error) {
    setStatus(`Eşitlenemedi: ${errorText(error)} Değişikliklerin bu cihazda duruyor, sonra tekrar denenecek.`, 'error');
  } finally {
    busy = false;
    if (again) { again = false; schedule(300); }
  }
}

function showConflict(remote, local) {
  $('#conflictRemote').textContent = `${summary(remote.data)} · son kayıt ${timeLabel(remote.updated_at)}`;
  $('#conflictLocal').textContent = summary(local);
  $('#syncConflict').classList.remove('hidden');
  setStatus('Hangi verinin kullanılacağını seçmen bekleniyor.', 'error');
  // Hangisi seçilirse seçilsin, bırakılan tarafın kopyası "Önceki veriyi geri yükle" ile geri alınabilir.
  $('#keepRemote').onclick = () => {
    $('#syncConflict').classList.add('hidden');
    if (local) keepUndo('"Buluttakini kullan" seçimi', local);
    applyRemote(remote);
  };
  $('#keepLocal').onclick = async () => {
    $('#syncConflict').classList.add('hidden');
    keepUndo('"Bu cihazdakini kullan" seçimi', remote.data);
    setStatus('Eşitleniyor…');
    try {
      if (!(await push(remote.version))) { schedule(300); return; }
      setStatus(`Eşitlendi · ${timeLabel(Date.now())}`, 'ok');
    } catch (error) {
      setStatus(`Eşitlenemedi: ${errorText(error)}`, 'error');
    }
  };
  $('#conflictBackup').onclick = () => $('#exportData').click();
}

function renderAuth() {
  $('#syncSignedOut').classList.toggle('hidden', !!user);
  $('#syncSignedIn').classList.toggle('hidden', !user);
  $('#syncPasswordForm').classList.add('hidden');
  $('#deleteAccountForm').classList.add('hidden');
  $('#accountCard').classList.toggle('hidden', !user);
  if (user) $('#syncUser').textContent = user.email;
  else setStatus('Giriş yapmadın; veriler sadece bu tarayıcıda.');
}

function authErrorText(error) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return 'E-posta veya şifre yanlış.';
  if (/already registered|already exists/i.test(message)) return 'Bu e-postayla zaten bir hesap var; "Giriş yap"a bas.';
  if (/email not confirmed/i.test(message)) return 'E-posta adresi henüz onaylanmamış.';
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return 'Şifre çok kısa ya da zayıf; en az 6 karakter kullan.';
  return errorText(error);
}

function bindAuthForm() {
  const form = $('#syncAuthForm');
  const buttons = [$('#syncSignIn'), $('#syncSignUp')];
  const credentials = () => ({ email: $('#syncEmail').value.trim(), password: $('#syncPassword').value });
  const run = async (label, action) => {
    if (!form.reportValidity()) return;
    const remember = $('#syncRemember').checked;
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    if (!remember) markBrowserSession();
    buttons.forEach(b => b.disabled = true);
    setStatus(label);
    try { await action(credentials()); } finally { buttons.forEach(b => b.disabled = false); }
  };
  form.onsubmit = event => {
    event.preventDefault();
    run('Giriş yapılıyor…', async creds => {
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) setStatus(`Giriş yapılamadı: ${authErrorText(error)}`, 'error');
      else $('#syncPassword').value = '';
    });
  };
  $('#syncSignUp').onclick = () => run('Hesap oluşturuluyor…', async creds => {
    const { data, error } = await supabase.auth.signUp(creds);
    if (error) { setStatus(`Hesap oluşturulamadı: ${authErrorText(error)}`, 'error'); return; }
    // Supabase, var olan bir e-posta için hata yerine kimliksiz bir kullanıcı döndürebilir.
    if (data.user && !data.user.identities?.length) { setStatus(authErrorText({ message: 'already registered' }), 'error'); return; }
    if (!data.session) { setStatus(`Hesap oluşturuldu. ${creds.email} adresine gelen onay bağlantısına tıkla, sonra buraya dönüp "Giriş yap"a bas.`, 'ok'); return; }
    $('#syncPassword').value = '';
  });
  $('#syncNow').onclick = () => sync();
  const passwordForm = $('#syncPasswordForm');
  const closePasswordForm = () => { passwordForm.reset(); passwordForm.classList.add('hidden'); };
  $('#syncShowPassword').onclick = () => { passwordForm.classList.remove('hidden'); $('#syncCurrentPassword').focus(); };
  $('#syncCancelPassword').onclick = closePasswordForm;
  passwordForm.onsubmit = async event => {
    event.preventDefault();
    const current = $('#syncCurrentPassword').value;
    const password = $('#syncNewPassword').value;
    if (password !== $('#syncNewPassword2').value) { setStatus('Yeni şifreler birbiriyle aynı değil.', 'error'); return; }
    if (password === current) { setStatus('Yeni şifre eskisiyle aynı olamaz.', 'error'); return; }
    const button = $('#syncSavePassword');
    button.disabled = true;
    setStatus('Mevcut şifre doğrulanıyor…');
    try {
      // Açık bırakılmış bir oturumla şifrenin değiştirilmesini önlemek için önce mevcut şifreyi doğrula.
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (check.error) {
        const wrong = /invalid login credentials/i.test(check.error.message || '');
        setStatus(wrong ? 'Mevcut şifre yanlış; şifre değiştirilmedi.' : `Şifre değiştirilemedi: ${authErrorText(check.error)}`, 'error');
        return;
      }
      // current_password: Supabase'te "mevcut şifre zorunlu" ayarı açıksa kontrol sunucuda da yapılır
      // (eski/önbellekteki bir sayfa ya da doğrudan API isteği bu adımı atlayamaz).
      const { error } = await supabase.auth.updateUser({ password, current_password: current });
      if (error) {
        const same = error.code === 'same_password' || /different from the old|same/i.test(error.message || '');
        const wrong = error.code === 'current_password_invalid' || error.code === 'current_password_required';
        setStatus(`Şifre değiştirilemedi: ${same ? 'Yeni şifre eskisiyle aynı olamaz.' : wrong ? 'Mevcut şifre yanlış.' : authErrorText(error)}`, 'error');
        return;
      }
      closePasswordForm();
      // Supabase diğer oturumları kendiliğinden kapatmıyor; hesabı ele geçiren biri varsa oturumu düşsün.
      const others = await supabase.auth.signOut({ scope: 'others' });
      setStatus(others.error
        ? 'Şifren değiştirildi, ancak diğer cihazlardaki oturumlar kapatılamadı. Diğer cihazlarda elle çıkış yap.'
        : 'Şifren değiştirildi ve diğer cihazlardaki oturumlar kapatıldı. Oralarda yeni şifrenle tekrar giriş yap.', others.error ? 'error' : 'ok');
    } finally {
      button.disabled = false;
    }
  };
  const deleteForm = $('#deleteAccountForm');
  // Hesap kartı sayfanın en altında; mesajı üstteki durum satırı yerine formun içinde göster.
  const deleteStatus = (text, tone = '') => {
    const el = $('#deleteAccountStatus');
    el.textContent = text;
    el.dataset.tone = tone;
    el.classList.toggle('hidden', !text);
  };
  const closeDeleteForm = () => { deleteForm.reset(); deleteForm.classList.add('hidden'); deleteStatus(''); $('#confirmDeleteAccount').disabled = true; };
  $('#showDeleteAccount').onclick = () => { deleteForm.classList.remove('hidden'); $('#deleteAccountPassword').focus(); };
  $('#cancelDeleteAccount').onclick = closeDeleteForm;
  $('#deleteAccountText').oninput = e => {
    // Türkçe klavyesi olmayanlar "SIL" yazabilir.
    $('#confirmDeleteAccount').disabled = !['SİL', 'SIL'].includes(e.target.value.trim().toLocaleUpperCase('tr-TR'));
  };
  deleteForm.onsubmit = async event => {
    event.preventDefault();
    const button = $('#confirmDeleteAccount');
    const passwordInput = $('#deleteAccountPassword');
    button.disabled = true;
    deleteStatus('Mevcut şifre doğrulanıyor…');
    try {
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: passwordInput.value });
      if (check.error) {
        const wrong = /invalid login credentials/i.test(check.error.message || '');
        deleteStatus(wrong ? 'Şifre yanlış. Hesabın silinmedi; şifreni kontrol edip tekrar dene.' : `Hesap silinemedi: ${authErrorText(check.error)}`, 'error');
        if (wrong) { passwordInput.focus(); passwordInput.select(); }
        button.disabled = false;
        return;
      }
      deleteStatus('Hesap siliniyor…');
      // Depolama dosyaları hesapla birlikte otomatik silinmiyor; önce kişisel klasörü boşalt.
      const files = await listPersonalFiles(user.id);
      if (files.length) {
        const { error: removeError } = await supabase.storage.from(PERSONAL_BUCKET).remove(files);
        // Dosyalar silinemezse hesabı silme; yoksa dosyalar sahipsiz kalır.
        if (removeError) { deleteStatus(`Kişisel dosyaların silinemedi, hesap silinmedi: ${errorText(removeError)}`, 'error'); button.disabled = false; return; }
      }
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
        deleteStatus(missing ? 'Hesap silme henüz sunucuda ayarlanmadı (supabase/hesap-sil.sql çalıştırılmalı). Hesap silinmedi.' : `Hesap silinemedi: ${errorText(error)}`, 'error');
        button.disabled = false;
        return;
      }
      clearTimeout(timer);
      localStorage.removeItem(META_KEY);
      localStorage.removeItem(PREVIOUS_KEY);
      await supabase.auth.signOut({ scope: 'local' });
      closeDeleteForm();
      // Hesap kartı artık gizli; kullanıcı sonucu görebilsin diye durum satırına kaydır.
      $('.sync-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.toast?.('Hesabın silindi');
      setStatus('Hesabın ve buluttaki verilerin silindi. Bu tarayıcıdaki kopya duruyor; istersen "İlerlemeyi sıfırla" ile onu da silebilirsin.', 'ok');
    } catch (error) {
      deleteStatus(`Hesap silinemedi: ${errorText(error)}`, 'error');
      button.disabled = false;
    }
  };
  $('#syncSignOut').onclick = async () => {
    // Varsayılan 'global' kapsam tüm cihazlardan çıkarır; sadece bu cihazdan çık.
    await supabase.auth.signOut({ scope: 'local' });
    setStatus('Bu cihazda çıkış yapıldı. Veriler bu tarayıcıda kalmaya devam ediyor.');
  };
  // Paylaşılan bilgisayar için: çıkış yap ve bu tarayıcıdaki kopyaları sil (bulut etkilenmez).
  $('#syncSignOutWipe').onclick = async () => {
    if (!confirm('Bu tarayıcıdaki tüm çalışma verilerin silinecek. Buluttaki verilerin korunur; tekrar giriş yapınca geri gelir. Devam edilsin mi?')) return;
    clearTimeout(timer);
    await supabase.auth.signOut({ scope: 'local' });
    [DATA_KEY, META_KEY, PREVIOUS_KEY, DATA_KEY + '-geri-al', DATA_KEY + '-bozuk'].forEach(key => localStorage.removeItem(key));
    location.reload();
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setStatus('Bulut eşitleme henüz ayarlanmadı (config.js boş). Veriler sadece bu tarayıcıda.');
    return;
  }
  try {
    // Sürüm sabit: yeni bir 2.x yayını (ya da ele geçirilmiş bir yayın) habersiz çalışmasın. Güncellerken test et.
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'odak-auth' },
    });
  } catch {
    // Kütüphane yüklenemedi (çoğunlukla internet yok ve henüz önbellekte değil): internet gelince kendiliğinden yeniden dene.
    setStatus('Çevrimdışısın ya da bulut servisine ulaşılamadı. Değişikliklerin bu cihazda kaydediliyor; internet gelince eşitlenecek.', 'error');
    window.addEventListener('online', () => main(), { once: true });
    return;
  }
  $('#syncForms').classList.remove('hidden');
  bindAuthForm();
  renderAuth();
  showForgotNote();
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user || null;
    if (next?.id === user?.id) return;
    user = next;
    renderAuth();
    // Supabase, bu geri çağırma içinde başka istek beklenmesini önermiyor; eşitlemeyi sonraya bırak.
    if (user) setTimeout(() => sync(), 0);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', () => sync());
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 120000);
}

main();
