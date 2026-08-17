---
name: "mehla-auth-identity-security"
description: "Authentication, Multi-Factor Authentication (MFA), Authenticator Assurance Levels (AAL2), session revocation, and identity lifecycle security auditor for MEHLA."
---

# MEHLA Authentication & Identity Security

## Purpose
Establishes and audits identity verification, credential security, session management, and Authenticator Assurance Levels (AAL) across all MEHLA user surfaces (Lawyers, Office Admins, Platform Superadmins, Clients).

## When To Use
- Trigger with `audit auth security` or when modifying authentication flows (`src/hooks/use-auth.ts`, `src/routes/auth/`, `src/lib/client-portal/portal-auth.server.ts`).
- Reviewing password hashing, OTP generation/validation, session tokens, and OAuth login.
- Defining high-risk operations requiring step-up authentication (MFA / AAL2).

## Authentication Surfaces & Requirements

### 1. Law Firm Staff & Lawyers
- **Authentication**: Password (zxcvbn strength >= 3) or Enterprise OAuth.
- **MFA / TOTP**: Supported for all users, required for `owner` and `admin` roles.
- **Session Duration**: Access Token 1 hour, Refresh Token with sliding expiration up to 30 days with device binding.
- **Revocation**: Password changes and role updates instantly revoke all active sessions.

### 2. Platform Admins (`/mehla-admin`)
- **Assurance Level**: Mandatory **AAL2 (MFA Verified)** for all administrative actions.
- **Access Restrictions**: IP allowlisting, short session lifetime (15 minutes idle timeout), step-up re-authentication for high-risk mutations (user suspension, tenant plan modifications).

### 3. Client Portal (`/portal/$slug`)
- **Authentication**: Passwordless 2-Factor SMS OTP via Saudi CST-approved sender (`MehlaLex`).
- **OTP Hardening**: Cryptographically secure 6-digit random token, SHA-256 stored in DB, 5-minute expiry, max 5 attempts before lockout.
- **Session**: HMAC-SHA256 signed session token bound to `client_id` and `organization_id`.

## Step-Up Authentication (AAL2 Trigger List)
The following operations MUST require recent MFA verification or step-up re-auth:
- Changing organization member roles or transferring office ownership.
- Accessing platform financial analytics and MRR.
- Bulk exporting client documents, cases, or invoices.
- Generating or modifying API integration keys and webhook secrets.
- Changing bank account details or payout configurations.
- Accessing Top Secret forensic vaults or deleting cases.

## Security Checks
- [ ] Are OTP verification codes generated using `crypto.getRandomValues()`?
- [ ] Are failed login and OTP attempts tracked and rate-limited with progressive backoff?
- [ ] Does logout revoke the server-side refresh token, not just clear client cookies?
- [ ] Is password complexity enforced client-side and verified server-side?
- [ ] Are timing attacks prevented via constant-time token comparison (`crypto.timingSafeEqual`)?

## Output Format
```markdown
### 🔐 MEHLA Authentication Security Audit Report

#### 1. Surface Analysis
- **Target Surface**: [Law Firm Web / Client Portal / Platform Admin]
- **Current AAL Level**: [AAL1 / AAL2]
- **MFA Status**: [ENFORCED / AVAILABLE / MISSING]

#### 2. Findings & Gaps
| ID | Area | Finding | Severity | Recommendation |
|---|---|---|---|---|
| AUTH-01 | Step-Up | Bulk export lacks AAL2 step-up check | HIGH | Require MFA confirmation before ZIP generation |
```

## Standards Baseline & References
- **NIST SP 800-63B**: Digital Identity Guidelines (Authentication and Lifecycle)
- **OWASP ASVS 5.0.0**: V2 Authentication Verification & V3 Session Management
- **NCA Essential Cybersecurity Controls (ECC-1:2018)**: 2-1 Identity and Access Management
