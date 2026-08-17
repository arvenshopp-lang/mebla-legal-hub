---
name: "mehla-api-security"
description: "Audits MEHLA REST APIs, TanStack Server Functions, and RPC endpoints against OWASP API Security Top 10. Enforces BOLA/IDOR prevention, Broken Function Level Authorization (BFLA), Mass Assignment defense, SSRF mitigation, strict input/output schemas, and rate limits."
---

# MEHLA API & Endpoint Security Master Skill

## Purpose
Enforces rigorous API security standards across all MEHLA HTTP routes, TanStack Start Server Functions, webhook receivers, and backend RPC endpoints based on the OWASP API Security Top 10 standard.

## When To Use
- Trigger with `review API security` or when creating new endpoints in `src/routes/api/` or `src/lib/*.functions.ts`.
- Auditing public endpoints (OTP requests, client portals, public webhooks, public verification pages).
- Reviewing internal RPC APIs and privileged admin routes.

## The 8 Mandatory API Contract Attributes
Every API route or Server Function MUST define and enforce:
1. **Authentication**: Mechanism (Supabase Session JWT, Client Portal HMAC Session, Webhook HMAC, Public Token, or Admin Session).
2. **Authorization**: RBAC check (Owner, Admin, Lawyer, Support, Public).
3. **Tenant Scope**: Explicit binding to `organization_id` derived from session, NOT from untrusted client input.
4. **Input Schema**: Strict Zod schema validation for all parameters, headers, and request bodies.
5. **Output Schema**: Filtered response payload preventing excessive data exposure (no password hashes, tokens, or unneeded PII).
6. **Rate Limit**: Protection against brute-force, Denial of Wallet, and resource exhaustion.
7. **Audit Event**: Security log generation for state modifications and sensitive data exports.
8. **Error Model**: Generic, safe error messages that do not leak SQL syntax, stack traces, or internal server paths.

## OWASP API Top 10 Coverage & Verification

| OWASP API Category | Vulnerability | MEHLA Mandatory Defense |
|---|---|---|
| **API1:2023** | Broken Object Level Authorization (BOLA/IDOR) | Always check `id` + `organization_id` in single SQL query |
| **API2:2023** | Broken Authentication | Strict token verification, constant-time comparison, no credentials in URLs |
| **API3:2023** | Broken Object Property Level Auth (Mass Assignment) | Explicit Zod schema parsing; never pass `req.body` directly to DB update |
| **API4:2023** | Unrestricted Resource Consumption | Pagination limits (`max 100`), timeout limits (`15s`), IP/User rate limiting |
| **API5:2023** | Broken Function Level Authorization (BFLA) | Guard functions (`guardAdmin`, `requireBillingAccess`) on server handlers |
| **API6:2023** | Unrestricted Access to Sensitive Business Flows | Anti-automation checks on OTP requests and PDF generation |
| **API7:2023** | Server-Side Request Forgery (SSRF) | Use `integrationFetch` with `ssrf.server.ts` URL policy & IP allowlisting |
| **API8:2023** | Security Misconfiguration | Strict CORS, `Content-Security-Policy`, `X-Content-Type-Options: nosniff` |
| **API9:2023** | Improper Inventory Management | Deprecated endpoints must be retired; versioning enforced |
| **API10:2023**| Unsafe Consumption of APIs | Validate and sanitize all responses received from third-party APIs (Madar, WhatsLine) |

## Security Checks
- [ ] Are all server function parameters parsed using `zod`?
- [ ] Is `organization_id` extracted from the verified session context rather than trusted from request parameters?
- [ ] Are all outbound HTTP calls to third-party services routed through the SSRF protection layer (`src/lib/integrations/http.server.ts`)?
- [ ] Are sensitive tokens (Bearer tokens, API keys) passed strictly via Authorization headers, never query strings?
- [ ] Do error responses suppress database error details and stack traces?

## Output Format
```markdown
### 🌐 MEHLA API Security Audit Report: [Endpoint / Route]

#### 1. Endpoint Contract Profile
- **Method & Path**: `POST /api/public/portal/otp`
- **Auth Model**: [Public with Rate Limiting / Authenticated Session]
- **Tenant Isolation Mechanism**: [Resolved via Org Slug]
- **Zod Validation**: [PASSED / MISSING]

#### 2. OWASP API Top 10 Gap Analysis
| Category | Check | Status | Notes |
|---|---|---|---|
| API1 (BOLA) | Org-scoped lookup | ✅ SECURE | Bound to tenant |
| API7 (SSRF) | Outbound URL policy | ✅ SECURE | Validated via ssrf.server.ts |

#### 3. Verdict
- **Status**: [APPROVED / REJECTED]
```

## Standards Baseline & References
- **OWASP API Security Top 10**: 2023 (Status: Stable | Checked: 2026-08)
- **OWASP ASVS 5.0.0**: V13 API and Web Service Architecture
