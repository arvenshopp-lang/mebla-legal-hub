---
name: "mehla-frontend-security"
description: "React 19, DOM XSS, Content Security Policy (CSP), local storage secrets, clickjacking, and client-side authorization assumption auditor for MEHLA."
---

# MEHLA Frontend Security Master Skill

## Purpose
Secures the browser presentation tier and client-side state across MEHLA. Enforces the golden rule: **"Frontend authorization is a UX enhancement, never a security boundary."**

## When To Use
- Trigger with `audit frontend security` or when creating/refactoring React UI routes in `src/routes/` and components in `src/components/`.
- Reviewing HTML rendering, rich text editors, PDF previews, dynamic canvas pads, and client storage.
- Configuring Content Security Policy (CSP), CORS, and HTTP security headers.

## Frontend Security Principles & Checks

### 1. Zero Trust on Client State
- UI hiding (e.g. hiding an "احذف القضية" button based on `role !== 'owner'`) is for user experience only. The server function MUST independently verify the user's role and tenant ownership.

### 2. DOM XSS Prevention
- Banned patterns:
  - Direct assignment to `element.innerHTML`
  - Unsanitized `dangerouslySetInnerHTML`
  - Dynamic `eval()` or `new Function()`
  - Rendering markdown without an AST-sanitized parser (e.g. using DOMPurify with strict HTML allowlists).

### 3. LocalStorage & Session Storage Hygiene
- NEVER store long-lived JWT refresh tokens, database passwords, or unencrypted PII in `localStorage`.
- Storage is restricted to UI preferences (theme, sidebar state) and temporary short-lived public portal session hashes.

### 4. Clickjacking & Frame Busting
- Ensure all HTML responses include `X-Frame-Options: DENY` (or `SAMEORIGIN` where iframe previews of court documents are needed within the same origin).
- CSP header must declare `frame-ancestors 'self'`.

### 5. Content Security Policy (CSP)
- Enforce strict script sources: `script-src 'self' https://challenges.cloudflare.com`.
- Disallow `unsafe-eval` and `unsafe-inline` where feasible.
- Restrict `connect-src` to Supabase, PostHog, and authorized Saudi infrastructure endpoints.

## Output Format
```markdown
### 🖥️ MEHLA Frontend Security Audit

#### 1. Client Security Posture
- **CSP Status**: [ENFORCED / PERMISSIVE]
- **DOM XSS Scans**: [PASSED (0 findings)]
- **LocalStorage Audit**: [CLEAN - No secret tokens stored]

#### 2. Findings
| ID | Component | Vulnerability | Severity | Recommended Fix |
|---|---|---|---|---|
| FRONT-01 | `...` | None | PASS | Safe |
```

## Standards Baseline & References
- **OWASP ASVS 5.0.0**: V5 Validation, Sanitization and Encoding
- **OWASP Top 10 (2025)**: A03 Injection & A05 Security Misconfiguration
- **W3C Content Security Policy Level 3**
