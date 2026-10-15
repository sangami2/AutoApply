#!/usr/bin/env node
/**
 * DASHBOARD — interactive control panel for the whole pipeline.
 * Pure Node http server (no external deps). Open http://localhost:4747.
 *
 * Server-side responsibility: spawn pipeline scripts, split their combined
 * stdout into two streams —
 *   - structured `events` (parsed from %%EVT%% lines emitted by events.mjs)
 *     used to build a human-friendly live summary
 *   - raw `rawLog` lines (everything, unfiltered) for a separate detailed tab
 * — and serve both plus the on-disk spreadsheets over a tiny JSON API.
 *
 * Usage: node dashboard.mjs   (then open the URL it prints)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { parseEventLine } from './events.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DASH_PORT ? Number(process.env.DASH_PORT) : 4747;

let running = null;             // { name, child, startedAt }
let events = [];                // structured, human-friendly event log for the current/last run
const EVENTS_MAX = 2000;
const rawLog = [];              // full unfiltered stdout/stderr, for the Detailed Logs tab
const RAW_LOG_MAX = 4000;
let lineCarry = '';             // partial line buffered across data chunks

function ingest(chunk) {
  const text = lineCarry + chunk.toString();
  const lines = text.split('\n');
  lineCarry = lines.pop(); // last element may be a partial line; keep for next chunk
  for (const line of lines) {
    const evt = parseEventLine(line);
    if (evt) {
      events.push(evt);
      if (events.length > EVENTS_MAX) events.shift();
    } else if (line.trim()) {
      rawLog.push(line);
      if (rawLog.length > RAW_LOG_MAX) rawLog.shift();
    }
  }
}

function startJob(name, cmdArgs) {
  if (running) return { ok: false, error: `Already running: ${running.name}. Stop it first.` };
  events = [];
  rawLog.length = 0;
  lineCarry = '';
  rawLog.push(`$ node ${cmdArgs.join(' ')}`);
  const child = spawn(process.execPath, cmdArgs, { cwd: __dirname, env: { ...process.env } });
  running = { name, child, startedAt: Date.now() };
  child.stdout.on('data', ingest);
  child.stderr.on('data', ingest);
  child.on('close', (code) => {
    rawLog.push(`\n[${name} exited with code ${code}]`);
    events.push({ type: 'process_exit', ts: Date.now(), code, name });
    running = null;
  });
  return { ok: true };
}

// ---- CSV parsing (handles quoted fields) ----
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* skip */ }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function readCsvObjects(file) {
  if (!fs.existsSync(file)) return { headers: [], rows: [] };
  const rows = parseCsv(fs.readFileSync(file, 'utf-8'));
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0];
  return { headers, rows: rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))) };
}

function latestScan() {
  const dir = path.join(__dirname, 'runs');
  if (!fs.existsSync(dir)) return { file: null, headers: [], rows: [] };
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('scan-') && f.endsWith('.csv')).sort().reverse();
  if (!files.length) return { file: null, headers: [], rows: [] };
  return { file: files[0], ...readCsvObjects(path.join(dir, files[0])) };
}

function json(res, obj) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }

  if (u.pathname === '/api/state') {
    const apps = readCsvObjects(path.join(__dirname, 'applications-log.csv'));
    const scan = latestScan();
    let results = [];
    try { results = JSON.parse(fs.readFileSync(path.join(__dirname, 'application-results.json'), 'utf-8')); } catch {}
    const safety = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '.browser-profile/automation-safety-state.json'), 'utf-8')); } catch { return {}; } })();
    const links = (() => { try { return fs.readFileSync(path.join(__dirname, 'links.txt'), 'utf-8').split('\n').filter((l) => l.trim() && !l.startsWith('#')); } catch { return []; } })();
    return json(res, {
      running: running ? { name: running.name, startedAt: running.startedAt } : null,
      apps, scan, results, safety, links,
      events, rawLog: rawLog.slice(-1200),
      serverTime: Date.now(),
    });
  }

  if (u.pathname === '/api/run' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
      const { action } = JSON.parse(body || '{}');
      const map = {
        'scan': ['daily-run.mjs', '--no-submit'],
        'scan-apply': ['daily-run.mjs'],
        'apply-queue': ['apply-window.mjs', '--queue', 'today-queue.json', '--submit'],
        'links-prepare': ['apply-links.mjs', '--no-submit'],
        'links-apply': ['apply-links.mjs'],
      };
      if (!map[action]) return json(res, { ok: false, error: 'unknown action' });
      return json(res, startJob(action, map[action]));
    });
    return;
  }

  if (u.pathname === '/api/stop' && req.method === 'POST') {
    if (running) { running.child.kill('SIGTERM'); return json(res, { ok: true }); }
    return json(res, { ok: false, error: 'nothing running' });
  }

  if (u.pathname === '/api/links' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
      const { links } = JSON.parse(body || '{}');
      const clean = String(links || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const header = '# Paste one job APPLICATION url per line. Lines starting with # are ignored.\n';
      fs.writeFileSync(path.join(__dirname, 'links.txt'), header + clean.join('\n') + '\n');
      return json(res, { ok: true, count: clean.filter((l) => /^https?:\/\//.test(l)).length });
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  AutoApply dashboard → http://localhost:${PORT}\n  (Ctrl+C to stop)\n`);
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>AutoApply</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:#0d1117;--panel:#161b22;--panel2:#1c2129;--border:#30363d;--text:#e6edf3;--muted:#8b949e;
    --accent:#2f81f7;--accent-dim:rgba(47,129,247,.12);
    --green:#3fb950;--green-dim:rgba(63,185,80,.12);
    --amber:#d29922;--amber-dim:rgba(210,153,34,.12);
    --red:#f85149;--red-dim:rgba(248,81,73,.12);
  }
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text)}
  header{padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:18px;position:sticky;top:0;background:var(--bg);z-index:20;flex-wrap:wrap}
  header h1{font-size:17px;margin:0;white-space:nowrap}
  .status{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
  .dot.idle{background:var(--muted)}.dot.run{background:var(--green);animation:pulse 1.2s infinite}
  @keyframes pulse{50%{opacity:.35}}
  .spacer{flex:1}
  .updated{font-size:11px;color:var(--muted);opacity:.7}

  main{max-width:1280px;margin:0 auto;padding:20px 24px 60px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:18px}
  .card h2{margin:0 0 4px;font-size:14.5px;display:flex;align-items:center;gap:8px}
  .card .sub{color:var(--muted);font-size:12px;margin:0 0 14px}

  .btns{display:flex;flex-wrap:wrap;gap:9px}
  button{background:var(--accent);color:#fff;border:0;border-radius:7px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}
  button:hover{opacity:.88}
  button.ghost{background:transparent;border:1px solid var(--border);color:var(--text)}
  button.stop{background:var(--red)}
  button:disabled{opacity:.35;cursor:not-allowed}

  /* Stage banner */
  .stage-banner{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--accent-dim);border:1px solid rgba(47,129,247,.3);border-radius:9px;margin-bottom:16px}
  .stage-banner.done{background:var(--green-dim);border-color:rgba(63,185,80,.3)}
  .stage-banner .spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(47,129,247,.25);border-top-color:var(--accent);animation:spin .8s linear infinite;flex:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  .stage-banner .txt{font-size:13.5px;font-weight:600}
  .stage-banner .txt .muted{font-weight:400;color:var(--muted);font-size:12px;display:block;margin-top:2px}

  /* Funnel counters */
  .funnel{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}
  .metric{background:var(--panel2);border:1px solid var(--border);border-radius:9px;padding:12px 14px;text-align:center}
  .metric .n{font-size:24px;font-weight:700;line-height:1.1}
  .metric .l{font-size:11px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.03em}
  .metric.searched .n{color:var(--text)}
  .metric.rejected .n{color:var(--red)}
  .metric.selected .n{color:var(--green)}
  .metric.submitted .n{color:var(--accent)}

  /* Job feed */
  .job-feed{display:flex;flex-direction:column;gap:8px;max-height:480px;overflow-y:auto;padding-right:4px}
  .job-row{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;padding:10px 12px;background:var(--panel2);border:1px solid var(--border);border-radius:8px;border-left:3px solid var(--border)}
  .job-row.selected{border-left-color:var(--green)}
  .job-row.rejected{border-left-color:var(--red);opacity:.72}
  .job-row.applying{border-left-color:var(--accent)}
  .job-row.submitted{border-left-color:var(--accent)}
  .score-badge{font-size:15px;font-weight:800;text-align:center;padding:5px 0;border-radius:6px;background:rgba(255,255,255,.05)}
  .score-badge.hi{color:var(--green)}
  .score-badge.mid{color:var(--amber)}
  .score-badge.lo{color:var(--muted)}
  .job-title{font-size:13.5px;font-weight:600}
  .job-meta{font-size:12px;color:var(--muted);margin-top:2px}
  .job-reason{font-size:11.5px;color:var(--muted);margin-top:3px;font-style:italic}
  .job-tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
  .job-tag.selected{background:var(--green-dim);color:var(--green)}
  .job-tag.rejected{background:var(--red-dim);color:var(--red)}
  .job-tag.applying{background:var(--accent-dim);color:var(--accent)}
  .job-tag.submitted{background:var(--accent-dim);color:var(--accent)}
  .job-tag.blocked{background:var(--amber-dim);color:var(--amber)}
  .empty{color:var(--muted);font-size:13px;padding:24px;text-align:center}

  /* Tabs */
  .tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:16px}
  .tab{padding:9px 16px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;user-select:none}
  .tab.active{color:var(--text);border-bottom-color:var(--accent)}
  .tab-panel{display:none}
  .tab-panel.active{display:block}

  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--border);vertical-align:top}
  th{color:var(--muted);font-weight:600;position:sticky;top:0;background:var(--panel)}
  .scroll{max-height:380px;overflow:auto;border:1px solid var(--border);border-radius:8px}
  .pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700}
  .pill.SUBMITTED{background:var(--green-dim);color:var(--green)}
  .pill.APPLY,.pill.READY{background:var(--accent-dim);color:var(--accent)}
  .pill.BLOCKED,.pill.FAILED,.pill.SUBMIT_CLICKED{background:var(--amber-dim);color:var(--amber)}
  .pill.BELOW,.pill.SKIPPED{background:rgba(139,148,158,.1);color:var(--muted)}
  .score{font-weight:700}

  textarea{width:100%;min-height:72px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:7px;padding:10px;font:12.5px/1.5 ui-monospace,monospace;resize:vertical}
  pre.log{background:#010409;border:1px solid var(--border);border-radius:8px;padding:12px;max-height:560px;overflow:auto;font:12px/1.6 ui-monospace,SFMono-Regular,monospace;color:#c9d1d9;white-space:pre-wrap;word-break:break-word}
  .muted{color:var(--muted);font-size:12px}
  a{color:var(--accent)}
</style></head><body>
<header>
  <h1>⚡ AutoApply</h1>
  <span class="status" id="statusText"><span class="dot idle" id="dot"></span>idle</span>
  <span class="status" id="safety"></span>
  <div class="spacer"></div>
  <span class="updated" id="updated"></span>
</header>
<main>

  <div class="card">
    <h2>Controls</h2>
    <p class="sub">Scan looks at ~25 fresh roles, reads full descriptions, skips 5+yr and no-sponsorship roles, tailors a résumé per good match, then applies. Errored applications stay open in their own tab for you while the next one starts — nothing blocks.</p>
    <div class="btns">
      <button onclick="run('scan')">🔍 Scan only (no apply)</button>
      <button onclick="run('scan-apply')">🚀 Scan + Apply</button>
      <button class="ghost" onclick="run('apply-queue')">📋 Apply today's queue</button>
      <button class="ghost" onclick="run('links-prepare')">🔗 Prepare links</button>
      <button class="ghost" onclick="run('links-apply')">🔗 Apply to links</button>
      <button class="stop" onclick="stop()" id="stopBtn" disabled>■ Stop</button>
    </div>
  </div>

  <div class="card" id="stageCard" style="display:none">
    <div class="stage-banner" id="stageBanner">
      <div class="spin" id="stageSpin"></div>
      <div class="txt" id="stageTxt">—</div>
    </div>
    <div class="funnel" id="funnel"></div>
  </div>

  <div class="card">
    <h2>📋 Jobs this run</h2>
    <p class="sub">Live, in the order decisions were made — score, verdict, and why.</p>
    <div class="job-feed" id="jobFeed"><div class="empty">Run a scan to see jobs appear here.</div></div>
  </div>

  <div class="card">
    <h2>✅ Applications this run</h2>
    <div class="job-feed" id="appFeed"><div class="empty">No applications submitted yet this run.</div></div>
  </div>

  <div class="card">
    <h2>Add job links</h2>
    <p class="sub">Paste application URLs, one per line. Save, then use "Apply to links" above.</p>
    <textarea id="links" placeholder="https://..."></textarea>
    <div class="btns" style="margin-top:10px">
      <button onclick="saveLinks()">💾 Save links</button>
      <span class="muted" id="linksMsg"></span>
    </div>
  </div>

  <div class="card">
    <div class="tabs">
      <div class="tab active" data-tab="scan" onclick="showTab('scan')">Scan Spreadsheet</div>
      <div class="tab" data-tab="history" onclick="showTab('history')">Application History</div>
      <div class="tab" data-tab="logs" onclick="showTab('logs')">Detailed Logs</div>
    </div>

    <div class="tab-panel active" id="panel-scan">
      <p class="sub" id="scanFile">No scan yet.</p>
      <div class="scroll"><table id="scanTable"><thead><tr><th>Score</th><th>Title</th><th>Company</th><th>Yrs</th><th>Verdict</th></tr></thead><tbody></tbody></table></div>
    </div>

    <div class="tab-panel" id="panel-history">
      <div class="scroll"><table id="appsTable"><thead><tr><th>Date</th><th>Title</th><th>Company</th><th>Score</th><th>ATS</th><th>Status</th></tr></thead><tbody></tbody></table></div>
    </div>

    <div class="tab-panel" id="panel-logs">
      <p class="sub">Raw output from the running process — for debugging.</p>
      <pre class="log" id="rawLog">—</pre>
    </div>
  </div>

</main>
<script>
let linksDirty=false;
let currentTab='scan';
document.getElementById('links').addEventListener('input',()=>linksDirty=true);

function showTab(name){
  currentTab=name;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+name));
}

async function run(action){await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});refresh();}
async function stop(){await fetch('/api/stop',{method:'POST'});refresh();}
async function saveLinks(){
  const links=document.getElementById('links').value;
  const r=await fetch('/api/links',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({links})});
  const d=await r.json();linksDirty=false;
  document.getElementById('linksMsg').textContent=d.ok?('✓ saved '+d.count+' link(s)'):'save failed';
}
function pill(v){const k=(v||'').replace(/[^A-Z_]/gi,'').toUpperCase();const cls=k.includes('SUBMITTED')?'SUBMITTED':k.includes('APPLY')||k.includes('READY')?'APPLY':k.includes('BLOCK')||k.includes('FAIL')||k.includes('CLICKED')?'BLOCKED':k.includes('SKIP')||k.includes('BELOW')?'BELOW':'';return '<span class="pill '+cls+'">'+(v||'')+'</span>';}
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function scoreClass(s){s=Number(s)||0;return s>=8?'hi':s>=6?'mid':'lo';}
function timeAgo(ms){const s=Math.max(0,Math.round((Date.now()-ms)/1000));if(s<5)return 'just now';if(s<60)return s+'s ago';const m=Math.round(s/60);if(m<60)return m+'m ago';return Math.round(m/60)+'h ago';}

const STAGE_LABELS={discover:'🔍 Discovering jobs',score:'🧮 Scoring jobs',read_descriptions:'📖 Reading full descriptions',rescore:'🧮 Re-scoring with full context',tailor:'📝 Tailoring résumés',apply:'🚀 Applying',done:'✅ Done'};

function buildStageAndFunnel(events){
  const stageCard=document.getElementById('stageCard');
  const stageEvents=events.filter(e=>e.type==='stage');
  const runEnd=[...events].reverse().find(e=>e.type==='run_end');
  const exited=[...events].reverse().find(e=>e.type==='process_exit');
  if(!stageEvents.length && !events.length){stageCard.style.display='none';return;}
  stageCard.style.display='';

  const last=stageEvents[stageEvents.length-1];
  const banner=document.getElementById('stageBanner');
  const spin=document.getElementById('stageSpin');
  const txt=document.getElementById('stageTxt');
  const isDone = !!exited || (last && last.stage==='done');
  banner.className='stage-banner'+(isDone?' done':'');
  spin.style.display=isDone?'none':'block';
  if(isDone) spin.outerHTML='<div style="font-size:18px">'+(exited && exited.code!==0 ? '⚠️' : '✅')+'</div>';
  const label = last ? (STAGE_LABELS[last.stage]||last.label||last.stage) : 'Starting…';
  const sub = last && last.label ? last.label : '';
  txt.innerHTML=esc(label)+(sub&&sub!==label?'<span class="muted">'+esc(sub)+'</span>':'');

  // funnel counts
  const discovered=events.find(e=>e.type==='discovered');
  const deduped=events.find(e=>e.type==='deduped');
  const verdicts=events.filter(e=>e.type==='job_verdict');
  const selected=verdicts.filter(v=>v.verdict==='selected'||v.verdict==='shortlisted').length;
  const rejected=verdicts.filter(v=>v.verdict==='rejected').length;
  const applyResults=events.filter(e=>e.type==='apply_result');
  const submitted=applyResults.filter(r=>r.status==='SUBMITTED').length;

  const metrics=[
    ['searched', discovered?discovered.count:(deduped?deduped.searched:'—'), 'Searched'],
    ['rejected', rejected||'0', 'Rejected'],
    ['selected', runEnd?runEnd.selected:(selected||'0'), 'Selected'],
    ['submitted', submitted||'0', 'Submitted'],
  ];
  document.getElementById('funnel').innerHTML=metrics.map(([cls,n,l])=>
    '<div class="metric '+cls+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');
}

function buildJobFeed(events){
  // Latest verdict per job (title+company), most recent first.
  const verdicts=events.filter(e=>e.type==='job_verdict');
  const byKey=new Map();
  for(const v of verdicts){ byKey.set(v.title+'|||'+v.company, v); } // later overwrites earlier -> final verdict wins
  const list=[...byKey.values()].reverse();
  const feed=document.getElementById('jobFeed');
  if(!list.length){feed.innerHTML='<div class="empty">Run a scan to see jobs appear here.</div>';return;}
  feed.innerHTML=list.map(v=>{
    const cls=v.verdict==='rejected'?'rejected':'selected';
    const tagCls=v.verdict==='rejected'?'rejected':'selected';
    const tagText=v.verdict==='rejected'?'Rejected':(v.verdict==='shortlisted'?'Shortlisted':'Selected');
    return '<div class="job-row '+cls+'">'
      +'<div class="score-badge '+scoreClass(v.score)+'">'+(v.score!=null?Number(v.score).toFixed(1):'—')+'</div>'
      +'<div><div class="job-title">'+esc(v.title)+'</div>'
      +'<div class="job-meta">'+esc(v.company)+(v.location?' · '+esc(v.location):'')+(v.requiredYears?' · requires '+v.requiredYears+'+ yrs':'')+'</div>'
      +'<div class="job-reason">'+esc(v.reason||'')+'</div></div>'
      +'<span class="job-tag '+tagCls+'">'+tagText+'</span>'
      +'</div>';
  }).join('');
}

function buildAppFeed(events){
  const results=events.filter(e=>e.type==='apply_result');
  const inProgress=[...events].reverse().find(e=>e.type==='apply_progress');
  const feed=document.getElementById('appFeed');
  const rows=[];
  const doneKeys=new Set();
  for(const r of [...results].reverse()){
    const key=r.title+'|||'+r.company; if(doneKeys.has(key)) continue; doneKeys.add(key);
    const submitted=r.status==='SUBMITTED';
    const blocked=!submitted;
    rows.push('<div class="job-row '+(submitted?'submitted':'applying')+'">'
      +'<div class="score-badge '+(submitted?'hi':'mid')+'">'+(submitted?'✓':'!')+'</div>'
      +'<div><div class="job-title">'+esc(r.title)+'</div>'
      +'<div class="job-meta">'+esc(r.company)+'</div>'
      +'<div class="job-reason">'+esc((r.detail||'').slice(0,140))+'</div></div>'
      +'<span class="job-tag '+(submitted?'submitted':'blocked')+'">'+esc(r.status)+'</span>'
      +'</div>');
  }
  if(inProgress && !doneKeys.has(inProgress.title+'|||'+inProgress.company)){
    rows.unshift('<div class="job-row applying">'
      +'<div class="score-badge mid">⟳</div>'
      +'<div><div class="job-title">'+esc(inProgress.title)+'</div>'
      +'<div class="job-meta">'+esc(inProgress.company)+' · job '+(inProgress.index+1)+' of '+inProgress.total+'</div>'
      +'<div class="job-reason">Applying now…</div></div>'
      +'<span class="job-tag applying">In progress</span>'
      +'</div>');
  }
  feed.innerHTML=rows.length?rows.join(''):'<div class="empty">No applications submitted yet this run.</div>';
}

async function refresh(){
  let d;
  try{ d=await (await fetch('/api/state')).json(); }
  catch(e){ document.getElementById('updated').textContent='connection lost, retrying…'; return; }

  const runningNow=!!d.running;
  document.getElementById('dot').className='dot '+(runningNow?'run':'idle');
  document.getElementById('statusText').innerHTML='<span class="dot '+(runningNow?'run':'idle')+'"></span>'+(runningNow?d.running.name:'idle');
  document.getElementById('stopBtn').disabled=!runningNow;
  document.getElementById('updated').textContent='updated '+new Date(d.serverTime).toLocaleTimeString();

  const s=d.safety||{};
  document.getElementById('safety').textContent=(s.date?('today: '+(s.applicationAttempts||0)+' apps, '+(s.linkedInSearches||0)+' searches'):'');

  buildStageAndFunnel(d.events||[]);
  buildJobFeed(d.events||[]);
  buildAppFeed(d.events||[]);

  // scan spreadsheet
  document.getElementById('scanFile').textContent=d.scan.file?('Source: '+d.scan.file):'No scan yet.';
  const sb=document.querySelector('#scanTable tbody');
  sb.innerHTML=(d.scan.rows||[]).slice(0,80).map(r=>'<tr><td class="score">'+(r['Score']||'')+'</td><td>'+esc(r['Job Title'])+'</td><td>'+esc(r['Company'])+'</td><td>'+(r['Required Yrs']||'')+'</td><td>'+pill(r['Verdict'])+'</td></tr>').join('')||'<tr><td colspan=5 class=muted>No scan yet.</td></tr>';

  // history
  const ab=document.querySelector('#appsTable tbody');
  ab.innerHTML=(d.apps.rows||[]).slice(-100).reverse().map(r=>'<tr><td>'+(r['Run Date']||'')+'</td><td>'+esc(r['Job Title'])+'</td><td>'+esc(r['Company'])+'</td><td class="score">'+(r['Score']||'')+'</td><td>'+(r['ATS']||'')+'</td><td>'+pill(r['Status'])+'</td></tr>').join('')||'<tr><td colspan=6 class=muted>No applications yet.</td></tr>';

  // raw log
  const logEl=document.getElementById('rawLog');
  const wasAtBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  logEl.textContent=(d.rawLog||[]).join('\\n')||'—';
  if(wasAtBottom) logEl.scrollTop=logEl.scrollHeight;

  // links (only load once, don't clobber typing)
  if(!linksDirty && document.getElementById('links').value===''){document.getElementById('links').value=(d.links||[]).join('\\n');}
}
refresh();setInterval(refresh,5000);
</script>
</body></html>`;
