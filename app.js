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
  sessions: [{id:uid(),subject:'Türkçe',minutes:25,time:'09:20',date:todayKey()}]
};
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || seed; } catch { state = seed; }
state.tasks ||= []; state.sessions ||= []; state.dailyTarget ||= 120;
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
  $('#targetPercent').textContent=`${targetPct}%`; $('#targetRing').style.background=`conic-gradient(var(--green) ${targetPct}%,#29314c 0)`;
  $('#sessionList').innerHTML=[...sessions].reverse().map(s=>`<div class="session"><i class="session-dot"></i><div><strong>${escapeHTML(s.subject)}</strong><span>${s.time}</span></div><em>${s.minutes} dk</em></div>`).join('');
  $('#emptySessions').classList.toggle('hidden',sessions.length>0);
  renderWeek();
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
  timer.left=timer.total;updateTimer();
}
$('#toggleTimer').onclick=()=>{if(timer.running){stopTimer();return;}timer.running=true;$('#playIcon').textContent='Ⅱ';$('#playLabel').textContent='Duraklat';timer.id=setInterval(()=>{timer.left--;updateTimer();if(timer.left<=0)completeTimer();},1000);};
$('#resetTimer').onclick=()=>{stopTimer();timer.left=timer.total;updateTimer();toast('Sayaç sıfırlandı');};
$('#skipTimer').onclick=()=>{if(confirm(timer.isFocus?'Bu odak oturumunu tamamlandı olarak kaydetmek ister misin?':'Molayı bitirmek ister misin?'))completeTimer();};
document.querySelectorAll('.mode').forEach(btn=>btn.onclick=()=>{stopTimer();document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active'));btn.classList.add('active');timer.total=Number(btn.dataset.minutes)*60;timer.left=timer.total;timer.isFocus=btn.dataset.minutes==='25';$('#timerState').textContent=timer.isFocus?'ODAK ZAMANI':'MOLA ZAMANI';updateTimer();});

const now=new Date();$('#fullDate').textContent=now.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'}).toLocaleUpperCase('tr-TR');
render();updateTimer();

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
}
registerStudyTools();
