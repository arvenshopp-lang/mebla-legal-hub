---
name: "mehla-oauth-integration-security"
description: "OAuth 2.0, OpenID Connect (OIDC), PKCE, token encryption, scope minimization, and third-party connector security auditor for MEHLA."
---

# MEHLA OAuth & Integration Security Master Skill

## Purpose
Governs all outbound and inbound OAuth 2.0 / OIDC integrations in MEHLA (Google Workspace, Microsoft 365, OneDrive, Outlook Calendar, Wathiq API, Saudi Government OAuth). Ensures secure token exchange, cryptographic state validation, token rotation, and zero scope over-permissioning.

## When To Use
- Trigger with `review OAuth integration` or when building/modifying connectors in `src/lib/integrations/`.
- Adding OAuth for Google Calendar, Outlook Calendar, OneDrive, or Google Drive.
- Integrating external Saudi government identity portals (Nafath, Wathiq).

## Mandatory OAuth 2.0 Security Controls

### 1. Authorization Code Flow with PKCE
- All OAuth clients MUST use the **Authorization Code Grant with PKCE** (`code_challenge` / `code_verifier`).
- `code_challenge_method` MUST be `S256` (SHA-256). Plain methods are forbidden.

### 2. State & CSRF Protection
- The `state` parameter is MANDATORY and MUST contain a cryptographically signed HMAC token:
  `HMAC-SHA256(user_id + organization_id + nonce + timestamp, secret)`.
- Reused or expired states (> 10 minutes) MUST be rejected.

### 3. Redirect URI Validation
- Exact string matching on redirect URIs. Wildcard domain redirects (`https://*.mehlalex.com/*`) in OAuth client configuration are strictly forbidden to prevent token interception.

### 4. Scope Minimization (Least Privilege)
- Request only the granular scopes strictly needed for the feature:
  - Calendar Sync: `Calendars.ReadWrite` (never `Mailbox.Read` or `Directory.AccessAsUser.All`).
  - OneDrive BYOS: `Files.ReadWrite.AppFolder` (isolated application folder, never root drive access).

### 5. Token Vault Storage & Rotation
- Access tokens and Refresh tokens MUST be encrypted at rest before storing in `integration_secrets` table using AES-256-GCM via `src/lib/integrations/vault.server.ts`.
- Tokens must be rotated upon refresh; old refresh tokens must be invalidated.

## Security Checks
- [ ] Is PKCE with S256 enforced on all authorization requests?
- [ ] Is the `state` parameter generated with high-entropy random bytes and cryptographically verified upon callback?
- [ ] Are OAuth refresh tokens encrypted in the database and never logged?
- [ ] Does disconnect/revocation properly trigger token revocation at the upstream provider (e.g. Microsoft Graph / Google API)?

## Output Format
```markdown
### 🔑 MEHLA OAuth Integration Security Audit

#### 1. Integration Profile
- **Provider**: [Microsoft Graph / Google Workspace / Wathiq]
- **Flow**: [Auth Code + PKCE S256]
- **Requested Scopes**: [Scope list]

#### 2. Findings
| ID | Check | Result | Severity | Mitigation |
|---|---|---|---|---|
| OAUTH-01 | State Parameter | ✅ Verified HMAC | PASS | None |
| OAUTH-02 | Token Storage | ✅ AES-256-GCM Vault | PASS | None |
```

## Standards Baseline & References
- **RFC 7636**: Proof Key for Code Exchange (PKCE)
- **RFC 6749 & RFC 6819**: OAuth 2.0 Threat Model and Security Considerations
- **OAuth 2.0 Security Best Current Practice**: (IETF 2024-2026)
- **OWASP ASVS 5.0.0**: V3 Authentication & V9 Communications
