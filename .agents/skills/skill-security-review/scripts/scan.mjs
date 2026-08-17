#!/usr/bin/env node
/**
 * skill-security-review - static scanner for Agent Skills.
 *
 * Reads the files of a skill (or a repo of skills) and reports patterns that
 * matter for safety: network egress, process execution, secret/credential
 * access, dynamic code, filesystem writes, obfuscation, and prompt-injection
 * style instructions inside SKILL.md.
 *
 * IT NEVER EXECUTES THE TARGET. It only reads files. The scanner locates
 * things worth a human's eyes and tiers them by how they run
 * (auto-run > on-invocation > on-demand > static-text). The reviewer still
 * reads the flagged files by hand before giving a verdict.
 *
 * Usage:
 *   node scan.mjs <path-to-skill-or-repo> [--json]
 *
 * Exit code is always 0 unless the path is unreadable; findings are data, not
 * errors. Zero runtime dependencies (Node stdlib only).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

const CODE_EXTS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sh', '.bash', '.zsh', '.rb', '.pl', '.php']);
const MD_EXTS = new Set(['.md', '.markdown', '.mdx']);
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', 'coverage']);
const MAX_FILE_BYTES = 2_000_000; // skip reading anything larger; note it instead

// ---------------------------------------------------------------------------
// Rule catalog. Each rule: { id, category, severity, langs, re, guard?, note? }
// severity: high | medium | low | info. guard(line, m) -> false to drop a match.
// ---------------------------------------------------------------------------

const CODE_RULES = [
  // --- network egress ---
  { id: 'net-fetch', category: 'network-egress', severity: 'medium',
    re: /\bfetch\s*\(/, note: 'HTTP request. Check the destination host and payload.' },
  { id: 'net-http-import', category: 'network-egress', severity: 'medium',
    re: /\b(require\(['"]|from ['"]|import .*['"])(node:)?(https?|net|dgram|tls|dns)\b/,
    note: 'Imports a network module.' },
  { id: 'net-ws', category: 'network-egress', severity: 'medium',
    re: /new WebSocket|WebSocketServer|socket\.io|\.connect\s*\(/,
    note: 'Opens a socket/websocket connection.' },
  { id: 'net-xhr', category: 'network-egress', severity: 'medium',
    re: /XMLHttpRequest|axios|got\(|node-fetch|urllib|requests\.(get|post|put|patch|delete)|http\.client|urlopen/,
    note: 'HTTP client usage.' },
  { id: 'net-curl', category: 'network-egress', severity: 'high',
    re: /\b(curl|wget)\b/, note: 'Shells out to curl/wget. Check URL and whether output is executed.' },
  { id: 'net-url', category: 'network-egress', severity: 'info',
    re: /https?:\/\/[a-z0-9.-]+/i,
    note: 'External URL literal (informational; correlate with fetch/exec).' },

  // --- process execution ---
  { id: 'exec-child_process', category: 'process-exec', severity: 'high',
    re: /child_process|node:child_process/, note: 'Node process execution module.' },
  { id: 'exec-call', category: 'process-exec', severity: 'high',
    re: /(^|[^.\w])(execSync|execFileSync|spawnSync|execFile|spawn|exec)\s*\(/,
    guard: (line, m) => !/\.\s*exec\s*\(/.test(line) && !/\bRegExp\b/.test(line),
    note: 'Runs a subprocess. NOTE: bare .exec( on a variable is usually a regex - verify.' },
  { id: 'exec-py', category: 'process-exec', severity: 'high',
    re: /\b(subprocess\.|os\.system|os\.popen|os\.exec|commands\.getoutput|pty\.spawn)/,
    note: 'Python subprocess execution.' },
  { id: 'exec-backtick', category: 'process-exec', severity: 'medium',
    re: /`[^`]*\$\([^`]*`|\bsystem\s*\(|\bexec\b.*\$/,
    note: 'Possible shell command substitution.' },

  // --- secret / credential access ---
  { id: 'secret-ssh', category: 'secret-access', severity: 'high',
    re: /\.ssh\b|id_ed25519|id_rsa|id_ecdsa|authorized_keys|known_hosts/,
    note: 'Touches SSH key material.' },
  { id: 'secret-cloud', category: 'secret-access', severity: 'high',
    re: /\.aws\/|\.config\/gcloud|\.kube\/config|\.docker\/config|\.netrc|\.npmrc|\.pypirc/,
    note: 'Reads cloud/registry credential files.' },
  { id: 'secret-keychain', category: 'secret-access', severity: 'high',
    re: /security find-generic-password|libsecret|keychain|credential.?manager|keytar/i,
    note: 'Accesses the OS credential store.' },
  { id: 'secret-env-file', category: 'secret-access', severity: 'medium',
    re: /readFileSync\([^)]*\.env|open\([^)]*\.env|dotenv|['"][^'"]*\/\.env['"]/,
    note: 'Reads a .env secrets file.' },
  { id: 'secret-env-enum', category: 'secret-access', severity: 'low',
    re: /Object\.(keys|entries|values)\s*\(\s*process\.env|for .* in os\.environ|process\.env\s*\}|JSON\.stringify\(\s*process\.env/,
    note: 'Enumerates the whole environment (possible harvest).' },
  { id: 'secret-token', category: 'secret-access', severity: 'low',
    re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|bearer|password)\b/i,
    note: 'Credential-related identifier (often benign; check if sent anywhere).' },

  // --- dynamic code ---
  { id: 'dyn-eval', category: 'dynamic-code', severity: 'high',
    re: /(^|[^.\w])eval\s*\(|new Function\s*\(|\bvm\.(runIn|compile)|\bexec\s*\(\s*compile/,
    note: 'Runs code built at runtime.' },
  { id: 'dyn-pickle', category: 'dynamic-code', severity: 'high',
    re: /pickle\.loads|marshal\.loads|yaml\.load\s*\(/,
    note: 'Deserializes into executable objects (pickle/unsafe yaml).' },
  { id: 'dyn-decode-exec', category: 'dynamic-code', severity: 'high',
    re: /(atob|Buffer\.from\([^)]*base64|b64decode|fromCharCode)[^;]{0,60}(eval|Function|exec|spawn)/,
    note: 'Decodes then executes - classic obfuscated payload.' },

  // --- filesystem ---
  { id: 'fs-destructive', category: 'filesystem', severity: 'high',
    re: /rm\s+-rf|rmdir\s+\/s|fs\.rm\s*\(|shutil\.rmtree|unlinkSync|os\.remove/,
    note: 'Deletes files/dirs.' },
  { id: 'fs-abs-write', category: 'filesystem', severity: 'medium',
    re: /writeFileSync\s*\(\s*['"]\/(?!tmp)|open\s*\(\s*['"]\/(?!tmp)[^'"]*['"]\s*,\s*['"][wa]|>>?\s*\/(etc|usr|bin|root|home)/,
    note: 'Writes to an absolute system path outside the project.' },
  { id: 'fs-home', category: 'filesystem', severity: 'low',
    re: /os\.homedir\s*\(\)|expanduser\(|process\.env\.HOME|\$HOME/,
    note: 'Resolves the home directory (check what it does there).' },

  // --- obfuscation ---
  { id: 'obf-base64', category: 'obfuscation', severity: 'medium',
    re: /['"][A-Za-z0-9+/]{120,}={0,2}['"]/,
    note: 'Long base64/opaque literal.' },
  { id: 'obf-hex', category: 'obfuscation', severity: 'low',
    re: /(\\x[0-9a-f]{2}){10,}/i, note: 'Long hex-escaped string.' },
];

// Zero-width / bidi control characters (used to hide instructions in text).
const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤﻿]/;

const MD_RULES = [
  { id: 'md-pipe-shell', category: 'injection', severity: 'high',
    re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|python|node)\b/i,
    note: 'Instructs piping a download straight into an interpreter.' },
  { id: 'md-run-remote', category: 'injection', severity: 'high',
    re: /\b(npm\s+i(nstall)?|pip\s+install|npx|uvx|gem\s+install|go\s+install)\b[^\n]*(https?:\/\/|git\+|github\.com\/[^\s)]+)/i,
    note: 'Instructs installing/executing code from a remote/arbitrary source.' },
  { id: 'md-override', category: 'injection', severity: 'high',
    re: /ignore (all |the |any )?(previous|prior|earlier|above) (instructions|prompts|rules)|disregard (the )?(system|previous)|override.{0,20}(system|safety)/i,
    note: 'Prompt-injection: tries to override the agent\'s own instructions.' },
  { id: 'md-hide-from-user', category: 'injection', severity: 'high',
    re: /(do not|don't|never) (tell|inform|mention|show|reveal).{0,30}(user|human)|without (telling|informing|asking) the user/i,
    note: 'Tells the agent to act behind the user\'s back.' },
  { id: 'md-exfil', category: 'injection', severity: 'high',
    re: /\b(send|post|upload|exfiltrat|transmit|report|beacon)\b[^\n]{0,50}\b(env|environment|token|key|secret|credential|\.ssh|password|contents|history)\b/i,
    note: 'Instructs sending local/secret data somewhere.' },
  { id: 'md-read-secrets', category: 'injection', severity: 'high',
    re: /\b(read|cat|open|load|collect|gather)\b[^\n]{0,40}(\.ssh|\.env|id_rsa|id_ed25519|\.aws|credentials|\.netrc|password|api[_-]?key)\b/i,
    note: 'Instructs reading credential/secret files.' },
  { id: 'md-run-script', category: 'process-exec', severity: 'low',
    re: /(you MUST|always|first)[^\n]{0,40}\b(run|execute)\b[^\n]{0,40}\b(node|python|bash|sh|\.mjs|\.py|\.sh|scripts\/)/i,
    note: 'Setup step that runs a bundled script (read that script).' },
];

// ---------------------------------------------------------------------------
// File walk + classification
// ---------------------------------------------------------------------------

function walk(dir, root, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, root, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function classify(file) {
  const ext = extname(file).toLowerCase();
  const name = basename(file).toLowerCase();
  if (MD_EXTS.has(ext)) return 'markdown';
  if (CONFIG_EXTS.has(ext)) return 'config';
  if (CODE_EXTS.has(ext)) {
    if (/\.(min|umd|bundle)\.js$/.test(name)) return 'vendored';
    return 'code';
  }
  return 'asset';
}

function isVendoredByContent(text) {
  // Single very long line = minified/vendored bundle. Note it, do not line-scan.
  const firstBreak = text.indexOf('\n');
  const longestLine = text.split('\n').reduce((a, l) => Math.max(a, l.length), 0);
  return longestLine > 2000 || (firstBreak === -1 && text.length > 2000);
}

// ---------------------------------------------------------------------------
// Entry-point (tier) detection
// ---------------------------------------------------------------------------

function detectAutoRun(files, root, texts) {
  const autorun = new Set();
  const refExts = /\.(mjs|cjs|js|py|sh|bash|rb)$/i;
  // 1. filename heuristic: hook*.
  for (const f of files) {
    if (/(^|\/)hook[\w.-]*\.(mjs|cjs|js|py|sh)$/i.test(f)) autorun.add(f);
    if (/(^|\/)(pre|post)[-_]?tool[-_]?use/i.test(f)) autorun.add(f);
  }
  // 2. hook/plugin/settings manifests referencing a command.
  for (const f of files) {
    const rel = relative(root, f);
    if (/hooks?\.json$|settings(\.local)?\.json$|\.claude-plugin\//i.test(rel)) {
      const t = texts.get(f) || '';
      for (const m of t.matchAll(/["']([^"']*\.(?:mjs|cjs|js|py|sh|bash))["']/g)) {
        const cand = files.find(x => x.endsWith(m[1].replace(/^\.?\/?/, '')) || basename(x) === basename(m[1]));
        if (cand) autorun.add(cand);
      }
      if (/PostToolUse|PreToolUse|"hooks"/.test(t)) {
        // manifest itself is evidence of a hook wiring
        autorun.add(f);
      }
    }
  }
  return autorun;
}

function detectOnInvocation(skillMd, files, root) {
  // Scripts the SKILL.md tells the agent to run during setup / on activation.
  const oninv = new Set();
  if (!skillMd) return oninv;
  const text = skillMd.text;
  for (const m of text.matchAll(/(?:node|python3?|bash|sh|\.\/)\s+([\w./-]+\.(?:mjs|cjs|js|py|sh|bash))/g)) {
    const target = m[1];
    const cand = files.find(x => x.endsWith(target.replace(/^\.?\/?/, '')) || basename(x) === basename(target));
    if (cand) oninv.add(cand);
  }
  return oninv;
}

function tierFor(file, autorun, oninv, kind) {
  if (autorun.has(file)) return 'auto-run';
  if (oninv.has(file)) return 'on-invocation';
  if (kind === 'markdown') return 'static-text';
  return 'on-demand';
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

function scanFileLines(file, text, rules, rel, isCode) {
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 4000) continue; // skip pathological lines
    // Commented-out code does not run: skip JS/C comment lines for code rules.
    // (Hidden-unicode check below still runs on every line.)
    const trimmed = line.trim();
    const isCommentLine = isCode && /^(\/\/|\*|\/\*)/.test(trimmed);
    if (!isCommentLine) for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (rule.guard && !rule.guard(line, m)) continue;
      let severity = rule.severity;
      // localhost downgrade for network rules
      if (rule.category === 'network-egress' && /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/.test(line)) {
        severity = severity === 'high' ? 'low' : 'info';
      }
      findings.push({
        file: rel, line: i + 1, rule: rule.id, category: rule.category,
        severity, snippet: line.trim().slice(0, 200), note: rule.note,
      });
    }
    if (HIDDEN_CHARS.test(line)) {
      findings.push({
        file: rel, line: i + 1, rule: 'hidden-unicode', category: 'obfuscation',
        severity: 'high', snippet: '[zero-width / bidi control characters present]',
        note: 'Invisible characters can hide instructions or code. Inspect with a hex view.',
      });
    }
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const target = args.find(a => !a.startsWith('--'));
  if (!target) {
    console.error('usage: node scan.mjs <path-to-skill-or-repo> [--json]');
    process.exit(2);
  }
  let st;
  try { st = statSync(target); } catch (e) { console.error(`cannot read ${target}: ${e.message}`); process.exit(2); }

  const root = st.isDirectory() ? target : join(target, '..');
  const files = [];
  if (st.isDirectory()) walk(target, root, files); else files.push(target);

  // Read text once per file.
  const texts = new Map();
  const inventory = [];
  const skillMds = [];
  for (const f of files) {
    const rel = relative(root, f) || basename(f);
    let kind = classify(f);
    let size = 0;
    try { size = statSync(f).size; } catch {}
    let text = '';
    if ((kind === 'code' || kind === 'markdown' || kind === 'config' || kind === 'vendored') && size <= MAX_FILE_BYTES) {
      try { text = readFileSync(f, 'utf-8'); } catch {}
      if (kind === 'code' && isVendoredByContent(text)) kind = 'vendored';
    }
    texts.set(f, text);
    inventory.push({ file: rel, kind, bytes: size });
    if (basename(f).toLowerCase() === 'skill.md') skillMds.push({ file: f, rel, text });
  }

  const autorun = detectAutoRun(files, root, texts);
  const primarySkillMd = skillMds[0];
  const oninv = detectOnInvocation(primarySkillMd, files, root);

  const findings = [];
  const notes = [];
  for (const f of files) {
    const rel = relative(root, f) || basename(f);
    const kind = inventory.find(x => x.file === rel)?.kind;
    const text = texts.get(f) || '';
    if (kind === 'vendored') {
      notes.push(`Vendored/minified, not line-scanned: ${rel} (read the source repo or treat as opaque).`);
      continue;
    }
    let ruleset = null;
    if (kind === 'code' || kind === 'config') ruleset = CODE_RULES;
    else if (kind === 'markdown') ruleset = MD_RULES;
    if (!ruleset || !text) continue;
    const fileFindings = scanFileLines(f, text, ruleset, rel, kind === 'code' || kind === 'config');
    const tier = tierFor(f, autorun, oninv, kind);
    for (const fnd of fileFindings) { fnd.tier = tier; findings.push(fnd); }
  }

  // Summaries
  const sevOrder = { high: 0, medium: 1, low: 2, info: 3 };
  const tierOrder = { 'auto-run': 0, 'on-invocation': 1, 'on-demand': 2, 'static-text': 3 };
  findings.sort((a, b) =>
    (tierOrder[a.tier] - tierOrder[b.tier]) || (sevOrder[a.severity] - sevOrder[b.severity]) ||
    a.file.localeCompare(b.file) || a.line - b.line);

  const counts = { code: 0, markdown: 0, config: 0, asset: 0, vendored: 0 };
  for (const it of inventory) counts[it.kind] = (counts[it.kind] || 0) + 1;
  const bySev = {}; const byCat = {};
  for (const f of findings) { bySev[f.severity] = (bySev[f.severity] || 0) + 1; byCat[f.category] = (byCat[f.category] || 0) + 1; }

  const result = {
    target,
    summary: {
      files: inventory.length,
      byKind: counts,
      hasCode: counts.code > 0,
      autoRunEntrypoints: [...autorun].map(f => relative(root, f)),
      findings: findings.length,
      bySeverity: bySev,
      byCategory: byCat,
    },
    findings,
    inventory,
    notes,
  };

  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

  // Human-readable summary
  const s = result.summary;
  const L = [];
  L.push(`# skill-security-review scan: ${target}`);
  L.push('');
  L.push(`Files: ${s.files}  (code ${counts.code}, markdown ${counts.markdown}, config ${counts.config}, vendored ${counts.vendored}, asset ${counts.asset})`);
  L.push(`Has executable code: ${s.hasCode ? 'YES' : 'no (markdown-only)'}`);
  L.push(`Auto-run entrypoints: ${s.autoRunEntrypoints.length ? s.autoRunEntrypoints.join(', ') : 'none detected'}`);
  L.push(`Findings: ${s.findings}  (${Object.entries(bySev).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'})`);
  L.push('');
  if (notes.length) { L.push('Notes:'); for (const n of notes) L.push(`  - ${n}`); L.push(''); }
  if (!findings.length) {
    L.push('No pattern matches. Still read SKILL.md and any code by hand before trusting.');
  } else {
    let curTier = null;
    for (const f of findings) {
      if (f.tier !== curTier) { curTier = f.tier; L.push(`## tier: ${curTier}`); }
      L.push(`  [${f.severity}] ${f.category}/${f.rule}  ${f.file}:${f.line}`);
      L.push(`      ${f.snippet}`);
      if (f.note) L.push(`      -> ${f.note}`);
    }
  }
  L.push('');
  L.push('Reminder: this locates; it does not judge. Read every auto-run and flagged file by hand.');
  console.log(L.join('\n'));
}

main();
