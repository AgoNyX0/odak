const STORAGE_KEY = 'odak-study-v1';
// index.html'deki ?v= sürüm etiketi (servis çalışanı aynı sürümün dosyalarını önbelleğe alır).
const ASSET_VERSION = (() => { try { return new URL(document.currentScript.src).searchParams.get('v') || 'dev'; } catch { return 'dev'; } })();
const localDateKey = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const todayKey = () => localDateKey();
const dateFromKey = key => { const [year,month,day]=key.split('-').map(Number); return new Date(year,month-1,day,12); };
const addDaysKey = (key,days) => { const date=dateFromKey(key); date.setDate(date.getDate()+days); return localDateKey(date); };
const weekStartKey = (date=new Date()) => { const start=new Date(date); start.setHours(12,0,0,0); start.setDate(start.getDate()-((start.getDay()+6)%7)); return localDateKey(start); };
const uid = () => Math.random().toString(36).slice(2,9);
const seed = {
  dailyTarget: 120,
  tasks: [],
  sessions: [],
  exams: [],
  errorEntries: [],
  reviewItems: [],
  reviewHistory: [],
  weeklyReviews: [],
  examTarget: 90,
  settings: {theme:'dark',accent:'indigo',focus:25,shortBreak:5,longBreak:15,sound:true,reduceMotion:false}
};
// Veri nereden gelirse gelsin (bu tarayıcı, yedek dosyası, bulut) önce buradan geçer:
// - Şablonlara kaçışsız giren alanlar (kimlik, tarih, saat, sayı, tür) güvenli biçime zorlanır → XSS kapanır.
// - Yanlış türdeki alanlar düzeltilir → uygulama açılışta çökmez, bozuk veri buluta yayılmaz.
const SAFE_ID=/^[A-Za-z0-9_-]{1,64}$/, DATE_RE=/^\d{4}-\d{2}-\d{2}$/, TIME_RE=/^\d{1,2}:\d{2}$/, ISO_RE=/^[0-9T:.+\-Z]{1,40}$/, WORD_RE=/^[A-Za-z-]{1,24}$/;
const NUM_KEYS=new Set(['minutes','amount','videoCount','durationSeconds','correct','wrong','blank','net','count','stage','previousStage','nextStage','lapses','reviewCount','intervalDays','score','duration','day','dailyTarget','examTarget','focus','shortBreak','longBreak']);
const NULLABLE_NUM=new Set(['score','duration']);
const DATE_KEYS=new Set(['date','dueDate','nextDueDate','doneDate','week','start','weekStart']);
const ISO_KEYS=new Set(['createdAt','reviewedAt','lastReviewedAt','exportedAt','updatedAt']);
const WORD_KEYS=new Set(['type','cause','outcome','status','sourceType','mode','theme','accent','kind','rating']);
const LIST_KEYS=['tasks','sessions','exams','errorEntries','reviewItems','reviewHistory','weeklyReviews'];
const isPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function sanitizeNode(value,key=''){
  if(Array.isArray(value)){
    if(key==='errorIds')return value.filter(id=>typeof id==='string'&&SAFE_ID.test(id));
    return value.map(item=>sanitizeNode(item,key)).filter(item=>item!==undefined);
  }
  if(isPlain(value)){
    const out={};
    for(const [k,v] of Object.entries(value))out[k]=sanitizeNode(v,k);
    return out;
  }
  if(k_isId(key))return typeof value==='string'&&SAFE_ID.test(value)?value:(key==='id'?uid():null);
  if(NUM_KEYS.has(key)){if(value===null&&NULLABLE_NUM.has(key))return null;const n=Number(value);return Number.isFinite(n)?n:(NULLABLE_NUM.has(key)?null:0);}
  if(DATE_KEYS.has(key))return typeof value==='string'&&DATE_RE.test(value)?value:todayKey();
  if(key==='time')return typeof value==='string'&&TIME_RE.test(value)?value:'00:00';
  if(ISO_KEYS.has(key))return typeof value==='string'&&ISO_RE.test(value)?value:null;
  if(WORD_KEYS.has(key))return typeof value==='string'&&WORD_RE.test(value)?value:'';
  return value;
}
function k_isId(key){return key==='id'||key==='repeatOf'||/Id$/.test(key);}
function normalizeState(raw){
  const data=sanitizeNode(isPlain(raw)?raw:{});
  LIST_KEYS.forEach(k=>{data[k]=Array.isArray(data[k])?data[k].filter(isPlain):[];});
  data.programCompleted=isPlain(data.programCompleted)?data.programCompleted:{};
  data.mistakePacks=Array.isArray(data.mistakePacks)?data.mistakePacks.filter(isPlain):[];
  if(isPlain(data.program)&&Array.isArray(data.program.days)){
    data.program.days=data.program.days.filter(isPlain).map(day=>({...day,items:Array.isArray(day.items)?day.items.filter(isPlain):[]}));
    // Oynatma listesi bağlantıları yalnızca https olabilir (javascript: vb. engellenir).
    const links=isPlain(data.program.links)?data.program.links:{};
    data.program.links=Object.fromEntries(Object.entries(links).filter(([,url])=>typeof url==='string'&&/^https:\/\//i.test(url)));
  }else data.program=null;
  const clamp=(v,min,max,fallback)=>Number.isFinite(v)&&v>=min&&v<=max?v:fallback;
  data.dailyTarget=clamp(data.dailyTarget,15,720,120);
  data.examTarget=clamp(data.examTarget,1,200,90);
  const s={...seed.settings,...(isPlain(data.settings)?data.settings:{})};
  s.focus=clamp(s.focus,5,180,25);s.shortBreak=clamp(s.shortBreak,1,30,5);s.longBreak=clamp(s.longBreak,5,60,15);
  s.sound=Boolean(s.sound);s.reduceMotion=Boolean(s.reduceMotion);
  if(!['dark','light'].includes(s.theme))s.theme='dark';
  if(!['indigo','green','orange','pink'].includes(s.accent))s.accent='indigo';
  data.settings=s;
  data.dataVersion=2;
  return data;
}
let state;
{
  const raw=localStorage.getItem(STORAGE_KEY);
  let parsed=null;
  try{parsed=raw?JSON.parse(raw):null;}
  catch{
    // Okunamayan veriyi silme: kopyasını sakla ve bu cihazı buluta göre yeniden eşitlenecek "yeni cihaz" yap.
    localStorage.setItem(STORAGE_KEY+'-bozuk',raw);
    localStorage.removeItem('odak-sync-meta');
  }
  state=normalizeState(parsed||seed);
}
// Eski sürüm her yeni kullanıcıya örnek görevler ve bir örnek oturum ekliyordu; birebir eşleşenleri bir kez temizle.
if(!state.seedSamplesCleaned){
  const SEED_TASKS=[['Trigonometri konu tekrarı','Matematik',40],['Hücre bölünmesi soru çözümü','Biyoloji',30],['Paragraf denemesi','Türkçe',25]];
  const isSeedTask=t=>!t.source&&SEED_TASKS.some(([title,subject,minutes])=>t.title===title&&t.subject===subject&&t.minutes===minutes);
  // Örnek oturum her zaman örnek görevlerle birlikte eklenirdi; görevler yoksa gerçek bir oturumu silme.
  const hadSeedTasks=state.tasks.some(isSeedTask);
  state.tasks=state.tasks.filter(t=>!isSeedTask(t));
  if(hadSeedTasks)state.sessions=state.sessions.filter(s=>!(s.subject==='Türkçe'&&s.minutes===25&&s.time==='09:20'&&Object.keys(s).sort().join()==='date,id,minutes,subject,time'));
  state.seedSamplesCleaned=true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); window.odakSync?.changed(); };
// Kullanıcı bir pencerede ya da bir alanda yazıyorsa buluttan gelen güncelleme (sayfa yenileme) beklesin.
window.odakBusy=()=>Boolean(document.querySelector('.modal-backdrop:not(.hidden)')||document.activeElement?.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,select'));
// Başka bir sekme veriyi değiştirdiyse bu sekmenin bellekteki eski kopyası onu ezmesin: yeni veriyi al.
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY||event.newValue===null)return;
  try{state=normalizeState(JSON.parse(event.newValue));}catch{return;}
  render();
});

const $ = s => document.querySelector(s);
const taskList=$('#taskList'), taskForm=$('#taskForm'), timerSubject=$('#timerSubject');
let timer={total:1500,left:1500,running:false,id:null,isFocus:true};

function escapeHTML(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
// action: {label, run} → bildirimde bir düğme (ör. "Geri al"). Önceki bildirimin zamanlayıcısı yenisini erken kapatmasın.
function toast(message,action){
  const t=$('#toast');t.textContent=message;
  if(action){const button=document.createElement('button');button.type='button';button.className='toast-action';button.textContent=action.label;button.onclick=()=>{t.classList.remove('show');action.run();};t.append(button);}
  t.classList.toggle('has-action',Boolean(action));t.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),action?6000:2200);
}
function formatMinutes(min){if(min<60)return `${min} dk`;const h=Math.floor(min/60),m=min%60;return m?`${h} sa ${m} dk`:`${h} sa`;}
function dayLabel(date){return ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][date.getDay()];}
const SUBJECTS=[
  {name:'Matematik',color:'#6c7cff'},
  {name:'Türkçe',color:'#18b892'},
  {name:'Fizik',color:'#3b9dd8'},
  {name:'Kimya',color:'#ad8cff'},
  {name:'Biyoloji',color:'#58d6a6'},
  {name:'Sosyal',color:'#f08b45'}
];
// Kişisel çalışma programı koda gömülü değil: her kullanıcının kendi verisinde (state.program) durur ve bulutla eşitlenir.
// Biçim: {start:'YYYY-MM-DD', links:{Ders:url}, days:[{day,date,items:[{subject,range,topic,practice,videoCount,durationSeconds}]}]}
function formatVideoDuration(seconds){const minutes=Math.round(seconds/60),hours=Math.floor(minutes/60),rest=minutes%60;return hours?(rest?`${hours} sa ${rest} dk`:`${hours} sa`):`${minutes} dk`;}
const programDays=()=>Array.isArray(state.program?.days)?state.program.days:[];
const programLink=subject=>state.program?.links?.[subject]||'';
// programWeekNeedsFocus: ilk açılışta bugünün (ya da sıradaki günün) haftasını göster.
// programWeekTarget: program-editor bir tarih ekleyince o haftaya geç.
let programFilter='all',programWeek=0,programWeekNeedsFocus=true,programWeekTarget=null;
// Uzun listeler (denemeler, hata kayıtları, yaklaşan tekrarlar) kısaltılıyor ama eskilere de ulaşılabilsin.
const listExpanded={exams:false,mistakes:false,upcoming:false};
function moreButton(key,total,limit){
  if(total<=limit)return '';
  return `<button class="show-more" type="button" data-show-more="${key}">${listExpanded[key]?'Daha az göster':`Tümünü göster (${total})`}</button>`;
}
document.addEventListener('click',event=>{
  const key=event.target.dataset?.showMore;
  if(!key||!(key in listExpanded))return;
  listExpanded[key]=!listExpanded[key];render();
});
const REVIEW_INTERVALS=[1,3,7,14,30,60];
const REASON_META={
  knowledge:{label:'Bilgi eksiği',minutes:35,task:'konu tekrarı + 10 soru'},
  method:{label:'Yöntem',minutes:30,task:'yöntem çalışması + 10 soru'},
  calculation:{label:'İşlem',minutes:30,task:'işlem pratiği · 15 soru'},
  attention:{label:'Dikkat',minutes:20,task:'kontrollü çözüm · 10 soru'},
  time:{label:'Süre',minutes:25,task:'süreli mini deneme'}
};
const normalizeText=value=>String(value||'').trim().toLocaleLowerCase('tr-TR');
const formatShortDate=key=>dateFromKey(key).toLocaleDateString('tr-TR',{day:'numeric',month:'short'});
const SUBJECT_ALIASES=new Map([
  ['mat','Matematik'],['matematik','Matematik'],['geometri','Matematik'],
  ['türkçe','Türkçe'],['turkce','Türkçe'],['edebiyat','Türkçe'],['paragraf','Türkçe'],
  ['fizik','Fizik'],['kimya','Kimya'],['biyoloji','Biyoloji'],
  ['sosyal','Sosyal'],['tarih','Sosyal'],['coğrafya','Sosyal'],['cografya','Sosyal'],['felsefe','Sosyal'],['din','Sosyal'],['din kültürü','Sosyal']
]);
function canonicalSubject(value){return SUBJECT_ALIASES.get(normalizeText(value))||null;}
function subjectMeta(value){const canonical=canonicalSubject(value);return SUBJECTS.find(subject=>subject.name===canonical)||{name:String(value||'Diğer'),color:'#8b95ad'};}
state.tasks.forEach(task=>{const canonical=canonicalSubject(task.subject);if(canonical)task.subject=canonical;});

function getErrorGroups(){
  const groups=new Map();
  state.errorEntries.filter(entry=>entry.status==='open').forEach(entry=>{
    const key=`${normalizeText(entry.subject)}|${normalizeText(entry.topic)}|${entry.cause}`;
    const current=groups.get(key)||{subject:entry.subject,topic:entry.topic,cause:entry.cause,count:0,examIds:new Set(),errorIds:[],latest:''};
    current.count+=entry.count;current.examIds.add(entry.examId);current.errorIds.push(entry.id);current.latest=current.latest>entry.createdAt?current.latest:entry.createdAt;groups.set(key,current);
  });
  const weights={knowledge:3,time:2.5,method:2.2,calculation:2,attention:1.5};
  return [...groups.values()].map(group=>({...group,score:group.count*(weights[group.cause]||1)+Math.max(0,group.examIds.size-1)*3})).sort((a,b)=>b.score-a.score||b.latest.localeCompare(a.latest));
}

function getNextAction(){
  const suggestion=getErrorGroups()[0];
  if(suggestion){
    const meta=REASON_META[suggestion.cause]||REASON_META.knowledge;
    return {kind:'error',title:`${suggestion.topic} ${meta.task}`,subject:suggestion.subject,minutes:meta.minutes,errorIds:suggestion.errorIds,reason:suggestion.examIds.size>1?`${suggestion.examIds.size} denemede tekrarlandı · ${meta.label}`:`${suggestion.count} soru · ${meta.label}`};
  }
  const task=state.tasks.find(item=>item.date===todayKey()&&!item.done);
  if(task)return {kind:'task',title:task.title,subject:task.subject,minutes:task.minutes,reason:`Bugünkü planında sırada · ${task.minutes} dk`,taskId:task.id};
  return {kind:'empty',title:'Planından devam et',reason:'Bugünkü ilk küçük hedefini seç.'};
}

function renderCapacity(){
  const todays=state.tasks.filter(task=>task.date===todayKey());
  const planned=todays.reduce((sum,task)=>sum+task.minutes,0);
  const percent=Math.round(planned/state.dailyTarget*100);
  $('#capacityLabel').textContent=`Bugün ${planned} dk planlandı`;
  $('#capacityStatus').textContent=`${state.dailyTarget} dk kapasite`;
  $('#capacityBar').style.width=`${Math.min(100,percent)}%`;
  $('#capacityCard').classList.toggle('over-capacity',planned>state.dailyTarget);
  $('#capacityCard').classList.toggle('at-capacity',planned===state.dailyTarget);
  $('#capacityHint').textContent=planned>state.dailyTarget?`${planned-state.dailyTarget} dk kapasitenin üzerinde.`:planned===state.dailyTarget?'Planın kapasitenle tam dengede.':`Bugün için ${state.dailyTarget-planned} dk boşluğun var.`;
  return planned;
}

function renderTodayActions(){
  const action=getNextAction();
  $('#todayNextTitle').textContent=action.title;$('#todayNextReason').textContent=action.reason;
  $('#acceptNextAction').textContent=action.kind==='task'?'Odaklan':action.kind==='error'?'Plana ekle':'Görev ekle';
  $('#acceptNextAction').dataset.actionKind=action.kind;
  $('#acceptNextAction').dataset.taskId=action.taskId||'';
  const due=state.reviewItems.filter(item=>item.status==='active'&&item.dueDate<=todayKey());
  $('#todayReviewCount').textContent=due.length;
  $('#todayReviewText').textContent=due.length?`Yaklaşık ${Math.max(2,due.length*2)} dakika.`:'Tekrar kuyruğun boş.';
}

function renderReviews(){
  const today=todayKey();
  const active=state.reviewItems.filter(item=>item.status==='active');
  const due=active.filter(item=>item.dueDate<=today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.stage-b.stage||a.createdAt.localeCompare(b.createdAt));
  const upcomingAll=active.filter(item=>item.dueDate>today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const upcoming=upcomingAll.slice(0,listExpanded.upcoming?Infinity:8);
  const weekStart=weekStartKey();
  const weeklyDone=state.reviewHistory.filter(entry=>localDateKey(new Date(entry.reviewedAt))>=weekStart).length;
  $('#dueReviewStat').textContent=`${due.length} tekrar`;$('#weeklyReviewStat').textContent=`${weeklyDone} tekrar`;
  $('#nextReviewStat').textContent=upcoming.length?formatShortDate(upcoming[0].dueDate):'—';
  $('#dueReviewList').innerHTML=due.map(item=>`<article class="review-item" data-review-id="${item.id}"><div class="review-item-head"><span>${escapeHTML(item.subject)}</span><small>${item.dueDate<today?'Gecikti':'Bugün'}</small></div><h3>${escapeHTML(item.topic)}</h3><p>Bakmadan bu konu hakkında neleri hatırlıyorsun?</p><textarea class="review-recall" maxlength="280" placeholder="Kısa bir cevap yazabilirsin…" aria-label="${escapeHTML(item.topic)} için hatırladıkların"></textarea><div class="review-reveal"><button class="secondary-btn" type="button" data-reveal-review="${item.id}">${item.referenceText?'Notumla karşılaştır':'Kendimi değerlendir'}</button><button class="text-btn" type="button" data-snooze-review="${item.id}">Yarına ertele</button></div><div class="review-answer hidden" data-review-answer="${item.id}"><p>${item.referenceText?escapeHTML(item.referenceText):'Kendi hatırlamana göre değerlendir.'}</p><div class="rating-row"><button type="button" data-rate-review="${item.id}" data-rating="forgot">Unuttum</button><button type="button" data-rate-review="${item.id}" data-rating="hard">Zorlandım</button><button type="button" data-rate-review="${item.id}" data-rating="remembered">Hatırladım</button></div></div></article>`).join('');
  $('#emptyDueReviews').classList.toggle('hidden',due.length>0);
  $('#upcomingReviewList').innerHTML=upcoming.map(item=>`<div class="upcoming-review"><span><strong>${escapeHTML(item.topic)}</strong><small>${escapeHTML(item.subject)}</small></span><time datetime="${item.dueDate}">${formatShortDate(item.dueDate)}</time><button type="button" data-archive-review="${item.id}" aria-label="${escapeHTML(item.topic)} tekrarını arşivle">×</button></div>`).join('')+moreButton('upcoming',upcomingAll.length,8);
  $('#emptyUpcomingReviews').classList.toggle('hidden',upcoming.length>0);
}

// state.mistakePacks: [{id,label,title,summary,htmlPath,pdfPath,pdfName}] — yollar kullanıcının gizli klasörüne göre.
function renderMistakePacks(){
  const packs=Array.isArray(state.mistakePacks)?state.mistakePacks:[];
  $('#mistakePacks').innerHTML=packs.map(pack=>`<div class="mistake-practice-pack"><div><span class="mistake-pack-label">${escapeHTML(pack.label||'')}</span><strong>${escapeHTML(pack.title||'Hata defteri')}</strong><small>${escapeHTML(pack.summary||'')}</small></div><div class="mistake-pack-actions">${pack.htmlPath?`<button class="mistake-pack-link" type="button" data-pack-open="${escapeHTML(pack.id)}">Önizle ↗</button>`:''}${pack.pdfPath?`<button class="mistake-pack-download" type="button" data-pack-pdf="${escapeHTML(pack.id)}">PDF indir ↓</button>`:''}</div></div>`).join('');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-pack-open],[data-pack-pdf]');
  if(!button)return;
  const id=button.dataset.packOpen||button.dataset.packPdf,pack=(state.mistakePacks||[]).find(item=>item.id===id);
  if(!pack)return;
  if(!window.odakSync?.openPersonalFile){toast('Bu dosya için bulut hesabına giriş yapmalısın');return;}
  if(button.dataset.packOpen)window.odakSync.openPersonalFile(pack.htmlPath,{type:'text/html',title:[pack.label,pack.title].filter(Boolean).join(' · ')});
  else window.odakSync.openPersonalFile(pack.pdfPath,{type:'application/pdf',download:pack.pdfName||'hata-defteri.pdf'});
});
function renderMistakes(){
  renderMistakePacks();
  const exams=[...state.exams].sort((a,b)=>b.date.localeCompare(a.date));
  const selected=$('#mistakeExam').value;
  $('#mistakeExam').innerHTML=exams.map(exam=>`<option value="${exam.id}">${escapeHTML(exam.name)} · ${exam.type}</option>`).join('');
  if(exams.some(exam=>exam.id===selected))$('#mistakeExam').value=selected;
  $('#openMistakeForm').disabled=exams.length===0;
  const current=state.errorEntries.filter(entry=>entry.status!=='reviewed');
  const reasonCounts=Object.keys(REASON_META).map(key=>({key,count:current.filter(entry=>entry.cause===key).reduce((sum,entry)=>sum+entry.count,0)})).filter(item=>item.count);
  $('#mistakeReasonSummary').innerHTML=reasonCounts.map(item=>`<span><strong>${item.count}</strong> ${REASON_META[item.key].label}</span>`).join('');
  $('#mistakeList').innerHTML=[...state.errorEntries].reverse().slice(0,listExpanded.mistakes?Infinity:6).map(entry=>`<div class="mistake-entry"><span class="mistake-dot ${entry.cause}"></span><div><strong>${escapeHTML(entry.subject)} · ${escapeHTML(entry.topic)}</strong><small>${REASON_META[entry.cause]?.label||'Hata'} · ${entry.count} ${entry.outcome==='blank'?'boş':'yanlış'}${entry.status==='planned'?' · Planda':entry.status==='reviewed'?' · Tekrar edildi':''}</small></div><button type="button" data-delete-mistake="${entry.id}" aria-label="Hata kaydını sil">×</button></div>`).join('')+moreButton('mistakes',state.errorEntries.length,6);
  $('#emptyMistakes').textContent=exams.length?'Henüz hata kaydı yok.':'Hata defterini kullanmak için önce bir deneme sonucu ekle.';
  $('#emptyMistakes').classList.toggle('hidden',state.errorEntries.length>0);
  const next=getNextAction();
  const isSuggestion=next.kind==='error';
  $('#examNextTitle').textContent=isSuggestion?next.title:'İlk hata kaydını ekle';
  $('#examNextReason').textContent=isSuggestion?next.reason:'Hata nedenlerini kaydettiğinde sana küçük ve uygulanabilir bir çalışma önereceğim.';
  $('#addSuggestedTask').disabled=!isSuggestion;
}

function renderWeeklyReview(){
  const key=weekStartKey();
  const review=state.weeklyReviews.find(item=>item.weekStart===key);
  $('#weeklyReviewForm').classList.toggle('hidden',Boolean(review));
  $('#lastWeeklyReview').classList.toggle('hidden',!review);
  if(review)$('#lastWeeklyReview').innerHTML=`<div><span>Bu haftanın özeti</span><strong>${escapeHTML(review.win)}</strong></div><div><span>Takıldığın yer</span><strong>${escapeHTML(review.block)}</strong></div><div><span>Tek değişiklik</span><strong>${escapeHTML(review.change)}</strong></div><button class="secondary-btn" type="button" id="editWeeklyReview">Düzenle</button>`;
}

// Tamamlanma işaretleri çalışmanın kalıcı kimliğine bağlı: araya gün/çalışma eklenince kaymaz.
// Eski programlar "gün-sıra" anahtarı kullanıyordu; bir kez kimliklere çevriliyor.
function ensureProgramIds(){
  const days=state.program?.days;
  if(!Array.isArray(days))return;
  let changed=false;
  days.forEach(day=>day.items.forEach((item,index)=>{
    if(item.id)return;
    item.id=uid();
    const legacy=`${day.day}-${index}`;
    if(state.programCompleted[legacy]){delete state.programCompleted[legacy];state.programCompleted[item.id]=true;}
    changed=true;
  }));
  if(changed)save();
}
ensureProgramIds();
function programDayDone(day){return day.items.length>0&&day.items.every(item=>state.programCompleted[item.id]);}
// Çalışma türleri: kullanıcı ne yapacağını ve kaç tane olduğunu kendisi giriyor.
const PROGRAM_TYPES={video:{label:'Konu videosu',unit:'video'},test:{label:'Test çöz',unit:'test'},soru:{label:'Soru çöz',unit:'soru'},tekrar:{label:'Konu tekrarı',unit:''},deneme:{label:'Deneme',unit:'deneme'}};
// Eski biçim videoCount, yeni biçim type:'video' + amount.
const itemVideoCount=item=>Number(item.videoCount)||(item.type==='video'?Number(item.amount)||0:0);
function programAmountLabel(item){
  if(item.amount&&PROGRAM_TYPES[item.type]?.unit)return `${item.amount} ${PROGRAM_TYPES[item.type].unit}`;
  if(item.videoCount)return `${item.videoCount} video`;
  return PROGRAM_TYPES[item.type]?.label||'';
}
function programSummary(days){
  const first=dateFromKey(days[0].date),last=dateFromKey(days.at(-1).date);
  const items=days.flatMap(day=>day.items);
  const videos=items.reduce((sum,item)=>sum+itemVideoCount(item),0);
  const minutes=Math.round(items.reduce((sum,item)=>sum+(item.durationSeconds||0),0)/60);
  const range=`${first.toLocaleDateString('tr-TR',{day:'numeric',month:'long'})}–${last.toLocaleDateString('tr-TR',{day:'numeric',month:'long'})}`;
  const duration=minutes?`yaklaşık ${Math.floor(minutes/60)?`${Math.floor(minutes/60)} saat `:''}${minutes%60?`${minutes%60} dakika`:''}`.trim():'';
  return [range,videos?`${videos} video`:'',duration].filter(Boolean).join(' · ');
}
function renderProgram(){
  const PROGRAM_DAYS=programDays(),hasProgram=PROGRAM_DAYS.length>0;
  $('#programBody').classList.toggle('hidden',!hasProgram);
  $('#programEmptyState').classList.toggle('hidden',hasProgram);
  $('#jumpProgramDay').classList.toggle('hidden',!hasProgram);
  $('#programKicker').textContent=hasProgram&&state.program.kicker?state.program.kicker:'ÇALIŞMA PROGRAMI';
  $('#programDescription').textContent=hasProgram?programSummary(PROGRAM_DAYS):'';
  $('#programLegend').textContent=hasProgram?(state.program.legend||''):'';
  if(!hasProgram)return;
  // Başlangıç her zaman ilk günün tarihi (silme sonrası eski kalan program.start'a güvenme).
  const PROGRAM_START=PROGRAM_DAYS[0].date;
  const dayDiff=(from,to)=>Math.round((dateFromKey(to)-dateFromKey(from))/86400000);
  const itemTotal=PROGRAM_DAYS.reduce((sum,day)=>sum+day.items.length,0);
  const completed=PROGRAM_DAYS.reduce((sum,day)=>sum+day.items.filter(item=>state.programCompleted[item.id]).length,0);
  const fullDays=PROGRAM_DAYS.filter(programDayDone).length;
  const percent=Math.round(completed/(itemTotal)*100);
  const today=todayKey();
  const todayIndex=PROGRAM_DAYS.findIndex(day=>day.date===today);
  // Odak günü: bugün programdaysa bugün, değilse bugünden sonraki ilk gün, o da yoksa son gün.
  const upcomingIndex=PROGRAM_DAYS.findIndex(day=>day.date>=today);
  const focusIndex=todayIndex>=0?todayIndex:upcomingIndex>=0?upcomingIndex:PROGRAM_DAYS.length-1;
  const focusDay=PROGRAM_DAYS[focusIndex];
  $('#programPercent').textContent=`%${percent}`;
  $('#programRing').style.setProperty('--program-progress',`${percent}%`);
  $('#programProgressBar').style.width=`${percent}%`;
  $('#programProgressText').textContent=`${completed} / ${itemTotal} çalışma tamamlandı`;
  $('#programDaysDone').textContent=fullDays;
  const lastDate=PROGRAM_DAYS.at(-1).date;
  const remainingDays=PROGRAM_DAYS.filter(day=>day.date>=today&&!programDayDone(day)).length;
  $('#programRemaining').textContent=completed===itemTotal?'Programdaki tüm çalışmalar tamamlandı. Harika iş!':remainingDays?`Önünde ${remainingDays} çalışma günü var.`:'Kalan çalışma günün yok; eksik kalanları tamamlayabilir ya da yeni çalışma ekleyebilirsin.';
  const startsIn=dayDiff(today,PROGRAM_START);
  $('#programPhase').textContent=startsIn>0?(startsIn===1?'Program yarın başlıyor':`Program ${startsIn} gün sonra başlıyor`):today>lastDate?'Program dönemi sona erdi':`Bugün programın ${dayDiff(PROGRAM_START,today)+1}. günü`;
  // Haftalar gerçek takvim haftası (Pazartesi–Pazar); boş haftalar atlanır.
  const weekOf=key=>weekStartKey(dateFromKey(key));
  const weekKeys=[...new Set(PROGRAM_DAYS.map(day=>weekOf(day.date)))];
  const totalWeeks=weekKeys.length;
  if(programWeekTarget){const index=weekKeys.indexOf(weekOf(programWeekTarget));if(index>=0)programWeek=index;programWeekTarget=null;}
  else if(programWeekNeedsFocus){programWeek=Math.max(0,weekKeys.indexOf(weekOf(focusDay.date)));}
  programWeekNeedsFocus=false;
  programWeek=Math.max(0,Math.min(totalWeeks-1,programWeek));
  const weekKey=weekKeys[programWeek];
  const weekDays=PROGRAM_DAYS.filter(day=>weekOf(day.date)===weekKey);
  // "Tüm günler" haftaya göre; "Kalanlar/Tamamlananlar" tüm programda arar (sadece o haftada arıyordu).
  const matchesFilter=day=>programFilter==='done'?programDayDone(day):!programDayDone(day);
  const visible=programFilter==='all'?weekDays:PROGRAM_DAYS.filter(matchesFilter);
  document.querySelectorAll('.week-pager,.week-bottom-nav').forEach(el=>el.classList.toggle('hidden',programFilter!=='all'));
  const weekStart=dateFromKey(weekKey),weekEnd=dateFromKey(addDaysKey(weekKey,6));
  const sameMonth=weekStart.getMonth()===weekEnd.getMonth();
  const weekDates=sameMonth?`${weekStart.getDate()}–${weekEnd.toLocaleDateString('tr-TR',{day:'numeric',month:'long'})}`:`${weekStart.toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}–${weekEnd.toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}`;
  $('#programWeekLabel').textContent=`${programWeek+1}. Hafta`;
  $('#programWeekDates').textContent=weekDates;
  $('#programWeekCount').textContent=`${programWeek+1} / ${totalWeeks}`;
  document.querySelectorAll('[data-program-week-dir="-1"]').forEach(button=>button.disabled=programWeek===0);
  document.querySelectorAll('[data-program-week-dir="1"]').forEach(button=>button.disabled=programWeek===totalWeeks-1);
  $('#programList').innerHTML=visible.map(day=>{
    const date=dateFromKey(day.date),isToday=day.date===today,isNext=day.day===focusDay.day&&todayIndex<0;
    const dateText=date.toLocaleDateString('tr-TR',{day:'numeric',month:'long',weekday:'short'});
    const done=programDayDone(day);
    const dayVideoCount=day.items.reduce((sum,item)=>sum+itemVideoCount(item),0);
    const dayDuration=day.items.reduce((sum,item)=>sum+(item.durationSeconds||0),0);
    const dayMeta=[day.items.length?`${day.items.length} çalışma`:'',dayVideoCount?`${dayVideoCount} video`:'',dayDuration?formatVideoDuration(dayDuration):''].filter(Boolean).join(' · ');
    return `<article class="program-day ${done?'is-done':''} ${isToday?'is-today':''} ${isNext?'is-next':''}" id="program-day-${day.day}">
      <header><div class="day-number"><span>GÜN</span><strong>${String(dayDiff(PROGRAM_START,day.date)+1).padStart(2,'0')}</strong></div><div><h3>${dateText}</h3><p>${dayMeta||'Çalışma yok'}</p></div>${done&&day.items.length?'<span class="day-done-badge">Tamamlandı</span>':''}<button class="program-day-add" type="button" data-add-item="${day.date}" title="Bu güne çalışma ekle" aria-label="${dateText} gününe çalışma ekle">＋</button></header>
      <div class="program-day-tasks">${day.items.map(item=>{const checked=Boolean(state.programCompleted[item.id]),meta=subjectMeta(item.subject);const info=[escapeHTML(item.subject),item.range?escapeHTML(item.range):'',programAmountLabel(item),item.durationSeconds?formatVideoDuration(item.durationSeconds):''].filter(Boolean).join(' · ');return `<div class="program-task-row"><label class="program-task ${checked?'done':''}" style="--program-subject:${meta.color}"><input type="checkbox" data-program-task="${item.id}" ${checked?'checked':''}><span class="program-check" aria-hidden="true"></span><span class="program-task-copy"><small>${info}</small><strong>${escapeHTML(item.topic)}</strong>${item.practice?`<em>${escapeHTML(item.practice)}</em>`:''}</span>${programLink(item.subject)?`<a href="${escapeHTML(programLink(item.subject))}" target="_blank" rel="noopener" aria-label="${escapeHTML(item.subject)} oynatma listesini aç" title="Oynatma listesini aç">↗</a>`:''}</label><button class="program-task-remove" type="button" data-remove-item="${item.id}" title="Çalışmayı sil" aria-label="${escapeHTML(item.topic)} çalışmasını sil">×</button></div>`;}).join('')}</div>
    </article>`;
  }).join('');
  $('#emptyProgram').classList.toggle('hidden',visible.length>0);
  $('#jumpProgramDay').dataset.targetDay=focusDay.day;
  $('#jumpProgramDay').dataset.targetWeek=weekKeys.indexOf(weekOf(focusDay.date));
  $('#jumpProgramDay').textContent=todayIndex>=0?'Bugünün gününe git':'Sıradaki güne git';
}

function render(){
  const todays=state.tasks.filter(t=>t.date===todayKey());
  const done=todays.filter(t=>t.done).length;
  const pct=todays.length?Math.round(done/todays.length*100):0;
  taskList.innerHTML='';
  const groups=SUBJECTS.map(subject=>({...subject,tasks:todays.filter(task=>canonicalSubject(task.subject)===subject.name)}));
  const legacyTasks=todays.filter(task=>!canonicalSubject(task.subject));
  if(legacyTasks.length)groups.push({name:'Diğer',color:'#8b95ad',tasks:legacyTasks,legacy:true});
  $('#subjectGrid').innerHTML=groups.map((group,index)=>{const completed=group.tasks.filter(t=>t.done).length,groupPct=group.tasks.length?Math.round(completed/group.tasks.length*100):0,safe=`lesson-${index}`;return `<article class="subject-card ${group.tasks.length?'':'is-empty'}" style="--lesson-color:${group.color}"><div class="subject-card-head"><h3>${escapeHTML(group.name)}</h3><span>${completed}/${group.tasks.length} görev</span></div><div class="semi-gauge"><svg viewBox="0 0 120 66" role="img" aria-labelledby="${safe}-title ${safe}-desc"><title id="${safe}-title">${escapeHTML(group.name)} ilerlemesi</title><desc id="${safe}-desc">${group.tasks.length} görevden ${completed} tanesi tamamlandı, yüzde ${groupPct}.</desc><path class="gauge-track" pathLength="100" d="M 10 60 A 50 50 0 0 1 110 60"/><path class="gauge-value" pathLength="100" d="M 10 60 A 50 50 0 0 1 110 60" style="--progress:${groupPct}"/></svg><strong aria-hidden="true">%${groupPct}</strong></div><div class="subject-tasks">${group.tasks.length?group.tasks.map(t=>`<div class="subject-task ${t.done?'done':''}"><input class="task-check" id="task-${t.id}" type="checkbox" data-id="${t.id}" ${t.done?'checked':''}><label for="task-${t.id}"><strong>${escapeHTML(t.title)}</strong><span>${t.minutes} dk</span></label><button class="delete-task" data-delete="${t.id}" aria-label="${escapeHTML(t.title)} görevini sil">×</button></div>`).join(''):'<p class="subject-empty">Henüz görev yok.</p>'}</div>${group.legacy?'':`<button class="subject-add" data-subject="${escapeHTML(group.name)}">＋ Görev ekle</button>`}</article>`;}).join('');
  $('#emptyTasks').classList.add('hidden');
  $('#planSummary').textContent=`${done} / ${todays.length} tamamlandı`;
  $('#planPercent').textContent=`${pct}%`; $('#planBar').style.width=`${pct}%`;
  $('#doneCount').textContent=`${done} görev`; $('#doneDetail').textContent=`Planının %${pct}'i`;
  const plannedMinutes=renderCapacity();
  $('#todayOverviewSummary').textContent=`${todays.length} görev · ${plannedMinutes} / ${state.dailyTarget} dk planlandı`;
  $('#todayHeroTitle').textContent=!todays.length?'Bugün için plan yok':todays.every(t=>t.done)?'Bugünün planı tamam!':'Planın hazır.';
  // Bugün listesi: geciken (önceki günlerden kalan, bitmemiş) görevler başta, sonra bugünün bitmemişleri, en sonda bugün tamamlananlar.
  // Görevler buradan işaretlenip silinir (eskiden işaretleme kutusu gizli bir bölümde kalmıştı).
  const overdue=state.tasks.filter(t=>!t.done&&t.date<todayKey()).sort((a,b)=>a.date.localeCompare(b.date));
  const previewRows=[...overdue,...todays.filter(t=>!t.done),...todays.filter(t=>t.done)];
  $('#todayPreviewList').innerHTML=previewRows.map(t=>{const meta=subjectMeta(t.subject),late=t.date<todayKey();return `<div class="preview-task ${t.done?'done':''} ${late?'late':''}"><input class="task-check preview-check" type="checkbox" data-id="${t.id}" ${t.done?'checked':''} aria-label="${escapeHTML(t.title)} görevini ${t.done?'yeniden aç':'tamamla'}"><i style="--lesson-color:${meta.color}"></i><span><strong>${escapeHTML(t.title)}</strong><small>${late?`<b class="late-tag">Gecikti · ${formatShortDate(t.date)}</b> · `:''}${escapeHTML(meta.name)} · ${Number(t.minutes)||0} dk</small></span><button class="delete-task preview-delete" type="button" data-delete="${t.id}" aria-label="${escapeHTML(t.title)} görevini sil" title="Görevi sil">×</button></div>`;}).join('');
  $('#emptyTodayPreview').textContent=todays.length?'Bugünün tüm görevleri tamamlandı.':'Bugün için görev yok. Planına küçük bir hedef ekle.';
  $('#emptyTodayPreview').classList.toggle('hidden',previewRows.length>0);

  const subjects=[...SUBJECTS.map(subject=>subject.name),...new Set(todays.filter(task=>!canonicalSubject(task.subject)).map(task=>task.subject))];
  const old=timerSubject.value;
  timerSubject.innerHTML=subjects.map(s=>`<option>${escapeHTML(s)}</option>`).join('');
  if(subjects.includes(old))timerSubject.value=old;

  const sessions=state.sessions.filter(s=>s.date===todayKey());
  const mins=sessions.reduce((a,s)=>a+s.minutes,0);
  $('#todayMinutes').textContent=formatMinutes(mins); $('#focusCount').textContent=`${sessions.length} oturum`;
  $('#focusDaySummary').textContent=`${formatMinutes(mins)} · ${sessions.length} oturum`;
  const targetPct=Math.min(100,Math.round(mins/state.dailyTarget*100));
  $('#todayTarget').textContent=`${state.dailyTarget} dk hedefin var`;
  $('#targetPercent').textContent=`${targetPct}%`; $('#targetRing').style.background=`conic-gradient(var(--green) ${targetPct}%,#29314c 0)`;
  $('#sessionList').innerHTML=[...sessions].reverse().map(s=>`<div class="session"><i class="session-dot"></i><div><strong>${escapeHTML(s.subject)}</strong><span>${s.time}</span></div><em>${s.minutes} dk</em></div>`).join('');
  $('#emptySessions').classList.toggle('hidden',sessions.length>0);
  renderWeek();
  renderExams();
  renderReviews();
  renderMistakes();
  renderWeeklyReview();
  renderTodayActions();
  renderProgram();
  renderStreak();
  save();
}

function renderStreak(){
  const today=todayKey(),active=new Set();
  state.sessions.forEach(session=>{if(session.date)active.add(session.date);});
  // Seri, işin YAPILDIĞI güne göre sayılır (geçmiş bir görevi bugün işaretlemek seriyi geriye dönük uzatmasın).
  state.tasks.forEach(task=>{if(task.done){const day=task.doneDate||task.date;if(day&&day<=today)active.add(day);}});
  state.exams.forEach(exam=>{if(exam.date&&exam.date<=today)active.add(exam.date);});
  state.reviewHistory.forEach(review=>{if(review.reviewedAt)active.add(localDateKey(new Date(review.reviewedAt)));});
  programDays().forEach(day=>day.items.forEach(item=>{const mark=state.programCompleted[item.id];if(!mark)return;const doneDay=typeof mark==='string'&&DATE_RE.test(mark)?mark:day.date;if(doneDay<=today)active.add(doneDay);}));
  let date=active.has(today)?today:addDaysKey(today,-1),days=0;
  while(active.has(date)&&date<=today){days++;date=addDaysKey(date,-1);}
  $('#streakValue').textContent=`${days} gün`;
}

function renderWeek(){
  const days=[]; const now=new Date();
  const monday=new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7));
  for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(monday.getDate()+i);const key=localDateKey(d);/* UTC değil yerel tarih: gece 00-03 arası bir gün kayıyordu */const min=state.sessions.filter(s=>s.date===key).reduce((a,s)=>a+s.minutes,0);days.push({label:dayLabel(d),min,today:key===todayKey()});}
  const max=Math.max(120,...days.map(d=>d.min));
  $('#weekChart').innerHTML=days.map(d=>`<div class="bar-col ${d.today?'today':''}" title="${d.min} dakika"><div class="bar-track"><i class="bar-fill" style="height:${Math.max(3,d.min/max*100)}%"></i></div><span>${d.label}</span></div>`).join('');
  const total=days.reduce((a,d)=>a+d.min,0); $('#weekTotal').textContent=formatMinutes(total);
}

function syncTaskErrors(task){
  const ids=task.source?.type==='exam-error'?task.source.errorIds||[]:[];
  state.errorEntries.forEach(entry=>{if(ids.includes(entry.id)){entry.status=task.done?'reviewed':'planned';entry.reviewedAt=task.done?new Date().toISOString():null;}});
}
function handleTaskChange(e){if(e.target.matches('.task-check')){const t=state.tasks.find(x=>x.id===e.target.dataset.id);if(t){t.done=e.target.checked;t.doneDate=t.done?todayKey():undefined;syncTaskErrors(t);toast(t.done?'Hedef tamamlandı!':'Hedef yeniden açıldı');render();}}}
function handleTaskClick(e){const id=e.target.dataset.delete;if(id){const task=state.tasks.find(t=>t.id===id);if(task?.source?.type==='exam-error')state.errorEntries.forEach(entry=>{if(task.source.errorIds.includes(entry.id)){entry.status='open';entry.taskId=null;entry.reviewedAt=null;}});state.tasks=state.tasks.filter(t=>t.id!==id);render();return;}const subject=e.target.dataset.subject;if(subject){showForm();$('#taskSubject').value=subject;}}
taskList.addEventListener('change',handleTaskChange);taskList.addEventListener('click',handleTaskClick);
$('#subjectGrid').addEventListener('change',handleTaskChange);$('#subjectGrid').addEventListener('click',handleTaskClick);
$('#todayPreviewList').addEventListener('click',e=>{if(e.target.dataset.delete){handleTaskClick(e);toast('Görev silindi');}});
$('#todayPreviewList').addEventListener('change',handleTaskChange);
function showForm(){taskForm.classList.remove('hidden');$('#taskTitle').focus();}
$('#openTaskForm').onclick=showForm; $('#emptyAdd').onclick=showForm;
// Görev formu eskiden gizli bir bölümdeydi ve açılmıyordu; hızlı ekle penceresini kullan.
const openTaskCapture=()=>openModal('quickCaptureDialog','#quickTaskTitle');
$('#todayAddTask').onclick=openTaskCapture;
taskForm.addEventListener('submit',e=>{e.preventDefault();const task={id:uid(),title:$('#taskTitle').value.trim(),subject:$('#taskSubject').value.trim(),minutes:Number($('#taskMinutes').value),done:false,date:todayKey()};state.tasks.push(task);taskForm.reset();$('#taskMinutes').value=30;taskForm.classList.add('hidden');const planned=state.tasks.filter(t=>t.date===todayKey()).reduce((sum,t)=>sum+t.minutes,0);toast(planned>state.dailyTarget?`Planın kapasiteni ${planned-state.dailyTarget} dk aşıyor.`:'Hedef plana eklendi');render();});

function addSuggestedTask(){
  const action=getNextAction();
  if(action.kind!=='error')return false;
  const task={id:uid(),title:action.title,subject:canonicalSubject(action.subject)||action.subject,minutes:action.minutes,done:false,date:todayKey(),source:{type:'exam-error',errorIds:action.errorIds}};
  state.tasks.push(task);state.errorEntries.forEach(entry=>{if(action.errorIds.includes(entry.id)){entry.status='planned';entry.taskId=task.id;}});render();toast('Öneri bugünün planına eklendi');return true;
}
$('#addSuggestedTask').onclick=addSuggestedTask;
$('#acceptNextAction').onclick=e=>{
  const kind=e.currentTarget.dataset.actionKind;
  if(kind==='error'){addSuggestedTask();return;}
  // Sıradaki görevde: odak sayacını o görevin dersiyle aç (eskiden görev olmayan Program ekranına gidiyordu).
  if(kind==='task'){const task=state.tasks.find(t=>t.id===e.currentTarget.dataset.taskId);location.hash='focus';if(task){setTimeout(()=>{const option=[...timerSubject.options].find(o=>o.value===task.subject);if(option)timerSubject.value=task.subject;},60);}return;}
  openTaskCapture();
};

function updateTimer(){
  const m=Math.floor(timer.left/60),s=timer.left%60;$('#timerText').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const circumference=590.62;$('#ringProgress').style.strokeDashoffset=circumference*(1-timer.left/timer.total);
  document.title=timer.running?`${m}:${String(s).padStart(2,'0')} • Odak`:'Odak — Ders Çalışma Paneli';
}
// Sayaç gerçek saate göre çalışır: kalan süre bitiş anından (endAt) hesaplanır. Böylece arka planda / kilitli
// ekranda geri kalmaz. Durumu ayrı bir anahtarda saklanır; sayfa yenilense de kaldığı yerden devam eder.
const TIMER_KEY='odak-timer';
function persistTimer(){try{localStorage.setItem(TIMER_KEY,JSON.stringify({total:timer.total,left:timer.left,running:timer.running,endAt:timer.endAt||0,isFocus:timer.isFocus,mode:Math.max(0,activeTimerMode()),subject:timerSubject.value}));}catch{}}
function tickTimer(){
  if(!timer.running)return;
  timer.left=Math.max(0,Math.ceil((timer.endAt-Date.now())/1000));
  updateTimer();
  if(timer.left<=0)completeTimer(true);
}
function startTimer(){
  if(timer.running)return;
  timer.running=true;timer.endAt=Date.now()+timer.left*1000;
  $('#playIcon').textContent='Ⅱ';$('#playLabel').textContent='Duraklat';
  clearInterval(timer.id);timer.id=setInterval(tickTimer,1000);persistTimer();
}
function stopTimer(){
  if(timer.running)timer.left=Math.max(0,Math.ceil((timer.endAt-Date.now())/1000));
  clearInterval(timer.id);timer.running=false;timer.endAt=0;
  $('#playIcon').textContent='▶';$('#playLabel').textContent='Başlat';persistTimer();
}
// natural=true: süre doldu (tam süre). false: kullanıcı "tamamla"ya bastı → gerçekten çalışılan süre kaydedilir.
function completeTimer(natural=false){
  const elapsed=natural?timer.total:timer.total-(timer.running?Math.max(0,Math.ceil((timer.endAt-Date.now())/1000)):timer.left);
  stopTimer();
  let completedSession=null;
  if(timer.isFocus){
    const mins=Math.round(elapsed/60);
    if(mins>=1){completedSession={id:uid(),subject:timerSubject.value,minutes:mins,time:new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),date:todayKey()};state.sessions.push(completedSession);toast(`${mins} dakikalık odak kaydedildi!`);render();}
    else toast('1 dakikadan kısa süre kaydedilmedi.');
  }
  else toast('Mola tamamlandı. Yeniden odaklanabilirsin.');
  if(natural&&state.settings.sound)playTone();
  timer.left=timer.total;updateTimer();persistTimer();
  if(completedSession)setTimeout(()=>openRecallDialog(completedSession),250);
}
// Çalışan ya da yarım kalmış bir sayacı onay almadan sıfırlama.
const confirmTimerReset=()=>!(timer.running||timer.left<timer.total)||confirm('Devam eden sayaç sıfırlanacak. Emin misin?');
$('#toggleTimer').onclick=()=>{if(timer.running)stopTimer();else startTimer();};
$('#resetTimer').onclick=()=>{stopTimer();timer.left=timer.total;updateTimer();persistTimer();toast('Sayaç sıfırlandı');};
$('#skipTimer').onclick=()=>{if(confirm(timer.isFocus?'Şu ana kadar çalıştığın süre odak oturumu olarak kaydedilsin mi?':'Molayı bitirmek ister misin?'))completeTimer(false);};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tickTimer();});
timerSubject.addEventListener('change',persistTimer);
function activeTimerMode(){return [...document.querySelectorAll('.mode')].findIndex(button=>button.classList.contains('active'));}
function syncTimerDurationControl(){const minutes=Math.round(timer.total/60);$('#timerDurationValue').value=minutes;}
function setTimerDuration(minutes){
  const modeIndex=Math.max(0,activeTimerMode()),keys=['focus','shortBreak','longBreak'],minimums=[5,1,5],maximums=[180,30,60];
  const value=Math.max(minimums[modeIndex],Math.min(maximums[modeIndex],Math.round(minutes)));
  stopTimer();state.settings[keys[modeIndex]]=value;
  const mode=document.querySelectorAll('.mode')[modeIndex];mode.dataset.minutes=value;mode.querySelector('span').textContent=`${value} dk`;
  const settingIds=['focusSetting','shortBreakSetting','longBreakSetting'];$(`#${settingIds[modeIndex]}`).value=value;
  timer.total=value*60;timer.left=timer.total;syncTimerDurationControl();updateTimer();persistTimer();save();
}
$('#decreaseTimerDuration').onclick=()=>{if(!confirmTimerReset())return;const mode=Math.max(0,activeTimerMode());setTimerDuration(timer.total/60-[5,1,5][mode]);};
$('#increaseTimerDuration').onclick=()=>{if(!confirmTimerReset())return;const mode=Math.max(0,activeTimerMode());setTimerDuration(timer.total/60+[5,1,5][mode]);};
$('#timerDurationValue').onchange=event=>{if(!confirmTimerReset()){syncTimerDurationControl();return;}setTimerDuration(Number(event.target.value)||timer.total/60);};
document.querySelectorAll('.mode').forEach((btn,index)=>btn.onclick=()=>{if(btn.classList.contains('active')||!confirmTimerReset())return;stopTimer();document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active'));btn.classList.add('active');timer.total=Number(btn.dataset.minutes)*60;timer.left=timer.total;timer.isFocus=index===0;$('#timerState').textContent=timer.isFocus?'ODAK ZAMANI':'MOLA ZAMANI';syncTimerDurationControl();updateTimer();persistTimer();});

const writeFullDate=()=>{$('#fullDate').textContent=new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'}).toLocaleUpperCase('tr-TR');};
writeFullDate();
// Gece yarısını geçen açık sekme: tarih başlığı ve "bugün" listeleri kendiliğinden yenilensin.
let renderedDay=todayKey();
const checkDayChange=()=>{if(todayKey()!==renderedDay){renderedDay=todayKey();writeFullDate();render();}};
setInterval(checkDayChange,60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkDayChange();});
$('#examDate').value=todayKey();

const viewTitles={
  today:'Bugün',
  plan:'Program',
  reviews:'Tekrarlar',
  focus:'Odak Sayacı',
  progress:'İlerleme',
  exams:'Denemeler',
  settings:'Ayarlar'
};
let previousView='today';
function setView(view,shouldScroll=false){
  if(!viewTitles[view])view='today';
  const current=document.body.dataset.view||'today';
  if(view==='settings'&&current!=='settings')previousView=current;
  document.body.dataset.view=view;
  $('#pageTitle').textContent=viewTitles[view];
  document.querySelectorAll('[data-view-link]').forEach(link=>{
    const active=link.dataset.viewLink===view;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  if(shouldScroll)window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-view-link]').forEach(link=>link.addEventListener('click',()=>setView(link.dataset.viewLink,true)));
window.addEventListener('hashchange',()=>setView(location.hash.slice(1),true));
setView(location.hash.slice(1)||'today');

let pendingRecallSession=null;
// Pencere kapanınca odak, pencereyi açan öğeye döner; başka pencere açıksa sayfa kilidi kalkmaz.
const modalReturnFocus=new Map();
function openModal(id,focusSelector){const modal=$(`#${id}`);if(modal.classList.contains('hidden'))modalReturnFocus.set(id,document.activeElement);modal.classList.remove('hidden');document.body.classList.add('modal-open');setTimeout(()=>modal.querySelector(focusSelector||'input,textarea,button')?.focus(),30);}
function closeModal(id){
  $(`#${id}`).classList.add('hidden');
  if(!document.querySelector('.modal-backdrop:not(.hidden)'))document.body.classList.remove('modal-open');
  const back=modalReturnFocus.get(id);modalReturnFocus.delete(id);
  if(back&&document.contains(back))back.focus?.();
}
document.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>closeModal(button.dataset.closeModal));
// Eşitleme çakışması seçim yapılmadan kapatılamaz (arka plan tıklaması ve Esc ile de).
const MUST_CHOOSE=new Set(['recallDialog','syncConflict']);
document.querySelectorAll('.modal-backdrop').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal&&!MUST_CHOOSE.has(modal.id))closeModal(modal.id);}));
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=document.querySelector('.modal-backdrop:not(.hidden)');if(open){if(open.id==='syncConflict')return;if(open.id==='recallDialog'&&$('#recallText').value.trim()&&!confirm('Yazdıklarını kaydetmeden kapatmak ister misin?'))return;closeModal(open.id);}}});

$('#quickCapture').onclick=()=>openModal('quickCaptureDialog','#quickTaskTitle');
$('#quickCaptureForm').addEventListener('submit',event=>{
  event.preventDefault();
  const task={id:uid(),title:$('#quickTaskTitle').value.trim(),subject:$('#quickTaskSubject').value.trim(),minutes:Number($('#quickTaskMinutes').value),done:false,date:todayKey()};
  if(!task.title||!task.subject)return;
  state.tasks.push(task);event.currentTarget.reset();$('#quickTaskMinutes').value='25';closeModal('quickCaptureDialog');
  const planned=state.tasks.filter(item=>item.date===todayKey()).reduce((sum,item)=>sum+item.minutes,0);
  render();toast(planned>state.dailyTarget?`Görev eklendi · kapasiten ${planned-state.dailyTarget} dk aşıldı.`:'Görev bugünün planına eklendi');
});

function createOrUpdateReviewItem({subject,topic,referenceText='',sourceType='manual',sourceId=null,delay=1}){
  const existing=state.reviewItems.find(item=>item.status==='active'&&(sourceId&&item.sourceId===sourceId||(normalizeText(item.subject)===normalizeText(subject)&&normalizeText(item.topic)===normalizeText(topic))));
  if(existing){existing.referenceText=referenceText||existing.referenceText;existing.dueDate=addDaysKey(todayKey(),delay);existing.sourceType=sourceType;existing.sourceId=sourceId||existing.sourceId;return existing;}
  const item={id:uid(),subject,topic,referenceText,sourceType,sourceId,createdAt:new Date().toISOString(),dueDate:addDaysKey(todayKey(),delay),stage:0,intervalDays:delay,status:'active',lastReviewedAt:null,reviewCount:0,lapses:0};
  state.reviewItems.push(item);return item;
}
function openRecallDialog(session){
  pendingRecallSession=session;$('#recallSubject').textContent=session.subject;
  const matching=state.tasks.filter(task=>task.date===todayKey()&&!task.done&&normalizeText(task.subject)===normalizeText(session.subject));
  $('#recallTopic').value=matching.length===1?matching[0].title:'';$('#recallText').value='';openModal('recallDialog','#recallTopic');
}
$('#skipRecall').onclick=()=>{pendingRecallSession=null;closeModal('recallDialog');toast('Oturum kaydın korundu');};
$('#recallForm').addEventListener('submit',event=>{event.preventDefault();if(!pendingRecallSession)return;createOrUpdateReviewItem({subject:pendingRecallSession.subject,topic:$('#recallTopic').value.trim(),referenceText:$('#recallText').value.trim(),sourceType:'focus',sourceId:pendingRecallSession.id,delay:1});pendingRecallSession=null;closeModal('recallDialog');event.currentTarget.reset();render();toast('Tekrar yarına planlandı');});

function openReviewForm(){const form=$('#reviewForm');form.classList.remove('hidden');$('#reviewSubject').focus();}
function closeReviewForm(){const form=$('#reviewForm');form.reset();$('#reviewDelay').value='1';form.classList.add('hidden');}
$('#openReviewForm').onclick=openReviewForm;$('#closeReviewForm').onclick=closeReviewForm;$('#cancelReview').onclick=closeReviewForm;
$('#reviewForm').addEventListener('submit',event=>{event.preventDefault();createOrUpdateReviewItem({subject:$('#reviewSubject').value.trim(),topic:$('#reviewTopic').value.trim(),referenceText:$('#reviewPrompt').value.trim(),delay:Number($('#reviewDelay').value)||1});closeReviewForm();render();toast('Tekrar kuyruğa eklendi');});

$('#dueReviewList').addEventListener('click',event=>{
  const reveal=event.target.dataset.revealReview;
  if(reveal){document.querySelector(`[data-review-answer="${reveal}"]`)?.classList.remove('hidden');event.target.closest('.review-reveal')?.classList.add('hidden');return;}
  const snooze=event.target.dataset.snoozeReview;
  if(snooze){const item=state.reviewItems.find(review=>review.id===snooze);if(item){item.dueDate=addDaysKey(todayKey(),1);render();toast('Tekrar yarına ertelendi');}return;}
  const id=event.target.dataset.rateReview,rating=event.target.dataset.rating;
  if(!id||!rating)return;
  const item=state.reviewItems.find(review=>review.id===id);if(!item)return;
  const previousStage=item.stage;let interval=1;
  if(rating==='remembered'){item.stage=Math.min(REVIEW_INTERVALS.length-1,item.stage+1);interval=REVIEW_INTERVALS[item.stage];}
  else if(rating==='hard'){interval=Math.max(1,Math.ceil((item.intervalDays||REVIEW_INTERVALS[item.stage])/2));}
  else{item.stage=0;interval=1;item.lapses=(item.lapses||0)+1;}
  item.intervalDays=interval;item.dueDate=addDaysKey(todayKey(),interval);item.lastReviewedAt=new Date().toISOString();item.reviewCount=(item.reviewCount||0)+1;
  const recall=event.target.closest('.review-item')?.querySelector('.review-recall')?.value.trim()||'';
  state.reviewHistory.push({id:uid(),reviewItemId:item.id,reviewedAt:item.lastReviewedAt,rating,recallText:recall,previousStage,nextStage:item.stage,nextDueDate:item.dueDate});
  render();toast(`Tekrar tamamlandı · sıradaki ${interval} gün sonra`);
});
$('#upcomingReviewList').addEventListener('click',event=>{const id=event.target.dataset.archiveReview;if(!id)return;const item=state.reviewItems.find(review=>review.id===id);if(item){item.status='archived';render();toast('Tekrar arşivlendi');}});

const ACCENTS={
  indigo:['#6c7cff','#8d99ff'],green:['#18b892','#58d6a6'],orange:['#f08b45','#ffad66'],pink:['#d9568d','#f285b0']
};
function hydrateSettings(){
  $('#focusSetting').value=state.settings.focus; $('#shortBreakSetting').value=state.settings.shortBreak; $('#longBreakSetting').value=state.settings.longBreak;
  $('#dailyTargetSetting').value=state.dailyTarget; $('#soundSetting').checked=state.settings.sound; $('#reduceMotion').checked=state.settings.reduceMotion;
}
function applySettings(showMessage=false){
  const colors=ACCENTS[state.settings.accent]||ACCENTS.indigo;
  document.documentElement.style.setProperty('--primary',colors[0]);document.documentElement.style.setProperty('--primary-2',colors[1]);
  document.body.dataset.theme=state.settings.theme;document.body.dataset.reduceMotion=String(state.settings.reduceMotion);
  document.querySelector('meta[name="theme-color"]').content=state.settings.theme==='light'?'#f3f5fb':'#11172a';
  document.querySelectorAll('#themeChoices [data-theme]').forEach(b=>{const selected=b.dataset.theme===state.settings.theme;b.classList.toggle('selected',selected);b.setAttribute('aria-checked',String(selected));});
  document.querySelectorAll('[data-accent]').forEach(b=>{const selected=b.dataset.accent===state.settings.accent;b.classList.toggle('selected',selected);b.setAttribute('aria-checked',String(selected));});
  const modes=[...document.querySelectorAll('.mode')];
  const values=[state.settings.focus,state.settings.shortBreak,state.settings.longBreak];
  modes.forEach((b,i)=>{b.dataset.minutes=values[i];b.querySelector('span').textContent=`${values[i]} dk`;});
  // Duraklatılmış (yarım kalmış) sayacı ayar kaydı yüzünden sıfırlama; sadece boştaki sayacı güncelle.
  if(!timer.running&&timer.left===timer.total){const active=modes.findIndex(b=>b.classList.contains('active'));timer.total=values[Math.max(0,active)]*60;timer.left=timer.total;syncTimerDurationControl();updateTimer();}
  save();if(showMessage)toast('Ayarlar kaydedildi');
}
function playTone(){
  try{const Ctx=window.AudioContext||window.webkitAudioContext;const ctx=new Ctx();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=660;gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.36);osc.onended=()=>ctx.close();/* açık kalan ses bağlamları birikmesin */}catch{}
}
document.querySelectorAll('#themeChoices [data-theme]').forEach(btn=>btn.onclick=()=>{state.settings.theme=btn.dataset.theme;applySettings(true);});
document.querySelectorAll('[data-accent]').forEach(btn=>btn.onclick=()=>{state.settings.accent=btn.dataset.accent;applySettings(true);});
$('#reduceMotion').onchange=e=>{state.settings.reduceMotion=e.target.checked;applySettings(true);};
$('#soundSetting').onchange=e=>{state.settings.sound=e.target.checked;applySettings(true);};
$('#testSound').onclick=()=>playTone();
[['focusSetting','focus',5,180],['shortBreakSetting','shortBreak',1,30],['longBreakSetting','longBreak',5,60]].forEach(([id,key,min,max])=>{$(`#${id}`).onchange=e=>{const value=Math.max(min,Math.min(max,Math.round(Number(e.target.value)||state.settings[key])));state.settings[key]=value;e.target.value=value;applySettings(true);};});
$('#dailyTargetSetting').onchange=e=>{state.dailyTarget=Math.max(15,Math.min(720,Math.round(Number(e.target.value)||120)));e.target.value=state.dailyTarget;render();toast('Günlük hedef güncellendi');};
$('#closeSettings').onclick=e=>{e.preventDefault();location.hash=previousView;};
// Esc ile Ayarlar'dan çık; ama açık bir pencere varsa ya da bir alana yazılıyorsa çıkma (önce o kapanır / yazı yarım kalmasın).
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||document.body.dataset.view!=='settings')return;
  if(document.querySelector('.modal-backdrop:not(.hidden)')||e.target.closest?.('input,textarea,select'))return;
  location.hash=previousView;
});
$('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`calisma-yedegi-${todayKey()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);/* bazı tarayıcılarda hemen iptal indirmeyi durduruyordu */toast('Yedek indirildi');};
$('#importData').onclick=()=>$('#importFile').click();
$('#importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  let data;
  try{const parsed=JSON.parse(await file.text());data=parsed&&parsed.data?parsed.data:parsed;}catch{toast('Dosya okunamadı: geçerli bir JSON değil');return;}
  if(!data||typeof data!=='object'||Array.isArray(data)||!['tasks','sessions','exams','settings'].some(k=>k in data)){toast('Bu dosya bir çalışma yedeği değil');return;}
  pendingImport=data;
  const count=k=>Array.isArray(data[k])?data[k].length:0;
  $('#importSummary').textContent=`${file.name}: ${count('tasks')} görev, ${count('sessions')} çalışma oturumu, ${count('exams')} deneme, ${count('reviewItems')} tekrar.`;
  $('#importConfirm').classList.remove('hidden');$('#confirmImport').focus();
};
let pendingImport=null;
$('#cancelImport').onclick=()=>{pendingImport=null;$('#importConfirm').classList.add('hidden');};
// Sıfırlama ve yedek yükleme buluta da yansır; geri dönülebilsin diye önceki verinin kopyası saklanır.
const UNDO_KEY=STORAGE_KEY+'-geri-al';
function keepUndoCopy(reason){try{localStorage.setItem(UNDO_KEY,JSON.stringify({reason,savedAt:new Date().toISOString(),data:state}));}catch{}renderUndo();}
function renderUndo(){
  let info=null;try{info=JSON.parse(localStorage.getItem(UNDO_KEY));}catch{}
  const box=$('#undoBox');if(!box)return;
  box.classList.toggle('hidden',!info?.data);
  if(info?.data)$('#undoText').textContent=`Son ${info.reason} işleminden önceki verin saklı (${new Date(info.savedAt).toLocaleString('tr-TR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}).`;
}
$('#undoRestore').onclick=()=>{
  let info=null;try{info=JSON.parse(localStorage.getItem(UNDO_KEY));}catch{}
  if(!info?.data)return;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(info.data));
  localStorage.removeItem(UNDO_KEY);
  location.reload();
};
$('#undoDismiss').onclick=()=>{localStorage.removeItem(UNDO_KEY);renderUndo();};
renderUndo();
$('#confirmImport').onclick=()=>{if(!pendingImport)return;keepUndoCopy('yedek yükleme');localStorage.setItem(STORAGE_KEY,JSON.stringify(normalizeState(pendingImport)));location.reload();};
$('#showReset').onclick=()=>{$('#resetConfirm').classList.remove('hidden');$('#resetText').focus();};
$('#cancelReset').onclick=()=>{$('#resetConfirm').classList.add('hidden');$('#resetText').value='';$('#confirmReset').disabled=true;$('#resetProgress').checked=true;$('#resetProgram').checked=true;$('#resetPacks').checked=false;};
// "sifirla" tr-TR büyük harfte "SİFİRLA" olur; ikisini de kabul et.
$('#resetText').oninput=e=>$('#confirmReset').disabled=!['SIFIRLA','SİFİRLA'].includes(e.target.value.trim().toLocaleUpperCase('tr-TR'));
$('#confirmReset').onclick=()=>{
  if(!$('#resetProgress').checked&&!$('#resetProgram').checked&&!$('#resetPacks').checked){toast('Silinecek bir şey seçmedin');return;}
  keepUndoCopy('sıfırlama');
  const parts=[];
  if($('#resetProgress').checked){state.tasks=[];state.sessions=[];state.exams=[];state.errorEntries=[];state.reviewItems=[];state.reviewHistory=[];state.weeklyReviews=[];parts.push('ilerleme kayıtları');}
  if($('#resetProgram').checked){state.program=null;state.programCompleted={};parts.push('program');}
  // Program kalsın ama ilerleme sıfırlansın denmişse, tamamlanma işaretleri de ilerlemedir: onlar da gider.
  else if($('#resetProgress').checked){state.programCompleted={};}
  if($('#resetPacks').checked){state.mistakePacks=[];parts.push('hata defteri kartları');}
  if(!parts.length){toast('Silinecek bir şey seçmedin');return;}
  save();render();$('#cancelReset').click();
  toast(`Silindi: ${parts.join(', ')}`);
  location.hash='today';
};

const examNet=(correct,wrong)=>Number((correct-wrong/4).toFixed(2));
const formatNet=value=>Number(value).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const EXAM_GROUPS_BY_TYPE={
TYT:[
  {key:'turkce',label:'Türkçe',limit:40},
  {key:'sosyal',label:'Sosyal',limit:20,children:[['tarih','Tarih'],['cografya','Coğrafya'],['felsefe','Felsefe'],['din','Din']]},
  {key:'matematik',label:'Matematik',limit:40},
  {key:'fen',label:'Fen',limit:20,children:[['fizik','Fizik'],['kimya','Kimya'],['biyoloji','Biyoloji']]}
 ],
 AYT:[
   {key:'matematik',label:'Matematik',limit:40},
   {key:'edebiyat',label:'Türk Dili ve Edebiyatı',limit:24},
   {key:'sosyal1',label:'Sosyal Bilimler 1',limit:16,children:[['tarih1','Tarih-1'],['cografya1','Coğrafya-1']]},
   {key:'sosyal2',label:'Sosyal Bilimler 2',limit:40,children:[['tarih2','Tarih-2'],['cografya2','Coğrafya-2'],['felsefe','Felsefe Grubu'],['din','Din']]},
   {key:'fen',label:'Fen Bilimleri',limit:40,children:[['fizik','Fizik'],['kimya','Kimya'],['biyoloji','Biyoloji']]}
 ],
 YDT:[{key:'dil',label:'Yabancı Dil',limit:80}]
};
const EXAM_COUNT_KEYS=['correct','wrong','blank'];
const EXAM_COUNT_LABELS={correct:'Doğru',wrong:'Yanlış',blank:'Boş'};
function examCountFields(key,label){return `<div class="exam-count-fields">${EXAM_COUNT_KEYS.map(part=>`<label>${EXAM_COUNT_LABELS[part]}<input type="number" min="0" max="200" step="1" value="0" data-exam-group="${key}" data-exam-count="${part}" aria-label="${label} ${EXAM_COUNT_LABELS[part].toLocaleLowerCase('tr-TR')}"></label>`).join('')}</div>`;}
function currentExamGroups(){return EXAM_GROUPS_BY_TYPE[$('#examType').value]||EXAM_GROUPS_BY_TYPE.TYT;}
function renderExamSubjectSections(){const groups=currentExamGroups();$('#examSubjectSections').innerHTML=groups.map(group=>group.children
  ?`<details class="exam-subject-card exam-expandable" data-exam-card="${group.key}"><summary><span><strong>${group.label}</strong><small>Alt dersleri açıp sonuçlarını gir</small></span><span class="exam-card-total" id="examSummary-${group.key}">0D · 0Y · 0B</span></summary><div class="exam-branch-grid">${group.children.map(([key,label])=>`<fieldset class="exam-branch-card"><legend>${label}</legend>${examCountFields(`${group.key}.${key}`,label)}</fieldset>`).join('')}</div></details>`
  :`<fieldset class="exam-subject-card"><legend>${group.label}</legend>${examCountFields(group.key,group.label)}</fieldset>`).join('');}
function examCounts(key){const values=EXAM_COUNT_KEYS.map(part=>{const input=$(`#examSubjectSections [data-exam-group="${key}"][data-exam-count="${part}"]`);return input.value===''?NaN:Number(input.value);});return {correct:values[0],wrong:values[1],blank:values[2]};}
function sumExamCounts(items){return items.reduce((sum,item)=>({correct:sum.correct+item.correct,wrong:sum.wrong+item.wrong,blank:sum.blank+item.blank}),{correct:0,wrong:0,blank:0});}
function readExamResult(){
  const groups=currentExamGroups();
  const subjects={};
  groups.forEach(group=>{
    if(group.children){const branches=Object.fromEntries(group.children.map(([key])=>[key,examCounts(`${group.key}.${key}`)]));subjects[group.key]={...sumExamCounts(Object.values(branches)),branches};}
    else subjects[group.key]=examCounts(group.key);
  });
  return {subjects,...sumExamCounts(Object.values(subjects))};
}
function updateNetPreview(){
  const result=readExamResult(),valid=EXAM_COUNT_KEYS.every(key=>Number.isInteger(result[key])&&result[key]>=0);
  $('#examTotalCounts').textContent=valid?`${result.correct} doğru · ${result.wrong} yanlış · ${result.blank} boş`:'Sayıları kontrol et';
  $('#netPreview').textContent=valid?`${formatNet(examNet(result.correct,result.wrong))} net`:'—';
  for(const key of Object.keys(result.subjects||{})){const value=result.subjects[key];if(value.branches)$(`#examSummary-${key}`).textContent=`${value.correct||0}D · ${value.wrong||0}Y · ${value.blank||0}B`;}
}
$('#examSubjectSections').addEventListener('input',updateNetPreview);
$('#examType').onchange=()=>{renderExamSubjectSections();updateNetPreview();};
renderExamSubjectSections();
function openExamForm(){
  $('#examForm').classList.remove('hidden');$('#examDate').value=todayKey();$('#examName').focus();window.scrollTo({top:0,behavior:'smooth'});
}
function closeExamForm(){
  $('#examForm').reset();$('#examDate').value=todayKey();$('#examType').onchange();$('#examError').classList.add('hidden');$('#examForm').classList.add('hidden');
}
$('#openExamForm').onclick=openExamForm;$('#emptyExamAdd').onclick=openExamForm;$('#closeExamForm').onclick=closeExamForm;$('#cancelExam').onclick=closeExamForm;
$('#examForm').addEventListener('submit',e=>{
  e.preventDefault();const {subjects,correct,wrong,blank}=readExamResult(),date=$('#examDate').value,error=$('#examError');
  let message='';if(![correct,wrong,blank].every(value=>Number.isInteger(value)&&value>=0))message='Doğru, yanlış ve boş alanlarına sıfır veya pozitif tam sayı gir.';
  else if(subjects){for(const group of currentExamGroups()){const values=subjects[group.key];if(!EXAM_COUNT_KEYS.every(key=>Number.isInteger(values[key])&&values[key]>=0)||(group.children&&!Object.values(values.branches).every(branch=>EXAM_COUNT_KEYS.every(key=>Number.isInteger(branch[key])&&branch[key]>=0)))){message=`${group.label} dersindeki sayıları kontrol et.`;break;}if(values.correct+values.wrong+values.blank>group.limit){message=`${group.label} için en fazla ${group.limit} soru girebilirsin.`;break;}}}
  if(!message&&correct+wrong+blank===0)message='En az bir soru sonucu girmelisin.';else if(!message&&date>todayKey())message='Sonuç tarihi gelecekte olamaz.';
  if(message){error.textContent=message;error.classList.remove('hidden');return;}
  const exam={id:uid(),type:$('#examType').value,name:$('#examName').value.trim(),date,correct,wrong,blank,net:examNet(correct,wrong),subjects,duration:Number($('#examDuration').value)||null,score:Number($('#examScore').value)||null};
  state.exams.push(exam);$('#examFilter').value=exam.type;closeExamForm();render();toast('Deneme eklendi · şimdi hatalarını sınıflandır');setTimeout(()=>openMistakeForm(exam.id),150);
});
$('#examTarget').onchange=e=>{state.examTarget=Math.max(1,Math.min(200,Number(e.target.value)||90));e.target.value=state.examTarget;render();toast('Net hedefi güncellendi');};
$('#examFilter').onchange=()=>renderExams();
$('#examList').addEventListener('click',e=>{const analyze=e.target.dataset.analyzeExam;if(analyze){openMistakeForm(analyze);return;}const id=e.target.dataset.deleteExam;if(id){const exam=state.exams.find(x=>x.id===id);const linked=state.errorEntries.filter(entry=>entry.examId===id).length;const detail=linked?` Bu denemeye bağlı ${linked} hata kaydı da silinecek.`:'';if(exam&&confirm(`${exam.name} kaydını silmek istiyor musun?${detail}`)){const removedIds=state.errorEntries.filter(entry=>entry.examId===id).map(entry=>entry.id);state.errorEntries=state.errorEntries.filter(entry=>entry.examId!==id);state.tasks.forEach(task=>{if(task.source?.type==='exam-error')task.source.errorIds=task.source.errorIds.filter(errorId=>!removedIds.includes(errorId));});state.exams=state.exams.filter(x=>x.id!==id);render();toast('Deneme silindi');}}});

function openMistakeForm(examId){
  if(!state.exams.length){openExamForm();return;}
  $('#mistakeForm').classList.remove('hidden');
  $('#mistakeError').classList.add('hidden');
  if(examId&&state.exams.some(exam=>exam.id===examId))$('#mistakeExam').value=examId;
  $('#mistakeSubject').focus();
  document.querySelector('.mistake-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeMistakeForm(){
  $('#mistakeForm').reset();$('#mistakeCount').value=1;$('#mistakeError').classList.add('hidden');$('#mistakeForm').classList.add('hidden');
}
$('#openMistakeForm').onclick=()=>openMistakeForm(state.exams.at(-1)?.id);
$('#cancelMistake').onclick=closeMistakeForm;
$('#mistakeForm').addEventListener('submit',event=>{
  event.preventDefault();
  const exam=state.exams.find(item=>item.id===$('#mistakeExam').value),subject=$('#mistakeSubject').value.trim(),topic=$('#mistakeTopic').value.trim(),cause=$('#mistakeReason').value,outcome=$('#mistakeOutcome').value,count=Number($('#mistakeCount').value),error=$('#mistakeError');
  let message='';
  if(!exam)message='Önce geçerli bir deneme seçmelisin.';
  else if(subject.length<2)message='Ders adını yazmalısın.';
  else if(topic.length<2)message='Konu adını yazmalısın.';
  else if(!Number.isInteger(count)||count<1||count>200)message='Soru sayısı 1 ile 200 arasında olmalı.';
  else{const limit=outcome==='blank'?exam.blank:exam.wrong;const used=state.errorEntries.filter(item=>item.examId===exam.id&&item.outcome===outcome).reduce((sum,item)=>sum+item.count,0);if(used+count>limit)message=`Bu denemede yalnızca ${limit} ${outcome==='blank'?'boş':'yanlış'} bulunuyor; toplam kayıt ${limit}'i aşamaz.`;}
  if(message){error.textContent=message;error.classList.remove('hidden');return;}
  const existing=state.errorEntries.find(item=>item.examId===exam.id&&normalizeText(item.subject)===normalizeText(subject)&&normalizeText(item.topic)===normalizeText(topic)&&item.cause===cause&&item.outcome===outcome&&item.status==='open');
  if(existing){existing.count+=count;existing.note=$('#mistakeNote').value.trim()||existing.note;}
  else state.errorEntries.push({id:uid(),examId:exam.id,subject,topic,outcome,cause,count,note:$('#mistakeNote').value.trim(),status:'open',taskId:null,createdAt:new Date().toISOString(),reviewedAt:null});
  closeMistakeForm();render();toast('Hata kaydedildi · çalışma önerin hazır');
});
$('#mistakeList').addEventListener('click',event=>{const id=event.target.dataset.deleteMistake;if(!id)return;const entry=state.errorEntries.find(item=>item.id===id);if(entry?.taskId){const task=state.tasks.find(item=>item.id===entry.taskId);if(task?.source?.errorIds)task.source.errorIds=task.source.errorIds.filter(errorId=>errorId!==id);}state.errorEntries=state.errorEntries.filter(item=>item.id!==id);render();toast('Hata kaydı silindi');});

function renderExams(){
  const type=$('#examFilter')?.value||'TYT';const exams=state.exams.filter(e=>e.type===type).sort((a,b)=>a.date.localeCompare(b.date));const recent=exams.slice(-10);const latest=exams.at(-1);
  $('#examTarget').value=state.examTarget;$('#examTargetLabel').textContent=state.examTarget;
  $('#latestNet').textContent=latest?formatNet(latest.net):'—';$('#latestExamName').textContent=latest?latest.name:'Henüz kayıt yok';
  const last3=exams.slice(-3);$('#averageNet').textContent=last3.length?formatNet(last3.reduce((a,x)=>a+x.net,0)/last3.length):'—';
  $('#bestNet').textContent=exams.length?formatNet(Math.max(...exams.map(x=>x.net))):'—';
  $('#targetGap').textContent=latest?`${latest.net>=state.examTarget?'+':''}${formatNet(latest.net-state.examTarget)}`:'—';
  $('#examList').innerHTML=[...exams].reverse().slice(0,listExpanded.exams?Infinity:8).map(x=>{const groups=EXAM_GROUPS_BY_TYPE[x.type]||EXAM_GROUPS_BY_TYPE.TYT;const breakdown=x.subjects?`<details class="exam-entry-breakdown"><summary>Ders sonuçları</summary>${groups.map(group=>{const value=x.subjects[group.key];if(!value)return '';const branches=group.children&&value.branches?`<small>${group.children.map(([key,label])=>`${label} ${value.branches[key]?.correct??0}D ${value.branches[key]?.wrong??0}Y ${value.branches[key]?.blank??0}B`).join(' · ')}</small>`:'';return `<div><strong>${group.label}: ${formatNet(examNet(value.correct,value.wrong))} net</strong><span>${value.correct}D ${value.wrong}Y ${value.blank}B</span>${branches}</div>`;}).join('')}</details>`:'';return `<div class="exam-entry"><span class="exam-entry-copy"><strong>${escapeHTML(x.name)}</strong><span>${x.type} · ${new Date(x.date+'T12:00:00').toLocaleDateString('tr-TR')} · ${x.correct}D ${x.wrong}Y ${x.blank}B</span>${breakdown}</span><strong class="exam-net">${formatNet(x.net)}</strong><button class="analyze-exam" data-analyze-exam="${x.id}" type="button">Analiz et</button><button class="delete-exam" data-delete-exam="${x.id}" aria-label="${escapeHTML(x.name)} kaydını sil">×</button></div>`;}).join('')+moreButton('exams',exams.length,8);
  $('#emptyExams').classList.toggle('hidden',exams.length>0);
  renderExamChart(recent);
  save();
}
function renderExamChart(exams){
  const chart=$('#examChart'),insight=$('#chartInsight');
  if(!exams.length){chart.innerHTML='<div class="empty-sessions">Grafiğin ilk denemenden sonra oluşacak.</div>';insight.textContent='Doğru ve yanlışlarını gir, netini otomatik hesaplayalım.';return;}
  const W=680,H=230,p={l:38,r:18,t:14,b:30};const values=exams.map(x=>x.net);const min=Math.min(0,...values)-5,max=Math.max(state.examTarget,...values,10)+5;const x=i=>exams.length===1?W/2:p.l+i*(W-p.l-p.r)/(exams.length-1);const y=v=>p.t+(max-v)*(H-p.t-p.b)/(max-min);
  const grids=[0,.25,.5,.75,1].map(t=>{const val=max-(max-min)*t,yy=p.t+(H-p.t-p.b)*t;return `<line class="grid-line" x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}"/><text class="axis-label" x="0" y="${yy+4}">${Math.round(val)}</text>`;}).join('');
  const points=exams.map((e,i)=>`${x(i)},${y(e.net)}`).join(' ');const dots=exams.map((e,i)=>`<circle class="net-point" cx="${x(i)}" cy="${y(e.net)}" r="5" tabindex="0"><title>${escapeHTML(e.name)}: ${formatNet(e.net)} net</title></circle><text class="axis-label" x="${x(i)}" y="${H-8}" text-anchor="middle">${new Date(e.date+'T12:00:00').toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'})}</text>`).join('');
  chart.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${exams.length} denemenin net gelişimi"><defs><linearGradient id="netArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".25"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>${grids}<line class="target-line" x1="${p.l}" y1="${y(state.examTarget)}" x2="${W-p.r}" y2="${y(state.examTarget)}"><title>Hedef: ${state.examTarget} net</title></line>${exams.length>1?`<polyline class="net-line" points="${points}"/>`:''}${dots}</svg>`;
  if(exams.length===1)insight.textContent=`Başlangıç noktan ${formatNet(exams[0].net)} net. Gelişimi görmek için bir deneme daha ekle.`;else if(exams.length>=6){const prev=exams.slice(-6,-3).reduce((a,e)=>a+e.net,0)/3,last=exams.slice(-3).reduce((a,e)=>a+e.net,0)/3;insight.textContent=`Son 3 ortalaman ${formatNet(last)}; önceki 3 denemeye göre ${last-prev>=0?'+':''}${formatNet(last-prev)} net.`;}else{const diff=exams.at(-1).net-exams.at(-2).net;insight.textContent=`Son denemende bir öncekine göre ${diff>=0?'+':''}${formatNet(diff)} net değişim var.`;}
}

function getWeekMetrics(){
  const start=weekStartKey(),end=addDaysKey(start,6),tasks=state.tasks.filter(task=>task.date>=start&&task.date<=end),sessions=state.sessions.filter(session=>session.date>=start&&session.date<=end),exams=state.exams.filter(exam=>exam.date>=start&&exam.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
  return {studiedMinutes:sessions.reduce((sum,session)=>sum+session.minutes,0),completedTasks:tasks.filter(task=>task.done).length,plannedTasks:tasks.length,examsCompleted:exams.length,netDelta:exams.length>1?Number((exams.at(-1).net-exams[0].net).toFixed(2)):0};
}
$('#weeklyReviewForm').addEventListener('submit',event=>{
  event.preventDefault();const key=weekStartKey(),now=new Date().toISOString(),data={weekStart:key,win:$('#weeklyWin').value.trim(),block:$('#weeklyBlock').value.trim(),change:$('#weeklyChange').value.trim(),metrics:getWeekMetrics()};
  const existing=state.weeklyReviews.find(item=>item.weekStart===key);
  if(existing)Object.assign(existing,data,{updatedAt:now});else state.weeklyReviews.push({id:uid(),...data,createdAt:now,updatedAt:now});
  render();toast('Haftalık değerlendirme kaydedildi');
});
$('#lastWeeklyReview').addEventListener('click',event=>{if(event.target.id!=='editWeeklyReview')return;const review=state.weeklyReviews.find(item=>item.weekStart===weekStartKey());if(!review)return;$('#weeklyWin').value=review.win;$('#weeklyBlock').value=review.block;$('#weeklyChange').value=review.change;$('#lastWeeklyReview').classList.add('hidden');$('#weeklyReviewForm').classList.remove('hidden');$('#weeklyWin').focus();});
$('#programList').addEventListener('change',event=>{const key=event.target.dataset.programTask;if(!key)return;state.programCompleted[key]=event.target.checked?todayKey():false;/* işaretlendiği gün (seri için) */if(!event.target.checked)delete state.programCompleted[key];render();toast(event.target.checked?'Çalışma tamamlandı!':'Çalışma yeniden açıldı');});
document.querySelectorAll('[data-program-filter]').forEach(button=>button.onclick=()=>{programFilter=button.dataset.programFilter;document.querySelectorAll('[data-program-filter]').forEach(item=>item.classList.toggle('active',item===button));renderProgram();});
document.querySelectorAll('[data-program-week-dir]').forEach(button=>button.onclick=()=>{programWeek+=Number(button.dataset.programWeekDir);renderProgram();$('#programList').scrollIntoView({behavior:'smooth',block:'start'});});
$('#jumpProgramDay').onclick=()=>{programWeek=Number($('#jumpProgramDay').dataset.targetWeek)||0;renderProgram();const day=$('#jumpProgramDay').dataset.targetDay;document.querySelector(`#program-day-${day}`)?.scrollIntoView({behavior:'smooth',block:'center'});};

hydrateSettings();applySettings();render();updateTimer();
// Sayfa yenilendiyse / sekme kapanıp açıldıysa sayacı kaldığı yerden sürdür; sen yokken bittiyse oturumu kaydet.
(function restoreTimer(){
  let saved=null;try{saved=JSON.parse(localStorage.getItem(TIMER_KEY));}catch{}
  if(!saved||!Number.isFinite(saved.total)||saved.total<=0)return;
  const modes=[...document.querySelectorAll('.mode')];
  const mode=Math.min(Math.max(0,Number(saved.mode)||0),modes.length-1);
  modes.forEach((b,i)=>b.classList.toggle('active',i===mode));
  timer.isFocus=mode===0;$('#timerState').textContent=timer.isFocus?'ODAK ZAMANI':'MOLA ZAMANI';
  timer.total=saved.total;timer.left=Math.min(Math.max(0,Number(saved.left)||0),saved.total);
  if([...timerSubject.options].some(o=>o.value===saved.subject))timerSubject.value=saved.subject;
  syncTimerDurationControl();
  if(saved.running&&saved.endAt){
    const left=Math.ceil((saved.endAt-Date.now())/1000);
    if(left<=0){timer.left=0;completeTimer(true);}
    else{timer.left=left;startTimer();}
  }
  updateTimer();
})();

function registerStudyTools(){
  const context=document.modelContext;
  if(!context?.registerTool)return;
  const register=tool=>{try{void Promise.resolve(context.registerTool(tool)).catch(()=>{});}catch{}}
  register({
    name:'get_study_summary',title:'Çalışma özetini getir',
    description:'Bugünün hedef, çalışma süresi ve tamamlanan odak oturumu özetini getirir.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute(){const tasks=state.tasks.filter(t=>t.date===todayKey());const sessions=state.sessions.filter(s=>s.date===todayKey());return{date:todayKey(),plannedTasks:tasks.length,completedTasks:tasks.filter(t=>t.done).length,plannedMinutes:tasks.reduce((sum,t)=>sum+t.minutes,0),dailyCapacity:state.dailyTarget,studiedMinutes:sessions.reduce((a,s)=>a+s.minutes,0),focusSessions:sessions.length,dueReviews:state.reviewItems.filter(item=>item.status==='active'&&item.dueDate<=todayKey()).length};}
  });
  register({
    name:'add_study_task',title:'Çalışma hedefi ekle',
    description:'Bugünün planına ders, görev ve süre bilgisiyle yeni bir çalışma hedefi ekler.',
    inputSchema:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:80},subject:{type:'string',enum:['Matematik','Türkçe','Fizik','Kimya','Biyoloji','Sosyal']},minutes:{type:'integer',minimum:5,maximum:240}},required:['title','subject','minutes'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const subject=canonicalSubject(input?.subject);if(!input||typeof input.title!=='string'||!input.title.trim()||!subject||!Number.isInteger(input.minutes)||input.minutes<5||input.minutes>240)throw new Error('Geçerli bir başlık, ders ve 5–240 arası dakika girilmeli.');const task={id:uid(),title:input.title.trim(),subject,minutes:input.minutes,done:false,date:todayKey()};state.tasks.push(task);render();return{id:task.id,status:'planned'};}
  });
  register({
    name:'complete_study_task',title:'Çalışma hedefini tamamla',
    description:'Kimliği verilen çalışma hedefini tamamlandı olarak işaretler.',
    inputSchema:{type:'object',properties:{taskId:{type:'string',minLength:1}},required:['taskId'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const task=state.tasks.find(t=>t.id===input?.taskId&&t.date===todayKey());if(!task)throw new Error('Bugünün planında bu kimlikle bir hedef bulunamadı.');task.done=true;syncTaskErrors(task);render();return{id:task.id,status:'completed'};}
  });
  register({
    name:'add_exam_result',title:'Deneme sonucu ekle',
    description:'Bir TYT, AYT veya YDT denemesini doğru, yanlış ve boş sayılarıyla kaydeder; neti otomatik hesaplar.',
    inputSchema:{type:'object',properties:{type:{type:'string',enum:['TYT','AYT','YDT']},name:{type:'string',minLength:1,maxLength:60},date:{type:'string'},correct:{type:'integer',minimum:0},wrong:{type:'integer',minimum:0},blank:{type:'integer',minimum:0}},required:['type','name','date','correct','wrong','blank'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){if(!input||!['TYT','AYT','YDT'].includes(input.type)||!input.name?.trim()||!DATE_RE.test(String(input.date))||input.date>todayKey()||![input.correct,input.wrong,input.blank].every(Number.isInteger)||input.correct+input.wrong+input.blank<1)throw new Error('Geçerli sınav türü, ad, tarih ve soru sonuçları girilmeli.');const exam={id:uid(),type:input.type,name:input.name.trim(),date:input.date,correct:input.correct,wrong:input.wrong,blank:input.blank,net:examNet(input.correct,input.wrong),duration:null,score:null};state.exams.push(exam);render();return{id:exam.id,net:exam.net,status:'saved'};}
  });
  register({
    name:'add_review_item',title:'Tekrar kuyruğuna konu ekle',
    description:'Bir ders ve konuyu akıllı tekrar kuyruğuna ekler.',
    inputSchema:{type:'object',properties:{subject:{type:'string',minLength:1,maxLength:24},topic:{type:'string',minLength:1,maxLength:60},note:{type:'string',maxLength:240}},required:['subject','topic'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){if(!input?.subject?.trim()||!input?.topic?.trim())throw new Error('Ders ve konu gerekli.');const item=createOrUpdateReviewItem({subject:input.subject.trim(),topic:input.topic.trim(),referenceText:input.note?.trim()||'',delay:1});render();return{id:item.id,dueDate:item.dueDate,status:'scheduled'};}
  });
  register({
    name:'add_exam_error',title:'Deneme hatası ekle',
    description:'Kayıtlı bir denemeye ders, konu ve hata nedeni ekler.',
    inputSchema:{type:'object',properties:{examId:{type:'string'},subject:{type:'string',enum:['Matematik','Türkçe','Fizik','Kimya','Biyoloji','Sosyal']},topic:{type:'string',minLength:2,maxLength:60},outcome:{type:'string',enum:['wrong','blank']},cause:{type:'string',enum:['knowledge','method','calculation','attention','time']},count:{type:'integer',minimum:1,maximum:200}},required:['examId','subject','topic','outcome','cause','count'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const exam=state.exams.find(item=>item.id===input?.examId),subject=canonicalSubject(input?.subject);if(!exam)throw new Error('Deneme bulunamadı.');if(!subject)throw new Error('Geçerli bir ders seçilmeli.');const limit=input.outcome==='blank'?exam.blank:exam.wrong,used=state.errorEntries.filter(item=>item.examId===exam.id&&item.outcome===input.outcome).reduce((sum,item)=>sum+item.count,0);if(used+input.count>limit)throw new Error('Hata sayısı deneme sonucundaki toplamı aşıyor.');const entry={id:uid(),examId:exam.id,subject,topic:input.topic.trim(),outcome:input.outcome,cause:input.cause,count:input.count,note:'',status:'open',taskId:null,createdAt:new Date().toISOString(),reviewedAt:null};state.errorEntries.push(entry);render();return{id:entry.id,status:'open'};}
  });
}
registerStudyTools();

// Çevrimdışı açılış: servis çalışanı sayfayı ve dosyaları kaydeder (sw.js). Güvenli bağlam gerektirir (https / localhost).
if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(ASSET_VERSION)}`).catch(()=>{});
}
// İnternet gidip gelince kullanıcı bilsin: çevrimdışıyken yapılanlar bu cihazda durur, internet gelince eşitlenir.
window.addEventListener('offline',()=>toast('İnternet yok — çalışmaya devam edebilirsin, değişiklikler internet gelince eşitlenecek.'));
window.addEventListener('online',()=>toast('İnternet geldi — eşitleniyor…'));
if(!navigator.onLine)setTimeout(()=>toast('Çevrimdışısın — kayıtlı sürüm açıldı. Değişikliklerin internet gelince eşitlenecek.'),800);
