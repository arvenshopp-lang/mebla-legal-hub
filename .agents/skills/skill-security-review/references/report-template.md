# Verdict template

Fill this in after reading the flagged files by hand. Keep it specific and cite `file:line`.
Adapt length to the skill: a markdown-only skill needs a few lines; a large code skill needs
the full structure. Use plain hyphens, never long dashes.

---

## <skill-name>: <bottom line>

**Bottom line:** one of safe / safe-with-caveats / needs-caution / do-not-install, plus one
sentence of why.

**What it ships:** N files (code X, markdown Y, vendored Z). <markdown-only, or the gist>.

### Runs automatically (auto-run)
- <hook / manifest handler>: <what it does on read>. <clean, or the concern>.
- If none: "No auto-run code (no hooks). Nothing fires on its own."

### Runs on invocation
- <setup/context/version scripts>: <what they do>. <e.g. read-only git introspection; a
  once-daily GET to the vendor's own domain, no data sent>.

### Runs on demand (only if you use a feature)
- <live server / sub-agent / exporter>: <capability + what gates it, e.g. localhost-only,
  spawns a CLI, only when the user invokes live mode>.

### Worth knowing (benign but notable)
- <phone-home version check; how to disable, e.g. an env var>.
- <external CDN assets, e.g. picsum/simpleicons, inserted into generated output>.

### Not reviewed
- <vendored/minified blobs and why; anything skipped>.

### Verdict
<Safe to install / install with these settings / do not install because ...>. If high-risk,
name the exact finding(s) and `file:line` and recommend against installing.

---

## Example (filled, abbreviated)

## acme-formatter: safe

**Bottom line:** safe. Markdown-only skill, no code, no external calls.

**What it ships:** 1 file (markdown 1).

### Runs automatically
- None. No hooks, no scripts.

### Worth knowing
- Instructs using `https://cdn.example/icons/...` in generated HTML - normal CDN usage,
  appears only in the user's output, not exfiltration.

### Not reviewed
- Nothing; single markdown file read in full.

### Verdict
Safe to install.
