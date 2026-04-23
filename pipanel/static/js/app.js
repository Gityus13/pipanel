// ══════════════════════════════════════════════
//  PiPanel — app.js
//  https://github.com/Gityus13/pipanel
// ══════════════════════════════════════════════

let token = localStorage.getItem('pp_token') || '';
let refreshInterval = null;
let historyWs = null;
let chartData = { cpu: [], mem: [], temp: [], labels: [] };

// ── API ───────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) { logout(); return null; }
    return res;
  } catch (e) {
    toast('Network error: ' + e.message, 'error');
    return null;
  }
}

async function apiJSON(path, opts = {}) {
  const res = await api(path, opts);
  if (!res || !res.ok) return null;
  return res.json();
}

// ── Auth ──────────────────────────────────────
async function login() {
  const pass = document.getElementById('password-input').value;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass }),
  });
  if (res.ok) {
    const data = await res.json();
    token = data.token;
    localStorage.setItem('pp_token', token);
    showApp();
  } else {
    document.getElementById('login-error').classList.remove('hidden');
    document.getElementById('password-input').select();
  }
}

function logout() {
  if (token) api('/api/auth/logout', { method: 'POST' });
  token = '';
  localStorage.removeItem('pp_token');
  location.reload();
}

// ── Toast ──────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal ──────────────────────────────────────
let modalResolve = null;

function confirm(title, body, danger = true) {
  return new Promise(resolve => {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    const btn = document.getElementById('modal-confirm');
    btn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    btn.onclick = () => { closeModal(); resolve(true); };
    document.getElementById('modal-overlay').classList.remove('hidden');
  });
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
  if (modalResolve) { modalResolve(false); modalResolve = null; }
}

// ── Theme ──────────────────────────────────────
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('pp_theme', t);
  document.getElementById('theme-toggle').textContent = t === 'dark' ? '☀' : '☾';
}
function toggleTheme() {
  setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

// ── Navigation ────────────────────────────────
let currentPage = 'dashboard';

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const btn = document.querySelector(`[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  clearInterval(refreshInterval);
  currentPage = page;
  loadPage(page);
}

function loadPage(p) {
  const map = {
    dashboard: loadDashboard,
    terminal:  loadTerminal,
    processes: loadProcesses,
    logs:      loadLogs,
    services:  loadServices,
    packages:  loadPackages,
    cron:      loadCron,
    docker:    loadDocker,
    files:     () => loadFiles('/'),
    disk:      loadDisk,
    network:   loadNetwork,
    gpio:      loadGPIO,
    usb:       loadUSB,
    settings:  loadSettings,
  };
  if (map[p]) map[p]();
}

// ── Helpers ───────────────────────────────────
const fmt = v => v === null || v === undefined ? '—' : v;

function formatBytes(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}

function pct(n, colorClass) {
  const color = colorClass || (n > 85 ? 'red' : n > 65 ? 'yellow' : 'green');
  return `<div class="progress-bar"><div class="progress-fill ${color}" style="width:${Math.min(100,n)}%"></div></div>`;
}

function getFileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return { py:'🐍', js:'📜', ts:'📜', json:'🗂', sh:'⚙', md:'📝', txt:'📄',
           png:'🖼', jpg:'🖼', jpeg:'🖼', gif:'🖼', svg:'🖼',
           mp4:'🎬', mp3:'🎵', zip:'🗜', tar:'🗜', gz:'🗜', pdf:'📕',
           html:'🌐', css:'🎨', c:'⚙', cpp:'⚙', rs:'⚙', go:'🐹' }[ext] || '📄';
}

function loadScript(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  return new Promise(resolve => {
    if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = resolve;
    document.head.appendChild(l);
  });
}

// ── Dashboard Charts ──────────────────────────
let charts = {};

function initChart(id, label, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  return {
    canvas, ctx, color,
    draw(labels, data) {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      canvas.width = W; canvas.height = H;
      if (!data.length) return;

      ctx.clearRect(0, 0, W, H);
      const max = 100;
      const padL = 28, padR = 8, padT = 8, padB = 20;
      const w = W - padL - padR, h = H - padT - padB;

      // Grid
      ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
      [0, 25, 50, 75, 100].forEach(v => {
        const y = padT + h - (v / max) * h;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = isDark ? '#4a5568' : '#9ca3af';
        ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(v, padL - 4, y + 3);
      });

      // Fill
      const pts = data.map((v, i) => ({
        x: padL + (i / Math.max(data.length - 1, 1)) * w,
        y: padT + h - (Math.min(v, 100) / max) * h,
      }));
      const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
      grad.addColorStop(0, color + '55');
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padT + h);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, padT + h);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  };
}

function updateCharts() {
  if (charts.cpu) charts.cpu.draw(chartData.labels, chartData.cpu);
  if (charts.mem) charts.mem.draw(chartData.labels, chartData.mem);
  if (charts.temp) charts.temp.draw(chartData.labels, chartData.temp);
}

function startHistoryWs() {
  if (historyWs && historyWs.readyState <= 1) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  historyWs = new WebSocket(`${proto}://${location.host}/ws/history?token=${token}`);
  historyWs.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'history') {
      chartData.cpu    = msg.data.map(d => d.cpu);
      chartData.mem    = msg.data.map(d => d.mem);
      chartData.temp   = msg.data.map(d => d.temp);
      chartData.labels = msg.data.map(d => new Date(d.t * 1000).toLocaleTimeString());
    } else if (msg.type === 'point') {
      chartData.cpu.push(msg.data.cpu);   if (chartData.cpu.length > 120)   chartData.cpu.shift();
      chartData.mem.push(msg.data.mem);   if (chartData.mem.length > 120)   chartData.mem.shift();
      chartData.temp.push(msg.data.temp); if (chartData.temp.length > 120)  chartData.temp.shift();
      chartData.labels.push(new Date(msg.data.t * 1000).toLocaleTimeString());
      if (chartData.labels.length > 120) chartData.labels.shift();
    }
    if (currentPage === 'dashboard') updateCharts();
  };
}

// ── Dashboard ─────────────────────────────────
async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Dashboard</h2><p>Real-time system overview</p></div></div><div class="loading pulse">Loading…</div>`;

  async function refresh() {
    const d = await apiJSON('/api/system/stats');
    if (!d) return;
    const c = d.cpu, m = d.memory, disk = d.disk, th = d.throttle || {};

    const alerts = [];
    if (th.currently_throttled) alerts.push('CPU is currently throttled');
    if (th.under_voltage)       alerts.push('Under-voltage detected — check your power supply');
    if (th.soft_temp_limit)     alerts.push('Soft temperature limit active');

    el.innerHTML = `
      <div class="page-header">
        <div class="page-header-left"><h2>Dashboard</h2><p>Real-time system overview</p></div>
        <div class="page-header-actions">
          <span class="uptime-badge">⏱ Up ${d.uptime}</span>
          <span style="color:var(--text-secondary);font-size:12px">Load: ${d.load_avg.map(x=>x.toFixed(2)).join(' / ')}</span>
        </div>
      </div>

      ${alerts.map(a => `<div class="alert-banner">🔴 ${a}</div>`).join('')}

      <div class="stats-grid fade-in">
        <div class="stat-card">
          <div class="stat-label">CPU Usage</div>
          <div class="stat-value">${fmt(c.percent)}<small style="font-size:14px;font-weight:400">%</small></div>
          <div class="stat-sub">${c.count} cores · ${c.freq_mhz} MHz</div>
          ${pct(c.percent)}
        </div>
        <div class="stat-card blue">
          <div class="stat-label">CPU Temp</div>
          <div class="stat-value">${fmt(c.temp_c)}<small style="font-size:14px;font-weight:400">°C</small></div>
          <div class="stat-sub">GPU: ${fmt(d.gpu.temp_c)}°C · Max: 85°C</div>
          ${pct((c.temp_c / 85) * 100, c.temp_c > 75 ? 'red' : c.temp_c > 60 ? 'yellow' : 'blue')}
        </div>
        <div class="stat-card green">
          <div class="stat-label">Memory</div>
          <div class="stat-value">${fmt(m.percent)}<small style="font-size:14px;font-weight:400">%</small></div>
          <div class="stat-sub">${m.used_mb} / ${m.total_mb} MB</div>
          ${pct(m.percent)}
        </div>
        <div class="stat-card yellow">
          <div class="stat-label">Disk</div>
          <div class="stat-value">${fmt(disk.percent)}<small style="font-size:14px;font-weight:400">%</small></div>
          <div class="stat-sub">${disk.used_gb} / ${disk.total_gb} GB used</div>
          ${pct(disk.percent)}
        </div>
        <div class="stat-card purple">
          <div class="stat-label">Net ↑</div>
          <div class="stat-value" style="font-size:18px;letter-spacing:-0.5px">${formatBytes(d.network.bytes_sent)}</div>
          <div class="stat-sub">↓ Recv: ${formatBytes(d.network.bytes_recv)}</div>
        </div>
        <div class="stat-card cyan">
          <div class="stat-label">Throttle</div>
          <div class="stat-value" style="font-size:18px">${th.currently_throttled ? '⚠ Active' : '✓ Normal'}</div>
          <div class="stat-sub">${th.under_voltage ? 'Low voltage' : 'Voltage OK'}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px">
        <div class="chart-wrap">
          <div class="chart-title">CPU % <span style="font-size:11px;color:var(--text-secondary);font-weight:400">last 10 min</span></div>
          <canvas id="chart-cpu" height="90"></canvas>
        </div>
        <div class="chart-wrap">
          <div class="chart-title">Memory % <span style="font-size:11px;color:var(--text-secondary);font-weight:400">last 10 min</span></div>
          <canvas id="chart-mem" height="90"></canvas>
        </div>
        <div class="chart-wrap">
          <div class="chart-title">Temp °C <span style="font-size:11px;color:var(--text-secondary);font-weight:400">last 10 min</span></div>
          <canvas id="chart-temp" height="90"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Throttle Status</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${renderThrottleBadges(th)}
        </div>
      </div>
    `;

    // Init charts after DOM update
    requestAnimationFrame(() => {
      charts.cpu  = initChart('chart-cpu',  'CPU',  '#e74c3c');
      charts.mem  = initChart('chart-mem',  'Mem',  '#3498db');
      charts.temp = initChart('chart-temp', 'Temp', '#f39c12');
      updateCharts();
    });
  }

  await refresh();
  startHistoryWs();
  refreshInterval = setInterval(refresh, 4000);
}

function renderThrottleBadges(th) {
  const checks = [
    ['Currently throttled', th.currently_throttled, 'red'],
    ['Under-voltage', th.under_voltage, 'red'],
    ['Freq capped', th.arm_frequency_capped, 'yellow'],
    ['Soft temp limit', th.soft_temp_limit, 'yellow'],
    ['Throttled (history)', th.throttling_occurred, 'yellow'],
    ['Undervolt (history)', th.under_voltage_occurred, 'yellow'],
  ];
  return checks.map(([label, active, color]) =>
    `<span class="badge badge-${active ? color : 'gray'}">${active ? '⚠' : '✓'} ${label}</span>`
  ).join('');
}

// ── Terminal ──────────────────────────────────
let termInstance = null;
let termWs = null;

async function loadTerminal() {
  const el = document.getElementById('page-terminal');
  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>Terminal</h2><p>Full shell in your browser</p></div>
      <div class="page-header-actions"><button class="btn btn-danger btn-sm" onclick="resetTerminal()">↺ Reconnect</button></div>
    </div>
    <div class="terminal-wrapper">
      <div class="terminal-bar">
        <div class="terminal-dots"><span class="dot-red"></span><span class="dot-yellow"></span><span class="dot-green"></span></div>
        <span style="color:var(--text-secondary);font-size:12px;margin-left:8px">bash — PiPanel Terminal</span>
      </div>
      <div id="terminal-container"></div>
    </div>
  `;
  await startTerminal();
}

async function startTerminal() {
  // Load xterm 5 + FitAddon from CDN
  await loadCSS('https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css');
  await loadScript('https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js');
  await loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js');

  const container = document.getElementById('terminal-container');
  if (!container) return;

  if (termInstance) { termInstance.dispose(); termInstance = null; }
  if (termWs) { termWs.close(); termWs = null; }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  termInstance = new Terminal({
    theme: {
      background: isDark ? '#0d1117' : '#ffffff',
      foreground: isDark ? '#e6edf3' : '#1a1f2e',
      cursor:     isDark ? '#e6edf3' : '#1a1f2e',
      selectionBackground: '#3d4d6a',
    },
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    scrollback: 5000,
  });

  const fitAddon = new FitAddon.FitAddon();
  termInstance.loadAddon(fitAddon);
  termInstance.open(container);

  setTimeout(() => { try { fitAddon.fit(); } catch(e) {} }, 50);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  termWs = new WebSocket(`${proto}://${location.host}/ws/terminal?token=${token}`);
  termWs.binaryType = 'arraybuffer';

  termWs.onopen = () => {
    // Send initial size
    sendResize(fitAddon);
  };

  termWs.onmessage = e => {
    const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data;
    termInstance.write(data);
  };

  termWs.onclose = () => {
    termInstance.writeln('\r\n\x1b[31m[Connection closed. Click Reconnect to restart.]\x1b[0m');
  };

  termWs.onerror = () => {
    termInstance.writeln('\r\n\x1b[31m[WebSocket error — is PiPanel running on the Pi?]\x1b[0m');
  };

  termInstance.onData(data => {
    if (termWs.readyState === WebSocket.OPEN) {
      termWs.send(new TextEncoder().encode(data));
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    try { fitAddon.fit(); sendResize(fitAddon); } catch(e) {}
  });
  resizeObserver.observe(container);
}

function sendResize(fitAddon) {
  if (!termInstance || !termWs || termWs.readyState !== WebSocket.OPEN) return;
  const rows = termInstance.rows, cols = termInstance.cols;
  const msg = new Uint8Array(5);
  msg[0] = 1;
  msg[1] = (rows >> 8) & 0xff; msg[2] = rows & 0xff;
  msg[3] = (cols >> 8) & 0xff; msg[4] = cols & 0xff;
  termWs.send(msg);
}

function resetTerminal() {
  startTerminal();
}

// ── Processes ─────────────────────────────────
async function loadProcesses() {
  const el = document.getElementById('page-processes');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Processes</h2><p>Top CPU consumers</p></div>
    <div class="page-header-actions"><button class="btn btn-secondary btn-sm" onclick="loadProcesses()">↻ Refresh</button></div>
  </div><div class="loading pulse">Loading…</div>`;

  const data = await apiJSON('/api/system/processes');
  if (!data) return;

  const rows = data.map(p => `
    <tr>
      <td><code style="font-size:12px">${p.pid}</code></td>
      <td><strong>${p.name || '—'}</strong></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:60px">${pct(p.cpu_percent || 0)}</div>
          <span>${(p.cpu_percent || 0).toFixed(1)}%</span>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:60px">${pct(p.memory_percent || 0, 'blue')}</div>
          <span>${(p.memory_percent || 0).toFixed(1)}%</span>
        </div>
      </td>
      <td><span class="badge ${p.status === 'running' ? 'badge-green' : 'badge-gray'}">${p.status || '—'}</span></td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>Processes</h2><p>${data.length} processes shown</p></div>
      <div class="page-header-actions"><button class="btn btn-secondary btn-sm" onclick="loadProcesses()">↻ Refresh</button></div>
    </div>
    <div class="card table-wrap fade-in">
      <table class="data-table">
        <thead><tr><th>PID</th><th>Name</th><th>CPU</th><th>Memory</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ── Logs ──────────────────────────────────────
async function loadLogs() {
  const el = document.getElementById('page-logs');
  const data = await apiJSON('/api/logs/files');

  const opts = (data?.logs || []).map(l => `<option value="${l.name}">${l.name} (${formatBytes(l.size)})</option>`).join('');
  const journalSection = `
    <div class="card" style="margin-top:16px">
      <div class="card-title">Journal (systemd)</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input id="journal-unit" class="search-bar" placeholder="Unit name (blank = all)" style="width:220px"/>
        <button class="btn btn-secondary btn-sm" onclick="loadJournal()">Load</button>
        <button class="btn btn-secondary btn-sm" onclick="loadDmesg()">dmesg</button>
      </div>
      <div id="journal-viewer" class="log-viewer">Click Load to view journal logs.</div>
    </div>
  `;

  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>System Logs</h2><p>Browse /var/log and journalctl</p></div></div>
    <div class="card">
      <div class="log-select-bar">
        <select id="log-file-select" onchange="loadLogFile()">${opts || '<option>No logs found</option>'}</select>
        <button class="btn btn-secondary btn-sm" onclick="loadLogFile()">↻ Reload</button>
        <select id="log-lines-select" onchange="loadLogFile()">
          <option value="100">100 lines</option>
          <option value="200" selected>200 lines</option>
          <option value="500">500 lines</option>
        </select>
      </div>
      <div id="log-viewer" class="log-viewer">Select a log file above.</div>
    </div>
    ${journalSection}
  `;

  if (data?.logs?.length) loadLogFile();
}

async function loadLogFile() {
  const name = document.getElementById('log-file-select')?.value;
  const lines = document.getElementById('log-lines-select')?.value || 200;
  const viewer = document.getElementById('log-viewer');
  if (!name || !viewer) return;
  viewer.textContent = 'Loading…';
  const data = await apiJSON(`/api/logs/read?name=${encodeURIComponent(name)}&lines=${lines}`);
  viewer.textContent = data?.content || 'Empty or permission denied.';
  viewer.scrollTop = viewer.scrollHeight;
}

async function loadJournal() {
  const unit = document.getElementById('journal-unit')?.value || '';
  const viewer = document.getElementById('journal-viewer');
  viewer.textContent = 'Loading…';
  const data = await apiJSON(`/api/logs/journal?lines=300&unit=${encodeURIComponent(unit)}`);
  viewer.textContent = data?.content || 'No output.';
  viewer.scrollTop = viewer.scrollHeight;
}

async function loadDmesg() {
  const viewer = document.getElementById('journal-viewer');
  viewer.textContent = 'Loading dmesg…';
  const data = await apiJSON('/api/logs/dmesg?lines=200');
  viewer.textContent = data?.content || 'No output.';
  viewer.scrollTop = viewer.scrollHeight;
}

// ── Services ──────────────────────────────────
let servicesData = [];

async function loadServices() {
  const el = document.getElementById('page-services');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Services</h2></div></div><div class="loading pulse">Loading…</div>`;

  servicesData = await apiJSON('/api/services/') || [];
  renderServices(servicesData);
}

function renderServices(list) {
  const el = document.getElementById('page-services');
  const rows = list.map(s => `
    <tr>
      <td><strong>${s.name.replace('.service','')}</strong></td>
      <td style="color:var(--text-secondary);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.description || '—'}</td>
      <td><span class="badge badge-${s.active === 'active' ? 'green' : 'red'}">${s.active}</span></td>
      <td><span class="badge badge-${s.enabled === 'enabled' ? 'green' : 'gray'}">${s.enabled}</span></td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-success btn-sm" onclick="svcAction('${s.name}','start')">▶</button>
          <button class="btn btn-danger btn-sm"  onclick="svcAction('${s.name}','stop')">■</button>
          <button class="btn btn-secondary btn-sm" onclick="svcAction('${s.name}','restart')">↺</button>
          <button class="btn btn-secondary btn-sm" onclick="viewSvcLogs('${s.name}')">📋</button>
        </div>
      </td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h2>Services</h2><p>${servicesData.length} services</p></div>
      <div class="page-header-actions">
        <input class="search-bar" placeholder="Filter services…" oninput="filterServices(this.value)" />
        <button class="btn btn-secondary btn-sm" onclick="loadServices()">↻ Refresh</button>
      </div>
    </div>
    <div class="card table-wrap fade-in">
      <table class="data-table">
        <thead><tr><th>Service</th><th>Description</th><th>State</th><th>Enabled</th><th>Actions</th></tr></thead>
        <tbody id="services-body">${rows}</tbody>
      </table>
    </div>
    <div id="svc-log-panel"></div>
  `;
}

function filterServices(q) {
  const filtered = servicesData.filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || (s.description || '').toLowerCase().includes(q.toLowerCase()));
  renderServices(filtered);
}

async function svcAction(name, action) {
  const res = await api(`/api/services/${name}/action`, { method: 'POST', body: JSON.stringify({ action }) });
  if (res?.ok) { toast(`${action} → ${name}`, 'success'); loadServices(); }
  else toast(`Failed to ${action} ${name}`, 'error');
}

async function viewSvcLogs(name) {
  const panel = document.getElementById('svc-log-panel');
  panel.innerHTML = `<div class="card" style="margin-top:16px"><div class="card-title">${name} — last 100 lines</div><div class="log-viewer pulse">Loading…</div></div>`;
  const data = await apiJSON(`/api/services/${name}/logs?lines=100`);
  panel.querySelector('.log-viewer').textContent = data?.logs || 'No output.';
  panel.querySelector('.log-viewer').classList.remove('pulse');
}

// ── Packages ──────────────────────────────────
async function loadPackages() {
  const el = document.getElementById('page-packages');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Updates</h2></div></div><div class="loading pulse">Checking updates…</div>`;
  const data = await apiJSON('/api/packages/upgradable');
  if (!data) return;

  const rows = data.packages.map(p => `
    <tr><td><strong>${p.name}</strong></td><td style="color:var(--text-secondary)">${p.version}</td></tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h2>Package Updates</h2><p>${data.count} package${data.count !== 1 ? 's' : ''} available</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm" onclick="runAptUpdate()">↻ apt update</button>
        ${data.count > 0 ? `<button class="btn btn-primary btn-sm" onclick="runUpgradeAll()">↑ Upgrade All</button>` : ''}
      </div>
    </div>
    <div id="pkg-output"></div>
    <div class="card table-wrap fade-in">
      ${data.count === 0
        ? '<div class="empty-state"><div class="empty-icon">✓</div>System is up to date</div>'
        : `<table class="data-table"><thead><tr><th>Package</th><th>Available Version</th></tr></thead><tbody>${rows}</tbody></table>`}
    </div>
  `;
}

async function runAptUpdate() {
  document.getElementById('pkg-output').innerHTML = `<div class="card" style="margin-bottom:14px;color:var(--yellow)">⏳ Running apt update…</div>`;
  const res = await api('/api/packages/update-index', { method: 'POST' });
  if (res?.ok) { toast('apt update complete', 'success'); loadPackages(); }
  else toast('apt update failed', 'error');
}

async function runUpgradeAll() {
  const ok = await confirm('Upgrade All Packages?', 'This will run <code>apt upgrade -y</code>. It may take several minutes.');
  if (!ok) return;
  document.getElementById('pkg-output').innerHTML = `<div class="card" style="margin-bottom:14px;color:var(--yellow)">⏳ Upgrading packages… please wait.</div>`;
  const res = await api('/api/packages/upgrade-all', { method: 'POST' });
  if (res?.ok) { toast('Upgrade complete', 'success'); loadPackages(); }
  else toast('Upgrade failed', 'error');
}

// ── Cron ──────────────────────────────────────
async function loadCron() {
  const el = document.getElementById('page-cron');
  const data = await apiJSON('/api/cron/');

  const rows = (data?.jobs || []).map(j => `
    <tr>
      <td><code>${j.minute} ${j.hour} ${j.day} ${j.month} ${j.weekday}</code></td>
      <td>${j.command}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteCron('${encodeURIComponent(j.raw)}')">Remove</button></td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>Cron Jobs</h2><p>${data?.jobs?.length || 0} scheduled jobs</p></div></div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Add New Job</div>
      <div class="cron-form">
        <div class="cron-field"><label>Minute</label><input id="cron-m" value="*" /></div>
        <div class="cron-field"><label>Hour</label><input id="cron-h" value="*" /></div>
        <div class="cron-field"><label>Day</label><input id="cron-d" value="*" /></div>
        <div class="cron-field"><label>Month</label><input id="cron-mo" value="*" /></div>
        <div class="cron-field"><label>Weekday</label><input id="cron-w" value="*" /></div>
        <div class="cron-field"><label>Command</label><input id="cron-cmd" placeholder="/path/to/script.sh" /></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="addCron()">Add Job</button>
        <span style="font-size:12px;color:var(--text-secondary)">
          Common: <code style="cursor:pointer" onclick="fillCron('0','*','*','*','*')">Hourly</code>
          · <code style="cursor:pointer" onclick="fillCron('0','0','*','*','*')">Daily</code>
          · <code style="cursor:pointer" onclick="fillCron('0','0','*','*','0')">Weekly</code>
        </span>
      </div>
    </div>

    <div class="card table-wrap fade-in">
      ${!rows ? '<div class="empty-state"><div class="empty-icon">🕐</div>No cron jobs yet</div>'
        : `<table class="data-table"><thead><tr><th>Schedule</th><th>Command</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
    </div>
  `;
}

function fillCron(m, h, d, mo, w) {
  document.getElementById('cron-m').value = m;
  document.getElementById('cron-h').value = h;
  document.getElementById('cron-d').value = d;
  document.getElementById('cron-mo').value = mo;
  document.getElementById('cron-w').value = w;
}

async function addCron() {
  const job = {
    minute:  document.getElementById('cron-m').value,
    hour:    document.getElementById('cron-h').value,
    day:     document.getElementById('cron-d').value,
    month:   document.getElementById('cron-mo').value,
    weekday: document.getElementById('cron-w').value,
    command: document.getElementById('cron-cmd').value,
  };
  if (!job.command.trim()) { toast('Command cannot be empty', 'error'); return; }
  const res = await api('/api/cron/add', { method: 'POST', body: JSON.stringify(job) });
  if (res?.ok) { toast('Cron job added', 'success'); loadCron(); }
  else toast('Failed to add cron job', 'error');
}

async function deleteCron(rawEnc) {
  const raw = decodeURIComponent(rawEnc);
  const ok = await confirm('Remove Cron Job', `Remove: <code>${raw}</code>?`);
  if (!ok) return;
  const res = await api('/api/cron/delete', { method: 'POST', body: JSON.stringify({ raw }) });
  if (res?.ok) { toast('Cron job removed', 'success'); loadCron(); }
  else toast('Failed to remove cron job', 'error');
}

// ── Docker ────────────────────────────────────
async function loadDocker() {
  const el = document.getElementById('page-docker');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Docker</h2></div></div><div class="loading pulse">Checking Docker…</div>`;

  const status = await apiJSON('/api/docker/status');
  if (!status?.available) {
    el.innerHTML = `
      <div class="page-header"><div class="page-header-left"><h2>Docker</h2></div></div>
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">🐳</div>
          <p>Docker is not installed or not running.</p>
          <p style="margin-top:8px">Install it: <code>curl -sSL https://get.docker.com | sh</code></p>
        </div>
      </div>`;
    return;
  }

  const [cData, iData] = await Promise.all([
    apiJSON('/api/docker/containers'),
    apiJSON('/api/docker/images'),
  ]);

  const containers = cData?.containers || [];
  const images = iData?.images || [];

  const cRows = containers.map(c => {
    const state = c.state || 'unknown';
    return `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td><code style="font-size:11px">${c.image}</code></td>
        <td><span class="status-dot ${state}"></span><span class="badge badge-${state === 'running' ? 'green' : state === 'paused' ? 'yellow' : 'red'}">${state}</span></td>
        <td style="font-size:12px;color:var(--text-secondary)">${c.status}</td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn btn-success btn-sm" onclick="dockerAction('${c.id}','start')">▶</button>
            <button class="btn btn-danger btn-sm" onclick="dockerAction('${c.id}','stop')">■</button>
            <button class="btn btn-secondary btn-sm" onclick="dockerAction('${c.id}','restart')">↺</button>
            <button class="btn btn-secondary btn-sm" onclick="dockerLogs('${c.id}','${c.name}')">📋</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const iRows = images.map(i => `
    <tr>
      <td><strong>${i.repository}</strong></td>
      <td>${i.tag}</td>
      <td style="color:var(--text-secondary)">${i.size}</td>
      <td style="color:var(--text-secondary);font-size:12px">${i.id}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h2>Docker</h2><p>${containers.length} containers · ${images.length} images</p></div>
      <div class="page-header-actions"><button class="btn btn-secondary btn-sm" onclick="loadDocker()">↻ Refresh</button></div>
    </div>
    <div class="card table-wrap fade-in" style="margin-bottom:16px">
      <div class="card-title">Containers</div>
      ${cRows ? `<table class="data-table"><thead><tr><th>Name</th><th>Image</th><th>State</th><th>Status</th><th>Actions</th></tr></thead><tbody>${cRows}</tbody></table>`
        : '<div class="empty-state">No containers found</div>'}
    </div>
    <div class="card table-wrap fade-in">
      <div class="card-title">Images</div>
      ${iRows ? `<table class="data-table"><thead><tr><th>Repository</th><th>Tag</th><th>Size</th><th>ID</th></tr></thead><tbody>${iRows}</tbody></table>`
        : '<div class="empty-state">No images found</div>'}
    </div>
    <div id="docker-log-panel"></div>
  `;
}

async function dockerAction(id, action) {
  const res = await api(`/api/docker/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) });
  if (res?.ok) { toast(`Docker: ${action}`, 'success'); loadDocker(); }
  else toast(`Failed: ${action}`, 'error');
}

async function dockerLogs(id, name) {
  const panel = document.getElementById('docker-log-panel');
  panel.innerHTML = `<div class="card" style="margin-top:16px"><div class="card-title">${name} — logs</div><div class="log-viewer pulse">Loading…</div></div>`;
  const data = await apiJSON(`/api/docker/${id}/logs?lines=100`);
  panel.querySelector('.log-viewer').textContent = data?.logs || 'No output.';
  panel.querySelector('.log-viewer').classList.remove('pulse');
}

// ── Files ─────────────────────────────────────
let currentPath = '/';

async function loadFiles(path) {
  currentPath = path;
  const el = document.getElementById('page-files');
  const data = await apiJSON(`/api/files/list?path=${encodeURIComponent(path)}`);
  if (!data) return;

  const parts = data.path.split('/').filter(Boolean);
  const crumbs = `
    <span class="breadcrumb-item" onclick="loadFiles('/')">~</span>
    ${parts.map((p, i) => `
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-item" onclick="loadFiles('/${parts.slice(0,i+1).join('/')}')">${p}</span>
    `).join('')}
  `;

  const items = data.items.map(item => `
    <div class="file-item" onclick="${item.is_dir ? `loadFiles('${item.path}')` : `dlFile('${item.path}')`}">
      <div class="file-item-icon">${item.is_dir ? '📁' : getFileIcon(item.name)}</div>
      <div class="file-item-name" title="${item.name}">${item.name}</div>
      <div class="file-item-size">${item.is_dir ? '' : formatBytes(item.size)}</div>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>File Manager</h2></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('fu').click()">↑ Upload</button>
        <button class="btn btn-secondary btn-sm" onclick="mkdirPrompt()">＋ Folder</button>
      </div>
    </div>
    <div class="file-toolbar"><div class="breadcrumb">${crumbs}</div></div>
    <div class="file-grid fade-in">${items || '<div class="empty-state">Empty folder</div>'}</div>
    <input type="file" id="fu" style="display:none" onchange="doUpload(this)" multiple />
  `;
}

function dlFile(path) { window.open(`/api/files/download?path=${encodeURIComponent(path)}&token=${token}`); }

async function doUpload(input) {
  for (const file of input.files) {
    const fd = new FormData(); fd.append('file', file);
    await fetch(`/api/files/upload?path=${encodeURIComponent(currentPath)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
  }
  toast('Upload complete', 'success');
  loadFiles(currentPath);
}

async function mkdirPrompt() {
  const name = window.prompt('New folder name:');
  if (!name) return;
  const res = await api('/api/files/mkdir', { method: 'POST', body: JSON.stringify({ path: currentPath, name }) });
  if (res?.ok) { toast('Folder created', 'success'); loadFiles(currentPath); }
}

// ── Disk ──────────────────────────────────────
async function loadDisk() {
  const el = document.getElementById('page-disk');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Disk</h2></div></div><div class="loading pulse">Analyzing…</div>`;

  const [mounts, usage] = await Promise.all([
    apiJSON('/api/disk/mounts'),
    apiJSON('/api/disk/usage?path=/'),
  ]);

  const mountRows = (mounts?.mounts || []).map(m => `
    <tr>
      <td><strong>${m.mount}</strong></td>
      <td style="color:var(--text-secondary)">${m.source}</td>
      <td>${m.fstype}</td>
      <td>${m.size}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:80px">${pct(parseInt(m.percent)||0)}</div>
          <span>${m.used} / ${m.size}</span>
        </div>
      </td>
      <td>${m.avail} free</td>
    </tr>
  `).join('');

  const maxSize = Math.max(...(usage?.entries || []).map(e => e.size), 1);
  const usageRows = (usage?.entries || []).slice(0, 20).map(e => `
    <div class="disk-entry">
      <div class="disk-entry-name" title="${e.path}">${e.name || e.path}</div>
      <div class="disk-entry-bar">${pct((e.size / maxSize) * 100, 'blue')}</div>
      <div class="disk-entry-size">${formatBytes(e.size)}</div>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>Disk</h2></div></div>
    <div class="card table-wrap fade-in" style="margin-bottom:16px">
      <div class="card-title">Filesystems</div>
      <table class="data-table"><thead><tr><th>Mount</th><th>Device</th><th>Type</th><th>Size</th><th>Usage</th><th>Free</th></tr></thead>
        <tbody>${mountRows}</tbody>
      </table>
    </div>
    <div class="card fade-in">
      <div class="card-title">Disk Usage — / (top 20)</div>
      ${usageRows || '<div class="empty-state">No data</div>'}
    </div>
  `;
}

// ── Network ───────────────────────────────────
async function loadNetwork() {
  const el = document.getElementById('page-network');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Network</h2><p>Scanning LAN…</p></div></div><div class="loading pulse">Scanning…</div>`;

  const data = await apiJSON('/api/network/devices');

  const rows = (data?.devices || []).map(d => `
    <tr>
      <td><strong>${d.ip}</strong></td>
      <td><code style="font-size:11px">${d.mac || '—'}</code></td>
      <td>${d.hostname || '<span style="color:var(--text-secondary)">unknown</span>'}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="pingHost('${d.ip}')">Ping</button></td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h2>Network</h2><p>${data?.devices?.length || 0} devices on ${data?.subnet || 'LAN'}</p></div>
      <div class="page-header-actions"><button class="btn btn-secondary btn-sm" onclick="loadNetwork()">↻ Rescan</button></div>
    </div>
    <div class="card table-wrap fade-in">
      ${rows ? `<table class="data-table"><thead><tr><th>IP</th><th>MAC</th><th>Hostname</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty-state"><div class="empty-icon">🌐</div>No devices found. Try installing arp-scan:<br><code>sudo apt install arp-scan</code></div>'}
    </div>
    <div id="ping-result"></div>
  `;
}

async function pingHost(host) {
  document.getElementById('ping-result').innerHTML = `<div class="card" style="margin-top:16px;color:var(--text-secondary)">Pinging ${host}…</div>`;
  const data = await apiJSON(`/api/network/ping?host=${host}`);
  document.getElementById('ping-result').innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="card-title">Ping — ${host}</div>
      <span class="badge badge-${data?.reachable ? 'green' : 'red'}">${data?.reachable ? '✓ Reachable' : '✗ Unreachable'}</span>
      <pre style="margin-top:12px;font-size:12px;color:var(--text-secondary);white-space:pre-wrap">${data?.output || ''}</pre>
    </div>
  `;
}

// ── GPIO ──────────────────────────────────────
async function loadGPIO() {
  const el = document.getElementById('page-gpio');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>GPIO</h2></div></div><div class="loading pulse">Reading pins…</div>`;

  const data = await apiJSON('/api/gpio/pins');
  if (!data?.pins) {
    el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>GPIO</h2></div></div>
      <div class="card"><div class="empty-state"><div class="empty-icon">🔌</div>GPIO not available. Requires Raspberry Pi 5 with lgpio.</div></div>`;
    return;
  }

  const pins = data.pins.map(p => `
    <div class="gpio-pin ${p.value === 1 ? 'high' : 'low'}">
      <div class="gpio-pin-num">BCM ${p.bcm}</div>
      <div class="gpio-pin-val">${p.value === null ? '—' : p.value === 1 ? '🟢' : '⚫'}</div>
      <div class="gpio-pin-mode">${p.mode}</div>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h2>GPIO Monitor</h2><p>Pi 5 · BCM numbering · ${data.pins.length} pins</p></div>
      <div class="page-header-actions"><button class="btn btn-secondary btn-sm" onclick="loadGPIO()">↻ Refresh</button></div>
    </div>
    <div class="gpio-grid fade-in">${pins}</div>
  `;
}

// ── USB ───────────────────────────────────────
async function loadUSB() {
  const el = document.getElementById('page-usb');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>USB Devices</h2></div></div><div class="loading pulse">Reading USB…</div>`;

  const data = await apiJSON('/api/settings/usb');
  const rows = (data?.devices || []).map(d => `
    <tr>
      <td><code style="font-size:12px">${d.bus_device}</code></td>
      <td>${d.description}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h2>USB Devices</h2><p>${data?.devices?.length || 0} devices connected</p></div>
      <div class="page-header-actions"><button class="btn btn-secondary btn-sm" onclick="loadUSB()">↻ Refresh</button></div>
    </div>
    <div class="card table-wrap fade-in">
      ${rows ? `<table class="data-table"><thead><tr><th>Bus/Device</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty-state"><div class="empty-icon">🔗</div>No USB devices detected</div>'}
    </div>
  `;
}

// ── Power ─────────────────────────────────────
async function showPowerPanel() {
  const ok = await confirm('Power Options', `
    <div class="power-grid" style="margin-top:8px">
      <div class="power-card shutdown" onclick="doPower('shutdown')">
        <div class="power-card-icon">⏻</div>
        <div class="power-card-label">Shutdown</div>
        <div class="power-card-sub">Power off safely</div>
      </div>
      <div class="power-card reboot" onclick="doPower('reboot')">
        <div class="power-card-icon">↺</div>
        <div class="power-card-label">Reboot</div>
        <div class="power-card-sub">Restart the Pi</div>
      </div>
      <div class="power-card suspend" onclick="doPower('suspend')">
        <div class="power-card-icon">💤</div>
        <div class="power-card-label">Suspend</div>
        <div class="power-card-sub">Sleep mode</div>
      </div>
    </div>
  `, false);
}

async function doPower(action) {
  closeModal();
  const labels = { shutdown: 'Shut down', reboot: 'Reboot', suspend: 'Suspend' };
  const ok = await confirm(`${labels[action]} Pi?`,
    `Are you sure you want to ${action} the Raspberry Pi?`, true);
  if (!ok) return;
  const res = await api('/api/power/action', { method: 'POST', body: JSON.stringify({ action }) });
  if (res?.ok) toast(`${labels[action]} initiated`, 'success');
  else toast(`Failed to ${action}`, 'error');
}

// ── Settings ──────────────────────────────────
async function loadSettings() {
  const el = document.getElementById('page-settings');
  el.innerHTML = `<div class="page-header"><div class="page-header-left"><h2>Settings</h2></div></div><div class="loading pulse">Loading…</div>`;

  const [info, cfg] = await Promise.all([
    apiJSON('/api/settings/info'),
    apiJSON('/api/settings/config'),
  ]);

  el.innerHTML = `
    <div class="page-header"><div class="page-header-left"><h2>Settings</h2><p>PiPanel configuration and hardware info</p></div></div>

    <div class="settings-grid fade-in">
      <div class="settings-section">
        <h3>🖥 Hardware Info</h3>
        <div class="info-grid">
          ${[['Model', info?.model], ['Hostname', info?.hostname], ['OS', info?.os],
             ['Kernel', info?.kernel], ['Arch', info?.arch], ['Python', info?.python],
             ['Firmware', info?.firmware]].map(([k, v]) =>
               `<div class="info-row"><span class="info-row-label">${k}</span><span class="info-row-value">${v || '—'}</span></div>`
          ).join('')}
        </div>
      </div>

      <div class="settings-section">
        <h3>⚙ Configuration</h3>
        <div class="form-group">
          <label>Port</label>
          <input type="number" id="cfg-port" value="${cfg?.port || 8080}" min="1024" max="65535" />
        </div>
        <div class="form-group">
          <label>Default Theme</label>
          <select id="cfg-theme">
            <option value="dark" ${cfg?.theme === 'dark' ? 'selected' : ''}>Dark</option>
            <option value="light" ${cfg?.theme === 'light' ? 'selected' : ''}>Light</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveConfig()">Save Config</button>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:8px">Port change requires restart.</p>
      </div>

      <div class="settings-section">
        <h3>🔒 Change Password</h3>
        <div class="form-group">
          <label>Current Password</label>
          <input type="password" id="pw-old" placeholder="Current password" />
        </div>
        <div class="form-group">
          <label>New Password</label>
          <input type="password" id="pw-new" placeholder="New password (min 6 chars)" />
        </div>
        <div class="form-group">
          <label>Confirm New Password</label>
          <input type="password" id="pw-confirm" placeholder="Confirm new password" />
        </div>
        <button class="btn btn-primary btn-sm" onclick="changePassword()">Change Password</button>
      </div>

      <div class="settings-section">
        <h3>⚡ Quick Actions</h3>
        ${[
          ['Drop Caches', 'drop_caches', 'Free page cache and inodes'],
          ['apt clean', 'apt_clean', 'Clear apt package cache'],
          ['apt autoremove', 'apt_autoremove', 'Remove unused packages'],
        ].map(([label, action, desc]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:13px;font-weight:600">${label}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${desc}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="quickAction('${action}','${label}')">Run</button>
          </div>
        `).join('')}
        <div id="quick-output" style="margin-top:12px"></div>
      </div>
    </div>
  `;
}

async function saveConfig() {
  const port = parseInt(document.getElementById('cfg-port').value);
  const theme = document.getElementById('cfg-theme').value;
  const res = await api('/api/settings/config', { method: 'POST', body: JSON.stringify({ port, theme }) });
  if (res?.ok) { toast('Config saved — restart PiPanel for port changes', 'success'); setTheme(theme); }
  else toast('Failed to save config', 'error');
}

async function changePassword() {
  const old_password = document.getElementById('pw-old').value;
  const new_password = document.getElementById('pw-new').value;
  const confirm_pw   = document.getElementById('pw-confirm').value;
  if (new_password !== confirm_pw) { toast('Passwords do not match', 'error'); return; }
  if (new_password.length < 6)    { toast('Password must be at least 6 characters', 'error'); return; }
  const res = await api('/api/settings/change-password', { method: 'POST', body: JSON.stringify({ old_password, new_password }) });
  if (res?.ok) { toast('Password changed successfully', 'success'); ['pw-old','pw-new','pw-confirm'].forEach(id => document.getElementById(id).value = ''); }
  else toast('Failed — check current password', 'error');
}

async function quickAction(action, label) {
  const output = document.getElementById('quick-output');
  output.innerHTML = `<div style="color:var(--yellow);font-size:12px">⏳ Running ${label}…</div>`;
  const data = await apiJSON('/api/settings/quick-action', { method: 'POST', body: JSON.stringify({ action }) });
  output.innerHTML = `<pre style="font-size:11px;color:var(--text-secondary);white-space:pre-wrap;background:var(--bg-secondary);padding:10px;border-radius:8px;max-height:150px;overflow-y:auto">${data?.output || 'Done.'}</pre>`;
  if (data?.ok) toast(`${label} complete`, 'success');
}

// ── Init ──────────────────────────────────────
async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  navigate('dashboard');
}

async function init() {
  setTheme(localStorage.getItem('pp_theme') || 'dark');

  // Events
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('password-input').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('power-btn').addEventListener('click', showPowerPanel);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Check existing token
  if (token) {
    const res = await api('/api/auth/check');
    if (res?.ok) { showApp(); return; }
  }

  document.getElementById('login-screen').classList.remove('hidden');
}

init();
