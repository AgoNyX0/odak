const STORAGE_KEY = 'odak-study-v1';
const todayKey = () => new Date().toISOString().slice(0,10);
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
  examTarget: 90,
  settings: {theme:'dark',accent:'indigo',focus:25,shortBreak:5,longBreak:15,sound:true,reduceMotion:false}
};
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || seed; } catch { state = seed; }
state.tasks ||= []; state.sessions ||= []; state.exams ||= []; state.dailyTarget ||= 120; state.examTarget ||= 90;
state.settings = {...seed.settings,...(state.settings||{})};
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const $ = s => document.querySelector(s);
const taskList=$('#taskList'), taskForm=$('#taskForm'), timerSubject=$('#timerSubject');
let timer={total:1500,left:1500,running:false,id:null,isFocus:true};

function escapeHTML(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function formatMinutes(min){if(min<60)return `${min} dk`;const h=Math.floor(min/60),m=min%60;return m?`${h} sa ${m} dk`:`${h} sa`;}
function dayLabel(date){return ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'][date.getDay()];}

function render(){
  const todays=state.tasks.filter(t=>t.date===todayKey());
  const done=todays.filter(t=>t.done).length;
  const pct=todays.length?Math.round(done/todays.length*100):0;
  taskList.innerHTML=todays.map(t=>`<label class="task ${t.done?'done':''}"><input class="task-check" type="checkbox" data-id="${t.id}" ${t.done?'checked':''}><span class="task-copy"><strong>${escapeHTML(t.title)}</strong><span>${escapeHTML(t.subject)} · ${t.minutes} dk</span></span><button class="delete-task" data-delete="${t.id}" aria-label="${escapeHTML(t.title)} görevini sil">×</button></label>`).join('');
  $('#emptyTasks').classList.toggle('hidden',todays.length>0);
  $('#planSummary').textContent=`${done} / ${todays.length} tamamlandı`;
  $('#planPercent').textContent=`${pct}%`; $('#planBar').style.width=`${pct}%`;
  $('#doneCount').textContent=`${done} görev`; $('#doneDetail').textContent=`Planının %${pct}'i`;

  const subjects=[...new Set(todays.map(t=>t.subject))];
  const old=timerSubject.value;
  timerSubject.innerHTML=(subjects.length?subjects:['Genel çalışma']).map(s=>`<option>${escapeHTML(s)}</option>`).join('');
  if(subjects.includes(old))timerSubject.value=old;

  const sessions=state.sessions.filter(s=>s.date===todayKey());
  const mins=sessions.reduce((a,s)=>a+s.minutes,0);
  $('#todayMinutes').textContent=formatMinutes(mins); $('#focusCount').textContent=`${sessions.length} oturum`;
  const targetPct=Math.min(100,Math.round(mins/state.dailyTarget*100));
  $('#todayTarget').textContent=`${state.dailyTarget} dk hedefin var`;
  $('#targetPercent').textContent=`${targetPct}%`; $('#targetRing').style.background=`conic-gradient(var(--green) ${targetPct}%,#29314c 0)`;
  $('#sessionList').innerHTML=[...sessions].reverse().map(s=>`<div class="session"><i class="session-dot"></i><div><strong>${escapeHTML(s.subject)}</strong><span>${s.time}</span></div><em>${s.minutes} dk</em></div>`).join('');
  $('#emptySessions').classList.toggle('hidden',sessions.length>0);
  renderWeek();
  renderExams();
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

taskList.addEventListener('change',e=>{if(e.target.matches('.task-check')){const t=state.tasks.find(x=>x.id===e.target.dataset.id);if(t){t.done=e.target.checked;toast(t.done?'Hedef tamamlandı!':'Hedef yeniden açıldı');render();}}});
taskList.addEventListener('click',e=>{const id=e.target.dataset.delete;if(id){state.tasks=state.tasks.filter(t=>t.id!==id);render();}});
function showForm(){taskForm.classList.remove('hidden');$('#taskTitle').focus();}
$('#openTaskForm').onclick=showForm; $('#emptyAdd').onclick=showForm;
taskForm.addEventListener('submit',e=>{e.preventDefault();state.tasks.push({id:uid(),title:$('#taskTitle').value.trim(),subject:$('#taskSubject').value.trim(),minutes:Number($('#taskMinutes').value),done:false,date:todayKey()});taskForm.reset();$('#taskMinutes').value=30;taskForm.classList.add('hidden');toast('Hedef plana eklendi');render();});

function updateTimer(){
  const m=Math.floor(timer.left/60),s=timer.left%60;$('#timerText').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const circumference=590.62;$('#ringProgress').style.strokeDashoffset=circumference*(1-timer.left/timer.total);
  document.title=timer.running?`${m}:${String(s).padStart(2,'0')} • Odak`:'Odak — Ders Çalışma Paneli';
}
function stopTimer(){clearInterval(timer.id);timer.running=false;$('#playIcon').textContent='▶';$('#playLabel').textContent='Başlat';}
function completeTimer(){
  stopTimer();
  if(timer.isFocus){const mins=Math.round(timer.total/60);state.sessions.push({id:uid(),subject:timerSubject.value,minutes:mins,time:new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),date:todayKey()});toast(`${mins} dakikalık odak kaydedildi!`);render();}
  else toast('Mola tamamlandı. Yeniden odaklanabilirsin.');
  if(state.settings.sound)playTone();
  timer.left=timer.total;updateTimer();
}
$('#toggleTimer').onclick=()=>{if(timer.running){stopTimer();return;}timer.running=true;$('#playIcon').textContent='Ⅱ';$('#playLabel').textContent='Duraklat';timer.id=setInterval(()=>{timer.left--;updateTimer();if(timer.left<=0)completeTimer();},1000);};
$('#resetTimer').onclick=()=>{stopTimer();timer.left=timer.total;updateTimer();toast('Sayaç sıfırlandı');};
$('#skipTimer').onclick=()=>{if(confirm(timer.isFocus?'Bu odak oturumunu tamamlandı olarak kaydetmek ister misin?':'Molayı bitirmek ister misin?'))completeTimer();};
document.querySelectorAll('.mode').forEach(btn=>btn.onclick=()=>{stopTimer();document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active'));btn.classList.add('active');timer.total=Number(btn.dataset.minutes)*60;timer.left=timer.total;timer.isFocus=btn.dataset.minutes==='25';$('#timerState').textContent=timer.isFocus?'ODAK ZAMANI':'MOLA ZAMANI';updateTimer();});

const now=new Date();$('#fullDate').textContent=now.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'}).toLocaleUpperCase('tr-TR');
$('#examDate').value=todayKey();

const viewTitles={
  today:'Merhaba, çalışmaya hazır mısın?',
  plan:'Bugünün çalışma planı',
  progress:'İlerlemen birikiyor',
  exams:'Deneme gelişimin',
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
$('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`calisma-yedegi-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);toast('Yedek indirildi');};
$('#showReset').onclick=()=>{$('#resetConfirm').classList.remove('hidden');$('#resetText').focus();};
$('#cancelReset').onclick=()=>{$('#resetConfirm').classList.add('hidden');$('#resetText').value='';$('#confirmReset').disabled=true;};
$('#resetText').oninput=e=>$('#confirmReset').disabled=e.target.value.trim().toLocaleUpperCase('tr-TR')!=='SIFIRLA';
$('#confirmReset').onclick=()=>{state.tasks=[];state.sessions=[];state.exams=[];save();render();$('#cancelReset').click();toast('İlerleme sıfırlandı');location.hash='today';};

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
  state.exams.push(exam);$('#examFilter').value=exam.type;closeExamForm();render();toast('Deneme eklendi');
});
$('#examTarget').onchange=e=>{state.examTarget=Math.max(1,Math.min(200,Number(e.target.value)||90));e.target.value=state.examTarget;render();toast('Net hedefi güncellendi');};
$('#examFilter').onchange=()=>renderExams();
$('#examList').addEventListener('click',e=>{const id=e.target.dataset.deleteExam;if(id){const exam=state.exams.find(x=>x.id===id);if(exam&&confirm(`${exam.name} kaydını silmek istiyor musun?`)){state.exams=state.exams.filter(x=>x.id!==id);render();toast('Deneme silindi');}}});

function renderExams(){
  const type=$('#examFilter')?.value||'TYT';const exams=state.exams.filter(e=>e.type===type).sort((a,b)=>a.date.localeCompare(b.date));const recent=exams.slice(-10);const latest=exams.at(-1);
  $('#examTarget').value=state.examTarget;$('#examTargetLabel').textContent=state.examTarget;
  $('#latestNet').textContent=latest?formatNet(latest.net):'—';$('#latestExamName').textContent=latest?latest.name:'Henüz kayıt yok';
  const last3=exams.slice(-3);$('#averageNet').textContent=last3.length?formatNet(last3.reduce((a,x)=>a+x.net,0)/last3.length):'—';
  $('#bestNet').textContent=exams.length?formatNet(Math.max(...exams.map(x=>x.net))):'—';
  $('#targetGap').textContent=latest?`${latest.net>=state.examTarget?'+':''}${formatNet(latest.net-state.examTarget)}`:'—';
  $('#examList').innerHTML=[...exams].reverse().slice(0,8).map(x=>`<div class="exam-entry"><span class="exam-entry-copy"><strong>${escapeHTML(x.name)}</strong><span>${x.type} · ${new Date(x.date+'T12:00:00').toLocaleDateString('tr-TR')} · ${x.correct}D ${x.wrong}Y ${x.blank}B</span></span><strong class="exam-net">${formatNet(x.net)}</strong><button class="delete-exam" data-delete-exam="${x.id}" aria-label="${escapeHTML(x.name)} kaydını sil">×</button></div>`).join('');
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
    execute(){const tasks=state.tasks.filter(t=>t.date===todayKey());const sessions=state.sessions.filter(s=>s.date===todayKey());return{date:todayKey(),plannedTasks:tasks.length,completedTasks:tasks.filter(t=>t.done).length,studiedMinutes:sessions.reduce((a,s)=>a+s.minutes,0),focusSessions:sessions.length};}
  });
  register({
    name:'add_study_task',title:'Çalışma hedefi ekle',
    description:'Bugünün planına ders, görev ve süre bilgisiyle yeni bir çalışma hedefi ekler.',
    inputSchema:{type:'object',properties:{title:{type:'string',minLength:1,maxLength:80},subject:{type:'string',minLength:1,maxLength:24},minutes:{type:'integer',minimum:5,maximum:240}},required:['title','subject','minutes'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){if(!input||typeof input.title!=='string'||!input.title.trim()||typeof input.subject!=='string'||!input.subject.trim()||!Number.isInteger(input.minutes)||input.minutes<5||input.minutes>240)throw new Error('Geçerli bir başlık, ders ve 5–240 arası dakika girilmeli.');const task={id:uid(),title:input.title.trim(),subject:input.subject.trim(),minutes:input.minutes,done:false,date:todayKey()};state.tasks.push(task);render();return{id:task.id,status:'planned'};}
  });
  register({
    name:'complete_study_task',title:'Çalışma hedefini tamamla',
    description:'Kimliği verilen çalışma hedefini tamamlandı olarak işaretler.',
    inputSchema:{type:'object',properties:{taskId:{type:'string',minLength:1}},required:['taskId'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const task=state.tasks.find(t=>t.id===input?.taskId&&t.date===todayKey());if(!task)throw new Error('Bugünün planında bu kimlikle bir hedef bulunamadı.');task.done=true;render();return{id:task.id,status:'completed'};}
  });
  register({
    name:'add_exam_result',title:'Deneme sonucu ekle',
    description:'Bir TYT, AYT veya YDT denemesini doğru, yanlış ve boş sayılarıyla kaydeder; neti otomatik hesaplar.',
    inputSchema:{type:'object',properties:{type:{type:'string',enum:['TYT','AYT','YDT']},name:{type:'string',minLength:1,maxLength:60},date:{type:'string'},correct:{type:'integer',minimum:0},wrong:{type:'integer',minimum:0},blank:{type:'integer',minimum:0}},required:['type','name','date','correct','wrong','blank'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){if(!input||!['TYT','AYT','YDT'].includes(input.type)||!input.name?.trim()||input.date>todayKey()||![input.correct,input.wrong,input.blank].every(Number.isInteger)||input.correct+input.wrong+input.blank<1)throw new Error('Geçerli sınav türü, ad, tarih ve soru sonuçları girilmeli.');const exam={id:uid(),type:input.type,name:input.name.trim(),date:input.date,correct:input.correct,wrong:input.wrong,blank:input.blank,net:examNet(input.correct,input.wrong),duration:null,score:null};state.exams.push(exam);render();return{id:exam.id,net:exam.net,status:'saved'};}
  });
}
registerStudyTools();
