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
  $('#syncShowPassword').onclick = () => { passwordForm.classList.remove('hidden'); $('#syncNewPassword').focus(); };
  $('#syncCancelPassword').onclick = closePasswordForm;
  passwordForm.onsubmit = async event => {
    event.preventDefault();
    const password = $('#syncNewPassword').value;
    if (password !== $('#syncNewPassword2').value) { setStatus('Yeni şifreler birbiriyle aynı değil.', 'error'); return; }
    const button = $('#syncSavePassword');
    button.disabled = true;
    const { error } = await supabase.auth.updateUser({ password });
    button.disabled = false;
    if (error) {
      const same = /different from the old|same/i.test(error.message || '');
      setStatus(`Şifre değiştirilemedi: ${same ? 'Yeni şifre eskisiyle aynı olamaz.' : authErrorText(error)}`, 'error');
      return;
    }
    closePasswordForm();
    setStatus('Şifren değiştirildi. Diğer cihazlarda bir sonraki girişte yeni şifreyi kullan.', 'ok');
  };
  $('#syncSignOut').onclick = async () => {
    await supabase.auth.signOut();
    setStatus('Çıkış yapıldı. Veriler bu tarayıcıda kalmaya devam ediyor.');
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
