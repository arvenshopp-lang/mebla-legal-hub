---
name: "mehla-logging-audit-security"
description: "Audit logging, security event tracking, correlation IDs, immutable audit trails, and zero-PII/zero-credential logging auditor for MEHLA."
---

# MEHLA Logging, Audit Trail & Telemetry Security Master Skill

## Purpose
Establishes and audits immutable audit trails, security event logging, and forensic tracking across MEHLA while strictly preventing the leakage of passwords, tokens, full confidential court documents, or unmasked PII into logs.

## When To Use
- Trigger with `audit logging security` or when creating state-changing mutations across modules.
- Auditing `audit_logs`, `admin_audit_logs`, and `print_audit_logs` database tables.
- Reviewing error monitoring (Sentry / PostHog) to prevent telemetry credential leaks.

## Mandatory Audit Event Scope
The following business and security events MUST produce an immutable audit log record:
1. **Authentication & Identity**: User logins, failed attempts, password resets, MFA activations, OTP dispatches.
2. **Access Control & RBAC**: Role modifications, user invitations, user suspensions, support access grants.
3. **Data Lifecycle**: Case creation/deletion, document uploads, document downloads, document print copies, bulk exports.
4. **Billing & Contracts**: Contract signatures, invoice creation, payments, banking reconciliations.
5. **Administrative Actions**: Platform configuration changes, quota overrides, emergency maintenance.

## The 7 Mandatory Log Record Attributes
Every security log entry MUST record:
- `timestamp`: ISO 8601 UTC timestamp.
- `actor_id`: User UUID or `service_role`.
- `organization_id`: Tenant UUID.
- `action`: Canonical action verb (e.g., `document.download`, `contract.sign`, `role.update`).
- `entity`: Target resource type and ID (`case:123`, `invoice:456`).
- `result`: `SUCCESS` or `FAILURE` (with standardized error code).
- `context`: IP Address, User Agent, and Correlation Request ID.

## Banned Log Contents (Zero Tolerance)
- NEVER log plaintext passwords, session JWTs, API keys, or OTPs.
- NEVER log full legal memo bodies, court exhibits, or complete OCR texts in application logs.
- Phone numbers and National IDs in logs must be masked (`05******89`).

## Security Checks
- [ ] Are all audit tables immutable (no `UPDATE` or `DELETE` grants)?
- [ ] Are correlation IDs attached to requests across the frontend and server functions?
- [ ] Are error handlers sanitizing exceptions before logging?

## Output Format
```markdown
### 📝 MEHLA Logging & Audit Trail Security Report

#### 1. Audit Coverage
- **Core Tables Audited**: [audit_logs, admin_audit_logs, print_audit_logs]
- **Immutability Status**: [APPEND-ONLY ENFORCED]
- **PII / Secret Leakage in Logs**: [ZERO DETECTED]

#### 2. Verdict
- **Status**: [LOGGING_SECURITY_VERIFIED]
```

## Standards Baseline & References
- **NIST SP 800-92**: Guide to Computer Security Log Management
- **OWASP ASVS 5.0.0**: V7 Security Logging and Monitoring
- **NCA Essential Cybersecurity Controls (ECC-1:2018)**: 2-3 Event Logging and Monitoring
