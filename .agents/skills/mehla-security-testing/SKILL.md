---
name: "mehla-security-testing"
description: "Negative security testing, authorization testing, cross-tenant penetration simulation, DAST, automated security regression suites, and CI/CD security pipeline skill for MEHLA."
---

# MEHLA Security Testing & Verification Master Skill

## Purpose
Defines and executes negative security testing, automated authorization validation, cross-tenant attack simulations, and security regression test suites for MEHLA.

## When To Use
- Trigger with `run security tests` or `test tenant isolation`.
- Running automated test suites before major releases.
- Writing negative test cases for new server functions and RLS policies.
- Validating bug fixes to prevent security regressions.

## The 6 Mandatory Security Testing Suites

### 1. Cross-Tenant Attack Testing (Multi-Tenant Isolation)
- **Test Objective**: Simulate an authenticated user from Organization A attempting to read, update, or delete data belonging to Organization B.
- **Scenarios**:
  - `GET /cases/{org_b_case_id}` with Org A token -> Expect `403 Forbidden` or `404 Not Found`.
  - `POST /documents/download` with Org B document ID -> Expect `403 Forbidden`.
  - Storage bucket direct download from `/organizations/{org_b_id}/...` -> Expect `403 Forbidden`.

### 2. Privilege Escalation & Role Matrix Testing (RBAC)
- **Test Objective**: Verify that lower-privileged roles (e.g. `lawyer`, `support`, `client`) cannot execute actions reserved for `owner` or `admin`.
- **Scenarios**:
  - Regular lawyer attempting to transfer office ownership -> Expect `403 Forbidden`.
  - Client portal session token attempting to query internal case notes -> Expect `403 Forbidden`.

### 3. Input Fuzzing & Boundary Testing
- **Scenarios**: Extreme numeric values (e.g., negative fees, infinite floats), SQL metacharacters (`' OR '1'='1`), XSS vectors (`<script>alert(1)</script>`), null byte injection (`%00`).

### 4. Authentication Bypass & Token Manipulation
- **Scenarios**: Expired JWTs, forged HMAC signatures, invalid OTP tokens, replayed webhooks.

### 5. Automated CI Security Guardrails
- `bun run security:check` (Code & Secret Guardrails).
- `bun audit` / `npm audit` (Dependency CVE Scanning).
- SQL Guardrails query (Detecting undocumented RPCs, missing RLS, anon grants).

## Output Format
```markdown
### 🧪 MEHLA Security Testing Suite Execution Report

#### 1. Test Execution Summary
- **Cross-Tenant Attack Tests**: [100% PASSED (All blocked)]
- **RBAC Matrix Tests**: [100% PASSED]
- **Negative Input Fuzzing**: [100% PASSED]
- **Automated Guardrails**: [100% CLEAN]

#### 2. Test Evidence Log
- `TEST_CROSS_TENANT_CASE_ACCESS`: PASS (Status 403)
- `TEST_UNAUTHENTICATED_DOWNLOAD`: PASS (Status 401)
```

## Standards Baseline & References
- **OWASP Web Security Testing Guide (WSTG v4.2)**: Identity, Auth & Authz Testing
- **NIST SP 800-115**: Technical Guide to Information Security Testing and Assessment
