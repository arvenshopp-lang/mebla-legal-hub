---
name: "mehla-secrets-security"
description: "Zero-Secrets-in-Code, client bundle leakage, environment variable isolation, secret rotation, and cryptographic key management auditor for MEHLA."
---

# MEHLA Secrets & Credential Security Master Skill

## Purpose
Enforces the zero-secrets policy across the entire MEHLA repository, frontend bundles, git history, CI/CD pipelines, and application logs. Ensures that all production credentials, API keys, database connection strings, and encryption keys are strictly protected.

## When To Use
- Trigger with `audit secrets` or before any commit, PR, or release.
- When adding new environment variables in `.env.example` or server configuration.
- Auditing client-side bundles to verify no server secrets leak via `VITE_` prefixes.
- Planning secret rotation cycles for Supabase service role keys, Resend API keys, WhatsLine tokens, or SMS API keys.

## Core Rules & Guardrails

### 1. No Secrets in Code or Git
- NEVER hardcode secrets, passwords, private keys, or API tokens in source code.
- Checked in CI via `bun run security:check` (catches `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MOBILENET_API_KEY`, `WHATSLINE_HEADER_TOKEN`, PEM keys, and bearer tokens).

### 2. Client Bundle Hygiene (`VITE_` Rules)
- Only non-sensitive public configuration can be prefixed with `VITE_` (e.g., `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_TITLE`).
- Any environment variable containing `SECRET`, `KEY`, `PRIVATE`, `PASSWORD`, `ADMIN`, `SERVICE_ROLE` MUST NOT have a `VITE_` prefix and MUST NOT be imported into client components.

### 3. Log & Console Sanitization
- `console.log`, `console.error`, and telemetry events MUST NOT log headers, full request bodies containing credentials, or `process.env` objects.
- PII and phone numbers in logs must be masked using `redactSaudiPii()` or `maskPhoneValue()`.

### 4. Secret Inventory & Blast Radius Management
- Maintain an inventory of all active third-party keys:
  - Database: `SUPABASE_SERVICE_ROLE_KEY` (Server runtime only)
  - Mail: `RESEND_API_KEY`, `HOSTINGER_SMTP_PASS`
  - WhatsApp: `WHATSLINE_HEADER_TOKEN`, `WHATSLINE_APP_ID`
  - SMS & OTP: `MOBILENET_API_KEY` (Madar SMS)
  - PII Encryption: `PII_ENCRYPTION_KEY` (AES-256-GCM Master Key)

## Security Checks
- [ ] Run grep/regex scans for common secret patterns across `src/` and `scripts/`.
- [ ] Inspect build output in `.output/public/` to confirm zero server secrets in static JS chunks.
- [ ] Verify that `.env` and `.env.local` are listed in `.gitignore`.
- [ ] Ensure that all database integration secrets are encrypted with `vault.server.ts` before persistence.

## Output Format
```markdown
### 🔒 MEHLA Secrets & Credential Audit Report

#### 1. Secrets Scan Summary
- **Scanned Files**: [X files]
- **Hardcoded Secrets Found**: [0]
- **Client Bundle Leaks**: [0]

#### 2. Findings
| ID | File | Variable / Pattern | Risk Level | Action |
|---|---|---|---|---|
| SEC-01 | `...` | None | PASS | Compliant |
```

## Standards Baseline & References
- **CISA Secure Software Development**: Eliminating Hardcoded Credentials
- **OWASP ASVS 5.0.0**: V6 Stored Cryptography & Key Management
- **MEHLA Automated Guardrails**: `scripts/security-guardrails.ts` (`code-guardrails`)
