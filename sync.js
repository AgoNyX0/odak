// Bulut eşitleme: localStorage'daki çalışma verisini Supabase'teki tek satırla eşitler.
// app.js'ten bağımsızdır; burada bir şey ters giderse uygulama yerel kayıtla çalışmaya devam eder.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

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
const summary = data => {
  const n = k => Array.isArray(data?.[k]) ? data[k].length : 0;
  return `${n('tasks')} görev, ${n('sessions')} çalışma oturumu, ${n('exams')} deneme, ${n('reviewItems')} tekrar`;
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

function schedule(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => sync(), delay);
}
window.odakSync = { changed: () => { if (user) schedule(); } };

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

function applyRemote(remote) {
  const current = localStorage.getItem(DATA_KEY);
  if (current) localStorage.setItem(PREVIOUS_KEY, current);
  localStorage.setItem(DATA_KEY, JSON.stringify(remote.data));
  writeMeta({ ...readMeta(), userId: user.id, version: remote.version, adoptBase: true });
  location.reload();
}

async function sync() {
  if (!supabase || !user) return;
  if (!$('#syncConflict').classList.contains('hidden')) return; // seçim bekleniyor
  if (busy) { again = true; return; }
  busy = true;
  setStatus('Eşitleniyor…');
  try {
    let meta = readMeta();
    if (meta.userId !== user.id) { meta = { userId: user.id, version: 0, base: null }; writeMeta(meta); }
    const remote = await fetchRemote();
    const local = localData();
    const localStable = local ? stable(local) : null;
    const dirty = localStable !== null && localStable !== meta.base;

    if (!remote) {
      if (local && !(await push(null))) { again = true; return; }
    } else if (remote.version === meta.version) {
      if (dirty && !(await push(remote.version))) { again = true; return; }
    } else if (localStable === stable(remote.data)) {
      writeMeta({ ...meta, version: remote.version, base: localStable });
    } else if (!dirty && meta.version > 0) {
      applyRemote(remote);
      return;
    } else {
      showConflict(remote, local);
      return;
    }
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
  $('#keepRemote').onclick = () => { $('#syncConflict').classList.add('hidden'); applyRemote(remote); };
  $('#keepLocal').onclick = async () => {
    $('#syncConflict').classList.add('hidden');
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const same = /different from the old|same/i.test(error.message || '');
        setStatus(`Şifre değiştirilemedi: ${same ? 'Yeni şifre eskisiyle aynı olamaz.' : authErrorText(error)}`, 'error');
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
  const closeDeleteForm = () => { deleteForm.reset(); deleteForm.classList.add('hidden'); $('#confirmDeleteAccount').disabled = true; };
  $('#showDeleteAccount').onclick = () => { deleteForm.classList.remove('hidden'); $('#deleteAccountPassword').focus(); };
  $('#cancelDeleteAccount').onclick = closeDeleteForm;
  $('#deleteAccountText').oninput = e => {
    // Türkçe klavyesi olmayanlar "SIL" yazabilir.
    $('#confirmDeleteAccount').disabled = !['SİL', 'SIL'].includes(e.target.value.trim().toLocaleUpperCase('tr-TR'));
  };
  deleteForm.onsubmit = async event => {
    event.preventDefault();
    const button = $('#confirmDeleteAccount');
    button.disabled = true;
    setStatus('Mevcut şifre doğrulanıyor…');
    try {
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: $('#deleteAccountPassword').value });
      if (check.error) {
        const wrong = /invalid login credentials/i.test(check.error.message || '');
        setStatus(wrong ? 'Mevcut şifre yanlış; hesap silinmedi.' : `Hesap silinemedi: ${authErrorText(check.error)}`, 'error');
        button.disabled = false;
        return;
      }
      setStatus('Hesap siliniyor…');
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
        setStatus(missing ? 'Hesap silme henüz sunucuda ayarlanmadı (supabase/hesap-sil.sql çalıştırılmalı). Hesap silinmedi.' : `Hesap silinemedi: ${errorText(error)}`, 'error');
        button.disabled = false;
        return;
      }
      clearTimeout(timer);
      localStorage.removeItem(META_KEY);
      localStorage.removeItem(PREVIOUS_KEY);
      await supabase.auth.signOut({ scope: 'local' });
      closeDeleteForm();
      setStatus('Hesabın ve buluttaki verilerin silindi. Bu tarayıcıdaki kopya duruyor; istersen "İlerlemeyi sıfırla" ile onu da silebilirsin.', 'ok');
    } catch (error) {
      setStatus(`Hesap silinemedi: ${errorText(error)}`, 'error');
      button.disabled = false;
    }
  };
  $('#syncSignOut').onclick = async () => {
    // Varsayılan 'global' kapsam tüm cihazlardan çıkarır; sadece bu cihazdan çık.
    await supabase.auth.signOut({ scope: 'local' });
    setStatus('Bu cihazda çıkış yapıldı. Veriler bu tarayıcıda kalmaya devam ediyor.');
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setStatus('Bulut eşitleme henüz ayarlanmadı (config.js boş). Veriler sadece bu tarayıcıda.');
    return;
  }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'odak-auth' },
    });
  } catch {
    setStatus('Bulut servisine ulaşılamadı. Veriler bu tarayıcıda kaydediliyor; sayfayı yenileyince tekrar denenecek.', 'error');
    return;
  }
  $('#syncForms').classList.remove('hidden');
  bindAuthForm();
  renderAuth();
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
