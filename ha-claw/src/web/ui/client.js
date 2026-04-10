const base='__BASEPATH__';
const msgs=document.getElementById('messages');
const inp=document.getElementById('input');
const sendBtn=document.getElementById('send');
const micBtn=document.getElementById('mic');

// ── Load welcome name from profile ───────────────────────
(async function(){
  try{
    const r=await fetch(base+'/api/settings');
    const d=await r.json();
    if(d.profile){
      if(d.profile.userName) {
        document.getElementById('welcome-name').textContent=d.profile.userName+'.';
        window.userName=d.profile.userName.toUpperCase();
      }
      if(d.profile.botName) window.botName=d.profile.botName.toUpperCase();
    }
    if(d.version){const vEl=document.getElementById('app-version');if(vEl)vEl.textContent='v'+d.version;}
    // After names are loaded, fetch history
    loadChatHistory();
  }catch(e){}
})();

async function loadChatHistory(){
  try{
    const r=await fetch(base+'/api/chat/history');
    const ms=await r.json();
    if(ms&&ms.length>0){
      msgs.innerHTML=''; // Clear/Reset
      ms.forEach(m=>{
        if(m.role==='user') addMsg(m.content,'user',true);
        else if(m.role==='assistant' && m.content) addMsg(m.content,'bot',true);
      });
      msgs.scrollTop=msgs.scrollHeight;
    }
  }catch(e){}
}

// ── Theme ─────────────────────────────────────────────────
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  localStorage.setItem('ha-claw-theme',t);
  document.querySelectorAll('.theme-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.theme===t);
  });
}
// Detect HA theme or user preference
(function(){
  const saved=localStorage.getItem('ha-claw-theme');
  if(saved){setTheme(saved);return;}
  // Try HA Ingress theme detection
  try{
    const ha=parent?.document?.documentElement;
    if(ha){
      const style=getComputedStyle(ha);
      const bg=style.getPropertyValue('--primary-background-color')||'';
      if(bg){
        const r=parseInt(bg.replace('#','').slice(0,2),16)||128;
        setTheme(r<100?'dark':'light');
        return;
      }
    }
  }catch(e){}
  // Fallback to OS preference
  if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:light)').matches){
    setTheme('light');
  }else{
    setTheme('dark');
  }
})();
document.querySelectorAll('.theme-btn').forEach(b=>{
  b.addEventListener('click',()=>setTheme(b.dataset.theme));
});

// ── Navigation ────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+btn.dataset.page).classList.add('active');
    
    // Page-specific initialization
    if(btn.dataset.page==='logs') {
       startLogPolling();
       const activeSub = document.querySelector('.logs-subnav-item.active');
       if(activeSub && activeSub.dataset.logTab === 'actions') loadActions();
    } else {
       stopLogPolling();
    }
    
    if(btn.dataset.page==='settings') {
       loadSettings();
       loadBacklog();
    }
  });
});

// ── Logs Sub-navigation ────────────────────────────────────
document.querySelectorAll('.logs-subnav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.logs-subnav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.log-tab').forEach(t=>t.classList.remove('active'));
    document.getElementById('log-tab-'+btn.dataset.logTab).classList.add('active');
    if(btn.dataset.logTab==='actions') loadActions();
  });
});

// ── Markdown parser (safe subset) ─────────────────────────
function parseMd(text){
  let s=text;
  // Escape HTML first
  s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Code blocks
  s=s.replace(/\\x60\\x60\\x60([\\s\\S]*?)\\x60\\x60\\x60/g,'<pre><code>$1</code></pre>');
  // Inline code
  s=s.replace(/\\x60([^\\x60]+)\\x60/g,'<code>$1</code>');
  // Bold **text** or __text__
  s=s.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
  s=s.replace(/__(.+?)__/g,'<strong>$1</strong>');
  // Italic *text*
  s=s.replace(/\\*(.+?)\\*/g,'<em>$1</em>');
  // Highlighted "quoted terms"
  s=s.replace(/&quot;(.+?)&quot;/g,'<span class="highlight">&quot;$1&quot;</span>');
  // Newlines
  s=s.replace(/\\\\n/g,'<br>');
  return s;
}

// ── Rich content detection & rendering ────────────────────
// Detects [CARDS]...[/CARDS] and [ACTIONS]...[/ACTIONS] blocks
// Cards format: [CARDS] icon|LABEL|Value ;; icon|LABEL|Value [/CARDS]
// Actions format: [ACTIONS] primary:Label ;; secondary:Label [/ACTIONS]

function renderRichContent(text){
  let html=text;

  // Parse [CARDS]...[/CARDS]
  html=html.replace(/\\[CARDS\\]([\\s\\S]*?)\\[\\/CARDS\\]/gi,(m,inner)=>{
    const cards=inner.split(';;').map(c=>c.trim()).filter(Boolean);
    let out='<div class="msg-cards">';
    for(const card of cards){
      const parts=card.split('|').map(p=>p.trim());
      if(parts.length>=3){
        out+='<div class="msg-card">'
          +'<div class="msg-card-icon">'+parts[0]+'</div>'
          +'<div class="msg-card-body">'
          +'<div class="msg-card-label">'+escHtml2(parts[1])+'</div>'
          +'<div class="msg-card-value">'+escHtml2(parts[2])+'</div>'
          +'</div></div>';
      }
    }
    out+='</div>';
    return out;
  });

  // Parse [ACTIONS id=xxx]...[/ACTIONS]
  html=html.replace(/\\[ACTIONS(?:\\s+id=(\\w+))?\\]([\\s\\S]*?)\\[\\/ACTIONS\\]/gi,(m,id,inner)=>{
    const actions=inner.split(';;').map(a=>a.trim()).filter(Boolean);
    const gid=id||('act-'+Math.random().toString(36).slice(2,8));
    let out='<div class="msg-actions" data-action-group="'+gid+'">';
    for(const action of actions){
      const match=action.match(/^(primary|secondary):(.+)$/);
      if(match){
        out+='<button class="msg-action-btn '+match[1]+'" data-action-group="'+gid+'" onclick="handleAction(this,\\''+escHtml2(match[2].trim()).replace(/'/g,'&#39;')+'\\')">'+escHtml2(match[2].trim())+'</button>';
      }
    }
    out+='</div>';
    return out;
  });


  // Parse [MAP id=xxx]lat|lng|zoom[/MAP]
  html=html.replace(/\\[MAP(?:\\s+id=(\\w+))?\\]([\\s\\S]*?)\\[\\/MAP\\]/gi,(m,id,inner)=>{
    const parts=inner.split('|').map(p=>p.trim());
    const lat = parts[0] || '52.52';
    const lng = parts[1] || '13.405';
    const zoom = parts[2] || '13';
    const mid = id || ('map-'+Math.random().toString(36).slice(2,8));
    return '<div class="msg-map" id="'+mid+'" data-lat="'+lat+'" data-lng="'+lng+'" data-zoom="'+zoom+'" style="height:250px;width:100%;border-radius:10px;margin-top:0.5rem;border:1px solid var(--border)"></div>';
  });

  return html;
}

function escHtml2(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── Messages ──────────────────────────────────────────────
function addMsg(text,cls,suppressScroll){
  // Hide welcome block once chat has messages
  const wb=document.getElementById('welcome-block');
  if(wb)wb.style.display='none';

  const group=document.createElement('div');
  group.className='msg-group';

  const label=document.createElement('div');
  label.className='msg-label'+(cls==='user'?' user-label':'');
  if(cls==='bot'){
    label.innerHTML='<span class="msg-label-icon">&#9889;</span> '+(window.botName||'HA-CLAW');
  }else{
    label.textContent=(window.userName||'DU');
  }
  group.appendChild(label);

  const bubble=document.createElement('div');
  bubble.className='msg '+cls;

  if(cls==='bot'){
    // Render markdown + rich content
    let html=parseMd(text);
    html=renderRichContent(html);
    bubble.innerHTML=html;
    
    // Initialize any maps found in the message
    setTimeout(() => {
      bubble.querySelectorAll('.msg-map').forEach(el => {
        const id = el.id;
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        const zoom = parseInt(el.dataset.zoom);
        if (window.L) {
          const map = L.map(id).setView([lat, lng], zoom);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
          }).addTo(map);
          L.marker([lat, lng]).addTo(map);
          // Fix rendering issue in hidden containers
          setTimeout(() => map.invalidateSize(), 200);
        }
      });
    }, 100);
  }else{
    bubble.textContent=text;
  }

  group.appendChild(bubble);
  msgs.appendChild(group);
  if(!suppressScroll) msgs.scrollTop=msgs.scrollHeight;
  return group;
}

// Handle action button clicks
function handleAction(btn,label){
  // Disable all buttons in the group
  const gid=btn.dataset.actionGroup;
  document.querySelectorAll('[data-action-group="'+gid+'"]').forEach(b=>{
    if(b.tagName==='BUTTON'){b.disabled=true;}
  });
  btn.style.opacity='1';
  // Send the action as a new chat message
  inp.value=label;
  sendMsg();
}

inp.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    if (!inp.value.trim() && lastUserMessage && document.querySelector('.msg.bot:last-child .retry-btn')) {
      sendMsg(true);
    } else {
      sendMsg();
    }
  }
});

// ── Speech-to-Text ────────────────────────────────────────
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null;
let isListening=false;

if(SpeechRecognition){
  recognition=new SpeechRecognition();
  recognition.lang='de-DE';
  recognition.interimResults=true;
  recognition.continuous=false;
  recognition.maxAlternatives=1;

  recognition.onresult=e=>{
    let transcript='';
    for(let i=0;i<e.results.length;i++){transcript+=e.results[i][0].transcript;}
    inp.value=transcript;
  };
  recognition.onend=()=>{isListening=false;micBtn.classList.remove('listening');micBtn.title='Spracheingabe';};
  recognition.onerror=e=>{isListening=false;micBtn.classList.remove('listening');if(e.error!=='aborted')addMsg('Mikrofon-Fehler: '+e.error,'bot');};
}else{
  micBtn.classList.add('unsupported');
}

function toggleMic(){
  if(!recognition)return;
  if(isListening){recognition.stop();return;}
  isListening=true;
  micBtn.classList.add('listening');
  micBtn.title='Aufnahme... (Klick zum Stoppen)';
  inp.value='';
  inp.placeholder='Hoere zu...';
  recognition.start();
  recognition.onend=()=>{
    isListening=false;micBtn.classList.remove('listening');
    inp.placeholder='Nachricht eingeben...';
    micBtn.title='Spracheingabe';
    if(inp.value.trim())sendMsg();
  };
}

// ── Typing indicator ─────────────────────────────────────
function showTyping(){
  const existing=document.getElementById('typing-indicator');
  if(existing)return;
  const group=document.createElement('div');
  group.className='msg-group';
  group.id='typing-indicator';
  const label=document.createElement('div');
  label.className='msg-label';
  label.innerHTML='<span class="msg-label-icon">&#9889;</span> '+(window.botName||'HA-CLAW');
  group.appendChild(label);
  const bubble=document.createElement('div');
  bubble.className='msg bot typing';
  bubble.innerHTML='<div class="typing-wrap"><div class="typing-dots"><span></span><span></span><span></span></div><span class="typing-text">denkt nach...</span></div>';
  group.appendChild(bubble);
  msgs.appendChild(group);
  msgs.scrollTop=msgs.scrollHeight;
}
function hideTyping(){
  const el=document.getElementById('typing-indicator');
  if(el)el.remove();
}

// ── Safety Gate (confirmation modal for dangerous tools) ──
let confirmPollTimer=null;
function startConfirmPolling(){
  if(confirmPollTimer)return;
  confirmPollTimer=setInterval(async()=>{
    try{
      const r=await fetch(base+'/api/confirm/pending');
      const d=await r.json();
      if(d.pending){
        clearInterval(confirmPollTimer);confirmPollTimer=null;
        showConfirmModal(d.id,d.toolName,d.args);
      }
    }catch(e){}
  },800);
}
function stopConfirmPolling(){
  if(confirmPollTimer){clearInterval(confirmPollTimer);confirmPollTimer=null;}
}
function showConfirmModal(id,toolName,args){
  const overlay=document.createElement('div');
  overlay.className='confirm-overlay';
  overlay.id='confirm-overlay';
  const argsStr=Object.entries(args).map(([k,v])=>k+': '+JSON.stringify(v)).join('\\n');
  overlay.innerHTML='<div class="confirm-modal">'
    +'<div class="confirm-title">Sicherheitsabfrage</div>'
    +'<div class="confirm-body">Tool <strong>'+escHtml2(toolName)+'</strong> moechte ausgefuehrt werden:<pre>'+escHtml2(argsStr)+'</pre></div>'
    +'<div class="confirm-actions">'
    +'<button class="confirm-btn approve" onclick="respondConfirm(\\''+id+'\\',true)">Ausfuehren</button>'
    +'<button class="confirm-btn deny" onclick="respondConfirm(\\''+id+'\\',false)">Ablehnen</button>'
    +'</div></div>';
  document.body.appendChild(overlay);
}
async function respondConfirm(id,approved){
  try{
    await fetch(base+'/api/confirm/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved})});
  }catch(e){}
  const ov=document.getElementById('confirm-overlay');if(ov)ov.remove();
  startConfirmPolling();
}

// ── Send ──────────────────────────────────────────────────
let lastUserMessage = '';
function sendMsg(isRetry){
  let t = '';
  if (isRetry === true) {
    t = lastUserMessage;
    if (!t) return;
  } else {
    t = inp.value.trim();
    if (!t) return;
    lastUserMessage = t;
    inp.value='';
    addMsg(t,'user');
  }
  sendBtn.disabled=true;inp.disabled=true;
  
  const group = addMsg('<i>Start...</i>', 'bot');
  const bubble = group.querySelector('.msg.bot');
  
  startConfirmPolling();
  
  const es = new EventSource(base+'/api/chat/stream?message='+encodeURIComponent(t));
  
  es.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    if(data.type === 'thinking') {
      bubble.innerHTML = '<div class="typing-wrap"><div class="typing-dots"><span></span><span></span><span></span></div><span class="typing-text">🤔 ' + escHtml2(data.message) + ' (Iteration ' + data.iteration + ')...</span></div>';
      msgs.scrollTop=msgs.scrollHeight;
    } 
    else if(data.type === 'tool_call') {
      bubble.innerHTML = '<div class="typing-wrap"><div class="typing-dots"><span></span><span></span><span></span></div><span class="typing-text">🔧 Führe Tool aus: ' + escHtml2(data.toolName) + '...</span></div>';
      msgs.scrollTop=msgs.scrollHeight;
    }
    else if(data.type === 'done') {
      let html = parseMd(data.response || '');
      html = renderRichContent(html);
      bubble.innerHTML = html;
      
      if(data.toolCalls && data.toolCalls.length > 0) {
         const m = document.createElement('div');
         m.className = 'meta';
         m.textContent = data.toolCalls.length + ' Tool-Aufruf(e)';
         bubble.appendChild(m);
      }
      es.close();
      cleanup();
      
      // Init maps
      setTimeout(() => {
        bubble.querySelectorAll('.msg-map').forEach(el => {
          const id = el.id;
          const lat = parseFloat(el.dataset.lat);
          const lng = parseFloat(el.dataset.lng);
          const zoom = parseInt(el.dataset.zoom);
          if (window.L) {
            const map = L.map(id).setView([lat, lng], zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '&copy; OpenStreetMap'
            }).addTo(map);
            L.marker([lat, lng]).addTo(map);
            setTimeout(() => map.invalidateSize(), 200);
          }
        });
      }, 100);
    }
    else if(data.type === 'error') {
      bubble.innerHTML = '❌ Fehler: ' + escHtml2(data.message) + '<br><button style="margin-top:8px;padding:6px 12px;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;" onclick="sendMsg(true)">🔄 Nochmal versuchen</button>';
      es.close();
      cleanup();
    }
  };
  
  es.onerror = function() {
    if(es.readyState === EventSource.CLOSED) return;
    bubble.innerHTML = '❌ Verbindungsfehler zum Server.<br><button style="margin-top:8px;padding:6px 12px;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;" onclick="sendMsg(true)">🔄 Nochmal versuchen</button>';
    es.close();
    cleanup();
  };

  function cleanup() {
    stopConfirmPolling();
    sendBtn.disabled=false;
    inp.disabled=false;
    inp.focus();
    msgs.scrollTop = msgs.scrollHeight;
  }
}

// ── Settings ──────────────────────────────────────────────
// Settings sub-navigation
document.querySelectorAll('.settings-nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.settings-nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.settings-section').forEach(s=>s.classList.remove('active'));
    document.getElementById('settings-'+btn.dataset.settings).classList.add('active');
  });
});

function tIcon(d){return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';}
const TOOL_ICONS={
  'ha_call_service':tIcon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
  'ha_call_service_dangerous':tIcon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  'ha_get_state':tIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  'ha_search_entities':tIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  'ha_get_config':tIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  'ha_get_all_entities':tIcon('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  'ha_list_areas':tIcon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="8"/>'),
  'ha_resolve_group':tIcon('<circle cx="9" cy="7" r="4"/><circle cx="17" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'),
  'ha_get_automation_config':tIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/>'),
  'get_current_time':tIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  'get_system_info':tIcon('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
  'store_list':tIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  'store_read':tIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
  'store_write':tIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  'store_delete':tIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  'memory_remember':tIcon('<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="12" r="10"/><line x1="12" y1="17" x2="12.01" y2="17"/>').replace('circle cx="12" cy="12" r="10"','path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7.5S12 20 12 22c0-2-1-2.5-3-4.5S5 12 5 9a7 7 0 0 1 7-7z"'),
  'memory_recall':tIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>'),
  'memory_update':tIcon('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  'memory_forget':tIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  'memory_list':tIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  'backlog_propose':tIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  'backlog_list':tIcon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  'backlog_update':tIcon('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>'),
  'backlog_detail':tIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>'),
  'backlog_delete':tIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'),
  'schedule_create':tIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="17" y1="2" x2="21" y2="6"/>'),
  'schedule_list':tIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="8" y1="18" x2="8.01" y2="18"/>'),
  'schedule_toggle':tIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M9 16l3 3 3-3"/>'),
  'schedule_delete':tIcon('<circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>'),
  'analyze_home':tIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/><line x1="6" y1="8" x2="6" y2="15"/><line x1="10" y1="11" x2="10" y2="15"/><line x1="18" y1="7" x2="18" y2="15"/><line x1="14" y1="10" x2="14" y2="15"/>'),
  'learn_correction':tIcon('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
  'learn_rule':tIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  'detect_patterns':tIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  'list_learned':tIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
};
const TOOL_DESCS={
  'ha_call_service':'Alltagsgeraete steuern (Licht, Klima, Schalter)',
  'ha_call_service_dangerous':'Sicherheitskritische Aktionen (Schloss, Alarm)',
  'ha_get_state':'Zustand eines Geraets abfragen',
  'ha_search_entities':'Geraete nach Name/Domain suchen',
  'ha_get_config':'HA Systemkonfiguration lesen',
  'ha_get_all_entities':'Uebersicht aller Entitaeten',
  'ha_list_areas':'Alle Bereiche und Stockwerke anzeigen',
  'ha_resolve_group':'Gruppen in Einzelgeraete aufloesen',
  'ha_get_automation_config':'Automation-Details lesen (Trigger, Aktionen)',
  'get_current_time':'Aktuelle Uhrzeit und Datum',
  'get_system_info':'CPU, RAM, Uptime',
  'store_list':'Notizen und Eintraege auflisten',
  'store_read':'Einzelnen Eintrag lesen',
  'store_write':'Eintrag erstellen oder aktualisieren',
  'store_delete':'Eintrag loeschen',
  'memory_remember':'Fakten und Kontext merken',
  'memory_recall':'Erinnerungen durchsuchen',
  'memory_update':'Erinnerung aktualisieren',
  'memory_forget':'Erinnerung loeschen',
  'memory_list':'Alle Erinnerungen anzeigen',
  'backlog_propose':'Optimierungsvorschlag erstellen',
  'backlog_list':'Backlog-Tasks auflisten',
  'backlog_update':'Backlog-Task aktualisieren',
  'backlog_detail':'Backlog-Task Details anzeigen',
  'backlog_delete':'Backlog-Task loeschen',
  'schedule_create':'Zeitgesteuerten Job erstellen',
  'schedule_list':'Alle geplanten Jobs anzeigen',
  'schedule_toggle':'Job aktivieren/deaktivieren',
  'schedule_delete':'Geplanten Job loeschen',
  'analyze_home':'Proaktive Smart Home Analyse',
  'learn_correction':'Korrektur speichern (aus Fehlern lernen)',
  'learn_rule':'Dauerhafte Regel hinzufuegen',
  'detect_patterns':'Nutzungsmuster erkennen',
  'list_learned':'Gelerntes anzeigen (Korrekturen, Regeln, Muster)',
};
const DANGEROUS_TOOLS=new Set(['ha_call_service_dangerous','store_delete','memory_forget','backlog_delete','schedule_delete']);

async function loadSettings(){
  try{
    const r=await fetch(base+'/api/settings');
    const d=await r.json();

    // Version
    if(d.version){
      const vEl=document.getElementById('app-version');
      if(vEl)vEl.textContent='v'+d.version;
    }

    // Model
    const parts=d.model.split('/');
    const mName=parts.length>1?parts[1]:d.model;
    const mProvider=parts.length>1?parts[0]:'';
    document.getElementById('active-model-name').textContent=mName;
    document.getElementById('active-model-id').textContent=d.model;

    // Stats
    if(d.uptime){
      const h=Math.floor(d.uptime/3600);
      const m=Math.floor((d.uptime%3600)/60);
      document.getElementById('settings-uptime').textContent=h+'h '+m+'m';
    }
    if(d.memory){
      document.getElementById('settings-heap').textContent=d.memory.heapMB+' MB';
      const pct=Math.min(100,Math.round(d.memory.heapMB/64*100));
      document.getElementById('settings-heap-bar').style.width=pct+'%';
    }

    // Model dropdown
    const sel=document.getElementById('model-select');
    const saved=localStorage.getItem('ha-claw-model-override');
    const activeModel=saved||d.model;
    sel.innerHTML='';
    if(d.availableModels){
      d.availableModels.forEach(function(mid){
        const opt=document.createElement('option');
        opt.value=mid;
        opt.textContent=mid;
        if(mid===activeModel)opt.selected=true;
        sel.appendChild(opt);
      });
      // If current model not in list, add it
      if(activeModel && !d.availableModels.includes(activeModel)){
        const opt=document.createElement('option');
        opt.value=activeModel;
        opt.textContent=activeModel;
        opt.selected=true;
        sel.appendChild(opt);
      }
    }
    if(saved){
      document.getElementById('active-model-badge').textContent='Browser Override';
      document.getElementById('active-model-badge').style.background='var(--success)';
    }

    // Complexity model dropdowns
    if(d.availableModels){
      [1,2,3].forEach(function(lvl){
        const cSel=document.getElementById('complexity-model-'+lvl);
        if(!cSel)return;
        cSel.innerHTML='<option value="">Standard</option>';
        d.availableModels.forEach(function(mid){
          const opt=document.createElement('option');
          opt.value=mid;
          opt.textContent=mid;
          cSel.appendChild(opt);
        });
      });
      // Set saved values from profile
      if(d.profile&&d.profile.complexityModels){
        var cm=d.profile.complexityModels;
        if(cm.level1){var e=document.getElementById('complexity-model-1');if(e)e.value=cm.level1;}
        if(cm.level2){var e=document.getElementById('complexity-model-2');if(e)e.value=cm.level2;}
        if(cm.level3){var e=document.getElementById('complexity-model-3');if(e)e.value=cm.level3;}
      }
    }

    // Security
    const secParts=[];
    if(d.haAvailable) secParts.push('HA API verbunden');
    else secParts.push('HA API nicht verfuegbar');
    if(d.telegramConfigured) secParts.push('Telegram aktiv');
    document.getElementById('security-desc').textContent=
      'Modus: '+(d.mode==='addon'?'HA Add-on':'Standalone')+'. '+secParts.join(', ')+'. Aktionen werden lokal ausgefuehrt, LLM-Anfragen gehen an Cloud-API.';

    // Tools
    const grid=document.getElementById('tools-grid');
    grid.innerHTML='';
    for(const tool of d.tools){
      const name=tool.name||tool;
      const enabled=tool.enabled!==false;
      const icon=TOOL_ICONS[name]||'&#128295;';
      const desc=TOOL_DESCS[name]||tool.description||'Registriertes Tool';
      const isDanger=tool.dangerous||DANGEROUS_TOOLS.has(name);
      const complexity=tool.complexity||1;
      const complexStars='&#9733;'.repeat(complexity)+'&#9734;'.repeat(3-complexity);
      grid.innerHTML+=
        '<div class="tool-card'+(enabled?'':' disabled')+'" id="tc-'+name+'">'
        +'<div class="tool-card-top">'
          +'<div class="tool-card-icon">'+icon+'</div>'
          +'<button class="tool-toggle'+(enabled?' on':'')+'" onclick="toggleTool(\\''+name+'\\',this)" title="'+(enabled?'Deaktivieren':'Aktivieren')+'"></button>'
        +'</div>'
        +'<div class="tool-card-name">'+name+'</div>'
        +'<div class="tool-card-type">'+desc+'</div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem">'
          +'<span class="tool-card-badge'+(isDanger?' danger':'')+'">'+
            (isDanger?'Bestaetigung noetig':'Safe')+'</span>'
          +'<span style="font-size:0.7rem;color:var(--accent);letter-spacing:0.1em" title="Komplexitaet '+complexity+'">'+complexStars+'</span>'
          +'<a href="#" onclick="showToolDetails(\\''+name+'\\');return false" style="font-size:0.65rem;color:var(--text-dim);text-decoration:none;opacity:0.7">Details &rarr;</a>'
        +'</div>'
        +'</div>';
    }
    // Profile
    if(d.profile){
      document.getElementById('profile-bot-name').value=d.profile.botName||'';
      document.getElementById('profile-user-name').value=d.profile.userName||'';
      window.botName=(d.profile.botName||'HA-CLAW').toUpperCase();
      window.userName=(d.profile.userName||'DU').toUpperCase();
      if(d.profile.personality){
        const p=d.profile.personality;
        ['directness','formality','humor','verbosity'].forEach(k=>{
          const slider=document.getElementById('slider-'+k);
          const valEl=document.getElementById('val-'+k);
          if(slider&&p[k]!=null){slider.value=p[k];if(valEl)valEl.textContent=p[k];}
        });
      }
      // Update sidebar agent name
      const agentName=document.querySelector('.settings-agent-name');
      if(agentName&&d.profile.botName)agentName.textContent=d.profile.botName+' Butler';
    }
  }catch(e){console.error('Settings load failed',e);}
}

// Profile: slider live update + auto-save
let profileSaveTimer=null;
['directness','formality','humor','verbosity'].forEach(k=>{
  const slider=document.getElementById('slider-'+k);
  const valEl=document.getElementById('val-'+k);
  if(!slider)return;
  slider.addEventListener('input',()=>{
    if(valEl)valEl.textContent=slider.value;
    clearTimeout(profileSaveTimer);
    profileSaveTimer=setTimeout(()=>savePersonality(),600);
  });
});

async function savePersonality(){
  const personality={
    directness:+document.getElementById('slider-directness').value,
    formality:+document.getElementById('slider-formality').value,
    humor:+document.getElementById('slider-humor').value,
    verbosity:+document.getElementById('slider-verbosity').value,
  };
  try{
    await fetch(base+'/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({personality})});
  }catch(e){console.error('Save personality failed',e);}
}

async function saveProfileNames(){
  const btn=document.getElementById('profile-save-names');
  const botName=document.getElementById('profile-bot-name').value.trim();
  const userName=document.getElementById('profile-user-name').value.trim();
  if(!botName||!userName)return;
  try{
    await fetch(base+'/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({botName,userName})});
    window.botName=botName.toUpperCase();
    window.userName=userName.toUpperCase();
    btn.textContent='Gespeichert!';btn.classList.add('saved');
    setTimeout(()=>{btn.innerHTML='<span class="icon">&#128190;</span> Speichern';btn.classList.remove('saved');},1500);
    const agentName=document.querySelector('.settings-agent-name');
    if(agentName)agentName.textContent=botName+' Butler';
  }catch(e){console.error('Save names failed',e);}
}

// Profile: slider live update + auto-save
// ── Backlog ──────────────────────────────────────────────
let allBacklogTasks=[];
let backlogFilter='all';

async function loadBacklog(){
  try{
    const r=await fetch(base+'/api/backlog');
    const d=await r.json();
    allBacklogTasks=d.tasks||[];
    renderBacklog();
  }catch(e){console.error('Backlog load failed',e);}
}

function renderBacklog(){
  const list=document.getElementById('backlog-list');
  const filtered=backlogFilter==='all'?allBacklogTasks:allBacklogTasks.filter(t=>t.status===backlogFilter);
  if(filtered.length===0){
    list.innerHTML='<div class="backlog-empty">Keine Tasks'+(backlogFilter!=='all'?' mit Status "'+backlogFilter+'"':'')+' vorhanden.</div>';
    return;
  }
  list.innerHTML=filtered.map(t=>{
    const prioCls='priority-'+t.priority;
    const statusCls=t.status==='done'?'status-done':t.status==='rejected'?'status-rejected':t.status==='deferred'?'status-deferred':'status';
    const actions=buildBacklogActions(t);
    return '<div class="backlog-item" data-id="'+t.id+'">'
      +'<div class="backlog-item-top">'
        +'<span class="backlog-item-title">'+esc(t.title)+'</span>'
        +'<div class="backlog-item-badges">'
          +'<span class="backlog-badge '+prioCls+'">'+t.priority+'</span>'
          +'<span class="backlog-badge '+statusCls+'">'+t.status.replace('_',' ')+'</span>'
          +'<span class="backlog-badge category">'+esc(t.category)+'</span>'
        +'</div>'
      +'</div>'
      +'<div class="backlog-item-details">'
        +'<div><div class="backlog-detail-label">As-Is</div><div class="backlog-detail-text">'+esc(t.asIs)+'</div></div>'
        +'<div><div class="backlog-detail-label">To-Be</div><div class="backlog-detail-text">'+esc(t.toBe)+'</div></div>'
        +'<div class="backlog-item-impact"><div class="backlog-detail-label">Impact</div><div class="backlog-detail-text">'+esc(t.impact)+'</div></div>'
      +'</div>'
      +(t.solution?'<div style="margin-top:0.5rem"><div class="backlog-detail-label">Vorgeschlagene Loesung</div><pre style="background:var(--bg-input);padding:0.75rem;border-radius:8px;overflow-x:auto;font-size:0.72rem;max-height:200px;overflow-y:auto;white-space:pre-wrap;color:var(--text-muted)">'+esc(t.solution)+'</pre></div>':'')
      +(t.executionResult?'<div style="margin-top:0.5rem"><div class="backlog-detail-label">Ergebnis</div><div class="backlog-detail-text">'+esc(t.executionResult)+'</div></div>':'')
      +'<div class="backlog-item-actions">'+actions+'</div>'
    +'</div>';
  }).join('');
}

function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function buildBacklogActions(t){
  const btns=[];
  if(t.status==='proposed'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'approved\\')">Genehmigen</button>');
    btns.push('<button class="backlog-action-btn" style="color:#fbbf24;border-color:#fbbf24" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'deferred\\')">Zurueckstellen</button>');
    btns.push('<button class="backlog-action-btn reject" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'rejected\\')">Ablehnen</button>');
  }
  if(t.status==='approved'){
    btns.push('<span style="color:var(--text-muted);font-size:0.72rem;font-style:italic">&#9881; KI erarbeitet Loesung...</span>');
    btns.push('<button class="backlog-action-btn" style="color:#fbbf24;border-color:#fbbf24" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'deferred\\')">Zurueckstellen</button>');
  }
  if(t.status==='solution_proposed'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'solution_approved\\')">Loesung genehmigen</button>');
    btns.push('<button class="backlog-action-btn" style="color:#63b3ed;border-color:#63b3ed" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'approved\\')">Neue Loesung</button>');
    btns.push('<button class="backlog-action-btn reject" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'rejected\\')">Ablehnen</button>');
  }
  if(t.status==='solution_approved'){
    btns.push('<span style="color:var(--text-muted);font-size:0.72rem;font-style:italic">&#9881; Wird ausgefuehrt...</span>');
  }
  if(t.status==='executing'){
    btns.push('<span style="color:#ed8936;font-size:0.72rem;font-style:italic">&#9881; Ausfuehrung laeuft...</span>');
  }
  if(t.status==='in_progress'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'done\\')">Abschliessen</button>');
  }
  if(t.status==='deferred'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'proposed\\')">Reaktivieren</button>');
    btns.push('<button class="backlog-action-btn reject" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'rejected\\')">Ablehnen</button>');
  }
  if(t.status==='rejected'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\''+t.id+'\\',\\'proposed\\')">Reaktivieren</button>');
  }
  btns.push('<button class="backlog-action-btn delete" onclick="deleteBacklogTask(\\''+t.id+'\\')">Loeschen</button>');
  return btns.join('');
}

async function updateBacklogStatus(id,status){
  try{
    await fetch(base+'/api/backlog/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    await loadBacklog();
  }catch(e){console.error('Backlog update failed',e);}
}

async function deleteBacklogTask(id){
  if(!confirm('Task wirklich loeschen?'))return;
  try{
    await fetch(base+'/api/backlog/'+id,{method:'DELETE'});
    await loadBacklog();
  }catch(e){console.error('Backlog delete failed',e);}
}

function filterBacklog(status,btn){
  backlogFilter=status;
  document.querySelectorAll('.backlog-filter').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderBacklog();
}

function showBacklogForm(){
  document.getElementById('backlog-form').style.display='block';
  document.getElementById('bl-title').focus();
}
function hideBacklogForm(){
  document.getElementById('backlog-form').style.display='none';
  document.getElementById('bl-title').value='';
  document.getElementById('bl-asis').value='';
  document.getElementById('bl-tobe').value='';
  document.getElementById('bl-impact').value='';
}

async function submitBacklogTask(){
  const title=document.getElementById('bl-title').value.trim();
  const asIs=document.getElementById('bl-asis').value.trim();
  const toBe=document.getElementById('bl-tobe').value.trim();
  const impact=document.getElementById('bl-impact').value.trim();
  const priority=document.getElementById('bl-priority').value;
  const category=document.getElementById('bl-category').value;
  if(!title||!asIs||!toBe||!impact){alert('Bitte alle Felder ausfuellen.');return;}
  try{
    await fetch(base+'/api/backlog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,asIs,toBe,impact,priority,category,proposedBy:'user'})});
    hideBacklogForm();
    await loadBacklog();
  }catch(e){console.error('Backlog create failed',e);}
}

// ── Logs ──────────────────────────────────────────────────
const logsBody=document.getElementById('logs-body');
const logsInput=document.getElementById('logs-input');
let logsPolling=null;
let lastLogCount=0;

const LEVEL_CLASS={debug:'log-level-debug',info:'log-level-info',warn:'log-level-warn',error:'log-level-error'};
const LEVEL_LABEL={debug:'DEBUG',info:'INFO',warn:'WARN',error:'ERROR'};

function fmtTime(iso){
  try{const d=new Date(iso);return d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  catch(e){return '--:--:--';}
}

function renderLogLine(entry){
  const cls=LEVEL_CLASS[entry.level]||'log-level-info';
  const label=LEVEL_LABEL[entry.level]||'INFO';
  const comp=entry.component?entry.component.toUpperCase():'SYSTEM';
  const dataStr=entry.data?' '+JSON.stringify(entry.data):'';
  return '<div class="log-line">'
    +'<span class="log-ts">['+fmtTime(entry.ts)+']</span>  '
    +'<span class="'+cls+'">'+label+':</span>  '
    +'<span class="log-component">'+comp+':</span>  '
    +'<span class="log-msg">'+escHtml(entry.msg+dataStr)+'</span>'
    +'</div>';
}

function escHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchLogs(){
  try{
    const r=await fetch(base+'/api/logs');
    const d=await r.json();
    if(d.entries&&d.entries.length!==lastLogCount){
      lastLogCount=d.entries.length;
      let html=d.entries.map(renderLogLine).join('');
      html+='<div class="log-line"><span class="log-ts">['+fmtTime(new Date().toISOString())+']</span>  <span class="log-level-debug">IDLE:</span>  <span class="log-msg" style="font-style:italic;opacity:0.5">Warte auf Aktivitaet...</span> <span class="log-cursor"></span></div>';
      logsBody.innerHTML=html;
      logsBody.scrollTop=logsBody.scrollHeight;
    }
    // Update stats
    if(d.uptime){
      const h=Math.floor(d.uptime/3600);
      const m=Math.floor((d.uptime%3600)/60);
      document.getElementById('logs-uptime').textContent=h+'h '+m+'m';
    }
    if(d.memory){
      document.getElementById('logs-heap').textContent=d.memory.heapMB+' MB';
    }
  }catch(e){}
}

// Start/stop polling when logs page is shown/hidden
function startLogPolling(){
  if(logsPolling)return;
  fetchLogs();
  logsPolling=setInterval(fetchLogs,3000);
}
function stopLogPolling(){
  if(logsPolling){clearInterval(logsPolling);logsPolling=null;}
}

// Download logs
// Download logs
document.getElementById('logs-download').addEventListener('click',async()=>{
  try{
    const r=await fetch(base+'/api/logs');
    const d=await r.json();
    const text=d.entries.map(e=>'['+e.ts+'] '+e.level.toUpperCase()+' ['+e.component+'] '+e.msg+(e.data?' '+JSON.stringify(e.data):'')).join('\\n');
    const blob=new Blob([text],{type:'text/plain'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='ha-claw-logs-'+new Date().toISOString().slice(0,10)+'.log';
    a.click();
  }catch(e){}
});

// Clear logs
document.getElementById('logs-clear').addEventListener('click',async()=>{
  try{
    await fetch(base+'/api/logs',{method:'DELETE'});
    lastLogCount=0;
    logsBody.innerHTML='<div class="log-line"><span class="log-ts">['+fmtTime(new Date().toISOString())+']</span>  <span class="log-component">SYSTEM:</span>  <span class="log-msg">Logs geleert.</span> <span class="log-cursor"></span></div>';
  }catch(e){}
});

// Logs command input
logsInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();runLogsCmd();}
});

async function runLogsCmd(){
  const cmd=logsInput.value.trim();
  if(!cmd)return;
  logsInput.value='';
  if(cmd==='/clear'){
    document.getElementById('logs-clear').click();
  }else if(cmd==='/status'){
    await fetchLogs();
  }else if(cmd==='/refresh'){
    lastLogCount=0;
    await fetchLogs();
  }else{
    const line=document.createElement('div');
    line.className='log-line';
    line.innerHTML='<span class="log-ts">['+fmtTime(new Date().toISOString())+']</span>  <span class="log-level-warn">WARN:</span>  <span class="log-msg">Unbekannter Befehl: '+escHtml(cmd)+'. Verfuegbar: /clear, /status, /refresh</span>';
    logsBody.appendChild(line);
    logsBody.scrollTop=logsBody.scrollHeight;
  }
}

// ── Action Log ────────────────────────────────────────────
async function clearActions(){
  if(!confirm('Moechten Sie den Aktionsverlauf wirklich leeren?')) return;
  try{
    await fetch(base+'/api/actions', { method: 'DELETE' });
    loadActions();
  }catch(e){}
}

async function rollbackAction(event, id){
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;
  
  try{
    const r = await fetch(base+'/api/actions/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if(r.ok) {
      loadActions();
    } else {
      alert('Rollback fehlgeschlagen.');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }catch(e){
    alert('Netzwerkfehler beim Rollback.');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function loadActions(){
  const list=document.getElementById('actions-list');
  try{
    const r=await fetch(base+'/api/actions');
    const d=await r.json();
    if(!d.actions||d.actions.length===0){
      list.innerHTML='<div class="backlog-empty">Noch keine Aktionen aufgezeichnet.</div>';
      return;
    }
    list.innerHTML=d.actions.map(a=>{
      let icon='&#128187;', cls='system';
      const tool = a.tool || 'system';
      if(tool==='ha_call_service'||tool==='ha_call_service_dangerous'){icon='&#128268;';cls='switch';}
      else if(tool.startsWith('memory')){icon='&#129504;';cls='note';}
      else if(tool.startsWith('backlog')){icon='&#128161;';cls='task';}
      
      const rollbackBtn = a.rollback ? '<button class="action-rollback" onclick="rollbackAction(event, \\'' + a.id + '\\')">Rollback</button>' : '';

      return '<div class="action-entry">'
        +'<div class="action-icon '+cls+'">'+icon+'</div>'
        +'<div class="action-body">'
          +'<div class="action-header">'
            +'<span class="action-tool">'+tool.replace('ha_','')+'</span>'
            +'<span class="action-time">'+fmtTime(a.timestamp)+'</span>'
          +'</div>'
          +'<div class="action-msg">'+escHtml(a.description)+'</div>'
          +rollbackBtn
        +'</div></div>';
    }).join('');
  }catch(e){list.innerHTML='<div class="backlog-empty">Fehler beim Laden der Aktionen.</div>';}
}

// ── Tool Toggle ──────────────────────────────────────────
async function toggleTool(name,btn){
  const enabling=!btn.classList.contains('on');
  btn.disabled=true;
  try{
    const r=await fetch(base+'/api/tools/toggle',{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name,enabled:enabling})
    });
    const d=await r.json();
    if(d.error){alert(d.error);return;}
    // Update UI
    btn.classList.toggle('on',enabling);
    const card=document.getElementById('tc-'+name);
    if(card) card.classList.toggle('disabled',!enabling);
    btn.title=enabling?'Deaktivieren':'Aktivieren';
  }catch(e){alert('Fehler: '+e.message);}
  finally{btn.disabled=false;}
}

// ── Tool Details ──────────────────────────────────────────
async function showToolDetails(name){
  document.getElementById('tool-detail-name').textContent=name;
  document.getElementById('tool-detail-desc').textContent=TOOL_DESCS[name]||'Registriertes System-Tool.';
  const paramsList=document.getElementById('tool-params-list');
  paramsList.innerHTML='<div class="backlog-empty">Lade Parameter...</div>';
  document.getElementById('tool-modal').classList.add('active');
  
  try{
    const r=await fetch(base+'/api/tools/'+name);
    const tool=await r.json();
    if(tool.parameters && tool.parameters.properties){
      const props=tool.parameters.properties;
      paramsList.innerHTML=Object.keys(props).map(p=>{
        const info=props[p];
        return '<div class="param-item">'
          +'<div class="param-name">'+p+'<span class="param-type">'+(info.type||'any')+'</span></div>'
          +'<div class="param-desc">'+(info.description||'Keine Beschreibung.')+'</div>'
          +'</div>';
      }).join('');
    }else{
      paramsList.innerHTML='<div class="backlog-empty">Keine Parameter definiert.</div>';
    }
  }catch(e){paramsList.innerHTML='<div class="backlog-empty">Fehler beim Laden der Tool-Details.</div>';}
}

function closeToolModal(e){
  if(!e || e.target.id==='tool-modal' || e.target.className==='modal-close'){
    document.getElementById('tool-modal').classList.remove('active');
  }
}

// ── Model Selection Override ──────────────────────────────
async function updateModelOverride(){
  const val=document.getElementById('model-select').value;
  if(!val){
    localStorage.removeItem('ha-claw-model-override');
    await fetch(base+'/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelOverride:''})});
    location.reload();
    return;
  }
  localStorage.setItem('ha-claw-model-override',val);
  await fetch(base+'/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelOverride:val})});
  const badge=document.getElementById('active-model-badge');
  badge.textContent='Browser Override';
  badge.style.background='var(--success)';

  // Update current display
  document.getElementById('active-model-name').textContent=val.split('/').pop();
  document.getElementById('active-model-id').textContent=val;
}

async function saveComplexityModels(){
  const complexityModels={
    level1:(document.getElementById('complexity-model-1')||{}).value||'',
    level2:(document.getElementById('complexity-model-2')||{}).value||'',
    level3:(document.getElementById('complexity-model-3')||{}).value||'',
  };
  try{
    await fetch(base+'/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({complexityModels})});
  }catch(e){console.error('Save complexity models failed',e);}
}

// Script End