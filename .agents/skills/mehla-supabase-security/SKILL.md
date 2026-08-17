---
name: "mehla-supabase-security"
description: "Deep PostgreSQL, Supabase Auth, RLS, Storage, and Edge Function security auditor for MEHLA. Enforces strict search_path, revokes anon permissions on sensitive tables, audits SECURITY DEFINER functions, verifies MFA/AAL2 readiness, and prevents service_role escalation."
---

# MEHLA Supabase & PostgreSQL Security Master Skill

## Purpose
Specialized deep security analyzer for MEHLA's Supabase backend. Audits PostgreSQL schema integrity, Row Level Security (RLS) policies, database grants, `SECURITY DEFINER` functions, Auth configurations, Storage bucket policies, and Edge Functions to guarantee defense-in-depth.

## When To Use
- Trigger with `review Supabase RLS` or `audit Supabase security`.
- Before adding or modifying any SQL migration in `supabase/migrations/`.
- Inspecting database functions, triggers, and RPC entry points.
- Auditing Supabase Storage bucket access and signed URL expiration.
- Reviewing `service_role` usage across backend server functions.

## Inputs Required
- SQL migration files in `supabase/migrations/`.
- TypeScript Supabase client references in `src/integrations/supabase/`.
- Supabase storage and webhook definitions.

## Read-only Default
Strictly read-only. Never executes `DROP`, `TRUNCATE`, `ALTER TABLE`, or destructive DDL on live databases without explicit manual confirmation.

## Technical Security Rules & Benchmarks

### 1. PostgreSQL & RLS Hardening
- **RLS Mandatory**: Every single table in the `public` schema MUST have RLS enabled.
- **Grant Minimization**:
  - `anon` MUST NOT have `INSERT`, `UPDATE`, or `DELETE` grants on business tables (`cases`, `clients`, `documents`, `invoices`, `contracts`).
  - `authenticated` grants must be paired with explicit RLS policies (no silent grants).
  - Pure server-only tables (`integration_secrets`, `otp_verifications`, `case_code_registry`) must have NO RLS policies and be accessible ONLY by `service_role`.

### 2. SECURITY DEFINER Functions
- **search_path Protection**: EVERY `SECURITY DEFINER` function MUST specify `SET search_path = public, pg_temp;` (or `private, pg_temp;`) to prevent search_path hijacking attacks.
- **Explicit Access & UID Check**:
  - Functions accessible to `authenticated` MUST begin with:
    `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;`
  - Functions MUST check user role or organization membership before executing privileged operations.
- **Execution Revocation**:
  - Functions MUST execute `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;` unless explicitly designed for unauthenticated public use.

### 3. Supabase Auth Security
- Email confirmation enabled.
- Magic link and password reset redirect URLs locked to strict allowlist domains (`https://mehlalex.com/*`, `https://*.mehlalex.com/*`).
- Anti-enumeration protections enabled.
- Support for Authenticator App (TOTP / MFA) with enforcement for administrative and privileged roles (AAL2).

### 4. Supabase Storage Hardening
- Buckets MUST NOT be set to public unless specifically intended for public marketing assets.
- `storage.objects` RLS policies MUST enforce that `bucket_id = 'documents'` allows downloads ONLY if the authenticated user belongs to the owning `organization_id`.
- File uploads MUST enforce size limits (< 50MB) and MIME type validation.

### 5. Edge Functions & Service Role
- Edge functions MUST verify JWTs or webhook HMAC signatures before processing.
- `service_role` key MUST NEVER be initialized in client-side code, frontend bundles, or exposed in API responses.

## Security Checks
- [ ] Are all `SECURITY DEFINER` functions in `supabase/migrations/` configured with `SET search_path`?
- [ ] Are all RPCs documented in `docs/security-guardrails.md`?
- [ ] Are anon grants completely revoked from all multi-tenant tables?
- [ ] Are storage object policies preventing cross-tenant downloads?
- [ ] Is `supabaseAdmin` restricted exclusively to server-side files (`*.server.ts` or server function handlers)?

## Output Format
```markdown
### 🐘 MEHLA Supabase Security Audit Report

#### 1. RLS & Schema Analysis
- Total Tables Inspected: [X]
- Tables with RLS Active: [X/X] (100% Target)
- Anon Access Status: [LOCKED]

#### 2. SECURITY DEFINER Review
| Function Name | Schema | search_path Set | Auth Check Present | Anon Revoked | Status |
|---|---|---|---|---|---|
| `admin_platform_metrics` | public | ✅ Yes | ✅ auth.uid() is null check | ✅ Yes | SECURE |

#### 3. Storage & Auth Findings
- Storage Policies: [PASSED]
- Auth Redirect URLs: [SECURE ALLOWLIST]
```

## Standards Baseline & References
- **CIS PostgreSQL 16 Benchmark**: Section 3 & 4 (Authentication & Authorization)
- **Supabase Official Security Best Practices**: (2025-2026 Edition)
- **OWASP ASVS 5.0.0**: V8 Data Protection & V4 Access Control
