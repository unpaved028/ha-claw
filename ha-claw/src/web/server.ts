/**
 * server.ts – Ingress-compatible Web Server with Chat API.
 */

import Fastify from 'fastify';
import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { runAgenticLoop } from '../core/agentic-loop.js';
import * as store from '../storage/json-store.js';
import type { CollectionName } from '../storage/json-store.js';

const log = createLogger('web');
const STARTUP_TIME = new Date().toISOString();
const VALID = new Set(['notes', 'conversations', 'memory']);

const DEFAULT_AGENT = {
  name: 'butler',
  systemPrompt: [
    'Du bist HA-Claw, ein lokaler KI-Assistent für Smart Home und Produktivität.',
    'Du läufst als Home Assistant Add-on.',
    'Du antwortest knapp, hilfreich und auf Deutsch.',
    'Du hast Zugriff auf Tools – nutze sie, wenn nötig.',
  ].join('\n'),
};

export async function startWebServer(): Promise<void> {
  const app = Fastify({ logger: false });

  // Health
  app.get('/health', async () => ({
    status: 'ok', version: '0.2.0', uptime: process.uptime(), startedAt: STARTUP_TIME,
    mode: appConfig.isAddon ? 'addon' : 'standalone',
    memory: { heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) },
  }));

  // Dashboard
  app.get('/', async (req, reply) => {
    reply.type('text/html');
    return dashboardHtml((req.headers['x-ingress-path'] as string) || '');
  });

  // ── Chat API (Agentic Loop via Web) ─────────────────────
  app.post<{ Body: { message: string } }>('/api/chat', async (req, reply) => {
    const message = req.body?.message;
    if (!message || typeof message !== 'string') {
      reply.status(400);
      return { error: 'Missing "message" field' };
    }
    log.info('Web chat request', { length: message.length });
    // Web UI requests auto-approve dangerous tools (user is HA-authenticated)
    const result = await runAgenticLoop(message, DEFAULT_AGENT);
    return result;
  });

  // ── Store CRUD ──────────────────────────────────────────
  app.get<{ Params: { c: string } }>('/api/:c', async (req, reply) => {
    if (!VALID.has(req.params.c)) { reply.status(400); return { error: 'invalid' }; }
    return store.list(req.params.c as CollectionName);
  });

  app.post<{ Params: { c: string }; Body: Record<string, unknown> }>('/api/:c', async (req, reply) => {
    if (!VALID.has(req.params.c)) { reply.status(400); return { error: 'invalid' }; }
    return store.create(req.params.c as CollectionName, req.body ?? {});
  });

  app.delete<{ Params: { c: string; id: string } }>('/api/:c/:id', async (req, reply) => {
    if (!VALID.has(req.params.c)) { reply.status(400); return { error: 'invalid' }; }
    const ok = await store.remove(req.params.c as CollectionName, req.params.id);
    if (!ok) { reply.status(404); return { error: 'not found' }; }
    return { deleted: true };
  });

  const port = appConfig.ingressPort;
  const host = appConfig.isAddon ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ port, host });
  log.info('Web server started', { host, port });
}

function dashboardHtml(b: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>HA-Claw</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:1.5rem;min-height:100vh;display:flex;flex-direction:column}
.c{max-width:700px;margin:0 auto;width:100%;flex:1;display:flex;flex-direction:column}
h1{color:#6c63ff;margin-bottom:.25rem;font-size:1.5rem}
.sub{color:#888;margin-bottom:1.5rem;font-size:.9rem}
.card{background:#16213e;border-radius:12px;padding:1.25rem;margin-bottom:1rem;border:1px solid #1a3a5c}
.card h2{font-size:.95rem;color:#6c63ff;margin-bottom:.5rem}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ade80;margin-right:6px}
#chat{flex:1;display:flex;flex-direction:column}
#messages{flex:1;overflow-y:auto;margin-bottom:1rem;min-height:120px}
.msg{margin-bottom:.75rem;padding:.75rem;border-radius:8px;font-size:.9rem;line-height:1.4;white-space:pre-wrap}
.msg.user{background:#1e3a5f;margin-left:2rem}
.msg.bot{background:#16213e;margin-right:2rem;border:1px solid #1a3a5c}
.inputrow{display:flex;gap:.5rem;align-items:center}
#input{flex:1;padding:.75rem;border-radius:8px;border:1px solid #1a3a5c;background:#0d2137;color:#e0e0e0;font-size:.9rem;outline:none}
#input:focus{border-color:#6c63ff}
button{padding:.75rem 1.25rem;border-radius:8px;border:none;background:#6c63ff;color:#fff;cursor:pointer;font-size:.9rem}
button:hover{background:#5a52d5}
button:disabled{opacity:.5;cursor:not-allowed}
.meta{font-size:.75rem;color:#555;margin-top:.25rem}
#mic{background:transparent;border:2px solid #6c63ff;width:44px;height:44px;min-width:44px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:1.2rem;transition:all .2s}
#mic:hover{background:rgba(108,99,255,.15)}
#mic.listening{background:#6c63ff;animation:pulse 1.2s ease-in-out infinite}
#mic.unsupported{display:none}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(108,99,255,.5)}50%{box-shadow:0 0 0 12px rgba(108,99,255,0)}}
</style></head><body><div class="c">
<h1>🤖 HA-Claw</h1><p class="sub">Local AI Smart Home Assistant — v0.2.1</p>
<div class="card"><h2>Status</h2><p><span class="dot"></span>Online</p></div>
<div class="card" id="chat"><h2>Chat</h2>
<div id="messages"></div>
<div class="inputrow">
<input id="input" placeholder="Nachricht eingeben..." autocomplete="off">
<button id="mic" title="Spracheingabe" onclick="toggleMic()">🎙️</button>
<button id="send" onclick="sendMsg()">Senden</button>
</div></div></div>
<script>
const base='${b}';
const msgs=document.getElementById('messages');
const inp=document.getElementById('input');
const btn=document.getElementById('send');
const micBtn=document.getElementById('mic');
inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}});
function addMsg(text,cls){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}

// ── Speech-to-Text (Browser API) ─────────────────────────
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
  recognition.onerror=e=>{isListening=false;micBtn.classList.remove('listening');if(e.error!=='aborted')addMsg('🎙️ Mikrofon-Fehler: '+e.error,'bot');};
}else{
  micBtn.classList.add('unsupported');
}

function toggleMic(){
  if(!recognition)return;
  if(isListening){recognition.stop();return;}
  isListening=true;
  micBtn.classList.add('listening');
  micBtn.title='Aufnahme läuft... (Klick zum Stoppen)';
  inp.value='';
  inp.placeholder='🎙️ Höre zu...';
  recognition.start();
  recognition.onend=()=>{
    isListening=false;micBtn.classList.remove('listening');
    inp.placeholder='Nachricht eingeben...';
    micBtn.title='Spracheingabe';
    if(inp.value.trim())sendMsg();
  };
}

async function sendMsg(){
  const t=inp.value.trim();if(!t)return;
  inp.value='';addMsg(t,'user');btn.disabled=true;inp.disabled=true;
  try{
    const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t})});
    const d=await r.json();
    addMsg(d.response||JSON.stringify(d),'bot');
    if(d.iterations){const m=document.createElement('div');m.className='meta';m.textContent=d.iterations+' Iteration(en), '+d.toolCalls.length+' Tool-Aufruf(e)';msgs.appendChild(m);}
  }catch(e){addMsg('❌ Fehler: '+e.message,'bot');}
  btn.disabled=false;inp.disabled=false;inp.focus();
}
</script></body></html>`;
}
