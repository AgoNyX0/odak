const STORAGE_KEY = 'odak-study-v1';
const localDateKey = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const todayKey = () => localDateKey();
const dateFromKey = key => { const [year,month,day]=key.split('-').map(Number); return new Date(year,month-1,day,12); };
const addDaysKey = (key,days) => { const date=dateFromKey(key); date.setDate(date.getDate()+days); return localDateKey(date); };
const weekStartKey = (date=new Date()) => { const start=new Date(date); start.setHours(12,0,0,0); start.setDate(start.getDate()-((start.getDay()+6)%7)); return localDateKey(start); };
const uid = () => Math.random().toString(36).slice(2,9);
const seed = {
  dailyTarget: 120,
  tasks: [
    {id:uid(),title:'Trigonometri konu tekrarı',subject:'Matematik',minutes:40,done:false,date:todayKey()},
    {id:uid(),title:'Hücre bölünmesi soru çözümü',subject:'Biyoloji',minutes:30,done:false,date:todayKey()},
    {id:uid(),title:'Paragraf denemesi',subject:'Türkçe',minutes:25,done:true,date:todayKey()}
  ],
  sessions: [{id:uid(),subject:'Türkçe',minutes:25,time:'09:20',date:todayKey()}],
  exams: [],
  errorEntries: [],
  reviewItems: [],
  reviewHistory: [],
  weeklyReviews: [],
  examTarget: 90,
  settings: {theme:'dark',accent:'indigo',focus:25,shortBreak:5,longBreak:15,sound:true,reduceMotion:false}
};
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || seed; } catch { state = seed; }
state.tasks ||= []; state.sessions ||= []; state.exams ||= []; state.errorEntries ||= []; state.reviewItems ||= []; state.reviewHistory ||= []; state.weeklyReviews ||= []; state.programCompleted ||= {}; state.dailyTarget ||= 120; state.examTarget ||= 90;
state.dataVersion = 2;
state.settings = {...seed.settings,...(state.settings||{})};
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const $ = s => document.querySelector(s);
const taskList=$('#taskList'), taskForm=$('#taskForm'), timerSubject=$('#timerSubject');
let timer={total:1500,left:1500,running:false,id:null,isFocus:true};

function escapeHTML(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
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
const PROGRAM_START='2026-09-21';
const PROGRAM_LINKS={
  Matematik:'https://www.youtube.com/playlist?list=PLyiXTl2rW_wrvZYVh9-A5pHeVhF4xdeO4',
  Kimya:'https://www.youtube.com/playlist?list=PL5kIOunpmSBNBWMQWLo0vjOZcNx5I_L7p',
  Fizik:'https://www.youtube.com/playlist?list=PLjMK0Mww73Cc4v8HI329cVSd7U4cMAEVZ',
  Biyoloji:'https://www.youtube.com/playlist?list=PL87vBAl7SzvzqiYcuIxz7ptFykyE2qYS_'
};
const PROGRAM_MATH=[
  ['M1–4','Temel Kavramlar'],['M5–7','Temel Kavramlar'],['M8–12','Tek-Çift, Pozitif-Negatif'],['M13–17','Ardışık Sayılar'],['M18–22','Faktöriyel'],['M23–24','Asal Sayılar'],['M25–28','Sayı Basamakları'],['M29–33','Bölünebilme I'],['M34–38','Bölünebilme II'],['M39–43','Asal Çarpanlar'],
  ['M44–46','EBOB-EKOK I'],['M47–48','EBOB-EKOK II'],['M49–56','Periyodik + Rasyonel Sayılar'],['M57–60','Birinci Dereceden Denklemler'],['M61–66','Basit Eşitsizlikler'],['M67–70','Mutlak Değer I'],['M71–74','Mutlak Değer II'],['M75–78','Üslü Sayılar I'],['M79–81','Üslü Sayılar II'],['M82–88','Köklü Sayılar'],
  ['M89–91','Çarpanlara Ayırma I'],['M92–94','Çarpanlara Ayırma II'],['M95–98','Oran-Orantı I'],['M99–102','Oran-Orantı ve Ortalama'],['M103–106','Sayı Problemleri I'],['M107–109','Sayı Problemleri II'],['M110–112','Kesir Problemleri'],['M113–120','Yaş ve İşçi Problemleri'],['M121–124','Hız Problemleri I'],['M125–129','Hız Problemleri II'],
  ['M130–132','Yüzde Problemleri I'],['M133–134','Yüzde Problemleri II'],['M135–137','Karışım Problemleri'],['M138–142','Grafik Problemleri'],['M143–146','Veri'],['M147–150','Kümeler I'],['M151–153','Kümeler II'],['M154–156','Kartezyen Çarpım'],['M157–160','Fonksiyonlar I-1'],['M161–164','Fonksiyonlar I-2'],
  ['M165–167','Fonksiyonlar I-3'],['M168–170','Fonksiyonlar I-4'],['M171–174','Fonksiyonlar II-1'],['M175–178','Fonksiyonlar II-2'],['M179–182','Fonksiyonlar II-3'],['M183–185','Fonksiyonlar II-4'],['M186–190','Sayma, Küme ve Fonksiyon'],['M191–195','Sayma ve Permütasyon I'],['M196–201','Sayma ve Permütasyon II'],['M202–207','Kombinasyon I'],
  ['M208–213','Kombinasyon II'],['M214–216','Binom'],['M217–223','Olasılık'],['M224–229','Mantık'],['M230–234','Polinomlar I'],['M235–239','Polinomlar II'],['M240–244','Polinomlar III'],['M245–249','İkinci Dereceden Denklemler I'],['M250–254','İkinci Dereceden Denklemler II'],['M255–259','Karmaşık Sayılar']
];
const PROGRAM_SCIENCE=[
  ['Kimya','K1–3','Tanıtım ve Simyadan Kimyaya'],['Kimya','K4–5','Kimya alanları ve sembolik dil'],['Kimya','K6–7','İş güvenliği'],['Kimya','K8–9','Atom modelleri ve atom yapısı'],['Kimya','K10–11','Periyodik sistem'],['Kimya','K12–13','Periyodik özellikler'],['Kimya','K14–15','Etkileşimler ve iyonik bağ'],['Kimya','K16–18','İyonik, kovalent ve metalik bağ'],['Kimya','K19–20','Zayıf etkileşimler ve değişimler'],['Kimya','K21–22','Maddenin halleri ve katılar'],
  ['Kimya','K23','Sıvılar'],['Kimya','K24–25','Gazlar ve doğa'],['Kimya','K26–28','Kimyanın temel kanunları'],['Kimya','K29–30','Mol I–II'],['Kimya','K31–32','Mol soruları ve tepkime türleri'],['Kimya','K33–34','Tepkime hesaplamaları I–II'],['Kimya','K35–36','Tepkime hesaplamaları III'],['Kimya','K37–38','Karışımlar'],['Kimya','K39–41','Çözünme ve derişim'],['Kimya','K42–43','Koligatif özellikler ve ayırma'],['Kimya','K44–45','Asit-baz ve tepkimeler I'],['Kimya','K46–47','Tepkimeler II ve tuzlar'],['Kimya','K48–49','Değerlendirme ve Kimya Her Yerde'],
  ['Fizik','F1–6','Fizik Bilimine Giriş'],['Fizik','F7–10','Madde ve Özellikleri I'],['Fizik','F11–15','Madde ve Özellikleri II'],['Fizik','F16–20','Doğrusal Hareket I'],['Fizik','F21–25','Doğrusal Hareket II'],['Fizik','F26–30','Newton Yasaları I'],['Fizik','F31–35','Newton Yasaları II'],['Fizik','F36–42','İş, Güç ve Enerji'],['Fizik','F43–47','Isı, Sıcaklık ve Genleşme I'],['Fizik','F48–52','Isı, Sıcaklık ve Genleşme II'],['Fizik','F53–56','Elektrostatik I'],['Fizik','F57–61','Elektrostatik II'],['Fizik','F62–66','Mıknatıslar'],['Fizik','F67–71','Elektrik Devreleri I'],['Fizik','F72–76','Elektrik Devreleri II'],['Fizik','F77–80','Basınç I'],['Fizik','F81–89','Basınç II ve Kaldırma Kuvveti'],['Fizik','F90–94','Dalgalar I'],['Fizik','F95–99','Dalgalar II'],['Fizik','F100–103','Dalgalar III'],['Fizik','F104–108','Optik I'],['Fizik','F109–113','Optik II'],['Fizik','F114–118','Optik III'],['Fizik','F119–122','Optik IV'],
  ['Biyoloji','B1–5','Canlıların özellikleri ve virüsler'],['Biyoloji','B6–12','İnorganik ve organik bileşikler'],['Biyoloji','B13–19','Enzim, vitamin, DNA ve ATP'],['Biyoloji','B20–26','Organeller ve hücre zarı'],['Biyoloji','B27–36','Sınıflandırma ve canlı grupları'],['Biyoloji','B37–43','Mitoz, mayoz ve üreme'],['Biyoloji','B44–47','Kalıtım I'],['Biyoloji','B48–50','Kalıtım II'],['Biyoloji','B51–54','Ekoloji'],['Biyoloji','B55–57','Döngüler ve çevre sorunları'],['Biyoloji','B58 · 00:00–01:29:00','Genel checkpoint I'],['Biyoloji','B58 · 01:29:00–02:58:00','Genel checkpoint II'],['Biyoloji','B58 · 02:58:00–04:27:13','Genel checkpoint III']
];
const PROGRAM_DAYS=PROGRAM_MATH.map((math,index)=>({day:index+1,date:addDaysKey(PROGRAM_START,index),items:[{subject:'Matematik',range:math[0],topic:math[1]},{subject:PROGRAM_SCIENCE[index][0],range:PROGRAM_SCIENCE[index][1],topic:PROGRAM_SCIENCE[index][2]}]}));
let programFilter='all',programWeek=0;
const LESSON_COLORS=SUBJECTS.map(subject=>subject.color);
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
  $('#acceptNextAction').textContent=action.kind==='task'?'Planı aç':action.kind==='error'?'Plana ekle':'Görev ekle';
  $('#acceptNextAction').dataset.actionKind=action.kind;
  const due=state.reviewItems.filter(item=>item.status==='active'&&item.dueDate<=todayKey());
  $('#todayReviewCount').textContent=due.length;
  $('#todayReviewText').textContent=due.length?`Yaklaşık ${Math.max(2,due.length*2)} dakika.`:'Tekrar kuyruğun boş.';
}

function renderReviews(){
  const today=todayKey();
  const active=state.reviewItems.filter(item=>item.status==='active');
  const due=active.filter(item=>item.dueDate<=today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.stage-b.stage||a.createdAt.localeCompare(b.createdAt));
  const upcoming=active.filter(item=>item.dueDate>today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,8);
  const weekStart=weekStartKey();
  const weeklyDone=state.reviewHistory.filter(entry=>localDateKey(new Date(entry.reviewedAt))>=weekStart).length;
  $('#dueReviewStat').textContent=`${due.length} tekrar`;$('#weeklyReviewStat').textContent=`${weeklyDone} tekrar`;
  $('#nextReviewStat').textContent=upcoming.length?formatShortDate(upcoming[0].dueDate):'—';
  $('#dueReviewList').innerHTML=due.map(item=>`<article class="review-item" data-review-id="${item.id}"><div class="review-item-head"><span>${escapeHTML(item.subject)}</span><small>${item.dueDate<today?'Gecikti':'Bugün'}</small></div><h3>${escapeHTML(item.topic)}</h3><p>Bakmadan bu konu hakkında neleri hatırlıyorsun?</p><textarea class="review-recall" maxlength="280" placeholder="Kısa bir cevap yazabilirsin…" aria-label="${escapeHTML(item.topic)} için hatırladıkların"></textarea><div class="review-reveal"><button class="secondary-btn" type="button" data-reveal-review="${item.id}">${item.referenceText?'Notumla karşılaştır':'Kendimi değerlendir'}</button><button class="text-btn" type="button" data-snooze-review="${item.id}">Yarına ertele</button></div><div class="review-answer hidden" data-review-answer="${item.id}"><p>${item.referenceText?escapeHTML(item.referenceText):'Kendi hatırlamana göre değerlendir.'}</p><div class="rating-row"><button type="button" data-rate-review="${item.id}" data-rating="forgot">Unuttum</button><button type="button" data-rate-review="${item.id}" data-rating="hard">Zorlandım</button><button type="button" data-rate-review="${item.id}" data-rating="remembered">Hatırladım</button></div></div></article>`).join('');
  $('#emptyDueReviews').classList.toggle('hidden',due.length>0);
  $('#upcomingReviewList').innerHTML=upcoming.map(item=>`<div class="upcoming-review"><span><strong>${escapeHTML(item.topic)}</strong><small>${escapeHTML(item.subject)}</small></span><time datetime="${item.dueDate}">${formatShortDate(item.dueDate)}</time><button type="button" data-archive-review="${item.id}" aria-label="${escapeHTML(item.topic)} tekrarını arşivle">×</button></div>`).join('');
  $('#emptyUpcomingReviews').classList.toggle('hidden',upcoming.length>0);
}

function renderMistakes(){
  const exams=[...state.exams].sort((a,b)=>b.date.localeCompare(a.date));
  const selected=$('#mistakeExam').value;
  $('#mistakeExam').innerHTML=exams.map(exam=>`<option value="${exam.id}">${escapeHTML(exam.name)} · ${exam.type}</option>`).join('');
  if(exams.some(exam=>exam.id===selected))$('#mistakeExam').value=selected;
  $('#openMistakeForm').disabled=exams.length===0;
  const current=state.errorEntries.filter(entry=>entry.status!=='reviewed');
  const reasonCounts=Object.keys(REASON_META).map(key=>({key,count:current.filter(entry=>entry.cause===key).reduce((sum,entry)=>sum+entry.count,0)})).filter(item=>item.count);
  $('#mistakeReasonSummary').innerHTML=reasonCounts.map(item=>`<span><strong>${item.count}</strong> ${REASON_META[item.key].label}</span>`).join('');
  $('#mistakeList').innerHTML=[...state.errorEntries].reverse().slice(0,6).map(entry=>`<div class="mistake-entry"><span class="mistake-dot ${entry.cause}"></span><div><strong>${escapeHTML(entry.subject)} · ${escapeHTML(entry.topic)}</strong><small>${REASON_META[entry.cause]?.label||'Hata'} · ${entry.count} ${entry.outcome==='blank'?'boş':'yanlış'}${entry.status==='planned'?' · Planda':entry.status==='reviewed'?' · Tekrar edildi':''}</small></div><button type="button" data-delete-mistake="${entry.id}" aria-label="Hata kaydını sil">×</button></div>`).join('');
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

function programTaskKey(day,itemIndex){return `${day}-${itemIndex}`;}
function programDayDone(day){return day.items.every((_,itemIndex)=>state.programCompleted[programTaskKey(day.day,itemIndex)]);}
function renderProgram(){
  const completed=PROGRAM_DAYS.reduce((sum,day)=>sum+day.items.filter((_,itemIndex)=>state.programCompleted[programTaskKey(day.day,itemIndex)]).length,0);
  const fullDays=PROGRAM_DAYS.filter(programDayDone).length;
  const percent=Math.round(completed/(PROGRAM_DAYS.length*2)*100);
  const today=todayKey();
  const todayIndex=PROGRAM_DAYS.findIndex(day=>day.date===today);
  const firstPendingIndex=PROGRAM_DAYS.findIndex(day=>!programDayDone(day));
  const focusIndex=todayIndex>=0?todayIndex:firstPendingIndex>=0?firstPendingIndex:PROGRAM_DAYS.length-1;
  const focusDay=PROGRAM_DAYS[focusIndex];
  $('#programPercent').textContent=`%${percent}`;
  $('#programRing').style.setProperty('--program-progress',`${percent}%`);
  $('#programProgressBar').style.width=`${percent}%`;
  $('#programProgressText').textContent=`${completed} / ${PROGRAM_DAYS.length*2} çalışma tamamlandı`;
  $('#programDaysDone').textContent=fullDays;
  $('#programRemaining').textContent=completed===PROGRAM_DAYS.length*2?'60 günlük program tamamlandı. Harika iş!':`${PROGRAM_DAYS.length-fullDays} tam gün kaldı · Her gün iki bağlantılı çalışma.`;
  $('#programPhase').textContent=today<PROGRAM_START?'Program yarın başlıyor':today>PROGRAM_DAYS.at(-1).date?'Program dönemi sona erdi':`Bugün programın ${todayIndex+1}. günü`;
  const totalWeeks=Math.ceil(PROGRAM_DAYS.length/7);
  programWeek=Math.max(0,Math.min(totalWeeks-1,programWeek));
  const weekDays=PROGRAM_DAYS.slice(programWeek*7,programWeek*7+7);
  const visible=weekDays.filter(day=>programFilter==='all'||programFilter==='done'&&programDayDone(day)||programFilter==='pending'&&!programDayDone(day));
  const weekStart=dateFromKey(weekDays[0].date),weekEnd=dateFromKey(weekDays.at(-1).date);
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
    return `<article class="program-day ${done?'is-done':''} ${isToday?'is-today':''} ${isNext?'is-next':''}" id="program-day-${day.day}">
      <header><div class="day-number"><span>GÜN</span><strong>${String(day.day).padStart(2,'0')}</strong></div><div><h3>${dateText}</h3><p>${isToday?'Bugünün programı':isNext?'Sıradaki program':'Matematik + '+day.items[1].subject}</p></div>${done?'<span class="day-done-badge">Tamamlandı</span>':''}</header>
      <div class="program-day-tasks">${day.items.map((item,itemIndex)=>{const key=programTaskKey(day.day,itemIndex),checked=Boolean(state.programCompleted[key]),meta=subjectMeta(item.subject);return `<label class="program-task ${checked?'done':''}" style="--program-subject:${meta.color}"><input type="checkbox" data-program-task="${key}" ${checked?'checked':''}><span class="program-check" aria-hidden="true"></span><span class="program-task-copy"><small>${escapeHTML(item.subject)} · ${escapeHTML(item.range)}</small><strong>${escapeHTML(item.topic)}</strong></span><a href="${PROGRAM_LINKS[item.subject]}" target="_blank" rel="noopener" aria-label="${escapeHTML(item.subject)} oynatma listesini aç" title="Oynatma listesini aç">↗</a></label>`;}).join('')}</div>
    </article>`;
  }).join('');
  $('#emptyProgram').classList.toggle('hidden',visible.length>0);
  $('#jumpProgramDay').dataset.targetDay=focusDay.day;
  $('#jumpProgramDay').dataset.targetWeek=Math.floor((focusDay.day-1)/7);
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
  $('#todayPreviewList').innerHTML=todays.filter(t=>!t.done).slice(0,4).map(t=>{const meta=subjectMeta(t.subject);return `<div class="preview-task"><i style="--lesson-color:${meta.color}"></i><span><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(meta.name)} · ${t.minutes} dk</small></span></div>`;}).join('');
  $('#emptyTodayPreview').textContent=todays.length?'Bugünün tüm görevleri tamamlandı.':'Bugün için görev yok. Planına küçük bir hedef ekle.';
  $('#emptyTodayPreview').classList.toggle('hidden',todays.some(t=>!t.done));

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
  save();
}

function renderWeek(){
  const days=[]; const now=new Date();
  const monday=new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7));
  for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(monday.getDate()+i);const key=d.toISOString().slice(0,10);const min=state.sessions.filter(s=>s.date===key).reduce((a,s)=>a+s.minutes,0);days.push({label:dayLabel(d),min,today:key===todayKey()});}
  const max=Math.max(120,...days.map(d=>d.min));
  $('#weekChart').innerHTML=days.map(d=>`<div class="bar-col ${d.today?'today':''}" title="${d.min} dakika"><div class="bar-track"><i class="bar-fill" style="height:${Math.max(3,d.min/max*100)}%"></i></div><span>${d.label}</span></div>`).join('');
  const total=days.reduce((a,d)=>a+d.min,0); $('#weekTotal').textContent=formatMinutes(total);
}

function syncTaskErrors(task){
  const ids=task.source?.type==='exam-error'?task.source.errorIds||[]:[];
  state.errorEntries.forEach(entry=>{if(ids.includes(entry.id)){entry.status=task.done?'reviewed':'planned';entry.reviewedAt=task.done?new Date().toISOString():null;}});
}
function handleTaskChange(e){if(e.target.matches('.task-check')){const t=state.tasks.find(x=>x.id===e.target.dataset.id);if(t){t.done=e.target.checked;syncTaskErrors(t);toast(t.done?'Hedef tamamlandı!':'Hedef yeniden açıldı');render();}}}
function handleTaskClick(e){const id=e.target.dataset.delete;if(id){const task=state.tasks.find(t=>t.id===id);if(task?.source?.type==='exam-error')state.errorEntries.forEach(entry=>{if(task.source.errorIds.includes(entry.id)){entry.status='open';entry.taskId=null;entry.reviewedAt=null;}});state.tasks=state.tasks.filter(t=>t.id!==id);render();return;}const subject=e.target.dataset.subject;if(subject){showForm();$('#taskSubject').value=subject;}}
taskList.addEventListener('change',handleTaskChange);taskList.addEventListener('click',handleTaskClick);
$('#subjectGrid').addEventListener('change',handleTaskChange);$('#subjectGrid').addEventListener('click',handleTaskClick);
function showForm(){taskForm.classList.remove('hidden');$('#taskTitle').focus();}
$('#openTaskForm').onclick=showForm; $('#emptyAdd').onclick=showForm;
$('#todayAddTask').onclick=()=>{location.hash='plan';setTimeout(showForm,80);};
taskForm.addEventListener('submit',e=>{e.preventDefault();const task={id:uid(),title:$('#taskTitle').value.trim(),subject:$('#taskSubject').value.trim(),minutes:Number($('#taskMinutes').value),done:false,date:todayKey()};state.tasks.push(task);taskForm.reset();$('#taskMinutes').value=30;taskForm.classList.add('hidden');const planned=state.tasks.filter(t=>t.date===todayKey()).reduce((sum,t)=>sum+t.minutes,0);toast(planned>state.dailyTarget?`Planın kapasiteni ${planned-state.dailyTarget} dk aşıyor.`:'Hedef plana eklendi');render();});

function addSuggestedTask(){
  const action=getNextAction();
  if(action.kind!=='error')return false;
  const task={id:uid(),title:action.title,subject:canonicalSubject(action.subject)||action.subject,minutes:action.minutes,done:false,date:todayKey(),source:{type:'exam-error',errorIds:action.errorIds}};
  state.tasks.push(task);state.errorEntries.forEach(entry=>{if(action.errorIds.includes(entry.id)){entry.status='planned';entry.taskId=task.id;}});render();toast('Öneri bugünün planına eklendi');return true;
}
$('#addSuggestedTask').onclick=addSuggestedTask;
$('#acceptNextAction').onclick=e=>{const kind=e.currentTarget.dataset.actionKind;if(kind==='error'){addSuggestedTask();}else if(kind==='task'){location.hash='plan';}else{location.hash='plan';setTimeout(showForm,80);}};

function updateTimer(){
  const m=Math.floor(timer.left/60),s=timer.left%60;$('#timerText').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const circumference=590.62;$('#ringProgress').style.strokeDashoffset=circumference*(1-timer.left/timer.total);
  document.title=timer.running?`${m}:${String(s).padStart(2,'0')} • Odak`:'Odak — Ders Çalışma Paneli';
}
function stopTimer(){clearInterval(timer.id);timer.running=false;$('#playIcon').textContent='▶';$('#playLabel').textContent='Başlat';}
function completeTimer(){
  stopTimer();
  let completedSession=null;
  if(timer.isFocus){const mins=Math.round(timer.total/60);completedSession={id:uid(),subject:timerSubject.value,minutes:mins,time:new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),date:todayKey()};state.sessions.push(completedSession);toast(`${mins} dakikalık odak kaydedildi!`);render();}
  else toast('Mola tamamlandı. Yeniden odaklanabilirsin.');
  if(state.settings.sound)playTone();
  timer.left=timer.total;updateTimer();
  if(completedSession)setTimeout(()=>openRecallDialog(completedSession),250);
}
$('#toggleTimer').onclick=()=>{if(timer.running){stopTimer();return;}timer.running=true;$('#playIcon').textContent='Ⅱ';$('#playLabel').textContent='Duraklat';timer.id=setInterval(()=>{timer.left--;updateTimer();if(timer.left<=0)completeTimer();},1000);};
$('#resetTimer').onclick=()=>{stopTimer();timer.left=timer.total;updateTimer();toast('Sayaç sıfırlandı');};
$('#skipTimer').onclick=()=>{if(confirm(timer.isFocus?'Bu odak oturumunu tamamlandı olarak kaydetmek ister misin?':'Molayı bitirmek ister misin?'))completeTimer();};
document.querySelectorAll('.mode').forEach((btn,index)=>btn.onclick=()=>{stopTimer();document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active'));btn.classList.add('active');timer.total=Number(btn.dataset.minutes)*60;timer.left=timer.total;timer.isFocus=index===0;$('#timerState').textContent=timer.isFocus?'ODAK ZAMANI':'MOLA ZAMANI';updateTimer();});

const now=new Date();$('#fullDate').textContent=now.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'}).toLocaleUpperCase('tr-TR');
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
function openModal(id,focusSelector){const modal=$(`#${id}`);modal.classList.remove('hidden');document.body.classList.add('modal-open');setTimeout(()=>modal.querySelector(focusSelector||'input,textarea,button')?.focus(),30);}
function closeModal(id){$(`#${id}`).classList.add('hidden');document.body.classList.remove('modal-open');}
document.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>closeModal(button.dataset.closeModal));
document.querySelectorAll('.modal-backdrop').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal&&modal.id!=='recallDialog')closeModal(modal.id);}));
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=document.querySelector('.modal-backdrop:not(.hidden)');if(open){if(open.id==='recallDialog'&&$('#recallText').value.trim()&&!confirm('Yazdıklarını kaydetmeden kapatmak ister misin?'))return;closeModal(open.id);}}});

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
  if(!timer.running){const active=modes.findIndex(b=>b.classList.contains('active'));timer.total=values[Math.max(0,active)]*60;timer.left=timer.total;updateTimer();}
  save();if(showMessage)toast('Ayarlar kaydedildi');
}
function playTone(){
  try{const Ctx=window.AudioContext||window.webkitAudioContext;const ctx=new Ctx();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=660;gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.36);}catch{}
}
document.querySelectorAll('#themeChoices [data-theme]').forEach(btn=>btn.onclick=()=>{state.settings.theme=btn.dataset.theme;applySettings(true);});
document.querySelectorAll('[data-accent]').forEach(btn=>btn.onclick=()=>{state.settings.accent=btn.dataset.accent;applySettings(true);});
$('#reduceMotion').onchange=e=>{state.settings.reduceMotion=e.target.checked;applySettings(true);};
$('#soundSetting').onchange=e=>{state.settings.sound=e.target.checked;applySettings(true);};
$('#testSound').onclick=()=>playTone();
[['focusSetting','focus',5,120],['shortBreakSetting','shortBreak',1,30],['longBreakSetting','longBreak',5,60]].forEach(([id,key,min,max])=>{$(`#${id}`).onchange=e=>{const value=Math.max(min,Math.min(max,Math.round(Number(e.target.value)||state.settings[key])));state.settings[key]=value;e.target.value=value;applySettings(true);};});
$('#dailyTargetSetting').onchange=e=>{state.dailyTarget=Math.max(15,Math.min(720,Math.round(Number(e.target.value)||120)));e.target.value=state.dailyTarget;render();toast('Günlük hedef güncellendi');};
$('#closeSettings').onclick=e=>{e.preventDefault();location.hash=previousView;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.dataset.view==='settings')location.hash=previousView;});
$('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`calisma-yedegi-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);toast('Yedek indirildi');};
$('#showReset').onclick=()=>{$('#resetConfirm').classList.remove('hidden');$('#resetText').focus();};
$('#cancelReset').onclick=()=>{$('#resetConfirm').classList.add('hidden');$('#resetText').value='';$('#confirmReset').disabled=true;};
$('#resetText').oninput=e=>$('#confirmReset').disabled=e.target.value.trim().toLocaleUpperCase('tr-TR')!=='SIFIRLA';
$('#confirmReset').onclick=()=>{state.tasks=[];state.sessions=[];state.exams=[];state.errorEntries=[];state.reviewItems=[];state.reviewHistory=[];state.weeklyReviews=[];state.programCompleted={};save();render();$('#cancelReset').click();toast('İlerleme sıfırlandı');location.hash='today';};

const examNet=(correct,wrong)=>Number((correct-wrong/4).toFixed(2));
const formatNet=value=>Number(value).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
function updateNetPreview(){const c=Number($('#examCorrect').value)||0,w=Number($('#examWrong').value)||0;$('#netPreview').textContent=formatNet(examNet(c,w));}
['examCorrect','examWrong','examBlank'].forEach(id=>$(`#${id}`).addEventListener('input',updateNetPreview));
function openExamForm(){
  $('#examForm').classList.remove('hidden');$('#examDate').value=todayKey();$('#examName').focus();window.scrollTo({top:0,behavior:'smooth'});
}
function closeExamForm(){
  $('#examForm').reset();$('#examDate').value=todayKey();$('#examCorrect').value=0;$('#examWrong').value=0;$('#examBlank').value=0;updateNetPreview();$('#examError').classList.add('hidden');$('#examForm').classList.add('hidden');
}
$('#openExamForm').onclick=openExamForm;$('#emptyExamAdd').onclick=openExamForm;$('#closeExamForm').onclick=closeExamForm;$('#cancelExam').onclick=closeExamForm;
$('#examForm').addEventListener('submit',e=>{
  e.preventDefault();const correct=Number($('#examCorrect').value),wrong=Number($('#examWrong').value),blank=Number($('#examBlank').value),date=$('#examDate').value,error=$('#examError');
  let message='';if(!Number.isInteger(correct)||!Number.isInteger(wrong)||!Number.isInteger(blank)||correct<0||wrong<0||blank<0)message='Doğru, yanlış ve boş alanlarına sıfır veya pozitif tam sayı gir.';else if(correct+wrong+blank===0)message='En az bir soru sonucu girmelisin.';else if(date>todayKey())message='Sonuç tarihi gelecekte olamaz.';
  if(message){error.textContent=message;error.classList.remove('hidden');return;}
  const exam={id:uid(),type:$('#examType').value,name:$('#examName').value.trim(),date,correct,wrong,blank,net:examNet(correct,wrong),duration:Number($('#examDuration').value)||null,score:Number($('#examScore').value)||null};
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
  $('#examList').innerHTML=[...exams].reverse().slice(0,8).map(x=>`<div class="exam-entry"><span class="exam-entry-copy"><strong>${escapeHTML(x.name)}</strong><span>${x.type} · ${new Date(x.date+'T12:00:00').toLocaleDateString('tr-TR')} · ${x.correct}D ${x.wrong}Y ${x.blank}B</span></span><strong class="exam-net">${formatNet(x.net)}</strong><button class="analyze-exam" data-analyze-exam="${x.id}" type="button">Analiz et</button><button class="delete-exam" data-delete-exam="${x.id}" aria-label="${escapeHTML(x.name)} kaydını sil">×</button></div>`).join('');
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
$('#programList').addEventListener('change',event=>{const key=event.target.dataset.programTask;if(!key)return;state.programCompleted[key]=event.target.checked;if(!event.target.checked)delete state.programCompleted[key];render();toast(event.target.checked?'Çalışma tamamlandı!':'Çalışma yeniden açıldı');});
document.querySelectorAll('[data-program-filter]').forEach(button=>button.onclick=()=>{programFilter=button.dataset.programFilter;document.querySelectorAll('[data-program-filter]').forEach(item=>item.classList.toggle('active',item===button));renderProgram();});
document.querySelectorAll('[data-program-week-dir]').forEach(button=>button.onclick=()=>{programWeek+=Number(button.dataset.programWeekDir);renderProgram();$('#programList').scrollIntoView({behavior:'smooth',block:'start'});});
$('#jumpProgramDay').onclick=()=>{programWeek=Number($('#jumpProgramDay').dataset.targetWeek)||0;renderProgram();const day=$('#jumpProgramDay').dataset.targetDay;document.querySelector(`#program-day-${day}`)?.scrollIntoView({behavior:'smooth',block:'center'});};

hydrateSettings();applySettings();render();updateTimer();

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
    execute(input){if(!input||!['TYT','AYT','YDT'].includes(input.type)||!input.name?.trim()||input.date>todayKey()||![input.correct,input.wrong,input.blank].every(Number.isInteger)||input.correct+input.wrong+input.blank<1)throw new Error('Geçerli sınav türü, ad, tarih ve soru sonuçları girilmeli.');const exam={id:uid(),type:input.type,name:input.name.trim(),date:input.date,correct:input.correct,wrong:input.wrong,blank:input.blank,net:examNet(input.correct,input.wrong),duration:null,score:null};state.exams.push(exam);render();return{id:exam.id,net:exam.net,status:'saved'};}
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
