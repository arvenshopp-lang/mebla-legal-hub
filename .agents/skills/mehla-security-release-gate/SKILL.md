---
name: "mehla-security-release-gate"
description: "Pre-release security gate, Go/No-Go decision framework, vulnerability threshold enforcer, and production readiness validator for MEHLA."
---

# MEHLA Pre-Release Security Quality Gate Master Skill

## Purpose
Acts as the final, non-negotiable security checkpoint before any code release, major deployment, or production cutover. Produces an authoritative **`GO`**, **`NO-GO`**, or **`CONDITIONAL-GO`** decision grounded in empirical evidence.

## When To Use
- Trigger with `run pre-release security gate` or before deploying new versions to production.
- Reviewing pull requests that alter core infrastructure, database schemas, or authentication.
- Evaluating production release candidates.

## Strict Gate Rules (Zero Compromise)
1. **Any Open CRITICAL Finding** $\rightarrow$ **`NO-GO`** (Mandatory deployment block).
2. **Any Open HIGH Finding** without an approved, compensating control $\rightarrow$ **`NO-GO`**.
3. **Failing Automated Guardrails** (`bun run security:check`) $\rightarrow$ **`NO-GO`**.
4. **Failing Build** (`npm run build`) $\rightarrow$ **`NO-GO`**.
5. **Unverified Migrations or Missing Rollback Plan** $\rightarrow$ **`NO-GO`**.

## The 10-Point Pre-Release Verification Checklist

| Check # | Security Verification Area | Requirement | Evidence Required |
|---|---|---|---|
| **1** | Multi-Tenant Isolation | All new tables have RLS and `organization_id` | SQL schema check |
| **2** | Authentication & Authz | All server functions guarded with session & RBAC | Code inspection |
| **3** | Secrets Hygiene | Zero secrets in code, git, or client bundles | Guardrail script output |
| **4** | Dependency Vulnerabilities | Zero Critical / High CVEs in production dependencies | Audit report |
| **5** | Automated Tests | All unit, integration, and security tests green | Test runner logs |
| **6** | Build Integrity | Clean `npm run build` with zero TypeScript errors | Build exit code 0 |
| **7** | PII & Privacy Shield | Saudi PII masked in logs, telemetry, and external AI calls | PII tests verified |
| **8** | Database Migration Safety | Migrations are backward-compatible and non-destructive | SQL review |
| **9** | Rollback Readiness | Documented rollback steps and verified backup PITR | Backup check |
| **10**| Monitoring & Alarms | Error tracking and security logging active | Sentry / PostHog verified |

## Output Format
```markdown
### 🚦 MEHLA Pre-Release Security Quality Gate Report
- **Release Version / Commit**: [Commit SHA / Tag]
- **Evaluator**: [Security Agent / Developer]
- **Date**: [YYYY-MM-DD]

#### 1. Security Gate Status Matrix
- [x] Multi-Tenant Isolation: PASSED
- [x] Authentication & RBAC: PASSED
- [x] Zero Secrets in Code: PASSED
- [x] Dependency Vulnerabilities: PASSED
- [x] Build Status: PASSED (Exit code 0)

#### 2. Final Release Decision
# 🟢 RELEASE VERDICT: GO
> All 10 mandatory security gates have been satisfied with zero open critical or high vulnerabilities.
```

## Standards Baseline & References
- **NIST SP 800-218 SSDF**: RV.1.1 (Verify Software Release Security)
- **OWASP SAMM v2.0**: Release Management & Verification
- **MEHLA Docs**: `docs/qa/final-release-gate.md`
