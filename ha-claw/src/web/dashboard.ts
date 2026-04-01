/**
 * dashboard.ts – HTML template for the HA-Claw Web UI.
 *
 * Three theme modes:
 * - "light"   – Clean light theme
 * - "dark"    – Clean dark theme
 * - "claw"    – Cyberpunk HA-Claw branded theme
 *
 * Default is auto-detected from HA Ingress or prefers-color-scheme.
 */

export function dashboardHtml(basePath: string): string {
  return `<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HA-Claw</title>
<style>
/* ── Reset ───────────────────────────────────────────────── */
*{margin:0;padding:0;box-sizing:border-box}
:root{--transition:0.25s ease}

/* ── Theme: Dark ─────────────────────────────────────────── */
[data-theme="dark"]{
  --bg:         #111827;
  --bg-surface: #1f2937;
  --bg-card:    #1f2937;
  --bg-input:   #111827;
  --border:     #374151;
  --text:       #e5e7eb;
  --text-muted: #9ca3af;
  --text-dim:   #6b7280;
  --accent:     #6c63ff;
  --accent-hover:#5a52d5;
  --accent-glow: rgba(108,99,255,0.15);
  --msg-user-bg:#1e3a5f;
  --msg-bot-bg: #1f2937;
  --msg-bot-border:#374151;
  --danger:     #ef4444;
  --success:    #4ade80;
  --nav-bg:     #111827;
  --nav-border: #1f2937;
  --brand-gradient:linear-gradient(135deg,#6c63ff,#a78bfa);
  --welcome-gradient:linear-gradient(135deg,#e5e7eb,#6c63ff);
  --label-color:#6c63ff;
  --scrollbar-thumb:#374151;
  --scrollbar-track:transparent;
  --input-shadow:none;
  --font-brand: system-ui,sans-serif;
}

/* ── Theme: Light ────────────────────────────────────────── */
[data-theme="light"]{
  --bg:         #f9fafb;
  --bg-surface: #ffffff;
  --bg-card:    #ffffff;
  --bg-input:   #f3f4f6;
  --border:     #e5e7eb;
  --text:       #1f2937;
  --text-muted: #6b7280;
  --text-dim:   #9ca3af;
  --accent:     #6c63ff;
  --accent-hover:#5a52d5;
  --accent-glow: rgba(108,99,255,0.1);
  --msg-user-bg:#ede9fe;
  --msg-bot-bg: #ffffff;
  --msg-bot-border:#e5e7eb;
  --danger:     #ef4444;
  --success:    #22c55e;
  --nav-bg:     #ffffff;
  --nav-border: #e5e7eb;
  --brand-gradient:linear-gradient(135deg,#6c63ff,#a78bfa);
  --welcome-gradient:linear-gradient(135deg,#1f2937,#6c63ff);
  --label-color:#6c63ff;
  --scrollbar-thumb:#d1d5db;
  --scrollbar-track:transparent;
  --input-shadow:0 1px 3px rgba(0,0,0,0.08);
  --font-brand: system-ui,sans-serif;
}

/* ── Theme: Claw ─────────────────────────────────────────── */
[data-theme="claw"]{
  --bg:         #0a0e17;
  --bg-surface: #0f1923;
  --bg-card:    #111d2b;
  --bg-input:   #0a1018;
  --border:     #1a2d42;
  --text:       #c8d6e5;
  --text-muted: #5a7a9a;
  --text-dim:   #3a5570;
  --accent:     #00e5a0;
  --accent-hover:#00c98b;
  --accent-glow: rgba(0,229,160,0.08);
  --msg-user-bg:rgba(0,229,160,0.06);
  --msg-bot-bg: #111d2b;
  --msg-bot-border:#1a2d42;
  --danger:     #ff4d6a;
  --success:    #00e5a0;
  --nav-bg:     #0a0e17;
  --nav-border: #1a2d42;
  --brand-gradient:linear-gradient(135deg,#00e5a0,#00b4d8);
  --welcome-gradient:linear-gradient(135deg,#c8d6e5,#00e5a0);
  --label-color:#00e5a0;
  --scrollbar-thumb:#1a2d42;
  --scrollbar-track:transparent;
  --input-shadow:0 0 20px rgba(0,229,160,0.04);
  --font-brand: 'JetBrains Mono',ui-monospace,monospace;
}
[data-theme="claw"] .brand{font-family:var(--font-brand);letter-spacing:0.15em;text-transform:uppercase}
[data-theme="claw"] .msg.bot{border-left:2px solid var(--accent);border-top:none;border-right:none;border-bottom:none}
[data-theme="claw"] .msg.user{border-right:2px solid rgba(0,229,160,0.3);border-top:none;border-left:none;border-bottom:none}
[data-theme="claw"] #input{font-family:var(--font-brand);letter-spacing:0.02em}
[data-theme="claw"] .statusbar{font-family:var(--font-brand);letter-spacing:0.08em;text-transform:uppercase;font-size:0.65rem}
[data-theme="claw"] .welcome-sub{font-family:var(--font-brand);letter-spacing:0.04em}
[data-theme="claw"] .nav-item.active{border-image:linear-gradient(90deg,#00e5a0,#00b4d8) 1;border-bottom:2px solid}

/* ── Layout ──────────────────────────────────────────────── */
html,body{height:100%}
body{
  font-family:system-ui,-apple-system,sans-serif;
  background:var(--bg);
  color:var(--text);
  display:flex;
  flex-direction:column;
  transition:background var(--transition),color var(--transition);
}

/* ── Navbar ──────────────────────────────────────────────── */
.navbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 1.5rem;
  height:52px;
  background:var(--nav-bg);
  border-bottom:1px solid var(--nav-border);
  flex-shrink:0;
  position:sticky;
  top:0;
  z-index:100;
}
.nav-left{display:flex;align-items:center;gap:0.5rem}
.brand{
  font-weight:700;
  font-size:1rem;
  background:var(--brand-gradient);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
.nav-center{display:flex;gap:0.25rem}
.nav-item{
  padding:0.5rem 1rem;
  font-size:0.8rem;
  font-weight:600;
  color:var(--text-muted);
  text-transform:uppercase;
  letter-spacing:0.06em;
  cursor:pointer;
  border-bottom:2px solid transparent;
  transition:all var(--transition);
  background:none;
  border-top:none;border-left:none;border-right:none;
}
.nav-item:hover{color:var(--text)}
.nav-item.active{color:var(--accent);border-bottom-color:var(--accent)}
.nav-right{display:flex;align-items:center;gap:0.75rem}

/* Theme Switcher */
.theme-switcher{
  display:flex;
  background:var(--bg-surface);
  border:1px solid var(--border);
  border-radius:8px;
  overflow:hidden;
}
.theme-btn{
  padding:0.35rem 0.5rem;
  font-size:0.7rem;
  background:none;
  border:none;
  color:var(--text-muted);
  cursor:pointer;
  transition:all var(--transition);
  line-height:1;
}
.theme-btn:hover{color:var(--text);background:var(--accent-glow)}
.theme-btn.active{color:var(--accent);background:var(--accent-glow)}

/* ── Main Content ────────────────────────────────────────── */
.main{
  flex:1;
  display:flex;
  flex-direction:column;
  max-width:820px;
  width:100%;
  margin:0 auto;
  padding:1.5rem;
  overflow:hidden;
}

/* Welcome */
.welcome{margin-bottom:1.25rem}
.welcome h1{
  font-size:2rem;
  font-weight:300;
  line-height:1.2;
  color:var(--text);
}
.welcome h1 strong{
  font-weight:700;
  background:var(--welcome-gradient);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
.welcome-sub{
  color:var(--text-muted);
  font-size:0.85rem;
  margin-top:0.35rem;
}

/* ── Messages ────────────────────────────────────────────── */
#messages{
  flex:1;
  overflow-y:auto;
  padding-bottom:1rem;
  scrollbar-width:thin;
  scrollbar-color:var(--scrollbar-thumb) var(--scrollbar-track);
}
#messages::-webkit-scrollbar{width:6px}
#messages::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:3px}
#messages::-webkit-scrollbar-track{background:var(--scrollbar-track)}

.msg-group{margin-bottom:1.25rem}
.msg-label{
  display:flex;
  align-items:center;
  gap:0.4rem;
  font-size:0.7rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:var(--label-color);
  margin-bottom:0.4rem;
}
.msg-label.user-label{
  justify-content:flex-end;
  color:var(--text-muted);
}
.msg-label-icon{
  width:18px;
  height:18px;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:0.6rem;
  background:var(--accent-glow);
  color:var(--accent);
}
.msg{
  padding:0.9rem 1rem;
  border-radius:10px;
  font-size:0.88rem;
  line-height:1.55;
  white-space:pre-wrap;
  word-break:break-word;
  transition:background var(--transition);
}
.msg.user{
  background:var(--msg-user-bg);
  margin-left:3rem;
  border:1px solid transparent;
}
.msg.bot{
  background:var(--msg-bot-bg);
  margin-right:3rem;
  border:1px solid var(--msg-bot-border);
}
.msg.typing{opacity:0.7;font-style:italic}
.typing-dots span{animation:blink 1.4s infinite both}
.typing-dots span:nth-child(2){animation-delay:0.2s}
.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes blink{0%,80%,100%{opacity:0}40%{opacity:1}}
.confirm-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999}
.confirm-modal{background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:1.5rem;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
.confirm-title{font-weight:700;font-size:1.1em;margin-bottom:0.75rem;color:var(--accent)}
.confirm-body{font-size:0.9em;line-height:1.5;margin-bottom:1rem}
.confirm-body pre{background:var(--bg);padding:0.5rem;border-radius:6px;font-size:0.82em;overflow-x:auto;margin-top:0.5rem}
.confirm-actions{display:flex;gap:0.75rem;justify-content:flex-end}
.confirm-btn{padding:0.5rem 1.2rem;border-radius:8px;border:none;cursor:pointer;font-weight:600;font-size:0.9em}
.confirm-btn.approve{background:var(--accent);color:#fff}
.confirm-btn.deny{background:var(--msg-user-bg);color:var(--text)}
.msg strong{font-weight:600}
.msg em{font-style:italic}
.msg code{
  background:rgba(108,99,255,0.1);
  padding:0.15em 0.4em;
  border-radius:4px;
  font-size:0.82em;
  font-family:ui-monospace,monospace;
}
.msg a,.msg .highlight{
  color:var(--accent);
  text-decoration:underline;
  text-underline-offset:2px;
  font-weight:600;
}

/* ── Rich Cards (automation proposals, device groups) ────── */
.msg-cards{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:0.6rem;
  margin:0.75rem 0;
}
.msg-card{
  display:flex;
  align-items:center;
  gap:0.65rem;
  background:var(--bg-surface);
  border:1px solid var(--border);
  border-radius:10px;
  padding:0.7rem 0.9rem;
}
.msg-card-icon{
  width:36px;
  height:36px;
  min-width:36px;
  border-radius:8px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:1rem;
  background:var(--accent-glow);
  color:var(--accent);
}
.msg-card-body{min-width:0}
.msg-card-label{
  font-size:0.6rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:var(--text-muted);
  margin-bottom:0.1rem;
}
.msg-card-value{
  font-size:0.85rem;
  font-weight:600;
  color:var(--text);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

/* ── Action Buttons (confirm/deny in chat) ───────────────── */
.msg-actions{
  display:flex;
  gap:0.5rem;
  margin-top:0.75rem;
  flex-wrap:wrap;
}
.msg-action-btn{
  padding:0.55rem 1.25rem;
  border-radius:24px;
  font-size:0.82rem;
  font-weight:600;
  cursor:pointer;
  border:none;
  transition:all var(--transition);
}
.msg-action-btn.primary{
  background:var(--accent);
  color:#fff;
}
.msg-action-btn.primary:hover{background:var(--accent-hover)}
.msg-action-btn.secondary{
  background:transparent;
  color:var(--text);
  border:1px solid var(--border);
}
.msg-action-btn.secondary:hover{border-color:var(--text-muted)}
.msg-action-btn:disabled{opacity:0.4;cursor:not-allowed}

/* Meta info */
.meta{
  font-size:0.7rem;
  color:var(--text-dim);
  margin-top:0.3rem;
  margin-right:3rem;
}

/* ── Input Area ──────────────────────────────────────────── */
.input-area{
  flex-shrink:0;
  padding-top:0.75rem;
}
.input-container{
  display:flex;
  align-items:center;
  gap:0.5rem;
  background:var(--bg-surface);
  border:1px solid var(--border);
  border-radius:14px;
  padding:0.5rem 0.5rem 0.5rem 1rem;
  box-shadow:var(--input-shadow);
  transition:border-color var(--transition),box-shadow var(--transition);
}
.input-container:focus-within{border-color:var(--accent)}
#input{
  flex:1;
  padding:0.55rem 0;
  border:none;
  background:transparent;
  color:var(--text);
  font-size:0.88rem;
  outline:none;
  min-width:0;
}
#input::placeholder{color:var(--text-dim)}

.input-btn{
  width:38px;
  height:38px;
  min-width:38px;
  border-radius:50%;
  border:none;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  transition:all var(--transition);
  font-size:1rem;
  padding:0;
}
#mic{
  background:transparent;
  color:var(--text-muted);
}
#mic svg{display:block}
#mic:hover{color:var(--accent);background:var(--accent-glow)}
#mic.listening{
  background:var(--accent);
  color:#fff;
  animation:pulse 1.2s ease-in-out infinite;
}
#mic.unsupported{display:none}
#send,#logs-send{
  background:var(--accent);
  color:#fff;
}
#send:hover,#logs-send:hover{background:var(--accent-hover)}
#send:disabled,#logs-send:disabled{opacity:0.4;cursor:not-allowed}

@keyframes pulse{
  0%,100%{box-shadow:0 0 0 0 var(--accent-glow)}
  50%{box-shadow:0 0 0 10px transparent}
}

/* ── Status Bar ──────────────────────────────────────────── */
.statusbar{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:1.25rem;
  padding:0.5rem 0 0.25rem;
  font-size:0.7rem;
  color:var(--text-dim);
}
.statusbar .dot{
  display:inline-block;
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--success);
  margin-right:0.3rem;
}

/* ── Pages ───────────────────────────────────────────────── */
.page{display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0}
.page.active{display:flex}

.page-placeholder{
  flex:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  color:var(--text-dim);
  gap:0.75rem;
}
.page-placeholder-icon{font-size:2.5rem;opacity:0.4}
.page-placeholder-text{font-size:0.9rem}

/* ── Logs Page ───────────────────────────────────────────── */
.logs-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:1.5rem;
  margin-bottom:1.25rem;
  flex-wrap:wrap;
}
.logs-header-left{}
.logs-header h1{
  font-size:2rem;
  font-weight:300;
  line-height:1.2;
}
.logs-header h1 strong{
  font-weight:700;
  background:var(--welcome-gradient);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
.logs-header-sub{
  color:var(--text-muted);
  font-size:0.85rem;
  margin-top:0.35rem;
}
.logs-stats{
  display:flex;
  align-items:center;
  gap:1.25rem;
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:10px;
  padding:0.75rem 1.25rem;
  flex-shrink:0;
}
.logs-stat-online{
  display:flex;
  align-items:center;
  gap:0.4rem;
  font-size:0.8rem;
  font-weight:600;
  color:var(--success);
}
.logs-stat-online .dot{
  width:8px;height:8px;border-radius:50%;background:var(--success);
}
.logs-stat{text-align:center}
.logs-stat-label{
  font-size:0.6rem;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:var(--text-dim);
  margin-bottom:0.15rem;
}
.logs-stat-value{
  font-size:0.95rem;
  font-weight:700;
  color:var(--text);
  font-family:ui-monospace,monospace;
}

/* Terminal */
.terminal{
  flex:1;
  display:flex;
  flex-direction:column;
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
  min-height:0;
}
.terminal-titlebar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0.6rem 1rem;
  border-bottom:1px solid var(--border);
  flex-shrink:0;
}
.terminal-dots{
  display:flex;
  gap:6px;
}
.terminal-dots span{
  width:10px;height:10px;border-radius:50%;
}
.terminal-dots span:nth-child(1){background:#ff5f57}
.terminal-dots span:nth-child(2){background:#febc2e}
.terminal-dots span:nth-child(3){background:#28c840}
.terminal-title{
  font-family:ui-monospace,monospace;
  font-size:0.75rem;
  color:var(--text-muted);
  display:flex;
  align-items:center;
  gap:0.5rem;
}
.terminal-actions{display:flex;gap:0.75rem}
.terminal-action{
  background:none;
  border:none;
  color:var(--text-dim);
  cursor:pointer;
  font-size:0.9rem;
  padding:0.2rem;
  transition:color var(--transition);
}
.terminal-action:hover{color:var(--text)}

.terminal-body{
  flex:1;
  overflow-y:auto;
  padding:1rem 1.25rem;
  font-family:ui-monospace,'JetBrains Mono',monospace;
  font-size:0.78rem;
  line-height:1.8;
  scrollbar-width:thin;
  scrollbar-color:var(--scrollbar-thumb) var(--scrollbar-track);
}
.terminal-body::-webkit-scrollbar{width:6px}
.terminal-body::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:3px}

.log-line{white-space:pre-wrap;word-break:break-all}
.log-ts{color:var(--accent);opacity:0.7}
.log-level-info{color:var(--text-muted)}
.log-level-warn{color:#febc2e}
.log-level-error{color:#ff5f57}
.log-level-debug{color:var(--text-dim)}
.log-component{color:var(--accent)}
.log-msg{color:var(--text)}
.log-separator{
  color:var(--text-dim);
  font-style:italic;
  opacity:0.5;
  display:block;
  margin:0.5rem 0;
}
.log-cursor{
  display:inline-block;
  width:7px;
  height:14px;
  background:var(--accent);
  animation:blink 1s step-end infinite;
  vertical-align:middle;
  margin-left:4px;
}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}

/* Logs input */
.logs-input-area{flex-shrink:0;padding-top:0.75rem}
.logs-input-container{
  display:flex;
  align-items:center;
  gap:0.5rem;
  background:var(--bg-surface);
  border:1px solid var(--border);
  border-radius:14px;
  padding:0.5rem 0.5rem 0.5rem 1rem;
  box-shadow:var(--input-shadow);
  transition:border-color var(--transition);
}
.logs-input-container:focus-within{border-color:var(--accent)}
.logs-input-prefix{
  color:var(--accent);
  font-family:ui-monospace,monospace;
  font-weight:700;
  font-size:1rem;
  user-select:none;
}
#logs-input{
  flex:1;
  padding:0.55rem 0;
  border:none;
  background:transparent;
  color:var(--text);
  font-family:ui-monospace,monospace;
  font-size:0.85rem;
  outline:none;
  min-width:0;
}
#logs-input::placeholder{color:var(--text-dim)}
.logs-input-hint{
  color:var(--text-dim);
  font-size:0.7rem;
  font-family:ui-monospace,monospace;
  white-space:nowrap;
  margin-right:0.25rem;
}

/* ── Settings Page ───────────────────────────────────────── */
.settings-layout{
  display:flex;
  gap:1.5rem;
  flex:1;
  overflow:hidden;
}
.settings-sidebar{
  width:180px;
  flex-shrink:0;
  display:flex;
  flex-direction:column;
  gap:1.5rem;
}
.settings-agent{padding:0.25rem 0}
.settings-agent-name{font-weight:700;font-size:0.95rem;color:var(--text)}
.settings-agent-status{
  font-size:0.65rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.1em;
  color:var(--accent);
  margin-top:0.15rem;
}
.settings-nav{display:flex;flex-direction:column;gap:0.15rem}
.settings-nav-item{
  display:flex;
  align-items:center;
  gap:0.6rem;
  padding:0.6rem 0.75rem;
  border-radius:8px;
  font-size:0.82rem;
  color:var(--text-muted);
  cursor:pointer;
  border:none;
  background:none;
  text-align:left;
  width:100%;
  border-left:3px solid transparent;
  transition:all var(--transition);
}
.settings-nav-item:hover{color:var(--text);background:var(--accent-glow)}
.settings-nav-item.active{
  color:var(--accent);
  border-left-color:var(--accent);
  background:var(--accent-glow);
}
.settings-nav-icon{display:flex;align-items:center;opacity:0.7}
.settings-nav-icon svg{display:block}

.settings-content{
  flex:1;
  overflow-y:auto;
  min-width:0;
  scrollbar-width:thin;
  scrollbar-color:var(--scrollbar-thumb) var(--scrollbar-track);
}
.settings-content::-webkit-scrollbar{width:6px}
.settings-content::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:3px}

.settings-header{margin-bottom:1.25rem}
.settings-header h1{
  font-size:2rem;
  font-weight:300;
  line-height:1.2;
}
.settings-header h1 strong{
  font-weight:700;
  background:var(--welcome-gradient);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
.settings-header-sub{
  color:var(--text-muted);
  font-size:0.85rem;
  margin-top:0.35rem;
}

/* Settings section */
.settings-section{display:none}
.settings-section.active{display:block}
.settings-section-title{
  font-size:1.1rem;
  font-weight:700;
  margin-bottom:1rem;
  color:var(--text);
}

/* Model + Stats grid */
.settings-grid{
  display:grid;
  grid-template-columns:1fr 260px;
  gap:1rem;
  margin-bottom:1.5rem;
}

/* Model card */
.model-card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  padding:1.25rem;
}
.model-card-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:0.35rem;
}
.model-card-title{font-size:1.05rem;font-weight:700}
.model-badge{
  font-size:0.6rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.06em;
  padding:0.25rem 0.6rem;
  border-radius:12px;
  background:var(--accent-glow);
  color:var(--accent);
  border:1px solid var(--accent);
}
.model-card-sub{font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem}
.model-list{display:flex;flex-direction:column;gap:0.5rem}
.model-item{
  display:flex;
  align-items:center;
  gap:0.75rem;
  padding:0.75rem 1rem;
  border-radius:10px;
  border:1px solid var(--border);
  background:var(--bg-surface);
  transition:all var(--transition);
}
.model-item.active{border-color:var(--accent)}
.model-item-icon{
  width:36px;height:36px;min-width:36px;
  border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  font-size:1rem;
  background:var(--accent-glow);
  color:var(--accent);
}
.model-item-body{flex:1;min-width:0}
.model-item-name{font-weight:600;font-size:0.88rem}
.model-item-desc{font-size:0.75rem;color:var(--text-muted)}
.model-item-check{
  font-size:1rem;
  color:var(--accent);
}
.model-item-select{
  font-size:0.7rem;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.06em;
  color:var(--text-dim);
}

/* Stats sidebar */
.stats-col{display:flex;flex-direction:column;gap:1rem}
.stat-card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  padding:1rem;
}
.stat-card-label{
  font-size:0.65rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.1em;
  color:var(--accent);
  margin-bottom:0.6rem;
}
.stat-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:0.4rem;
}
.stat-row-label{font-size:0.8rem;color:var(--text-muted)}
.stat-row-value{font-size:0.8rem;font-weight:700;font-family:ui-monospace,monospace}
.stat-bar{
  height:6px;
  background:var(--border);
  border-radius:3px;
  overflow:hidden;
  margin-bottom:0.75rem;
}
.stat-bar-fill{
  height:100%;
  border-radius:3px;
  background:var(--accent);
  transition:width 0.5s ease;
}
.stat-big{
  display:flex;
  align-items:center;
  gap:0.65rem;
  padding:0.6rem 0.75rem;
  background:var(--bg-surface);
  border:1px solid var(--border);
  border-radius:10px;
}
.stat-big-icon{
  width:32px;height:32px;min-width:32px;
  border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  font-size:0.9rem;
  background:var(--accent-glow);
  color:var(--accent);
}
.stat-big-label{font-size:0.7rem;color:var(--text-muted)}
.stat-big-value{font-size:0.95rem;font-weight:700;font-family:ui-monospace,monospace}

.security-card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  padding:1.25rem;
  text-align:center;
}
.security-icon{font-size:2rem;margin-bottom:0.5rem;color:var(--accent)}
.security-title{font-weight:700;font-size:0.95rem;margin-bottom:0.3rem}
.security-desc{font-size:0.78rem;color:var(--text-muted);line-height:1.4}

/* Tool vault */
.tools-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:1rem;
}
.tools-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
  gap:0.75rem;
}
.tool-card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  padding:1rem;
  transition:border-color var(--transition);
}
.tool-card:hover{border-color:var(--text-dim)}
.tool-card-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:0.65rem;
}
.tool-card-icon{
  width:36px;height:36px;
  border-radius:10px;
  display:flex;align-items:center;justify-content:center;
  font-size:1rem;
  background:var(--accent-glow);
  color:var(--accent);
}
.tool-card-name{font-weight:700;font-size:0.88rem;margin-bottom:0.2rem}
.tool-card-type{font-size:0.7rem;color:var(--text-muted)}
.tool-card-badge{
  display:inline-block;
  margin-top:0.5rem;
  font-size:0.6rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.06em;
  padding:0.2rem 0.5rem;
  border-radius:8px;
  background:var(--accent-glow);
  color:var(--accent);
}
.tool-card-badge.danger{
  background:rgba(239,68,68,0.1);
  color:var(--danger);
}
.tool-card.disabled{opacity:0.45;border-style:dashed}
.tool-toggle{
  position:relative;width:36px;height:20px;
  background:var(--border);border-radius:10px;
  cursor:pointer;transition:background var(--transition);
  border:none;padding:0;flex-shrink:0;
}
.tool-toggle.on{background:var(--accent)}
.tool-toggle::after{
  content:'';position:absolute;top:2px;left:2px;
  width:16px;height:16px;border-radius:50%;
  background:var(--text);transition:transform var(--transition);
}
.tool-toggle.on::after{transform:translateX(16px)}

/* ── Profile Section ─────────────────────────────────────── */
.profile-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:1rem;
}
.profile-card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  padding:1.25rem;
}
.profile-card-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:1rem;
}
.profile-card-title{font-size:1.05rem;font-weight:700}
.profile-card-hint{font-size:0.65rem;color:var(--text-dim);font-style:italic}
.profile-field{margin-bottom:0.85rem}
.profile-label{
  display:block;
  font-size:0.75rem;
  font-weight:600;
  color:var(--text-muted);
  margin-bottom:0.3rem;
  text-transform:uppercase;
  letter-spacing:0.06em;
}
.profile-input{
  width:100%;
  padding:0.6rem 0.75rem;
  border-radius:8px;
  border:1px solid var(--border);
  background:var(--bg-input);
  color:var(--text);
  font-size:0.88rem;
  outline:none;
  transition:border-color var(--transition);
}
.profile-input:focus{border-color:var(--accent)}
.profile-save-btn{
  display:inline-block;
  padding:0.5rem 1.2rem;
  border-radius:8px;
  border:none;
  background:var(--accent);
  color:#fff;
  font-size:0.8rem;
  font-weight:600;
  cursor:pointer;
  transition:background var(--transition);
  margin-top:0.25rem;
}
.profile-save-btn:hover{background:var(--accent-hover)}
.profile-save-btn.saved{background:var(--success)}

.profile-slider-group{display:flex;flex-direction:column;gap:1rem}
.profile-slider-row{}
.profile-slider-label{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:0.15rem;
}
.profile-slider-label span:first-child{font-size:0.85rem;font-weight:600;color:var(--text)}
.profile-slider-value{
  font-size:0.8rem;
  font-weight:700;
  color:var(--accent);
  font-family:ui-monospace,monospace;
  min-width:1.2em;
  text-align:right;
}
.profile-slider-desc{
  display:flex;
  justify-content:space-between;
  font-size:0.65rem;
  color:var(--text-dim);
  margin-bottom:0.3rem;
}
.profile-slider{
  -webkit-appearance:none;
  appearance:none;
  width:100%;
  height:6px;
  border-radius:3px;
  background:var(--border);
  outline:none;
  cursor:pointer;
}
.profile-slider::-webkit-slider-thumb{
  -webkit-appearance:none;
  appearance:none;
  width:18px;height:18px;
  border-radius:50%;
  background:var(--accent);
  cursor:pointer;
  border:2px solid var(--bg-card);
  box-shadow:0 0 4px rgba(0,0,0,0.2);
}
.profile-slider::-moz-range-thumb{
  width:18px;height:18px;
  border-radius:50%;
  background:var(--accent);
  cursor:pointer;
  border:2px solid var(--bg-card);
  box-shadow:0 0 4px rgba(0,0,0,0.2);
}

/* ── Backlog Section ──────────────────────────────────────── */
.backlog-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:1rem;
}
.backlog-add-btn{
  display:flex;
  align-items:center;
  gap:0.4rem;
  padding:0.45rem 0.9rem;
  border-radius:8px;
  border:1px solid var(--accent);
  background:transparent;
  color:var(--accent);
  font-size:0.78rem;
  font-weight:600;
  cursor:pointer;
  transition:all var(--transition);
}
.backlog-add-btn:hover{background:var(--accent-glow)}
.backlog-form{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:12px;
  padding:1.25rem;
  margin-bottom:1rem;
}
.backlog-form-grid{display:flex;flex-direction:column;gap:0.75rem}
.backlog-form-row{display:flex;gap:0.75rem}
.backlog-textarea{
  resize:vertical;
  min-height:50px;
  max-height:120px;
  font-family:inherit;
}
.backlog-form-actions{
  display:flex;
  gap:0.5rem;
  margin-top:0.75rem;
}
.backlog-cancel-btn{
  padding:0.5rem 1.2rem;
  border-radius:8px;
  border:1px solid var(--border);
  background:transparent;
  color:var(--text-muted);
  font-size:0.8rem;
  cursor:pointer;
  transition:all var(--transition);
}
.backlog-cancel-btn:hover{color:var(--text);border-color:var(--text-dim)}
.backlog-filters{
  display:flex;
  gap:0.35rem;
  margin-bottom:1rem;
  flex-wrap:wrap;
}
.backlog-filter{
  padding:0.3rem 0.7rem;
  border-radius:6px;
  border:1px solid var(--border);
  background:transparent;
  color:var(--text-muted);
  font-size:0.72rem;
  font-weight:600;
  cursor:pointer;
  transition:all var(--transition);
}
.backlog-filter:hover{color:var(--text);border-color:var(--text-dim)}
.backlog-filter.active{
  background:var(--accent-glow);
  color:var(--accent);
  border-color:var(--accent);
}
.backlog-list{display:flex;flex-direction:column;gap:0.6rem}
.backlog-empty{
  text-align:center;
  color:var(--text-dim);
  padding:2rem;
  font-size:0.85rem;
}
.backlog-item{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:10px;
  padding:1rem;
  transition:border-color var(--transition);
}
.backlog-item:hover{border-color:var(--text-dim)}
.backlog-item-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:0.4rem;
}
.backlog-item-title{font-weight:700;font-size:0.9rem}
.backlog-item-badges{display:flex;gap:0.35rem;align-items:center}
.backlog-badge{
  font-size:0.6rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.04em;
  padding:0.2rem 0.5rem;
  border-radius:6px;
}
.backlog-badge.priority-high{background:rgba(239,68,68,0.12);color:var(--danger)}
.backlog-badge.priority-medium{background:rgba(245,158,11,0.12);color:#f59e0b}
.backlog-badge.priority-low{background:var(--accent-glow);color:var(--accent)}
.backlog-badge.status{background:var(--accent-glow);color:var(--accent)}
.backlog-badge.status-done{background:rgba(74,222,128,0.12);color:var(--success)}
.backlog-badge.status-rejected{background:rgba(239,68,68,0.12);color:var(--danger)}
.backlog-badge.status-deferred{background:rgba(251,191,36,0.12);color:#fbbf24}
.backlog-badge.category{background:var(--bg-surface);color:var(--text-muted);border:1px solid var(--border)}
.backlog-item-details{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:0.5rem;
  margin-top:0.6rem;
  font-size:0.78rem;
}
.backlog-detail-label{
  font-size:0.65rem;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.06em;
  color:var(--text-dim);
  margin-bottom:0.15rem;
}
.backlog-detail-text{color:var(--text-muted);line-height:1.4}
.backlog-item-impact{
  grid-column:1/-1;
}
.backlog-item-actions{
  display:flex;
  gap:0.35rem;
  margin-top:0.75rem;
  flex-wrap:wrap;
}
.backlog-action-btn{
  padding:0.3rem 0.65rem;
  border-radius:6px;
  border:1px solid var(--border);
  background:transparent;
  color:var(--text-muted);
  font-size:0.7rem;
  font-weight:600;
  cursor:pointer;
  transition:all var(--transition);
}
.backlog-action-btn:hover{color:var(--text);border-color:var(--text-dim)}
.backlog-action-btn.approve{color:var(--success);border-color:var(--success)}
.backlog-action-btn.approve:hover{background:rgba(74,222,128,0.1)}
.backlog-action-btn.reject{color:var(--danger);border-color:var(--danger)}
.backlog-action-btn.reject:hover{background:rgba(239,68,68,0.1)}
.backlog-action-btn.delete{color:var(--danger);border-color:var(--danger)}
.backlog-action-btn.delete:hover{background:rgba(239,68,68,0.1)}

.backlog-action-btn.delete:hover{background:rgba(239,68,68,0.1)}

/* ── Actions List ────────────────────────────────────────── */
.actions-list{display:flex;flex-direction:column;gap:0.75rem;padding-bottom:2rem;overflow-y:auto;flex:1;min-height:0}
.action-entry{
  display:flex;gap:1rem;padding:0.85rem 1rem;
  background:var(--bg-card);border:1px solid var(--border);border-radius:12px;
}
.action-icon{
  width:38px;height:38px;min-width:38px;border-radius:10px;
  display:flex;align-items:center;justify-content:center;font-size:1.1rem;
}
.action-icon.switch{background:rgba(0,229,160,0.12);color:var(--success)}
.action-icon.note{background:rgba(108,99,255,0.12);color:var(--accent)}
.action-icon.task{background:rgba(245,158,11,0.12);color:#f59e0b}
.action-icon.system{background:rgba(229,231,235,0.1);color:var(--text-muted)}
.action-body{flex:1;min-width:0}
.action-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.2rem}
.action-tool{font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--text-dim);letter-spacing:0.05em}
.action-time{font-size:0.65rem;color:var(--text-dim);font-family:ui-monospace,monospace}
.action-msg{font-size:0.88rem;font-weight:600;color:var(--text);line-height:1.4}
.action-rollback{margin-top:0.75rem;padding:0.35rem 0.75rem;font-size:0.75rem;font-weight:600;color:var(--text);background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:all var(--transition)}
.action-rollback:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.action-rollback:disabled{opacity:0.5;cursor:not-allowed}
.btn-clear{padding:0.4rem 0.8rem;font-size:0.75rem;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;transition:all var(--transition)}
.btn-clear:hover{background:var(--danger);border-color:var(--danger);color:#fff}

/* ── Logs Sub-navigation ──────────────────────────────────── */
.logs-subnav{
  display:flex;
  gap:1.5rem;
  margin-bottom:1.25rem;
  border-bottom:1px solid var(--border);
  padding-bottom:0.25rem;
}
.logs-subnav-item{
  background:none;
  border:none;
  color:var(--text-dim);
  font-size:0.9rem;
  font-weight:600;
  cursor:pointer;
  padding:0.5rem 0.25rem;
  position:relative;
  transition:color var(--transition);
}
.logs-subnav-item:hover{color:var(--text)}
.logs-subnav-item.active{color:var(--accent)}
.logs-subnav-item.active::after{
  content:'';
  position:absolute;
  bottom:-0.25rem;
  left:0;
  right:0;
  height:2px;
  background:var(--accent);
  border-radius:2px;
}
.log-tab{display:none;flex-direction:column;flex:1;min-height:0}
.log-tab.active{display:flex;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--scrollbar-thumb) var(--scrollbar-track)}

/* ── Modal ──────────────────────────────────────────────── */
.modal{
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
  display:none;align-items:center;justify-content:center;z-index:1000;
  padding:1rem;
}
.modal.active{display:flex}
.modal-content{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:16px;width:100%;max-width:500px;
  display:flex;flex-direction:column;max-height:90vh;
}
.modal-header{
  padding:1rem 1.25rem;border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
}
.modal-title{font-weight:700;font-size:1.1rem}
.modal-close{
  background:none;border:none;color:var(--text-muted);
  font-size:1.2rem;cursor:pointer;padding:0.25rem;
}
.modal-close:hover{color:var(--text)}
.modal-body{padding:1.25rem;overflow-y:auto;scrollbar-width:thin}
.detail-label{font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--accent);margin-bottom:0.4rem;letter-spacing:0.06em}
.detail-text{font-size:0.9rem;line-height:1.5;color:var(--text);margin-bottom:1rem}
.params-list{display:flex;flex-direction:column;gap:0.75rem}
.param-item{padding:0.6rem;background:var(--bg-surface);border-radius:8px;border:1px solid var(--border)}
.param-name{font-family:ui-monospace,monospace;font-size:0.8rem;font-weight:700;color:var(--text)}
.param-type{font-size:0.65rem;color:var(--text-dim);margin-left:0.5rem}
.param-desc{font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem}

@media(max-width:700px){
  .profile-grid{grid-template-columns:1fr}
  .backlog-item-details{grid-template-columns:1fr}
  .backlog-form-row{flex-direction:column}
  .settings-layout{flex-direction:column}
  .settings-sidebar{width:100%;flex-direction:row;overflow-x:auto;gap:0.5rem}
  .settings-nav{flex-direction:row}
  .settings-nav-item{border-left:none;border-bottom:2px solid transparent;white-space:nowrap}
  .settings-nav-item.active{border-bottom-color:var(--accent);border-left-color:transparent}
  .settings-grid{grid-template-columns:1fr}
}

/* ── Responsive ──────────────────────────────────────────── */
@media(max-width:600px){
  .main{padding:1rem 0.75rem}
  .welcome h1{font-size:1.5rem}
  .msg.user{margin-left:1.5rem}
  .msg.bot{margin-right:1.5rem}
  .meta{margin-right:1.5rem}
  .navbar{padding:0 0.75rem}
  .brand{font-size:0.85rem}
  .theme-switcher{display:none}
}
</style>
</head>
<body>

<!-- ── Navbar ─────────────────────────────────────────────── -->
<nav class="navbar">
  <div class="nav-left">
    <span class="brand">HA-CLAW</span>
  </div>
  <div class="nav-center">
    <button class="nav-item active" data-page="chat">Chat</button>
    <button class="nav-item" data-page="settings">Settings</button>
    <button class="nav-item" data-page="logs">Logs</button>
  </div>
  <div class="nav-right">
    <div class="theme-switcher">
      <button class="theme-btn" data-theme="light" title="Light">&#9788;</button>
      <button class="theme-btn active" data-theme="dark" title="Dark">&#9790;</button>
      <button class="theme-btn" data-theme="claw" title="HA-Claw">&#9889;</button>
    </div>
  </div>
</nav>

<!-- ── Chat Page ─────────────────────────────────────────── -->
<div class="main">
  <div class="page active" id="page-chat">
    <div class="welcome" id="welcome-block">
      <h1>Willkommen, <strong id="welcome-name">...</strong></h1>
      <p class="welcome-sub">Alle Systeme synchronisiert. Was darf ich steuern?</p>
    </div>
    <div id="messages"></div>
    <div class="input-area">
      <div class="input-container">
        <input id="input" placeholder="Nachricht eingeben..." autocomplete="off">
        <button class="input-btn" id="mic" title="Spracheingabe" onclick="toggleMic()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg></button>
        <button class="input-btn" id="send" onclick="sendMsg()">&#10148;</button>
      </div>
      <div class="statusbar">
        <span><span class="dot"></span>Online</span>
        <span id="app-version">v...</span>
      </div>
    </div>
  </div>



  <!-- ── Settings Page ─────────────────────────────────────── -->
  <div class="page" id="page-settings">
    <div class="settings-layout">
      <div class="settings-sidebar">
        <div class="settings-agent">
          <div class="settings-agent-name">HA-Claw Butler</div>
          <div class="settings-agent-status">Active Intelligence</div>
        </div>
        <div class="settings-nav">
          <button class="settings-nav-item active" data-settings="model">
            <span class="settings-nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Model Forge
          </button>
          <button class="settings-nav-item" data-settings="tools">
            <span class="settings-nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span> Tool Vault
          </button>
          <button class="settings-nav-item" data-settings="backlog">
            <span class="settings-nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span> Backlog
          </button>
          <button class="settings-nav-item" data-settings="profile">
            <span class="settings-nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> Profil
          </button>
        </div>
      </div>
      <div class="settings-content">
        <div class="settings-header">
          <h1>System <strong>Settings</strong></h1>
          <p class="settings-header-sub">Konfiguriere HA-Claw Parameter, Tools und ueberwache den Systemstatus.</p>
        </div>

        <!-- Model Forge -->
        <div class="settings-section active" id="settings-model">
          <div class="settings-grid">
            <div class="model-card">
              <div class="model-card-header">
                <span class="model-card-title">Model Forge</span>
                <span class="model-badge" id="active-model-badge">Active Engine</span>
              </div>
              <p class="model-card-sub">Waehle das LLM fuer HA-Claw via OpenRouter.</p>
              
              <div class="profile-field">
                <label class="profile-label">Modell waehlen</label>
                <select class="profile-input" id="model-select" onchange="updateModelOverride()">
                  <option value="">Standard (Config)</option>
                </select>
                <p class="welcome-sub" style="font-size:0.75rem;margin-top:0.4rem">Aenderungen ueberschreiben den Add-on Standard fuer diesen Browser.</p>
                <div style="margin-top:0.8rem;padding:0.6rem;border-radius:8px;background:var(--surface);border:1px solid var(--border);font-size:0.75rem;line-height:1.5">
                  <strong style="color:var(--accent)">Empfehlung:</strong> Fuer zuverlaessiges Tool-Calling und natuerliche Antworten:<br>
                  &#9733; <strong>Claude Sonnet 4.6</strong> – ausgewogen, sehr gutes Tool-Calling<br>
                  &#9733; <strong>Claude Opus 4.6</strong> – Top-Tier Reasoning, komplex<br>
                  &#9733; <strong>GPT-5.4</strong> – leistungsstark<br>
                  &#9733; <strong>Gemini 3.1 Pro</strong> – starke Alternative<br>
                  &#128176; <strong>Claude Haiku 4.5 / Gemini Flash Lite</strong> – schnell &amp; guenstig
                </div>

                <div style="margin-top:1.5rem">
                  <label class="profile-label">Modell pro Komplexitaetsgrad</label>
                  <p class="welcome-sub" style="font-size:0.72rem;margin-bottom:0.6rem">Ordne verschiedene Modelle den Tool-Komplexitaetsstufen zu. Leer = Standard-Modell.</p>
                  <div style="display:flex;flex-direction:column;gap:0.5rem">
                    <div style="display:flex;align-items:center;gap:0.6rem">
                      <span style="font-size:0.75rem;min-width:90px;color:var(--text-muted)">&#9733;&#9734;&#9734; Einfach</span>
                      <select class="profile-input" id="complexity-model-1" onchange="saveComplexityModels()" style="flex:1;font-size:0.8rem">
                        <option value="">Standard</option>
                      </select>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.6rem">
                      <span style="font-size:0.75rem;min-width:90px;color:var(--text-muted)">&#9733;&#9733;&#9734; Mittel</span>
                      <select class="profile-input" id="complexity-model-2" onchange="saveComplexityModels()" style="flex:1;font-size:0.8rem">
                        <option value="">Standard</option>
                      </select>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.6rem">
                      <span style="font-size:0.75rem;min-width:90px;color:var(--text-muted)">&#9733;&#9733;&#9733; Komplex</span>
                      <select class="profile-input" id="complexity-model-3" onchange="saveComplexityModels()" style="flex:1;font-size:0.8rem">
                        <option value="">Standard</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="model-list" id="model-list" style="margin-top:1.5rem">
                <div class="model-item active">
                  <div class="model-item-icon">&#10024;</div>
                  <div class="model-item-body">
                    <div class="model-item-name" id="active-model-name">Lade...</div>
                    <div class="model-item-desc" id="active-model-id">--</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="stats-col">
              <div class="stat-card">
                <div class="stat-card-label">System Load</div>
                <div class="stat-row">
                  <span class="stat-row-label">Heap Usage</span>
                  <span class="stat-row-value" id="settings-heap">--</span>
                </div>
                <div class="stat-bar"><div class="stat-bar-fill" id="settings-heap-bar" style="width:0%"></div></div>
                <div class="stat-big">
                  <div class="stat-big-icon">&#9201;</div>
                  <div>
                    <div class="stat-big-label">Uptime</div>
                    <div class="stat-big-value" id="settings-uptime">--</div>
                  </div>
                </div>
              </div>
              <div class="security-card">
                <div class="security-icon">&#9889;</div>
                <div class="security-title">Ausfuehrung</div>
                <div class="security-desc" id="security-desc">Aktionen werden lokal ausgefuehrt, LLM-Anfragen gehen an Cloud-API.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tool Vault -->
        <div class="settings-section" id="settings-tools">
          <div class="tools-header">
            <div class="settings-section-title">Tool Vault</div>
          </div>
          <div class="tools-grid" id="tools-grid">
            <!-- Filled by JS -->
          </div>
        </div>

        <!-- Backlog -->
        <div class="settings-section" id="settings-backlog">
          <div class="backlog-header">
            <div class="settings-section-title">Optimization Backlog</div>
            <button class="backlog-add-btn" id="backlog-add-btn" onclick="showBacklogForm()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Task
            </button>
          </div>

          <!-- Add Task Form (hidden by default) -->
          <div class="backlog-form" id="backlog-form" style="display:none">
            <div class="backlog-form-grid">
              <div class="profile-field">
                <label class="profile-label">Titel</label>
                <input type="text" class="profile-input" id="bl-title" placeholder="Kurze Beschreibung">
              </div>
              <div class="backlog-form-row">
                <div class="profile-field" style="flex:1">
                  <label class="profile-label">Prioritaet</label>
                  <select class="profile-input" id="bl-priority">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div class="profile-field" style="flex:1">
                  <label class="profile-label">Kategorie</label>
                  <select class="profile-input" id="bl-category">
                    <option value="energy">Energy</option>
                    <option value="comfort">Comfort</option>
                    <option value="security">Security</option>
                    <option value="automation" selected>Automation</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
              <div class="profile-field">
                <label class="profile-label">As-Is (aktueller Zustand)</label>
                <textarea class="profile-input backlog-textarea" id="bl-asis" placeholder="Was ist der aktuelle Zustand?"></textarea>
              </div>
              <div class="profile-field">
                <label class="profile-label">To-Be (gewuenschter Zustand)</label>
                <textarea class="profile-input backlog-textarea" id="bl-tobe" placeholder="Was soll erreicht werden?"></textarea>
              </div>
              <div class="profile-field">
                <label class="profile-label">Impact</label>
                <input type="text" class="profile-input" id="bl-impact" placeholder="Erwarteter Nutzen">
              </div>
            </div>
            <div class="backlog-form-actions">
              <button class="profile-save-btn" onclick="submitBacklogTask()">Erstellen</button>
              <button class="backlog-cancel-btn" onclick="hideBacklogForm()">Abbrechen</button>
            </div>
          </div>

          <!-- Filter bar -->
          <div class="backlog-filters">
            <button class="backlog-filter active" data-filter="all" onclick="filterBacklog('all',this)">Alle</button>
            <button class="backlog-filter" data-filter="proposed" onclick="filterBacklog('proposed',this)">Proposed</button>
            <button class="backlog-filter" data-filter="approved" onclick="filterBacklog('approved',this)">Approved</button>
            <button class="backlog-filter" data-filter="in_progress" onclick="filterBacklog('in_progress',this)">In Progress</button>
            <button class="backlog-filter" data-filter="done" onclick="filterBacklog('done',this)">Done</button>
            <button class="backlog-filter" data-filter="deferred" onclick="filterBacklog('deferred',this)">Deferred</button>
            <button class="backlog-filter" data-filter="rejected" onclick="filterBacklog('rejected',this)">Rejected</button>
          </div>

          <div class="backlog-list" id="backlog-list">
            <div class="backlog-empty">Lade Backlog...</div>
          </div>
        </div>

        <!-- Profile -->
        <div class="settings-section" id="settings-profile">
          <div class="settings-section-title">Profil &amp; Persoenlichkeit</div>
          <div class="profile-grid">
            <div class="profile-card">
              <div class="profile-card-header">
                <span class="profile-card-title">Identitaet</span>
              </div>
              <div class="profile-field">
                <label class="profile-label">Bot-Name</label>
                <input type="text" class="profile-input" id="profile-bot-name" placeholder="z.B. Jarvis, Alfred...">
              </div>
              <div class="profile-field">
                <label class="profile-label">Dein Name</label>
                <input type="text" class="profile-input" id="profile-user-name" placeholder="Dein Name">
              </div>
              <button class="profile-save-btn" id="profile-save-names" onclick="saveProfileNames()">Speichern</button>
            </div>
            <div class="profile-card">
              <div class="profile-card-header">
                <span class="profile-card-title">Persoenlichkeit</span>
                <span class="profile-card-hint">Aenderungen werden sofort gespeichert</span>
              </div>
              <div class="profile-slider-group">
                <div class="profile-slider-row">
                  <div class="profile-slider-label">
                    <span>Direktheit</span>
                    <span class="profile-slider-value" id="val-directness">4</span>
                  </div>
                  <div class="profile-slider-desc">
                    <span>Diplomatisch</span><span>Direkt</span>
                  </div>
                  <input type="range" class="profile-slider" id="slider-directness" min="1" max="5" value="4">
                </div>
                <div class="profile-slider-row">
                  <div class="profile-slider-label">
                    <span>Formalitaet</span>
                    <span class="profile-slider-value" id="val-formality">3</span>
                  </div>
                  <div class="profile-slider-desc">
                    <span>Casual</span><span>Formell</span>
                  </div>
                  <input type="range" class="profile-slider" id="slider-formality" min="1" max="5" value="3">
                </div>
                <div class="profile-slider-row">
                  <div class="profile-slider-label">
                    <span>Humor</span>
                    <span class="profile-slider-value" id="val-humor">3</span>
                  </div>
                  <div class="profile-slider-desc">
                    <span>Sachlich</span><span>Humorvoll</span>
                  </div>
                  <input type="range" class="profile-slider" id="slider-humor" min="1" max="5" value="3">
                </div>
                <div class="profile-slider-row">
                  <div class="profile-slider-label">
                    <span>Ausfuehrlichkeit</span>
                    <span class="profile-slider-value" id="val-verbosity">2</span>
                  </div>
                  <div class="profile-slider-desc">
                    <span>Knapp</span><span>Ausfuehrlich</span>
                  </div>
                  <input type="range" class="profile-slider" id="slider-verbosity" min="1" max="5" value="2">
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- ── Logs Page ───────────────────────────────────────────── -->
  <div class="page" id="page-logs">
    <div class="logs-header">
      <div class="logs-header-left">
        <h1>System <strong>Logs</strong> & Aktivitaet</h1>
        <p class="logs-header-sub">Echtzeit-Telemetrie und KI-Audit-Trail von HA-Claw.</p>
      </div>
      <div class="logs-stats">
        <div class="logs-stat-online"><span class="dot"></span> SYSTEM ONLINE</div>
        <div class="logs-stat">
          <div class="logs-stat-label">Uptime</div>
          <div class="logs-stat-value" id="logs-uptime">--</div>
        </div>
        <div class="logs-stat">
          <div class="logs-stat-label">Heap</div>
          <div class="logs-stat-value" id="logs-heap">--</div>
        </div>
      </div>
    </div>

    <div class="logs-subnav">
      <button class="logs-subnav-item active" data-log-tab="system">System Logs</button>
      <button class="logs-subnav-item" data-log-tab="actions">Aktionen</button>
    </div>

    <!-- Tab: System Logs -->
    <div class="log-tab active" id="log-tab-system">
      <div class="terminal">
        <div class="terminal-titlebar">
          <div class="terminal-dots"><span></span><span></span><span></span></div>
          <div class="terminal-title">&#128187; HA_CLAW_LOG</div>
          <div class="terminal-actions">
            <button class="terminal-action" id="logs-download" title="Download">&#8615;</button>
            <button class="terminal-action" id="logs-clear" title="Logs leeren">&#128465;</button>
          </div>
        </div>
        <div class="terminal-body" id="logs-body">
          <div class="log-line"><span class="log-ts">[--:--:--]</span>  <span class="log-component">SYSTEM:</span>  <span class="log-msg">Lade Logs...</span></div>
        </div>
      </div>
      <div class="logs-input-area">
        <div class="logs-input-container">
          <span class="logs-input-prefix">$</span>
          <input id="logs-input" placeholder="Befehl eingeben..." autocomplete="off">
          <button class="input-btn" id="logs-send" onclick="runLogsCmd()">&#10148;</button>
        </div>
      </div>
    </div>

    <!-- Tab: Aktionen -->
    <div class="log-tab" id="log-tab-actions">
      <div class="welcome" style="margin-top:0; padding-top:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <p class="welcome-sub" style="margin:0">Audit-Trail der signifikanten KI-Entscheidungen.</p>
          <button class="btn-clear" onclick="clearActions()" style="padding:0.4rem 0.8rem; font-size:0.75rem">Verlauf leeren</button>
        </div>
      </div>
      <div class="actions-list" id="actions-list" style="margin-top:1rem">
        <div class="backlog-empty">Lade Aktionen...</div>
      </div>
    </div>
  </div>
</div>

<footer class="statusbar" style="margin-top:auto;border-top:1px solid var(--border);padding:1rem;flex-direction:column;height:auto">
  <div style="max-width:820px;width:100%;margin:0 auto;text-align:center;font-size:0.65rem;color:var(--text-dim);line-height:1.5">
    &copy; 2025 HA-Claw Butler &bull; Made with &hearts; for Home Assistant.<br>
    <strong>Disclaimer:</strong> Dies ist ein KI-Backend. Alle Aktionen werden lokal ausgefuehrt. 
    Nutzung auf eigene Gefahr. KI-generierte Antworten koennen ungenau sein.
  </div>
</footer>

<!-- ── Tool Details Modal ───────────────────────────────────── -->
<div id="tool-modal" class="modal" onclick="closeToolModal(event)">
  <div class="modal-content" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title" id="tool-detail-name">Tool Details</div>
      <button class="modal-close" onclick="closeToolModal()">&#10005;</button>
    </div>
    <div class="modal-body">
      <div class="detail-label">Beschreibung</div>
      <div class="detail-text" id="tool-detail-desc">--</div>
      
      <div class="detail-label" style="margin-top:1rem">Parameter</div>
      <div id="tool-params-list" class="params-list">
        <!-- Filled by JS -->
      </div>
    </div>
  </div>
</div>

<script>
const base='${basePath}';
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
        out+='<button class="msg-action-btn '+match[1]+'" data-action-group="'+gid+'" onclick="handleAction(this,\\''+escHtml2(match[2].trim()).replace(/'/g,'\\&#39;')+'\\')">'+escHtml2(match[2].trim())+'</button>';
      }
    }
    out+='</div>';
    return out;
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
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}
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
  bubble.innerHTML='<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span> denkt nach...';
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
async function sendMsg(){
  const t=inp.value.trim();if(!t)return;
  inp.value='';addMsg(t,'user');sendBtn.disabled=true;inp.disabled=true;
  showTyping();
  startConfirmPolling();
  try{
    const r=await fetch(base+'/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:t})
    });
    stopConfirmPolling();
    hideTyping();
    const d=await r.json();
    const g=addMsg(d.response||JSON.stringify(d),'bot');
    if(d.iterations){
      const m=document.createElement('div');
      m.className='meta';
      m.textContent=d.iterations+' Iteration(en), '+d.toolCalls.length+' Tool-Aufruf(e)';
      g.appendChild(m);
    }
  }catch(e){stopConfirmPolling();hideTyping();addMsg('Fehler: '+e.message,'bot');}
  sendBtn.disabled=false;inp.disabled=false;inp.focus();
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
          +'<button class="tool-toggle'+(enabled?' on':'')+'" onclick="toggleTool(\\x27'+name+'\\x27,this)" title="'+(enabled?'Deaktivieren':'Aktivieren')+'"></button>'
        +'</div>'
        +'<div class="tool-card-name">'+name+'</div>'
        +'<div class="tool-card-type">'+desc+'</div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem">'
          +'<span class="tool-card-badge'+(isDanger?' danger':'')+'">'+
            (isDanger?'Bestaetigung noetig':'Safe')+'</span>'
          +'<span style="font-size:0.7rem;color:var(--accent);letter-spacing:0.1em" title="Komplexitaet '+complexity+'">'+complexStars+'</span>'
          +'<a href="#" onclick="showToolDetails(\\x27'+name+'\\x27);return false" style="font-size:0.65rem;color:var(--text-dim);text-decoration:none;opacity:0.7">Details &rarr;</a>'
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
    setTimeout(()=>{btn.textContent='Speichern';btn.classList.remove('saved');},1500);
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
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27approved\\x27)">Genehmigen</button>');
    btns.push('<button class="backlog-action-btn" style="color:#fbbf24;border-color:#fbbf24" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27deferred\\x27)">Zurueckstellen</button>');
    btns.push('<button class="backlog-action-btn reject" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27rejected\\x27)">Ablehnen</button>');
  }
  if(t.status==='approved'){
    btns.push('<span style="color:var(--text-muted);font-size:0.72rem;font-style:italic">&#9881; KI erarbeitet Loesung...</span>');
    btns.push('<button class="backlog-action-btn" style="color:#fbbf24;border-color:#fbbf24" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27deferred\\x27)">Zurueckstellen</button>');
  }
  if(t.status==='solution_proposed'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27solution_approved\\x27)">Loesung genehmigen</button>');
    btns.push('<button class="backlog-action-btn" style="color:#63b3ed;border-color:#63b3ed" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27approved\\x27)">Neue Loesung</button>');
    btns.push('<button class="backlog-action-btn reject" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27rejected\\x27)">Ablehnen</button>');
  }
  if(t.status==='solution_approved'){
    btns.push('<span style="color:var(--text-muted);font-size:0.72rem;font-style:italic">&#9881; Wird ausgefuehrt...</span>');
  }
  if(t.status==='executing'){
    btns.push('<span style="color:#ed8936;font-size:0.72rem;font-style:italic">&#9881; Ausfuehrung laeuft...</span>');
  }
  if(t.status==='in_progress'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27done\\x27)">Abschliessen</button>');
  }
  if(t.status==='deferred'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27proposed\\x27)">Reaktivieren</button>');
    btns.push('<button class="backlog-action-btn reject" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27rejected\\x27)">Ablehnen</button>');
  }
  if(t.status==='rejected'){
    btns.push('<button class="backlog-action-btn approve" onclick="updateBacklogStatus(\\x27'+t.id+'\\x27,\\x27proposed\\x27)">Reaktivieren</button>');
  }
  btns.push('<button class="backlog-action-btn delete" onclick="deleteBacklogTask(\\x27'+t.id+'\\x27)">Loeschen</button>');
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
</script>
</body>
</html>`;
}
