const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const labels = {title:'Artwork name',period:'Period or movement',context:'Historical context',overview:'About the artwork'};
const fields = ['title','artist','date','period','medium','context','overview'];
const state = {artworks:[],ai:false,verified:false,filter:'all',image:'',editing:null,busy:false,grading:false,quiz:[],index:0,results:[],submitted:false,view:'library',mode:'self',initialDraft:''};
let toastTimer;
function toast(message, error=false) {
  const el=$('#toast'); el.textContent=message; el.className=error?'error':''; el.hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.hidden=true,error?9000:4000);
}
async function api(path, body) {
  const response=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json(); if(!response.ok) throw new Error(value.error||'Request failed. Please try again.'); return value;
}
function ask(title,description,accept='Continue') {
  const dialog=$('#confirm-dialog'); $('#confirm-title').textContent=title; $('#confirm-description').textContent=description; $('#confirm-accept').textContent=accept;
  return new Promise(resolve=>{
    const finish=value=>{dialog.oncancel=null;dialog.close();resolve(value);};
    $('#confirm-cancel').onclick=()=>finish(false); $('#confirm-accept').onclick=()=>finish(true);
    dialog.oncancel=event=>{event.preventDefault();finish(false);}; dialog.showModal();
  });
}
const ready = art => !!(art.image && art.title && art.period && art.context && art.overview);
async function showView(view) {
  if(state.grading)return toast('Please wait while your answers are being checked.');
  if(view==='library' && state.view==='quiz' && state.quiz.length) {
    if(!await ask('Leave this practice session?','Your saved artworks are safe. The current session and its answers will be cleared.','Leave session'))return;
    state.quiz=[];
  }
  state.view=view; $('#library-view').hidden=view!=='library'; $('#quiz-view').hidden=view!=='quiz';
  document.querySelectorAll('.nav').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
  if(view==='quiz'&&!state.quiz.length)renderQuizStart();
  window.scrollTo({top:0,behavior:'instant'});
}
function renderCollection() {
  // Once the user has a collection, put their own artworks ahead of onboarding.
  const hasArtworks=state.artworks.length>0;
  $('.feature').hidden=hasArtworks;$('.workflow-strip').hidden=hasArtworks;
  $('#nav-count').textContent=state.artworks.length; $('#total-count').textContent=state.artworks.length;
  $('#ready-count').textContent=state.artworks.filter(ready).length;
  $('#hero-add').innerHTML=(state.artworks.length?'Add another artwork':'Add your first artwork')+' '+icon('arrow');
  const query=$('#search').value.trim().toLowerCase();
  const items=state.artworks.filter(a=>(state.filter==='all'||(state.filter==='ready'?ready(a):!ready(a)))&&[a.title,a.artist,a.period,a.context].some(v=>v.toLowerCase().includes(query)));
  $('#collection-count').textContent=`${items.length} ${items.length===1?'artwork':'artworks'}`;
  $('#empty').hidden=!!state.artworks.length; $('#no-results').hidden=!state.artworks.length||!!items.length;
  $('#art-grid').innerHTML=items.map(a=>`<article class="art-card"><button class="art-image" data-edit="${escapeHTML(a.id)}" aria-label="Edit ${escapeHTML(a.title)}">${a.image?`<img src="${a.image}" alt="${escapeHTML(a.title)}" loading="lazy">`:`<span class="art-placeholder">${icon('image')}</span><span class="no-image-label">Add an artwork image</span>`}<span class="image-badge ${ready(a)?'ready':''}">${icon(ready(a)?'check':'book')}${ready(a)?'Ready to practice':'Finish your notes'}</span></button><div class="card-body"><span class="period-tag">${escapeHTML(a.period||'Add a period or movement')}</span><h3 class="card-title">${escapeHTML(a.title)}</h3><p class="card-subtitle">${escapeHTML(a.artist||'Artist unknown')}${a.date?' · '+escapeHTML(a.date):''}</p><p class="card-excerpt">${escapeHTML(a.overview||'Add a few notes about what you see and why this artwork matters.')}</p><div class="card-bottom"><button class="secondary" data-edit="${escapeHTML(a.id)}">${icon('book')} View & edit notes</button>${ready(a)?`<button class="text-button" data-practice="${escapeHTML(a.id)}" aria-label="Practice ${escapeHTML(a.title)}">Practice ${icon('arrow')}</button>`:''}</div></div></article>`).join('');
}
function setFilter(filter) {
  state.filter=filter; document.querySelectorAll('[data-filter]').forEach(button=>{const active=button.dataset.filter===filter;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});renderCollection();
}
async function refresh() {state.artworks=await api('artworks');renderCollection();}
function draftSnapshot() {return JSON.stringify({image:state.image,...Object.fromEntries(fields.map(key=>[key,$('#art-form').elements[key].value]))});}
function openEditor(art=null) {
  state.editing=art?.id||null;state.image=art?.image||'';state.busy=false;
  $('#art-form').reset();$('#editor-title').textContent=art?'A closer look':'Add an artwork';$('#delete-art').hidden=!art;$('#ai-notice').hidden=true;
  for(const key of fields)$('#art-form').elements[key].value=art?.[key]||'';
  renderImage();updateReadiness();state.initialDraft=draftSnapshot();$('#editor').showModal();$('#editor').scrollTop=0;
}
async function closeEditor() {
  if(state.busy)return;
  if(draftSnapshot()!==state.initialDraft&&!await ask('Discard your changes?','The changes in this editor haven’t been saved.','Discard changes'))return;
  $('#editor').close();
}
function updateReadiness() {
  const complete=!!state.image&&Object.keys(labels).every(key=>$('#art-form').elements[key].value.trim());
  const el=$('#editor-readiness');el.classList.toggle('complete',complete);
  el.innerHTML=icon(complete?'check':'book')+(complete?'All set. Save this artwork to add it to your practice collection.':'Add an image and complete the name, period, context, and overview to unlock practice.');
}
function renderImage() {
  $('#image-preview').hidden=!state.image;$('#upload-hint').hidden=!!state.image;$('#replace-hint').hidden=!state.image;
  if(state.image)$('#image-preview').src=state.image;else $('#image-preview').removeAttribute('src');
  $('#identify').disabled=!state.image||state.busy;updateReadiness();
}
async function chooseImage(file) {
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)return toast('Choose a JPG, PNG, or WebP smaller than 5 MB.',true);
  try {
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=data;});
    state.image=data;renderImage();
  }catch{toast('That image could not be opened. Try another file.',true);}
}
function renderAI() {
  $('#connection').classList.toggle('connected',state.verified);$('#connection').classList.toggle('configured',state.ai&&!state.verified);
  $('#connection span').textContent=state.verified?'AI connected':state.ai?'Check AI connection':'Connect AI';
  $('#ai-status-dot').classList.toggle('connected',state.verified);
  $('#ai-status-title').textContent=state.verified?'Connected and responding':state.ai?'API key configured — ready to test':'API key needed';
  $('#ai-status-description').textContent=state.verified?'Image recognition and written-answer feedback are available.':state.ai?'Run a connection check to verify model access and billing.':'The app is ready. Add your key securely in environment settings to enable AI.';
  $('#editor-connect').hidden=state.ai;$('#ai-banner').hidden=state.verified;
}
async function refreshAI() {const status=await api('status');state.ai=status.ai;state.verified=!!status.verified;renderAI();return status;}
function openSettings() {$('#settings').showModal();refreshAI().catch(()=>toast('Could not check AI settings. Try again.',true));}
$('#connection').onclick=openSettings;$('#banner-connect').onclick=openSettings;$('#editor-connect').onclick=openSettings;$('#close-settings').onclick=()=>$('#settings').close();
$('#test-ai').onclick=async()=>{
  const button=$('#test-ai');const result=$('#connection-result');button.disabled=true;button.textContent='Checking connection…';result.hidden=true;
  try{await refreshAI();const response=await api('ai/test',{});state.verified=true;renderAI();result.className='notice success';result.textContent=`Connected. ${response.model} responded successfully. You’re ready to identify artwork and get quiz feedback.`;}
  catch(err){state.verified=false;renderAI();result.className='notice error';result.textContent=err.message;}
  finally{result.hidden=false;button.disabled=false;button.innerHTML=icon('spark')+' Check AI connection';}
};
$('#add-art').onclick=()=>openEditor();$('#empty-add').onclick=()=>openEditor();$('#hero-add').onclick=()=>openEditor();
$('#art-form').addEventListener('input',updateReadiness);
 document.querySelectorAll('.close-modal').forEach(b=>b.onclick=closeEditor);
$('#editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('#image-file').onchange=e=>chooseImage(e.target.files[0]);
const upload=$('#upload-label');upload.ondragover=e=>{e.preventDefault();upload.classList.add('dragging');};upload.ondragleave=()=>upload.classList.remove('dragging');upload.ondrop=e=>{e.preventDefault();upload.classList.remove('dragging');if(!state.busy)chooseImage(e.dataTransfer.files[0]);};
$('#art-grid').onclick=e=>{
  const edit=e.target.closest('[data-edit]');if(edit)return openEditor(state.artworks.find(a=>a.id===edit.dataset.edit));
  const practice=e.target.closest('[data-practice]');if(practice){showView('quiz');startQuiz(state.artworks.filter(a=>a.id===practice.dataset.practice));}
};
$('#search').oninput=renderCollection;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>setFilter(b.dataset.filter));
$('#clear-filters').onclick=()=>{$('#search').value='';setFilter('all');};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#feature-practice').onclick=()=>showView('quiz');
function editorBusy(busy) {state.busy=busy;$('#art-form').querySelectorAll('input,textarea,button').forEach(el=>el.disabled=busy);renderImage();}
$('#identify').onclick=async()=>{
  if(!state.ai){openSettings();return;}
  if(fields.some(k=>$('#art-form').elements[k].value.trim())&&!await ask('Replace the current notes?','AI will write a new draft. Your saved version stays unchanged until you save.','Generate new draft'))return;
  editorBusy(true);$('#identify').textContent='Looking closely…';
  try {
    const result=await api('identify',{image:state.image});
    for(const key of fields)if(typeof result[key]==='string')$('#art-form').elements[key].value=result[key];
    $('#ai-notice').textContent=`Identification confidence: ${result.confidence||'unknown'}. ${result.caveat||'Verify these notes against your course materials.'}`;$('#ai-notice').className='notice';$('#ai-notice').hidden=false;
    state.verified=true;renderAI();toast('Your draft is ready. Review the details before saving.');
  }catch(err){state.verified=false;renderAI();$('#ai-notice').textContent=err.message;$('#ai-notice').className='notice error';$('#ai-notice').hidden=false;}
  finally{editorBusy(false);$('#identify').innerHTML=icon('spark')+' Identify with AI';updateReadiness();}
};
$('#art-form').onsubmit=async event=>{
  event.preventDefault();if(state.busy)return;
  const data=Object.fromEntries(new FormData(event.target));data.id=state.editing;data.image=state.image;editorBusy(true);
  try{await api('artworks',data);await refresh();$('#editor').close();state.quiz=[];toast(ready(data)?'Artwork saved. It’s ready for your next practice session.':'Artwork saved. You can finish your notes anytime.');}
  catch(err){toast(err.message,true);}finally{editorBusy(false);}
};
$('#delete-art').onclick=async()=>{
  if(!await ask('Delete this artwork?','The image and study notes will be permanently removed from your collection.','Delete artwork'))return;
  editorBusy(true);
  try{await api('delete',{id:state.editing});await refresh();state.quiz=[];$('#editor').close();toast('Artwork deleted.');}
  catch(err){toast(err.message,true);}finally{editorBusy(false);}
};
function renderQuizStart() {
  const count=state.artworks.filter(ready).length;
  $('#quiz-content').innerHTML=`<div class="quiz-start"><div class="quiz-start-copy"><div class="eyebrow">RECALL, REFLECT, REPEAT</div><h2>A fresh look at<br>what you’ve learned.</h2><p>We’ll show you the artwork. You recall its name, period, historical context, and visual significance — in your own words.</p><p>${state.ai?'Choose AI feedback for a practice score and suggestions, or compare your answers with your notes yourself.':'Start with self-review: compare your answers side by side with your saved notes. Connect AI when you’re ready for graded feedback.'}</p><button id="start-quiz" class="primary" ${count?'':'disabled'}>Start practicing ${icon('arrow')}</button><button id="back-library" class="text-button">Back to collection</button></div><div class="quiz-setup"><h3>YOUR SESSION</h3><div class="quiz-setting">${icon('image')}<div><strong>${count} ${count===1?'artwork':'artworks'} ready to practice</strong><small>Each session shuffles your selected artworks.</small><select id="quiz-length" aria-label="Number of artworks">${[1,5,10].map(n=>`<option value="${n}" ${n===5?'selected':''}>${Math.min(count,n)} ${Math.min(count,n)===1?'artwork':'artworks'}${n===10?' (up to 10)':''}</option>`).join('')}</select></div></div><div class="quiz-setting">${icon('spark')}<div><strong>Feedback style</strong><small>AI scores are practice estimates, not course grades.</small><select id="quiz-mode" aria-label="Feedback style">${state.ai?'<option value="ai">AI grading & feedback</option>':''}<option value="self">Self-review with saved notes</option></select></div></div><div class="notice">${count?'A different wording can still be a great answer. Focus on the ideas, rather than memorizing every sentence.':'To unlock practice, add an image, name, period, historical context, and overview to an artwork.'}</div>${!count?'<button id="quiz-sample" class="secondary">Try the sample artwork</button>':''}</div></div>`;
  $('#start-quiz').onclick=()=>startQuiz();$('#back-library').onclick=()=>showView('library');if($('#quiz-sample'))$('#quiz-sample').onclick=loadSample;
}
function startQuiz(selected=null) {
  state.mode=$('#quiz-mode')?.value||(state.ai?'ai':'self');let items=selected||state.artworks.filter(ready);
  if(!items.length)return;
  items=[...items];for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
  state.quiz=items.slice(0,selected?1:Number($('#quiz-length')?.value||5));state.index=0;state.results=[];renderQuestion();
}
function renderQuestion() {
  state.submitted=false;const art=state.quiz[state.index];
  $('#quiz-content').innerHTML=`<div class="quiz-progress"><span>ARTWORK ${state.index+1} OF ${state.quiz.length}</span><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${state.quiz.length}" aria-valuenow="${state.index}" aria-label="Session progress"><div class="progress-fill" style="width:${state.index/state.quiz.length*100}%"></div></div><button id="end-quiz" class="text-button">End session</button></div><div class="quiz-layout"><div class="quiz-art-panel"><div class="quiz-picture"><img src="${art.image}" alt="Artwork to identify"></div><p class="quiz-caption">Take a moment to look. What do the details tell you?</p></div><form id="quiz-form" class="quiz-fields"><div class="eyebrow">YOUR TURN</div><h2>Tell its story.</h2><p class="quiz-instruction">Use your own words. It’s okay to leave a field blank if you’re unsure.</p>${Object.entries(labels).map(([key,label])=>`<label>${label}${['title','period'].includes(key)?`<input name="${key}" placeholder="${key==='title'?'What is this artwork called?':'Which period or movement?'}" autocomplete="off">`:`<textarea name="${key}" rows="4" placeholder="${key==='context'?'Place it in its time and culture…':'Describe the subject, technique, and significance…'}"></textarea>`}</label>`).join('')}<button id="grade-answer" class="primary" type="submit">${state.mode==='ai'?'Get feedback':'Compare with my notes'} ${icon('arrow')}</button></form></div><div id="quiz-results" hidden></div>`;
  $('#end-quiz').onclick=async()=>{if(!state.submitted&&!await ask('End this practice session?','Your current answer won’t be saved. You can still see a summary of completed artworks.','End session'))return;renderSummary();};
  $('#quiz-form').onsubmit=gradeAnswer;window.scrollTo({top:0,behavior:'instant'});
}
async function gradeAnswer(event) {
  event.preventDefault();if(state.submitted||state.grading)return;
  const answers=Object.fromEntries(new FormData(event.target));if(!Object.values(answers).some(v=>v.trim()))return toast('Try at least one answer before checking.',true);
  const button=$('#grade-answer');button.disabled=true;button.textContent=state.mode==='ai'?'Reading your answers…':'Opening your notes…';$('#end-quiz').disabled=true;state.grading=true;
  try{
    const result=await api('grade',{id:state.quiz[state.index].id,answers,mode:state.mode});state.submitted=true;
    if(result.mode==='ai'){state.verified=true;renderAI();}
    state.results.push({title:state.quiz[state.index].title,...result});
    $('#quiz-form').querySelectorAll('input,textarea').forEach(el=>el.readOnly=true);button.hidden=true;
    const art=state.quiz[state.index],el=$('#quiz-results');el.hidden=false;el.className='results';
    el.innerHTML=`<div class="results-header"><div><div class="eyebrow">${result.mode==='ai'?'A CLOSER LOOK AT YOUR ANSWERS':'YOUR NOTES, SIDE BY SIDE'}</div><h2>${escapeHTML(art.title)}</h2><p class="fine-print">${result.mode==='ai'?escapeHTML(result.summary||'Review each field below.'):'Compare the key ideas you recalled. This session is unscored.'}</p></div>${result.mode==='ai'?`<div class="score">${result.score}<small> / 100</small></div>`:''}</div><div class="results-body">${Object.entries(labels).map(([key,label])=>{const f=result.fields?.find(x=>x.field===key);return `<div class="result-field"><strong>${label}${f?`<span class="field-score ${f.score<70?'low':''}">${f.score}/100</span>`:''}</strong>${f?`<p>${escapeHTML(f.feedback)}</p>`:''}<details ${result.mode==='self'?'open':''}><summary>Compare your answer with your notes</summary><div class="answer-comparison"><div class="answer-box"><b>Your answer</b><p>${escapeHTML(answers[key]||'No answer submitted.')}</p></div><div class="answer-box reference"><b>Saved notes</b><p>${escapeHTML(art[key])}</p></div></div></details></div>`;}).join('')}${result.mode==='ai'?'<p class="fine-print">AI practice estimate. All four fields are weighted equally. Check feedback against your course material.</p>':''}<button id="next-question" class="primary">${state.index+1<state.quiz.length?'Next artwork':'See session summary'} ${icon('arrow')}</button></div>`;
    $('#next-question').onclick=()=>{state.index++;if(state.index>=state.quiz.length)renderSummary();else renderQuestion();};el.scrollIntoView({behavior:'instant',block:'start'});
  }catch(err){toast(err.message,true);button.disabled=false;button.innerHTML='Try again '+icon('arrow');}
  finally{state.grading=false;$('#end-quiz').disabled=false;}
}
function renderSummary() {
  const scored=state.results.filter(r=>r.mode==='ai'),average=scored.length?Math.round(scored.reduce((sum,r)=>sum+r.score,0)/scored.length):null;
  $('#quiz-content').innerHTML=`<div class="session-summary"><div class="eyebrow">ONE STEP CLOSER</div><h2>${state.results.length?'Time well spent.':'Come back for another look.'}</h2><p>Every attempt builds a connection. Revisit your notes, then give it another try.</p><div class="session-score"><div><span class="score">${state.results.length}</span><small>artworks reviewed</small></div>${average!==null?`<div><span class="score">${average}%</span><small>AI practice average</small></div>`:''}</div>${state.results.map(r=>`<div class="result-field"><strong>${escapeHTML(r.title)}<span>${r.mode==='ai'?r.score+'%':'Self-reviewed'}</span></strong></div>`).join('')}<p class="fine-print">Session results are temporary. Your artwork images and study notes stay saved.</p><div class="quiz-actions"><button id="again" class="primary">Practice again ${icon('arrow')}</button><button id="done" class="secondary">Back to collection</button></div></div>`;
  state.quiz=[];$('#again').onclick=renderQuizStart;$('#done').onclick=()=>showView('library');window.scrollTo({top:0,behavior:'instant'});
}
async function loadSample() {
  const buttons=[$('#load-samples'),$('#quiz-sample')].filter(Boolean);buttons.forEach(b=>b.disabled=true);
  try {
    if(!state.artworks.some(a=>a.id==='sample-starry-night')){
      const response=await fetch('/assets/starry-night.jpg');if(!response.ok)throw new Error('Could not load the sample image. Please try again.');
      const blob=await response.blob();const image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
      await api('artworks',{id:'sample-starry-night',image,title:'The Starry Night',artist:'Vincent van Gogh',date:'1889',period:'Post-Impressionism',medium:'Oil on canvas',context:'Van Gogh painted The Starry Night in June 1889 while staying at the asylum of Saint-Paul-de-Mausole in Saint-Rémy-de-Provence, France. The landscape draws on the view from his window, memory, and imagination. It reflects a Post-Impressionist departure from purely observed appearances toward expressive color and form. The work was not made as a public commission; it belongs to his sustained exploration of nature and emotional experience.',overview:'A swirling night sky fills most of the canvas above a quiet village and rolling hills. Bright stars and a crescent moon contrast with deep blues, while a dark cypress rises at the left and links earth and sky. Thick, directional brushstrokes create movement and visible texture. The village includes an imagined church form associated with the artist’s Dutch memories. Rather than a literal night view, the composition uses color, rhythm, and exaggerated natural forms to convey an expressive response to the landscape.'});
    }
    await refresh();toast('The Starry Night is in your collection, ready to practice.');if(state.view==='quiz')renderQuizStart();
  }catch(err){toast(err.message,true);}finally{buttons.forEach(b=>b.disabled=false);}
}
$('#load-samples').onclick=loadSample;
window.addEventListener('beforeunload',event=>{if(($('#editor').open&&draftSnapshot()!==state.initialDraft)||state.quiz.length){event.preventDefault();event.returnValue='';}});
async function init() {try{await Promise.all([refreshAI(),refresh()]);}catch{toast('Could not load your study space. Check that the app is running and refresh.',true);$('#connection span').textContent='Connection unavailable';}}
init();
