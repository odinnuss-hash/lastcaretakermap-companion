// Last Caretaker Map - lokaler Server (keine externen Abhaengigkeiten, Node.js >= 18)
//
//  * liefert die Karte aus app/site aus (Kopie der Original-Webseite)
//  * speichert Fortschritt/Notizen/Einstellungen dauerhaft in userdata/progress.json
//  * kann die Karte vom Original-Repository aktualisieren (Update-Funktion)
//  * beendet sich selbst, wenn das Fenster geschlossen wurde
//
// Start:  node app/server.mjs [--open]

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ Konfiguration
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(APP_DIR);
const SITE_DIR = process.env.LCM_SITE || path.join(APP_DIR, 'site');
const CUSTOM_DIR = path.join(APP_DIR, 'custom');
const DATA_DIR = process.env.LCM_DATA || path.join(ROOT_DIR, 'userdata');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const STATE_FILE = path.join(DATA_DIR, 'progress.json');
const META_FILE = path.join(DATA_DIR, 'app-meta.json');
const KNOWN_LOCATIONS_FILE = path.join(APP_DIR, 'known-locations.json');
const KNOWN_TYPES_FILE = path.join(APP_DIR, 'known-types.json');

const PORT = parseInt(process.env.LCM_PORT || '37373', 10);
const HOST = '127.0.0.1';
// Grosszuegig bemessen: Browser drosseln Timer in minimierten/im Hintergrund liegenden Tabs
// stark (teils bis zum kompletten Einfrieren nach ein paar Minuten). Das eigentliche
// "Fenster wurde geschlossen" wird ueber /api/bye (sendBeacon beim pagehide-Event) sofort
// erkannt - dieser Wert ist nur das Sicherheitsnetz fuer den Fall, dass dieses Signal mal
// nicht ankommt (Browser-Absturz, Task-Kill o.ae.), daher darf er ruhig hoch sein.
const IDLE_MS = parseInt(process.env.LCM_IDLE_MS || String(6 * 60 * 60 * 1000), 10);
const FIRST_IDLE_MS = 5 * 60 * 1000; // so lange warten, bis das Fenster zum ersten Mal meldet
const BYE_GRACE_MS = 15 * 1000;      // Schonfrist nach Schliessen (Reload/zweites Fenster)

const REPO = process.env.LCM_REPO || 'the1killer/lastcaretakermap';
const SITE_BRANCH = 'gh-pages';   // fertig gebaute Webseite
const SRC_BRANCH = 'main';        // Quellcode (nur fuer die Liste neuer Locations)
const API_BASE = (process.env.LCM_API_BASE || 'https://api.github.com').replace(/\/$/, '');
const RAW_BASE = (process.env.LCM_RAW_BASE || 'https://raw.githubusercontent.com').replace(/\/$/, '');

const WIKI_BASE = (process.env.LCM_WIKI_BASE || 'https://thelastcaretaker.wiki.gg').replace(/\/$/, '');

// Veroeffentlichungs-Repository DIESER Companion-App (nicht zu verwechseln mit REPO oben, dem
// Original-Kartenprojekt von The1Killer). Hierueber bezieht die App neue Uebersetzungen/Funktionen
// fuer app/custom (siehe "Sprach- & App-Updates" in den Einstellungen) - server.mjs selbst wird
// dabei nie angefasst.
const APP_REPO = process.env.LCM_APP_REPO || 'odinnuss-hash/lastcaretakermap-companion';
const APP_BRANCH = process.env.LCM_APP_BRANCH || 'main';
const APP_CUSTOM_PREFIX = 'app/custom/';
// Die Wiki-Infos (deutsch übersetzt) liegen fest in app/custom/data-locations-wiki.json.
// Wiki-Updates (neu/geändert seit dem letzten Abgleich) werden nur bei "Nach Wiki-Updates
// suchen" live abgefragt und, wenn übernommen, unübersetzt (Englisch) in userdata/wiki-overrides.json
// abgelegt - sie ueberschreiben die deutsche Datei nicht.
const WIKI_DATA_FILE = path.join(CUSTOM_DIR, 'data-locations-wiki.json');
const WIKI_OVERRIDES_FILE = path.join(DATA_DIR, 'wiki-overrides.json');

const OPEN_WINDOW = process.argv.includes('--open') && !process.env.LCM_NO_OPEN;
const APP_VERSION = '1.0.0';

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// Fehler-Log-Datei: damit ein unerwarteter Fehler (siehe process.on-Handler unten) sich
// nachtraeglich nachvollziehen laesst, auch wenn niemand gerade auf das (meist minimierte)
// Server-Fenster geschaut hat.
const ERROR_LOG_FILE = path.join(DATA_DIR, 'error.log');
function logError(label, err) {
  log(label + ':', (err && err.message) || err);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${label}: ${(err && err.stack) || err}\n`;
    fs.appendFileSync(ERROR_LOG_FILE, line);
  } catch { /* Logging darf selbst nie den Server zum Absturz bringen */ }
}

// Ohne diese beiden Handler wuerde EIN einzelner unerwarteter Fehler (z.B. in einer einzelnen
// Anfrage oder einem Hintergrund-Task) den KOMPLETTEN Node-Prozess beenden - und damit auch
// die laufende Speicherung des Fortschritts, bis das (meist minimierte, also leicht uebersehene)
// Server-Fenster manuell neu gestartet wird. Lieber: Fehler loggen, Server weiterlaufen lassen
// (die einzelne fehlgeschlagene Anfrage bricht ab, aber alles andere - vor allem /api/state -
// funktioniert unveraendert weiter).
process.on('uncaughtException', (err) => logError('Unerwarteter Fehler (uncaughtException)', err));
process.on('unhandledRejection', (err) => logError('Unerwarteter Fehler (unhandledRejection)', err));

// ------------------------------------------------------------------ Hilfsfunktionen
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const exists = (p) => fsp.access(p).then(() => true, () => false);

async function readJson(file, fallback) {
  try {
    const txt = (await fsp.readFile(file, 'utf8')).replace(/^﻿/, '');
    return JSON.parse(txt);
  } catch { return fallback; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Windows (v.a. mit Virenscanner/Indexer) sperrt Dateien manchmal fuer einen kurzen
// Moment (EBUSY/EPERM/EACCES). Bei solchen Fehlern lohnt sich ein erneuter Versuch.
const isTransientFsError = (e) => e && ['EBUSY', 'EPERM', 'EACCES', 'ENOENT'].includes(e.code);

async function writeFileAtomicOnce(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  // Eindeutiger Name pro Aufruf (nicht nur pro Prozess), damit sich ueberlappende
  // Schreibvorgaenge auf dieselbe Datei nicht gegenseitig die Temp-Datei wegschnappen.
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmp = `${file}.${unique}.tmp`;
  let attempt = 0;
  for (;;) {
    try {
      await fsp.writeFile(tmp, data);
      await fsp.rename(tmp, file);
      return;
    } catch (e) {
      attempt++;
      if (!isTransientFsError(e) || attempt >= 5) {
        try { await fsp.rm(tmp, { force: true }); } catch { /* egal */ }
        throw e;
      }
      await sleep(50 * attempt);
    }
  }
}

// Pro Zieldatei werden Schreibvorgaenge der Reihe nach ausgefuehrt (nie parallel),
// damit z.B. schnelle, aufeinanderfolgende Speicheranfragen sich nicht in die Quere
// kommen. Jeder Aufruf haengt sich an die Kette des vorherigen an.
const writeQueues = new Map();
function writeFileAtomic(file, data) {
  const prev = writeQueues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeFileAtomicOnce(file, data));
  // Aus der Map entfernen, sobald diese Kette fertig ist, damit sie nicht unbegrenzt waechst.
  writeQueues.set(file, next.finally(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  }));
  return next;
}

// SHA-1 wie Git ihn fuer Dateien berechnet ("blob <laenge>\0<inhalt>")
function gitBlobSha(buf) {
  const h = crypto.createHash('sha1');
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest('hex');
}

async function walk(dir, base = dir, out = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Anfrage zu gross')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ------------------------------------------------------------------ Fortschritt speichern
async function loadState() {
  const data = await readJson(STATE_FILE, null);
  if (data && typeof data === 'object' && data.items && typeof data.items === 'object') {
    return { exists: true, items: data.items };
  }
  return { exists: false, items: {} };
}

let lastBackup = 0;

// Sicherungskopie der aktuellen progress.json anlegen (label z.B. "vor-reset")
async function makeBackup(label = '') {
  if (!(await exists(STATE_FILE))) return null;
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `progress-${stamp}${label ? '_' + label.replace(/[^\w-]/g, '') : ''}.json`;
  await fsp.copyFile(STATE_FILE, path.join(BACKUP_DIR, name));
  lastBackup = Date.now();
  const all = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.startsWith('progress-')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 40))) {
    await fsp.rm(path.join(BACKUP_DIR, f), { force: true });
  }
  return name;
}

async function listBackups() {
  let files = [];
  try { files = (await fsp.readdir(BACKUP_DIR)).filter((f) => /^progress-[\w.-]+\.json$/.test(f)); } catch { /* keine */ }
  const out = [];
  for (const f of files.sort().reverse()) {
    const data = await readJson(path.join(BACKUP_DIR, f), null);
    const items = data && data.items ? data.items : {};
    const keys = Object.keys(items);
    out.push({
      name: f,
      savedAt: data && data.savedAt ? data.savedAt : null,
      cleared: keys.filter((k) => k.startsWith('location-visit-') && items[k] === 'cleared').length,
      visited: keys.filter((k) => k.startsWith('location-visit-') && items[k] === 'visited').length,
      notes: keys.filter((k) => k.startsWith('location-notes-') && items[k].trim()).length,
    });
  }
  return out;
}

async function restoreBackup(name) {
  if (!/^progress-[\w.-]+\.json$/.test(name || '')) throw new Error('Ungueltiger Sicherungsname');
  const src = path.join(BACKUP_DIR, name);
  if (!(await exists(src))) throw new Error('Sicherung nicht gefunden');
  const data = await readJson(src, null);
  if (!data || typeof data.items !== 'object') throw new Error('Sicherung ist beschaedigt');
  await makeBackup('vor-wiederherstellung');
  await writeFileAtomic(STATE_FILE, JSON.stringify(data, null, 1));
  return { ok: true };
}

async function saveState(items) {
  const clean = {};
  for (const [k, v] of Object.entries(items || {})) {
    if (typeof k === 'string' && typeof v === 'string') clean[k] = v;
  }
  // regelmaessig automatische Sicherung der bisherigen Datei (max. 1x pro Stunde)
  try {
    if (Date.now() - lastBackup > 60 * 60 * 1000) await makeBackup('auto');
  } catch (e) { log('Backup-Hinweis:', e.message); }
  await writeFileAtomic(STATE_FILE, JSON.stringify({ savedAt: new Date().toISOString(), items: clean }, null, 1));
}

async function locationData() {
  const j = await readJson(KNOWN_LOCATIONS_FILE, null);
  const types = await readJson(KNOWN_TYPES_FILE, {});
  const out = [];
  if (j && typeof j === 'object') {
    for (const [cat, list] of Object.entries(j)) {
      if (!Array.isArray(list)) continue;
      for (const l of list) {
        if (!l || l.id == null) continue;
        out.push({ id: String(l.id), name: String(l.name ?? l.id), type: l.type || '', cat, x: l.longitude, y: l.latitude });
      }
    }
  }
  return { locations: out, types };
}

async function knownIds() {
  const j = await readJson(KNOWN_LOCATIONS_FILE, null);
  const ids = [];
  if (j && typeof j === 'object') {
    for (const list of Object.values(j)) if (Array.isArray(list)) for (const l of list) if (l && l.id != null) ids.push(String(l.id));
  }
  return ids;
}

// ------------------------------------------------------------------ Update-Funktion
async function ghFetch(url, asBuffer = false) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'LastCaretakerMap-local-app', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    throw new Error('Keine Verbindung zu GitHub');
  }
  if (!res.ok) {
    const err = new Error(`GitHub antwortete mit ${res.status} (${url.replace(/^https?:\/\//, '').split('?')[0]})`);
    err.status = res.status;
    throw err;
  }
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function fetchRemoteTree() {
  const data = await ghFetch(`${API_BASE}/repos/${REPO}/git/trees/${SITE_BRANCH}?recursive=1`);
  if (!data || !Array.isArray(data.tree)) throw new Error('Unerwartete Antwort von GitHub');
  if (data.truncated) throw new Error('Dateiliste von GitHub unvollstaendig');
  const files = {};
  for (const n of data.tree) if (n.type === 'blob') files[n.path] = { sha: n.sha, size: n.size || 0 };
  if (!files['index.html']) throw new Error('Auf dem Zweig fehlt index.html - Aufbau des Original-Projekts hat sich geaendert');
  return { commit: data.sha, files };
}

async function localFiles() {
  const out = {};
  for (const rel of await walk(SITE_DIR)) {
    if (rel.startsWith('.lcm')) continue;
    out[rel] = gitBlobSha(await fsp.readFile(path.join(SITE_DIR, rel)));
  }
  return out;
}

function normalizeLocations(json) {
  // -> { "<kategorie>/<id>": {name, json} }
  const map = {};
  if (!json || typeof json !== 'object') return map;
  for (const [cat, list] of Object.entries(json)) {
    if (!Array.isArray(list)) continue;
    for (const loc of list) {
      if (!loc || loc.id == null) continue;
      map[`${cat}/${loc.id}`] = { name: String(loc.name ?? loc.id), json: JSON.stringify(loc) };
    }
  }
  return map;
}

async function fetchSourceTypes() {
  try {
    const buf = await ghFetch(`${RAW_BASE}/${REPO}/${SRC_BRANCH}/src/data/types.json`, true);
    return JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (e) { return null; }
}

async function fetchSourceLocations() {
  try {
    const buf = await ghFetch(`${RAW_BASE}/${REPO}/${SRC_BRANCH}/src/data/locations.json`, true);
    return JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
  } catch (e) {
    log('Locations-Vergleich nicht moeglich:', e.message);
    return null;
  }
}

async function checkForUpdate() {
  const remote = await fetchRemoteTree();
  const local = await localFiles();
  const added = [], changed = [], removed = [];
  for (const [p, info] of Object.entries(remote.files)) {
    if (!(p in local)) added.push(p);
    else if (local[p] !== info.sha) changed.push(p);
  }
  for (const p of Object.keys(local)) if (!(p in remote.files)) removed.push(p);
  const upToDate = !added.length && !changed.length && !removed.length;

  const result = {
    upToDate, commit: remote.commit,
    added, changed, removed,
    downloadBytes: [...added, ...changed].reduce((s, p) => s + (remote.files[p].size || 0), 0),
    newLocations: [], changedLocations: [], removedLocations: [],
    checkedAt: new Date().toISOString(),
  };

  if (!upToDate) {
    const src = await fetchSourceLocations();
    if (src) {
      const known = normalizeLocations(await readJson(KNOWN_LOCATIONS_FILE, null));
      const fresh = normalizeLocations(src);
      if (Object.keys(known).length) {
        for (const [k, v] of Object.entries(fresh)) {
          if (!known[k]) result.newLocations.push(v.name);
          else if (known[k].json !== v.json) result.changedLocations.push(v.name);
        }
        for (const [k, v] of Object.entries(known)) if (!fresh[k]) result.removedLocations.push(v.name);
      }
      result._sourceLocations = src; // wird beim Installieren gespeichert
      result._sourceTypes = await fetchSourceTypes();
    }
  }
  return result;
}

let updating = false;
async function applyUpdate() {
  if (updating) throw new Error('Es laeuft bereits ein Update');
  updating = true;
  try {
    const check = await checkForUpdate();
    if (check.upToDate) return { ok: true, updated: 0, message: 'Bereits auf dem neuesten Stand.' };
    const remote = await fetchRemoteTree();

    const todo = [...check.added, ...check.changed];
    const stage = path.join(APP_DIR, '.update-tmp');
    await fsp.rm(stage, { recursive: true, force: true });
    await fsp.mkdir(stage, { recursive: true });

    // 1) alles herunterladen und pruefen (noch nichts am Bestand veraendern)
    let i = 0;
    const queue = todo.slice();
    async function worker() {
      while (queue.length) {
        const rel = queue.shift();
        const url = `${RAW_BASE}/${REPO}/${SITE_BRANCH}/${rel.split('/').map(encodeURIComponent).join('/')}`;
        let buf, ok = false, lastErr;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            buf = await ghFetch(url, true);
            if (gitBlobSha(buf) === remote.files[rel].sha) ok = true;
            else lastErr = new Error(`Pruefsumme stimmt nicht: ${rel}`);
          } catch (e) { lastErr = e; }
        }
        if (!ok) throw lastErr;
        const dest = path.join(stage, ...rel.split('/'));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, buf);
        i++;
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    log(`Update: ${i} Datei(en) heruntergeladen`);

    // 2) alte Fassung sichern, dann austauschen
    const bak = path.join(APP_DIR, 'site.bak');
    await fsp.rm(bak, { recursive: true, force: true });
    await fsp.mkdir(bak, { recursive: true });
    const touched = [...check.changed, ...check.removed];
    for (const rel of touched) {
      const src = path.join(SITE_DIR, ...rel.split('/'));
      if (await exists(src)) {
        const dst = path.join(bak, ...rel.split('/'));
        await fsp.mkdir(path.dirname(dst), { recursive: true });
        await fsp.copyFile(src, dst);
      }
    }
    try {
      for (const rel of todo) {
        const dest = path.join(SITE_DIR, ...rel.split('/'));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(path.join(stage, ...rel.split('/')), dest);
      }
      for (const rel of check.removed) await fsp.rm(path.join(SITE_DIR, ...rel.split('/')), { force: true });
    } catch (e) {
      // Rueckgaengig machen
      for (const rel of touched) {
        const b = path.join(bak, ...rel.split('/'));
        if (await exists(b)) await fsp.copyFile(b, path.join(SITE_DIR, ...rel.split('/'))).catch(() => {});
      }
      throw new Error('Austausch fehlgeschlagen, alte Version wiederhergestellt: ' + e.message);
    }
    await fsp.rm(stage, { recursive: true, force: true });

    if (check._sourceLocations) {
      await writeFileAtomic(KNOWN_LOCATIONS_FILE, JSON.stringify(check._sourceLocations));
    }
    if (check._sourceTypes) {
      await writeFileAtomic(KNOWN_TYPES_FILE, JSON.stringify(check._sourceTypes));
    }
    const meta = await readJson(META_FILE, {});
    meta.lastUpdate = new Date().toISOString();
    meta.lastUpdateCommit = remote.commit;
    await writeFileAtomic(META_FILE, JSON.stringify(meta, null, 1));
    delete check._sourceLocations;
    delete check._sourceTypes;
    return { ok: true, updated: todo.length + check.removed.length, ...check };
  } finally {
    updating = false;
    await fsp.rm(path.join(APP_DIR, '.update-tmp'), { recursive: true, force: true }).catch(() => {});
  }
}

// ------------------------------------------------------------------ Update-Funktion fuer die Custom-Erweiterung
// Anders als oben (Original-Kartendaten von The1Killer) betrifft dies NUR den Ordner app/custom
// dieser App selbst (Uebersetzungen/i18n.js, eigene Skripte, Datendateien) - abgeglichen gegen
// das eigene Veroeffentlichungs-Repository (APP_REPO). server.mjs selbst wird dabei nie veraendert,
// genau wie das Original-Update oben nie server.mjs ersetzt.
async function fetchAppRemoteTree() {
  const data = await ghFetch(`${API_BASE}/repos/${APP_REPO}/git/trees/${APP_BRANCH}?recursive=1`);
  if (!data || !Array.isArray(data.tree)) throw new Error('Unerwartete Antwort von GitHub');
  if (data.truncated) throw new Error('Dateiliste von GitHub unvollstaendig');
  const files = {};
  for (const n of data.tree) {
    if (n.type !== 'blob' || !n.path.startsWith(APP_CUSTOM_PREFIX)) continue;
    files[n.path.slice(APP_CUSTOM_PREFIX.length)] = { sha: n.sha, size: n.size || 0 };
  }
  if (!Object.keys(files).length) throw new Error(`Im Repository ${APP_REPO} wurde kein ${APP_CUSTOM_PREFIX} gefunden`);
  return { commit: data.sha, files };
}

async function localAppFiles() {
  const out = {};
  for (const rel of await walk(CUSTOM_DIR)) out[rel] = gitBlobSha(await fsp.readFile(path.join(CUSTOM_DIR, rel)));
  return out;
}

async function checkForAppUpdate() {
  const remote = await fetchAppRemoteTree();
  const local = await localAppFiles();
  const added = [], changed = [], removed = [];
  for (const [p, info] of Object.entries(remote.files)) {
    if (!(p in local)) added.push(p);
    else if (local[p] !== info.sha) changed.push(p);
  }
  for (const p of Object.keys(local)) if (!(p in remote.files)) removed.push(p);
  const upToDate = !added.length && !changed.length && !removed.length;
  return {
    upToDate, commit: remote.commit, added, changed, removed,
    downloadBytes: [...added, ...changed].reduce((s, p) => s + (remote.files[p].size || 0), 0),
    checkedAt: new Date().toISOString(),
    _remote: upToDate ? undefined : remote,
  };
}

let appUpdating = false;
async function applyAppUpdate() {
  if (appUpdating) throw new Error('Es laeuft bereits ein Update');
  appUpdating = true;
  try {
    const check = await checkForAppUpdate();
    if (check.upToDate) return { ok: true, updated: 0, message: 'Bereits auf dem neuesten Stand.' };
    const remote = check._remote || (await fetchAppRemoteTree());

    const todo = [...check.added, ...check.changed];
    const stage = path.join(APP_DIR, '.app-update-tmp');
    await fsp.rm(stage, { recursive: true, force: true });
    await fsp.mkdir(stage, { recursive: true });

    let i = 0;
    const queue = todo.slice();
    async function worker() {
      while (queue.length) {
        const rel = queue.shift();
        const url = `${RAW_BASE}/${APP_REPO}/${APP_BRANCH}/${APP_CUSTOM_PREFIX}${rel.split('/').map(encodeURIComponent).join('/')}`;
        let buf, ok = false, lastErr;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            buf = await ghFetch(url, true);
            if (gitBlobSha(buf) === remote.files[rel].sha) ok = true;
            else lastErr = new Error(`Pruefsumme stimmt nicht: ${rel}`);
          } catch (e) { lastErr = e; }
        }
        if (!ok) throw lastErr;
        const dest = path.join(stage, ...rel.split('/'));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, buf);
        i++;
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    log(`App-Update: ${i} Datei(en) heruntergeladen`);

    const bak = path.join(APP_DIR, 'custom.bak');
    await fsp.rm(bak, { recursive: true, force: true });
    await fsp.mkdir(bak, { recursive: true });
    const touched = [...check.changed, ...check.removed];
    for (const rel of touched) {
      const src = path.join(CUSTOM_DIR, ...rel.split('/'));
      if (await exists(src)) {
        const dst = path.join(bak, ...rel.split('/'));
        await fsp.mkdir(path.dirname(dst), { recursive: true });
        await fsp.copyFile(src, dst);
      }
    }
    try {
      for (const rel of todo) {
        const dest = path.join(CUSTOM_DIR, ...rel.split('/'));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(path.join(stage, ...rel.split('/')), dest);
      }
      for (const rel of check.removed) await fsp.rm(path.join(CUSTOM_DIR, ...rel.split('/')), { force: true });
    } catch (e) {
      for (const rel of touched) {
        const b = path.join(bak, ...rel.split('/'));
        if (await exists(b)) await fsp.copyFile(b, path.join(CUSTOM_DIR, ...rel.split('/'))).catch(() => {});
      }
      throw new Error('Austausch fehlgeschlagen, alte Version wiederhergestellt: ' + e.message);
    }
    await fsp.rm(stage, { recursive: true, force: true });

    const meta = await readJson(META_FILE, {});
    meta.appLastUpdate = new Date().toISOString();
    meta.appLastUpdateCommit = remote.commit;
    await writeFileAtomic(META_FILE, JSON.stringify(meta, null, 1));
    delete check._remote;
    return { ok: true, updated: todo.length + check.removed.length, ...check };
  } finally {
    appUpdating = false;
    await fsp.rm(path.join(APP_DIR, '.app-update-tmp'), { recursive: true, force: true }).catch(() => {});
  }
}

// ------------------------------------------------------------------ Wiki-Infos (thelastcaretaker.wiki.gg)
// Die eigentlichen Wiki-Infos (deutsch uebersetzt, Text + Bild + Wiki-Revisionsnummer je Ort)
// liegen fest in app/custom/data-locations-wiki.json und werden dem Browser einfach als
// statische Datei ausgeliefert - kein Netz noetig, kein Warten beim Anklicken eines Ortes.
// "Nach Wiki-Updates suchen" (unten) vergleicht die gespeicherten Revisionsnummern live mit dem
// echten Wiki; werden Ort uebernommen, landen sie unuebersetzt (Englisch) in userdata/wiki-overrides.json,
// ohne die deutsche Datei zu veraendern.
let wikiOverrides = null;
async function loadWikiOverrides() {
  if (!wikiOverrides) wikiOverrides = await readJson(WIKI_OVERRIDES_FILE, {});
  return wikiOverrides;
}
let wikiOverridesSaveQueued = false;
function saveWikiOverridesSoon() {
  if (wikiOverridesSaveQueued) return;
  wikiOverridesSaveQueued = true;
  setTimeout(async () => {
    wikiOverridesSaveQueued = false;
    try { await writeFileAtomic(WIKI_OVERRIDES_FILE, JSON.stringify(wikiOverrides, null, 1)); } catch (e) { log('Wiki-Overrides konnten nicht gespeichert werden:', e.message); }
  }, 500).unref();
}

async function wikiApi(params) {
  const qs = new URLSearchParams({ format: 'json', ...params });
  let res;
  try {
    res = await fetch(`${WIKI_BASE}/api.php?${qs}`, {
      headers: { 'User-Agent': 'LastCaretakerMap-local-app' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new Error('Keine Verbindung zum Wiki');
  }
  if (!res.ok) throw new Error('Wiki antwortete mit ' + res.status);
  return res.json();
}

const WIKI_GENERIC_IMAGES = new Set(['Map-Background-Tile.png', 'Stub.svg']);
function isGenericWikiImage(name) {
  if (WIKI_GENERIC_IMAGES.has(name)) return true;
  if (/^Icon_/i.test(name)) return true;
  if (/\.svg$/i.test(name)) return true;
  return false;
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function unescapeHtml(s) { return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }

function wikiLinkHtml(target, label) {
  const t = unescapeHtml(target).trim();
  if (/^(File|Image|Category):/i.test(t)) return '';
  const href = `${WIKI_BASE}/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
  return `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(unescapeHtml(label).trim())}</a>`;
}

function wikiInline(s) {
  let t = escapeHtml(s);
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (m, target, label) => wikiLinkHtml(target, label));
  t = t.replace(/\[\[([^\]|]+)\]\]/g, (m, target) => wikiLinkHtml(target, target));
  t = t.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener">$2</a>');
  t = t.replace(/'''''(.+?)'''''/g, '<b><i>$1</i></b>');
  t = t.replace(/'''(.+?)'''/g, '<b>$1</b>');
  t = t.replace(/''(.+?)''/g, '<i>$1</i>');
  t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  return t;
}

function stripWikiTemplates(text) {
  let prev;
  do {
    prev = text;
    text = text.replace(/\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\}/g, '');
  } while (text !== prev && text.includes('{{'));
  return text;
}

// Sehr einfacher, absichtlich toleranter Wikitext->HTML-Umwandler: deckt das ab, was auf diesem
// (kleinen Fan-)Wiki tatsaechlich vorkommt (Ueberschriften, Listen, Links, Fettschrift) - keine
// vollstaendige MediaWiki-Implementierung (z.B. Tabellen werden nicht unterstuetzt).
function wikitextToHtml(src) {
  if (!src) return '';
  let text = src.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi, '');
  text = text.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = stripWikiTemplates(text);

  const lines = text.split(/\r?\n/);
  const out = [];
  let listOpen = false, paraBuf = [];
  const flushPara = () => {
    const joined = paraBuf.join(' ').trim();
    if (joined) out.push(`<p>${wikiInline(joined)}</p>`);
    paraBuf = [];
  };
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); continue; }
    const h = line.match(/^(={2,6})\s*(.+?)\s*=+\s*$/);
    if (h) {
      flushPara(); closeList();
      const level = Math.min(h[1].length + 1, 6);
      out.push(`<h${level}>${wikiInline(h[2].trim())}</h${level}>`);
      continue;
    }
    const li = line.match(/^\*+\s*(.*)$/);
    if (li) {
      flushPara();
      if (!listOpen) { out.push('<ul class="lcm-wiki-list">'); listOpen = true; }
      out.push(`<li>${wikiInline(li[1])}</li>`);
      continue;
    }
    closeList();
    paraBuf.push(line);
  }
  flushPara(); closeList();

  let html = out.join('\n');
  // leere Abschnitte (Ueberschrift ohne Inhalt bis zur naechsten Ueberschrift) entfernen
  let prev;
  do {
    prev = html;
    html = html.replace(/<h(\d)>[^<]*<\/h\1>\s*(?=<h\d>|$)/g, '');
  } while (html !== prev);
  return html.trim();
}

async function fetchWikiInfo(title) {
  const q = await wikiApi({ action: 'query', titles: title });
  const pages = (q.query && q.query.pages) || {};
  const pid = Object.keys(pages)[0];
  if (!pid || pid === '-1' || pages[pid].missing != null) return { ok: false, reason: 'not-found' };

  const parsed = await wikiApi({ action: 'parse', page: title, prop: 'wikitext|images|revid' });
  const wikitext = (parsed.parse && parsed.parse.wikitext && parsed.parse.wikitext['*']) || '';
  const images = (parsed.parse && parsed.parse.images) || [];
  const revid = (parsed.parse && parsed.parse.revid) || null;

  let image = null;
  const candidates = images.filter((n) => !isGenericWikiImage(n));
  if (candidates.length) {
    try {
      const info = await wikiApi({ action: 'query', titles: 'File:' + candidates[candidates.length - 1], prop: 'imageinfo', iiprop: 'url' });
      const ipages = (info.query && info.query.pages) || {};
      const ipid = Object.keys(ipages)[0];
      if (ipid && ipid !== '-1' && ipages[ipid].imageinfo) image = ipages[ipid].imageinfo[0].url;
    } catch (e) { /* Bild ist optional */ }
  }

  return {
    ok: true,
    title,
    url: `${WIKI_BASE}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    html: wikitextToHtml(wikitext),
    image,
    revid,
  };
}

// Fragt fuer eine Liste von Wiki-Seitentiteln die aktuelle Revisionsnummer ab (chunk-weise,
// damit die Anfrage-URL nicht zu lang wird). Ergebnis: { titel: revid|null (null = Seite fehlt) }.
async function fetchWikiRevids(titles) {
  const out = {};
  const list = [...new Set(titles.filter(Boolean))];
  let anyOk = false, lastErr = null;
  for (let i = 0; i < list.length; i += 20) {
    const chunk = list.slice(i, i + 20);
    let data;
    try { data = await wikiApi({ action: 'query', titles: chunk.join('|'), prop: 'info' }); }
    catch (e) { lastErr = e; continue; }
    anyOk = true;
    const pages = (data.query && data.query.pages) || {};
    for (const p of Object.values(pages)) {
      if (!p || !p.title) continue;
      out[p.title] = p.missing != null ? null : (p.lastrevid || null);
    }
    // kleine Pause, um das (kleine) Fan-Wiki nicht zu ueberlasten
    if (i + 20 < list.length) await new Promise((r) => setTimeout(r, 250));
  }
  // Wenn ueberhaupt etwas angefragt wurde, aber keine einzige Anfrage durchging: eher ein
  // Verbindungsproblem melden, statt faelschlich "alles aktuell" zu zeigen.
  if (list.length && !anyOk) throw lastErr || new Error('Keine Verbindung zum Wiki');
  return out;
}

// Vergleicht die im deutschen Datenpaket gespeicherten Revisionsnummern (bzw. die einer bereits
// uebernommenen Aktualisierung) mit dem, was aktuell auf dem Wiki steht, und prueft zusaetzlich,
// ob fuer bisher unbekannte Orte inzwischen ein Artikel unter ihrem eigenen Namen existiert.
async function checkForWikiUpdate() {
  const staticData = await readJson(WIKI_DATA_FILE, {});
  const overrides = await loadWikiOverrides();
  const loc = await readJson(KNOWN_LOCATIONS_FILE, null);
  const appNames = [];
  if (loc && typeof loc === 'object') {
    for (const list of Object.values(loc)) if (Array.isArray(list)) for (const l of list) if (l && l.name) appNames.push(String(l.name));
  }

  const titleToNames = {};
  for (const [name, entry] of Object.entries(staticData)) {
    if (!entry || !entry.wikiTitle) continue;
    (titleToNames[entry.wikiTitle] = titleToNames[entry.wikiTitle] || []).push(name);
  }
  const revids = await fetchWikiRevids(Object.keys(titleToNames));

  const changed = [];
  for (const [wikiTitle, names] of Object.entries(titleToNames)) {
    const newRevid = revids[wikiTitle];
    if (newRevid == null) continue; // Seite (noch) nicht abgefragt oder verschwunden - nicht melden
    for (const name of names) {
      const ov = overrides[name];
      const cur = ov && ov.revid ? ov.revid : staticData[name].revid;
      if (newRevid !== cur) changed.push({ name, wikiTitle, oldRevid: cur, newRevid });
    }
  }

  // Orte ohne Wiki-Artikel (weder im Datenpaket noch als Uebernahme bekannt): pruefen, ob es
  // inzwischen einen Artikel unter genau diesem Namen gibt.
  const unresolved = appNames.filter((n) => !staticData[n] && !(overrides[n] && overrides[n].wikiTitle));
  const newlyAvailable = [];
  if (unresolved.length) {
    const revids2 = await fetchWikiRevids(unresolved);
    for (const n of unresolved) if (revids2[n] != null) newlyAvailable.push({ name: n, wikiTitle: n, revid: revids2[n] });
  }

  return {
    checkedAt: new Date().toISOString(),
    changed, newlyAvailable,
    upToDate: !changed.length && !newlyAvailable.length,
  };
}

// Holt fuer die uebergebenen Orte den frischen Wiki-Artikel und legt ihn (unuebersetzt, Englisch)
// als Ueberschreibung in userdata/wiki-overrides.json ab; die deutsche Basis-Datei bleibt unberuehrt.
async function applyWikiUpdates(items) {
  const overrides = await loadWikiOverrides();
  const results = [];
  for (const it of items || []) {
    const name = String((it && it.name) || '').trim().slice(0, 120);
    const wikiTitle = String((it && it.wikiTitle) || '').trim().slice(0, 150);
    if (!name || !wikiTitle) { results.push({ name, ok: false, reason: 'invalid' }); continue; }
    try {
      const info = await fetchWikiInfo(wikiTitle);
      if (!info.ok) { results.push({ name, ok: false, reason: info.reason || 'error' }); continue; }
      overrides[name] = {
        ok: true, wikiTitle, url: info.url, revid: info.revid,
        html: info.html, image: info.image, lang: 'en',
        appliedAt: new Date().toISOString(),
      };
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, reason: 'error', message: e.message });
    }
  }
  saveWikiOverridesSoon();
  return { ok: true, results };
}

// ------------------------------------------------------------------ Auslieferung der Seite
function transformIndex(html) {
  // Tracking (Google Analytics) und externe Leaflet-CSS entfernen: die Karte laeuft komplett lokal.
  html = html.replace(/<script[^>]*googletagmanager[^>]*>\s*<\/script>/gi, '');
  html = html.replace(/<script>(?:(?!<\/script>)[\s\S])*gtag\((?:(?!<\/script>)[\s\S])*<\/script>/gi, '');
  html = html.replace(/<link[^>]*unpkg\.com[^>]*>/gi, '');
  const head =
    '<script>window.dataLayer=[];window.gtag=function(){};</script>' + // Platzhalter, damit die Karte ohne Tracking laeuft
    '<link rel="icon" type="image/png" href="/custom/icon.png">' +
    '<link rel="stylesheet" href="/custom/custom.css">' +
    '<link rel="stylesheet" href="/custom/theme.css">' +
    '<script src="/custom/state-sync.js"></script>';
  const tail = '<script src="/custom/i18n.js" defer></script><script src="/custom/custom.js" defer></script>' +
    '<script src="/custom/features.js" defer></script>';
  html = html.replace(/<html lang="en">/i, '<html lang="de">');
  html = html.includes('</head>') ? html.replace('</head>', `${head}${tail}</head>`) : head + tail + html;
  return html;
}

function safeJoin(base, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes('\0')) return null;
  const full = path.normalize(path.join(base, rel));
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

async function serveStatic(req, res, urlPath) {
  let base = SITE_DIR;
  let rel = urlPath;
  if (urlPath.startsWith('/custom/')) { base = CUSTOM_DIR; rel = urlPath.slice('/custom'.length); }
  if (rel.endsWith('/')) rel += 'index.html';

  const full = safeJoin(base, rel);
  if (!full) { res.writeHead(400); res.end('Bad request'); return; }

  let stat;
  try { stat = await fsp.stat(full); } catch { stat = null; }
  if (!stat || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }

  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const isIndex = base === SITE_DIR && path.basename(full) === 'index.html' && path.dirname(full) === SITE_DIR;

  if (isIndex) {
    const html = transformIndex(await fsp.readFile(full, 'utf8'));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
    return;
  }
  const hashed = /\/assets\/.*-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(rel);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(full).pipe(res);
}

// ------------------------------------------------------------------ Spielstand einlesen (.sav)
//
// Die .sav-Datei des Spiels ist Unreal Engines "gepackte" Kompression: viele voneinander
// unabhaengige Abschnitte, jeweils ein kleiner Header (beginnt mit Unreals
// PACKAGE_FILE_TAG-Magic-Byte 0x9E2A83C1) gefolgt von genau einem zlib-Stream, der auf exakt
// 128 KiB entpackt. Dafuer gibt es keinen oeffentlich verfuegbaren Parser - das Format wurde
// Byte fuer Byte selbst reverse-engineered (siehe LIESMICH.txt). Danach ist die Datei ein
// gewoehnliches Unreal-"GVAS"-SaveGame mit dem ueblichen getaggten Property-Format.
//
// Statt die komplette (teils >80 MB grosse) Eigenschaftsstruktur nachzubilden, wird hier nur
// das gebraucht, was fuer den Rechner noetig ist:
//   - readTopLevelProps(): liest NUR die oberste Eigenschaftsebene (Slot-Name, Spielversion
//     u.ae.) - alles andere (v.a. "GameProgress", der komplette Weltzustand) wird anhand der
//     angegebenen Groesse uebersprungen statt inhaltlich geparst, daher sehr schnell.
//   - scanItemTotals(): sucht im GESAMTEN entpackten Spielstand nach jedem Vorkommen eines
//     "AssetName" (+ zugehoerigem "ItemCount" kurz danach) und summiert die Mengen auf - das
//     erfasst automatisch Spielerinventar + Schiffslager + alle Kisten zusammen, ohne die
//     Eigentuemer-/Container-Struktur nachvollziehen zu muessen.
const SAVEGAME_MAP_FILE = path.join(CUSTOM_DIR, 'data-calc-savemap.json');

function findNextZlibHeader(data, start) {
  const n = data.length;
  for (let i = start; i < n - 1; i++) {
    if (data[i] === 0x78) {
      const b0 = data[i], b1 = data[i + 1];
      if (((b0 << 8) | b1) % 31 === 0) return i;
    }
  }
  return -1;
}

function inflateOneChunk(buf) {
  return new Promise((resolve, reject) => {
    const inflater = zlib.createInflate();
    const chunks = [];
    inflater.on('data', (d) => chunks.push(d));
    inflater.on('error', reject);
    inflater.on('end', () => resolve({ out: Buffer.concat(chunks), bytesWritten: inflater.bytesWritten }));
    inflater.write(buf);
    inflater.end();
  });
}

async function decompressSaveFile(raw) {
  // Die simple Heuristik in findNextZlibHeader() (irgendein Byte 0x78, dessen folgendes Byte
  // eine gueltige zlib-Pruefsumme ergibt) kann auf zufaellige Byte-Paare in nicht-komprimierten
  // Fuellbytes hereinfallen (z.B. seit einem Spiel-Update neu vorkommende Nullpadding-Abschnitte,
  // die rein zufaellig mit 0x78 0x20 beginnen). So ein falscher Treffer liefert beim Entpacken
  // sofort einen Fehler (z.B. "Missing dictionary", weil das FDICT-Bit des zweiten Bytes
  // zufaellig gesetzt ist). Statt die komplette Datei an so einer Stelle abzubrechen, wird ein
  // solcher Fehlversuch hier als Fehltreffer behandelt und die Suche nach dem naechsten
  // echten zlib-Header einfach ein Byte weiter fortgesetzt.
  const outputs = [];
  let pos = 0;
  for (;;) {
    const hstart = findNextZlibHeader(raw, pos);
    if (hstart === -1) break;
    let out, bytesWritten;
    try {
      ({ out, bytesWritten } = await inflateOneChunk(raw.subarray(hstart)));
    } catch {
      pos = hstart + 1;
      continue;
    }
    outputs.push(out);
    pos = hstart + bytesWritten;
  }
  return Buffer.concat(outputs);
}

// ---- minimaler Unreal "FPropertyTag"-Reader (nur Kopf/Groesse, kein Parsen der Werte) ----
function gvasReadStr(data, off) {
  const n = data.readInt32LE(off);
  const p = off + 4;
  if (n === 0) return ['', p];
  if (n > 0) return [data.toString('utf8', p, p + n - 1), p + n];
  const n2 = -n;
  return [data.toString('utf16le', p, p + (n2 - 1) * 2), p + n2 * 2];
}
function gvasReadStructExtra(data, off) {
  off += 4; // "mystery" Feld (Zweck unklar, aber konstant vorhanden)
  let sname; [sname, off] = gvasReadStr(data, off);
  off += 4;
  let pkg; [pkg, off] = gvasReadStr(data, off);
  return [sname, pkg, off];
}
const GVAS_NESTED_TYPES = new Set(['StructProperty', 'ByteProperty', 'EnumProperty', 'ArrayProperty', 'SetProperty', 'MapProperty', 'OptionalProperty']);
function gvasReadTypeExtra(data, off, typename, depth) {
  depth = depth || 0;
  if (depth > 10) return off;
  if (typename === 'StructProperty') {
    let r = gvasReadStructExtra(data, off);
    return r[2];
  }
  if (typename === 'ByteProperty' || typename === 'EnumProperty') {
    off += 4;
    let ename; [ename, off] = gvasReadStr(data, off);
    if (ename !== '' && ename !== 'None') {
      off += 4;
      let tmp; [tmp, off] = gvasReadStr(data, off);
      off += 4;
      [tmp, off] = gvasReadStr(data, off);
    }
    return off;
  }
  if (typename === 'ArrayProperty' || typename === 'SetProperty' || typename === 'OptionalProperty') {
    off += 4;
    let inner; [inner, off] = gvasReadStr(data, off);
    if (GVAS_NESTED_TYPES.has(inner)) off = gvasReadTypeExtra(data, off, inner, depth + 1);
    return off;
  }
  if (typename === 'MapProperty') {
    off += 4;
    let keytype; [keytype, off] = gvasReadStr(data, off);
    if (GVAS_NESTED_TYPES.has(keytype)) off = gvasReadTypeExtra(data, off, keytype, depth + 1);
    off += 4;
    let valtype; [valtype, off] = gvasReadStr(data, off);
    if (GVAS_NESTED_TYPES.has(valtype)) off = gvasReadTypeExtra(data, off, valtype, depth + 1);
    return off;
  }
  return off;
}
// Liest nur die OBERSTE Eigenschaftsliste eines GVAS-Spielstands (z.B. Slot-Name, Version) -
// alles Grosse wird per Groesenangabe uebersprungen statt inhaltlich geparst.
function gvasReadTopLevelProps(data, start) {
  const props = {};
  let off = start;
  for (;;) {
    let name; [name, off] = gvasReadStr(data, off);
    if (name === '' || name === 'None') break;
    let typ; [typ, off] = gvasReadStr(data, off);
    off = gvasReadTypeExtra(data, off, typ, 0);
    off += 4; // ArrayIndex
    const size = data.readInt32LE(off); off += 4;
    if (size < 0 || size > data.length) break;
    const guid = data.readUInt8(off); off += 1;
    if (guid !== 0 && guid !== 1) break;
    if (guid) off += 16;
    const valueStart = off;
    props[name] = { type: typ, size, valueStart };
    off = valueStart + size;
    if (Object.keys(props).length > 2000) break; // Sicherheitsnetz
  }
  return props;
}
function readSaveMeta(data) {
  const idx = data.indexOf(Buffer.from('SlotName'));
  if (idx === -1) return {};
  const props = gvasReadTopLevelProps(data, idx - 4);
  const meta = {};
  try {
    if (props.SlotName) meta.slotName = gvasReadStr(data, props.SlotName.valueStart)[0];
    if (props.Version) meta.version = data.readInt32LE(props.Version.valueStart);
    if (props.GameBuildCreated) meta.gameBuild = data.readInt32LE(props.GameBuildCreated.valueStart);
    if (props.GameBuildCreatedGameType) meta.gameType = gvasReadStr(data, props.GameBuildCreatedGameType.valueStart)[0];
    if (props.GameBuildCreatedBuildType) meta.buildType = gvasReadStr(data, props.GameBuildCreatedBuildType.valueStart)[0];
    if (props.GameBuildLastUpdate) meta.gameBuildLastUpdate = data.readInt32LE(props.GameBuildLastUpdate.valueStart);
  } catch { /* Metadaten sind nur "nice to have" - bei Problemen einfach weniger anzeigen */ }
  return meta;
}

const GVAS_ASSETNAME_PAT = Buffer.from([0x0a, 0, 0, 0, ...Buffer.from('AssetName\0', 'latin1')]);
const GVAS_ITEMCOUNT_PAT = Buffer.from([0x0a, 0, 0, 0, ...Buffer.from('ItemCount\0', 'latin1')]);

// Summiert ItemCount ueber JEDES Vorkommen eines AssetName im gesamten Spielstand auf -
// also Spielerinventar + Schiffslager + alle Kisten/Container zusammen.
function scanItemTotals(data) {
  const totals = {};
  let pos = 0;
  for (;;) {
    const idx = data.indexOf(GVAS_ASSETNAME_PAT, pos);
    if (idx === -1) break;
    let off = idx;
    let typ;
    off = gvasReadStr(data, off)[1];
    [typ, off] = gvasReadStr(data, off);
    pos = idx + GVAS_ASSETNAME_PAT.length;
    if (typ !== 'NameProperty') continue;
    off += 4; // ArrayIndex
    const size = data.readInt32LE(off); off += 4;
    if (size < 0 || size > 1000) continue;
    const guid = data.readUInt8(off); off += 1;
    if (guid !== 0 && guid !== 1) continue;
    if (guid) off += 16;
    const valueStart = off;
    const assetVal = gvasReadStr(data, valueStart)[0];
    const endOff = valueStart + size;
    const windowEnd = Math.min(endOff + 800, data.length);
    const icIdx = data.indexOf(GVAS_ITEMCOUNT_PAT, endOff);
    if (icIdx === -1 || icIdx >= windowEnd) continue;
    let icoff = icIdx, ictyp;
    icoff = gvasReadStr(data, icoff)[1];
    [ictyp, icoff] = gvasReadStr(data, icoff);
    if (ictyp !== 'IntProperty') continue;
    icoff += 4;
    const icSize = data.readInt32LE(icoff); icoff += 4;
    const icGuid = data.readUInt8(icoff); icoff += 1;
    if (icGuid) icoff += 16;
    if (icSize !== 4) continue;
    const count = data.readInt32LE(icoff);
    if (count > 0) totals[assetVal] = (totals[assetVal] || 0) + count;
  }
  return totals;
}

// Liefert die Top-Level-Properties des Speicherstand-"Slots" (GameProgress -> <Spielername> ->
// Quests/HumanGrow/PersistentActors/...) - wird von mehreren Scan-Funktionen gebraucht, die
// jeweils nur einen einzelnen Unterbereich davon brauchen (Quests, HumanGrow, ...).
function findSlotProps(data) {
  const idx = data.indexOf(Buffer.from('SlotName'));
  if (idx === -1) return null;
  const topProps = gvasReadTopLevelProps(data, idx - 4);
  const gp = topProps.GameProgress;
  if (!gp || gp.type !== 'MapProperty') return null;
  let off = gp.valueStart;
  off += 4; // num_removed
  const num = data.readInt32LE(off); off += 4;
  if (num < 1) return null;
  let key; [key, off] = gvasReadStr(data, off); // Speicherstand-Schluessel, z.B. "voyageworld2"
  return gvasReadTopLevelProps(data, off);
}

// Findet im Spielstand den Byte-Bereich des "Quests"-Unterbereichs (eine StructProperty mit
// genau einer Map "QuestState" darin). Statt diese Map vollstaendig zu parsen (PrimaryAssetId
// als Map-Key ist ein UE-Sonderfall, siehe Notizen im zweiten Gehirn), wird nur der Byte-Bereich
// ermittelt und danach mit derselben Scan-Technik wie bei den Item-Mengen durchsucht.
function findQuestsBlob(data) {
  const slotProps = findSlotProps(data);
  if (!slotProps) return null;
  const quests = slotProps.Quests;
  if (!quests || quests.type !== 'StructProperty') return null;
  return { start: quests.valueStart, end: quests.valueStart + quests.size };
}

const GVAS_PRIMARYASSETNAME_PAT = Buffer.from([0x11, 0, 0, 0, ...Buffer.from('PrimaryAssetName\0', 'latin1')]);
const GVAS_STATUS_PAT = Buffer.from([0x07, 0, 0, 0, ...Buffer.from('Status\0', 'latin1')]);

// Liest je Quest-Eintrag im "Quests"-Bereich den internen Asset-Namen (z.B.
// "DA_Quest_Main_NEW_First_Light") + den Status (FVoyageQuestStatus::Completed /
// ::InProgress / ::NotStarted) aus - gleiche Vorgehensweise wie scanItemTotals: nicht
// vollstaendig parsen, sondern Tag-Muster suchen und den naechstgelegenen zugehoerigen
// Wert nehmen.
function scanQuestStatuses(data) {
  const blob = findQuestsBlob(data);
  if (!blob) return [];
  const out = [];
  let pos = blob.start;
  for (;;) {
    const idx = data.indexOf(GVAS_PRIMARYASSETNAME_PAT, pos);
    if (idx === -1 || idx >= blob.end) break;
    let off = idx;
    let typ;
    off = gvasReadStr(data, off)[1];
    [typ, off] = gvasReadStr(data, off);
    pos = idx + GVAS_PRIMARYASSETNAME_PAT.length;
    if (typ !== 'NameProperty') continue;
    off += 4;
    const size = data.readInt32LE(off); off += 4;
    if (size < 0 || size > 500) continue;
    const guid = data.readUInt8(off); off += 1;
    if (guid !== 0 && guid !== 1) continue;
    if (guid) off += 16;
    const questName = gvasReadStr(data, off)[0];
    const endOff = off + size;
    const windowEnd = Math.min(endOff + 2000, blob.end);
    const stIdx = data.indexOf(GVAS_STATUS_PAT, endOff);
    if (stIdx === -1 || stIdx >= windowEnd) { out.push({ assetName: questName, status: null }); continue; }
    let stoff = stIdx, sttyp;
    stoff = gvasReadStr(data, stoff)[1];
    [sttyp, stoff] = gvasReadStr(data, stoff);
    if (sttyp !== 'EnumProperty') { out.push({ assetName: questName, status: null }); continue; }
    stoff = gvasReadTypeExtra(data, stoff, 'EnumProperty', 0);
    stoff += 4; // ArrayIndex
    const stSize = data.readInt32LE(stoff); stoff += 4;
    const stGuid = data.readUInt8(stoff); stoff += 1;
    if (stGuid) stoff += 16;
    const statusVal = gvasReadStr(data, stoff)[0];
    out.push({ assetName: questName, status: statusVal || null });
  }
  return out;
}

// Liest den "HumanGrow"-Bereich (ArrayProperty<StructProperty>, ein Eintrag je bisher im
// Lazarus Rack gezuechtetem Menschen seit Speicherstand-Beginn). Jedes Element ist selbst eine
// ganz normale getaggte Property-Liste (Type/UniqueID/Timestamp/DeliveryTimestamp/Traits/
// properties, endet mit "None") - anders als bei Quests gibt es hier keinen Map-Key-Sonderfall,
// daher wird hier (anders als bei den Items/Quests) tatsaechlich jedes Element vollstaendig
// durchlaufen statt nur grob gescannt. "Traits" (SetProperty) enthaelt als Objekt-Pfad u.a. genau
// einen "DA_Profession_<Name>"-Eintrag (der gezuechtete Beruf) sowie ggf. zusaetzliche
// Mutations-Eintraege (DA_Mutation_*), die hier nicht ausgewertet werden.
// "Type" ist der Status des Eintrags (FVoyageResultType::Success = fertig gezuechtet, aber noch
// nicht abgeholt/geliefert; ::Delivered = bereits geliefert/im Lazarus Rack entnommen).
const DA_PROFESSION_PAT = /\/DA_Profession_([A-Za-z0-9_]+)\.DA_Profession_\1\b/;
function scanHumanGrow(data) {
  const slotProps = findSlotProps(data);
  if (!slotProps) return [];
  const hg = slotProps.HumanGrow;
  if (!hg || hg.type !== 'ArrayProperty') return [];
  let off = hg.valueStart;
  const end = hg.valueStart + hg.size;
  if (off + 4 > end) return [];
  const count = data.readInt32LE(off); off += 4;
  const out = [];
  for (let i = 0; i < count && off < end; i++) {
    let status = null, timestamp = null, deliveryTimestamp = null, professionAsset = null;
    let p = off;
    for (;;) {
      let name; [name, p] = gvasReadStr(data, p);
      if (name === '' || name === 'None') break;
      let typ; [typ, p] = gvasReadStr(data, p);
      p = gvasReadTypeExtra(data, p, typ, 0);
      p += 4; // ArrayIndex
      const size = data.readInt32LE(p); p += 4;
      if (size < 0 || size > data.length) break;
      const guid = data.readUInt8(p); p += 1;
      if (guid !== 0 && guid !== 1) break;
      if (guid) p += 16;
      const valueStart = p;
      if (name === 'Type' && typ === 'EnumProperty') { status = gvasReadStr(data, valueStart)[0] || null; }
      else if (name === 'Timestamp' && typ === 'Int64Property' && size === 8) { timestamp = Number(data.readBigInt64LE(valueStart)); }
      else if (name === 'DeliveryTimestamp' && typ === 'Int64Property' && size === 8) { deliveryTimestamp = Number(data.readBigInt64LE(valueStart)); }
      else if (name === 'Traits' && typ === 'SetProperty') {
        const buf = data.toString('latin1', valueStart, valueStart + size);
        const m = buf.match(DA_PROFESSION_PAT);
        if (m) professionAsset = 'DA_Profession_' + m[1];
      }
      p = valueStart + size;
    }
    off = p;
    out.push({ professionAsset, status, timestamp, deliveryTimestamp });
  }
  return out;
}

// "DA_Profession_Room_Supervisor" -> "Room Supervisor" - entspricht 1:1 name_en in
// data-calc-humans.json (stichprobenartig gegen einen echten Spielstand verifiziert, keine
// Abweichungen gefunden - im Gegensatz zu den Missionsnamen hier keine Fuzzy-Normalisierung
// noetig).
function normalizeProfessionAssetName(name) { return name.replace(/^DA_Profession_/, '').replace(/_/g, ' '); }

let humansDataCache = null;
async function loadHumansDataForMatching() {
  if (humansDataCache) return humansDataCache;
  const j = await readJson(path.join(CUSTOM_DIR, 'data-calc-humans.json'), { list: [] });
  humansDataCache = j.list || [];
  return humansDataCache;
}

async function matchGrowToHumans(entries) {
  const humans = await loadHumansDataForMatching();
  const byName = new Map(humans.map((h) => [h.name_en, h]));
  return entries.map((e) => {
    const h = e.professionAsset ? byName.get(normalizeProfessionAssetName(e.professionAsset)) : null;
    return {
      professionId: h ? h.id : null,
      nameEn: h ? h.name_en : null,
      nameDe: h ? h.name_de : null,
      professionAsset: e.professionAsset,
      status: e.status,
      timestamp: e.timestamp,
      deliveryTimestamp: e.deliveryTimestamp
    };
  });
}

const QUESTS_DATA_FILE = path.join(CUSTOM_DIR, 'data-quests.json');
let questsDataCache = null;
async function loadQuestsDataForMatching() {
  if (questsDataCache) return questsDataCache;
  questsDataCache = await readJson(QUESTS_DATA_FILE, []);
  return questsDataCache;
}
// Ein paar Quest-Namen weichen zwischen dem internen Asset-Namen und dem uebersetzten
// Wiki-Titel staerker ab, als der automatische Abgleich (CamelCase/Unterstriche -> Slug)
// abdeckt - von Hand geprueft und bestaetigt (siehe zweites Gehirn).
const QUEST_NAME_OVERRIDES = {
  echoesintheruins: 'echoes-in-the-grave',
  seedofthefuture: 'seeds-of-the-future',
  nextstepofevolution: 'the-next-step-of-evolution',
  gyrolostblueprints: 'salvage-gyro-lost-blueprints'
};
function normalizeQuestAssetName(name) {
  let s = name.replace(/^DA_Quest_/, '');
  s = s.replace(/^(Main_NEW_|New_Main_|New_CU\d+_|CU\d+_\d*_?)/, '');
  s = s.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-');
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}
async function matchQuestsToIds(statuses) {
  const quests = await loadQuestsDataForMatching();
  const byId = new Map(quests.map((q) => [q.id, q]));
  const bySlug = new Map(quests.map((q) => [String(q.en || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), q]));
  return statuses.map((s) => {
    const norm = normalizeQuestAssetName(s.assetName);
    const overridden = QUEST_NAME_OVERRIDES[norm.replace(/-/g, '')];
    const q = byId.get(overridden) || byId.get(norm) || bySlug.get(norm) || null;
    return { assetName: s.assetName, status: s.status, questId: q ? q.id : null, de: q ? q.de : null };
  });
}

function saveGamesBaseDir() {
  // Windows: %localappdata%\Voyage\Saved\SaveGames
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Voyage', 'Saved', 'SaveGames');
}

async function listSaveGameFiles() {
  const base = saveGamesBaseDir();
  const files = [];
  if (await exists(base)) {
    async function walkDir(dir) {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walkDir(full);
        else if (e.isFile() && e.name.toLowerCase().endsWith('.sav')) {
          let st;
          try { st = await fsp.stat(full); } catch { continue; }
          files.push({ path: full, name: e.name, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
    }
    await walkDir(base);
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { base, files };
}

let saveMapCache = null;
async function loadSaveMap() {
  if (saveMapCache) return saveMapCache;
  saveMapCache = await readJson(SAVEGAME_MAP_FILE, { food: {}, memory: {} });
  return saveMapCache;
}

// Normiert einen savemap-Eintrag auf ein Array von Spiel-Asset-Namen - meist genau ein Name,
// aber manchmal mehrere (z.B. Farbvarianten desselben Sammelobjekts wie "Basketball" (braun)
// und "Basketball" (blau): unterschiedliche interne DataAssets, aber fuer die Zuchtrechnung
// dieselbe Sache, daher werden ihre Mengen zusammengezaehlt statt nur eine Variante zu erfassen).
function saveMapDaNames(entry) { return Array.isArray(entry) ? entry : [entry]; }

// Spiel-Build, mit dem das Einlesen zuletzt vollstaendig getestet/verifiziert wurde (siehe
// zweites Gehirn, last-caretaker-map.md). Weicht der eingelesene Spielstand davon ab, heisst
// das nicht zwingend, dass etwas kaputt ist - nur dass die Werte nicht erneut gegengeprueft
// wurden und ein Update des Spiels theoretisch das .sav-Format geaendert haben koennte.
const SAVEGAME_TESTED_BUILD = 651238;

async function readSaveGameQuantities(filePath) {
  const { files } = await listSaveGameFiles();
  if (!files.some((f) => f.path === filePath)) {
    throw Object.assign(new Error('Unbekannte Spielstand-Datei'), { status: 400 });
  }
  const raw = await fsp.readFile(filePath);
  const data = await decompressSaveFile(raw);
  const meta = readSaveMeta(data);
  const totals = scanItemTotals(data);
  const map = await loadSaveMap();
  function sumFor(entry) {
    return saveMapDaNames(entry).reduce((s, da) => s + (totals[da] || 0), 0);
  }
  const food = {};
  Object.keys(map.food || {}).forEach((id) => { const n = sumFor(map.food[id]); if (n) food[id] = n; });
  const memory = {};
  Object.keys(map.memory || {}).forEach((id) => { const n = sumFor(map.memory[id]); if (n) memory[id] = n; });
  const mappedDaNames = new Set([
    ...Object.values(map.food || {}).flatMap(saveMapDaNames),
    ...Object.values(map.memory || {}).flatMap(saveMapDaNames)
  ]);
  const unmapped = [];
  Object.keys(totals).forEach((k) => {
    if (mappedDaNames.has(k)) return;
    if (/^DA_(Food_|Memory_|Cartridge_Mod_)/.test(k)) unmapped.push({ assetName: k, qty: totals[k] });
  });
  unmapped.sort((a, b) => b.qty - a.qty);

  let quests = [];
  try {
    quests = await matchQuestsToIds(scanQuestStatuses(data));
  } catch { /* Missionsstatus ist "nice to have" - bei Problemen einfach weglassen */ }

  let grown = [];
  try {
    grown = await matchGrowToHumans(scanHumanGrow(data));
  } catch { /* Liste gezuechteter Menschen ist "nice to have" - bei Problemen einfach weglassen */ }

  const compat = {
    testedBuild: SAVEGAME_TESTED_BUILD,
    savegameBuild: meta.gameBuild || null,
    matches: meta.gameBuild ? meta.gameBuild === SAVEGAME_TESTED_BUILD : null
  };

  return { meta, food, memory, unmapped, quests, compat, grown };
}

// ------------------------------------------------------------------ HTTP-Server
let lastBeat = Date.now();
let seenBeat = false;

async function handleApi(req, res, pathname, url) {
  // Schutz gegen fremde Webseiten: veraendernde Anfragen nur mit eigenem Header (loest CORS-Preflight aus)
  const mutating = req.method !== 'GET' && req.method !== 'HEAD';
  const viaBeacon = pathname === '/api/state' && req.method === 'POST' && req.headers['sec-fetch-site'] === 'same-origin';
  if (mutating && req.headers['x-lcm'] !== '1' && !viaBeacon && pathname !== '/api/bye' && pathname !== '/api/heartbeat') {
    return sendJson(res, 403, { error: 'Verboten' });
  }

  if (pathname === '/api/ping') return sendJson(res, 200, { app: 'last-caretaker-map', version: APP_VERSION });

  if (pathname === '/api/heartbeat') { lastBeat = Date.now(); seenBeat = true; return sendJson(res, 200, { ok: true }); }

  if (pathname === '/api/bye') {
    lastBeat = Date.now() - IDLE_MS + BYE_GRACE_MS;
    seenBeat = true;
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/state') {
    if (req.method === 'GET') return sendJson(res, 200, await loadState());
    if (req.method === 'PUT' || req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Ungueltiges JSON' }); }
      if (!body || typeof body.items !== 'object' || Array.isArray(body.items)) return sendJson(res, 400, { error: 'items fehlt' });
      await saveState(body.items);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/backup' && req.method === 'POST') {
    let label = '';
    try { label = (JSON.parse(await readBody(req) || '{}').label || '').toString().slice(0, 30); } catch { /* egal */ }
    return sendJson(res, 200, { ok: true, name: await makeBackup(label) });
  }
  if (pathname === '/api/backups' && req.method === 'GET') return sendJson(res, 200, { backups: await listBackups() });
  if (pathname === '/api/backups/restore' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      return sendJson(res, 200, await restoreBackup(body.name));
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }
  if (pathname === '/api/locations' && req.method === 'GET') return sendJson(res, 200, await locationData());
  if (pathname === '/api/known-ids' && req.method === 'GET') return sendJson(res, 200, { ids: await knownIds() });

  if (pathname === '/api/savegame/list' && req.method === 'GET') {
    try {
      const { base, files } = await listSaveGameFiles();
      return sendJson(res, 200, { base, files: files.map((f) => ({ path: f.path, name: f.name, size: f.size, mtimeMs: f.mtimeMs })) });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }
  if (pathname === '/api/savegame/read' && req.method === 'GET') {
    const filePath = url.searchParams.get('path') || '';
    if (!filePath) return sendJson(res, 400, { error: 'path fehlt' });
    try {
      return sendJson(res, 200, await readSaveGameQuantities(filePath));
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.message });
    }
  }

  if (pathname === '/api/wiki-overrides' && req.method === 'GET') {
    return sendJson(res, 200, await loadWikiOverrides());
  }

  if (pathname === '/api/wiki-update/check' && req.method === 'GET') {
    try {
      const r = await checkForWikiUpdate();
      const meta = await readJson(META_FILE, {});
      meta.lastWikiCheck = r.checkedAt;
      await writeFileAtomic(META_FILE, JSON.stringify(meta, null, 1));
      return sendJson(res, 200, r);
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  if (pathname === '/api/wiki-update/apply' && req.method === 'POST') {
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'Ungueltiges JSON' }); }
    if (!Array.isArray(body.items) || !body.items.length) return sendJson(res, 400, { error: 'items fehlt' });
    try {
      const r = await applyWikiUpdates(body.items);
      const meta = await readJson(META_FILE, {});
      meta.lastWikiUpdate = new Date().toISOString();
      await writeFileAtomic(META_FILE, JSON.stringify(meta, null, 1));
      return sendJson(res, 200, r);
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (pathname === '/api/info') {
    const meta = await readJson(META_FILE, {});
    return sendJson(res, 200, { version: APP_VERSION, repo: REPO, appRepo: APP_REPO, stateFile: STATE_FILE, ...meta });
  }

  if (pathname === '/api/app-update/check' && req.method === 'GET') {
    try {
      const r = await checkForAppUpdate();
      delete r._remote;
      const meta = await readJson(META_FILE, {});
      meta.appLastCheck = r.checkedAt;
      await writeFileAtomic(META_FILE, JSON.stringify(meta, null, 1));
      return sendJson(res, 200, r);
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  if (pathname === '/api/app-update/apply' && req.method === 'POST') {
    try { return sendJson(res, 200, await applyAppUpdate()); }
    catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  if (pathname === '/api/update/check' && req.method === 'GET') {
    try {
      const r = await checkForUpdate();
      delete r._sourceLocations;
      delete r._sourceTypes;
      const meta = await readJson(META_FILE, {});
      meta.lastCheck = r.checkedAt;
      await writeFileAtomic(META_FILE, JSON.stringify(meta, null, 1));
      return sendJson(res, 200, r);
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  if (pathname === '/api/update/apply' && req.method === 'POST') {
    try { return sendJson(res, 200, await applyUpdate()); }
    catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  return sendJson(res, 404, { error: 'Unbekannte Schnittstelle' });
}

const server = http.createServer(async (req, res) => {
  try {
    // Jede Anfrage zaehlt als Lebenszeichen - nicht nur der Heartbeat selbst. So bleibt
    // der Server auch am Leben, wenn der Heartbeat-Timer im Browser mal ausgesetzt hat
    // (siehe IDLE_MS oben), aber z.B. gerade ein Speichervorgang durchkam.
    lastBeat = Date.now();
    // Nur Anfragen an localhost zulassen (Schutz gegen DNS-Rebinding)
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') { res.writeHead(403); res.end('Forbidden'); return; }
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    log('Fehler:', e);
    if (!res.headersSent) sendJson(res, 500, { error: String(e.message || e) });
    else res.end();
  }
});

// ------------------------------------------------------------------ Fenster oeffnen
function browserCandidates() {
  const env = process.env;
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
  const list = [];
  for (const r of roots) {
    list.push(path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    list.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    list.push(path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  }
  return list;
}

function openWindow(url) {
  if (process.platform === 'win32') {
    const exe = browserCandidates().find((p) => fs.existsSync(p));
    if (exe) {
      // --disable-gpu(-compositing) beugt Grafik-/Renderfehlern (schwarze oder verzerrte
      // Bereiche) im eigenen App-Fenster vor, die auf manchen Systemen (Grafiktreiber,
      // Mehrschirm-Setups mit unterschiedlicher Skalierung) sonst auftreten koennen. Die
      // Karte selbst braucht keine Hardware-Beschleunigung, der Effekt auf die Geschwindigkeit
      // ist nicht spuerbar. Kann per Umgebungsvariable LCM_NO_GPU_FIX=1 abgeschaltet werden.
      const gpuFix = process.env.LCM_NO_GPU_FIX === '1' ? [] : ['--disable-gpu', '--disable-gpu-compositing'];
      spawn(exe, [`--app=${url}`, '--window-size=1500,950', ...gpuFix], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

// ------------------------------------------------------------------ Start
async function ensureSite() {
  if (await exists(path.join(SITE_DIR, 'index.html'))) return true;
  log('Webseiten-Dateien fehlen - lade sie vom Original-Repository ...');
  try {
    await fsp.mkdir(SITE_DIR, { recursive: true });
    const r = await applyUpdate();
    log(`Fertig: ${r.updated} Dateien geladen.`);
    return true;
  } catch (e) {
    log('Download fehlgeschlagen:', e.message);
    return false;
  }
}

async function alreadyRunning() {
  try {
    const r = await fetch(`http://${HOST}:${PORT}/api/ping`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j && j.app === 'last-caretaker-map';
  } catch { return false; }
}

function fail(msg) {
  console.error('\n' + msg + '\n\nDieses Fenster schliesst sich in 60 Sekunden.');
  setTimeout(() => process.exit(1), 60000);
}

async function main() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (process.argv.includes('--setup')) {
    // Ersteinrichtung ohne Server: Kartendaten laden, dann beenden
    const ok = await ensureSite();
    process.exit(ok ? 0 : 1);
  }
  const url = `http://localhost:${PORT}/`;

  server.once('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      if (await alreadyRunning()) {
        log('Die Karte laeuft bereits - oeffne nur ein Fenster.');
        if (OPEN_WINDOW) openWindow(url);
        setTimeout(() => process.exit(0), 500);
      } else {
        fail(`Port ${PORT} wird von einem anderen Programm benutzt. Schliesse es oder starte mit LCM_PORT=<andere Zahl>.`);
      }
    } else fail('Server konnte nicht starten: ' + err.message);
  });

  if (!(await ensureSite())) {
    return fail('Die Karten-Dateien (app\\site) fehlen und konnten nicht geladen werden.\nPruefe die Internetverbindung und starte start.bat erneut.');
  }

  server.listen(PORT, HOST, () => {
    console.log('==============================================');
    console.log(' The Last Caretaker Map - laeuft auf ' + url);
    console.log(' Fortschritt wird gespeichert in: ' + STATE_FILE);
    console.log(' Dieses Fenster darf minimiert bleiben; es schliesst');
    console.log(' sich von selbst, wenn die Karte geschlossen wird.');
    console.log('==============================================');
    if (OPEN_WINDOW) openWindow(url);
  });

  setInterval(() => {
    const limit = seenBeat ? IDLE_MS : Math.max(IDLE_MS, FIRST_IDLE_MS);
    if (Date.now() - lastBeat > limit) {
      log('Kein Fenster mehr offen - Server beendet sich.');
      process.exit(0);
    }
  }, 5000).unref();
}

main();
