---
name: "mehla-zero-trust-security"
description: "Zero Trust Architecture (ZTA) auditor for MEHLA based on NIST SP 800-207. Enforces 'Never Trust, Always Verify', per-request authentication, service-to-service isolation, micro-segmentation, and context-aware authorization."
---

# MEHLA Zero Trust Architecture (ZTA) Master Skill

## Purpose
Applies the Zero Trust security philosophy across MEHLA. Enforces the core paradigm: **"Never trust solely because a request originates internally or from within the network perimeter. Always authenticate, authorize, and validate explicitly on every request."**

## When To Use
- Trigger with `audit zero trust` or when architecting microservices, background job dispatchers, or internal RPC functions.
- Reviewing communication between Edge Nitro runtime, TanStack Start Server Functions, Supabase PostgreSQL, and third-party SaaS connectors.
- Auditing service-to-service API authentication and worker queue processors.

## The 5 Pillars of Zero Trust in MEHLA

### 1. Explicit Identity Verification
- Every internal function, API call, and database query must verify the caller's cryptographic identity (Supabase JWT or HMAC-signed service key).
- No endpoint or database table may rely on "IP whitelisting" or "internal network" status alone as proof of authorization.

### 2. Least Privilege Access (Micro-Segmentation)
- Service workers (e.g., email dispatcher, SMS queue runner, OCR pipeline) MUST only hold database grants for their specific queues (`email_outbox`, `notification_queue`, `usage_counters`).
- Workers must NOT have unrestricted global `postgres` superuser or unrestricted write access across all business tables.

### 3. Assume Breach
- Architect every subsystem under the assumption that other subsystems or user sessions might be compromised:
  - If a lawyer's session is stolen, they still cannot access other organizations (RLS hard boundary).
  - If a frontend component suffers an XSS bug, server functions still enforce cryptographic session validation and tenant scoping.

### 4. Dynamic Context-Aware Access Control
- Evaluate request context dynamically: user role, tenant status (active subscription vs suspended), MFA verification level (AAL2 for admin actions), and rate limits.

### 5. Encrypted Data Everywhere
- In transit: TLS 1.3 enforced everywhere.
- At rest: Database tablespace encryption + application-layer field encryption for sensitive tokens (`vault.server.ts`).

## Security Checks
- [ ] Are any internal endpoints accessible without token or HMAC authentication?
- [ ] Do background workers operate under least-privilege database roles?
- [ ] Is service role usage restricted exclusively to trusted server handlers with strict tenant context?

## Output Format
```markdown
### 🛡️ MEHLA Zero Trust Architecture Audit

#### 1. Zero Trust Posture
- **Perimeter Trust Model**: [REJECTED - ZERO TRUST ENFORCED]
- **Internal RPC Verification**: [100% EXPLICIT AUTHENTICATION]
- **Micro-Segmentation**: [ACTIVE]

#### 2. Findings
| ID | Subsystem | Gap | Severity | Recommendation |
|---|---|---|---|---|
| ZT-01 | Internal Queue | Missing worker token | MEDIUM | Require worker HMAC signature |
```

## Standards Baseline & References
- **NIST SP 800-207**: Zero Trust Architecture (Status: Final Baseline)
- **CISA Zero Trust Maturity Model v2.0**: Identity, Device, Network, Application & Data Pillars
