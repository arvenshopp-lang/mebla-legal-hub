---
name: "mehla-code-security-review"
description: "Static code analysis and pull request security review skill for MEHLA TypeScript/React/Nitro stack. Detects SQL injection, XSS, SSRF, path traversal, auth bypass, race conditions, and insecure crypto."
---

# MEHLA Code Security Review & SAST Master Skill

## Purpose
Performs in-depth Static Application Security Testing (SAST) and code review for TypeScript, React 19, TanStack Start Server Functions, and Nitro SSR backend code in MEHLA.

## When To Use
- Trigger with `review code security` or before merging PRs and finalizing feature branches.
- Auditing newly written routes, components, or server functions.
- Performing pre-merge checks for AppSec compliance.

## Target Vulnerability Classes & Anti-Patterns

### 1. Injection Flaws
- **SQL Injection**: Using string concatenation in database queries instead of parameterized Supabase query builder or prepared statements.
- **Command Injection**: Unsanitized parameters passed to `child_process.exec` or shell commands.
- **Regex Denial of Service (ReDoS)**: Catastrophic backtracking in untrusted text parsing.

### 2. Cross-Site Scripting (XSS)
- Using `dangerouslySetInnerHTML` with unescaped legal markdown, OCR text, or HTML.
- Insecure DOM insertion via `document.write` or `eval()`.
- Untrusted URLs passed to `href` without protocol validation (`javascript:` URIs).

### 3. Server-Side Request Forgery (SSRF)
- Direct `fetch(userSuppliedUrl)` without passing through `src/lib/integrations/http.server.ts` and `ssrf.server.ts`.

### 4. Path Traversal & Arbitrary File Access
- Using unvalidated user input in `fs.readFile` or storage keys (`../../`). Must use `path.basename()` and restrict to designated directories.

### 5. Insecure Randomness & Cryptography
- Using `Math.random()` for security-sensitive tokens, OTPs, or IDs. (Must use `crypto.getRandomValues()` or `crypto.randomUUID()`).
- Insecure hashing (MD5, SHA-1) for passwords or session tokens.

### 6. Race Conditions & Concurrency
- Balance deduction or usage counter incrementing without atomic database transactions (`FOR UPDATE` or atomic RPC increment).

## Step-by-Step Review Workflow
1. **Identify Modified Files**: Focus on changed files in the active PR or feature branch.
2. **Trace Untrusted Input (Sources to Sinks)**: Map all user-controlled inputs (query params, body, headers, uploaded files) to their processing sinks.
3. **Verify Defenses**: Check whether sanitization, parameterization, or type-coercion occurs between source and sink.
4. **False-Positive Filtering**: Confirm exploitability in production before reporting findings.

## Output Format
```markdown
### 🔍 MEHLA Code Security Review Report

#### 1. Scope & Changed Files
- Files Audited: [List of files and line counts]

#### 2. Findings Matrix
| Finding ID | Severity | File & Lines | Flaw Type | Exploit Scenario | Fix Proposal |
|---|---|---|---|---|---|
| CODE-01 | HIGH | `src/lib/...:45` | Unvalidated URL | SSRF risk | Route via `integrationFetch` |

#### 3. Verdict
- **PR Status**: [APPROVED_NO_BLOCKERS / CHANGES_REQUESTED]
```

## Standards Baseline & References
- **OWASP Top 10 (2025)**: A01 to A10
- **OWASP ASVS 5.0.0**: V5 Input Validation & V14 Data Sanitization
- **CWE / SANS Top 25 Most Dangerous Software Errors**
