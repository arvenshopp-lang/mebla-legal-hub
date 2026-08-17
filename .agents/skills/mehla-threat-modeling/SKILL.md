---
name: "mehla-threat-modeling"
description: "STRIDE, Abuse-Case, and Attack-Tree threat modeling for MEHLA Legal SaaS. Evaluates features, APIs, external integrations (WhatsApp, SMS, Wathiq, Najiz, Cloud Storage), Client Portal, and AI pipelines to uncover attack vectors and assign residual risk."
---

# MEHLA Threat Modeling & Attack Surface Analysis

## Purpose
Provides structured, repeatable threat modeling using STRIDE, Abuse Cases, and Attack Trees tailored specifically to a high-sensitivity multi-tenant legal platform. It identifies assets, trust boundaries, entry points, adversary capabilities, and residual risks across application components.

## When To Use
- Trigger with `run mehla threat model` or before implementing any new architecture component.
- Auditing new integration points (e.g. Government APIs, Wathiq, Najiz extension, WhatsLine, Mobile.net).
- Reviewing sensitive user flows: Client Portal OTP login (`/portal/$slug`), Public Document e-Signing (`/sign/$token`), Payment webhooks, AI Copilot data retrieval.

## Inputs Required
- Component architecture or data flow description.
- Involved external and internal entities (Browser, Edge Server, Database, External APIs).
- Data assets traversing the flow (Tokens, Legal Memos, Court Decisions, Client PII).

## Read-only Default
Executes in purely analytical and read-only mode. Generates threat matrices, data flow diagrams, and control recommendations without altering application source code or configurations.

## Steps
1. **Asset Identification**:
   - Inventory key assets: Case documents, Client PII, Lawyer notes, OTP tokens, HMAC session keys, Billing records, System credentials.
2. **Trust Boundary & Entry Point Mapping**:
   - Map trust boundaries: Client Browser <-> Edge Proxy <-> TanStack SSR <-> Supabase DB <-> Third-Party APIs.
3. **STRIDE Analysis**:
   - **Spoofing**: Can an attacker forge identities or tenant identifiers?
   - **Tampering**: Can payload variables, prices, case statuses, or signatures be modified in transit?
   - **Repudiation**: Can a user deny signing a contract or viewing confidential evidence?
   - **Information Disclosure**: Can cross-tenant leakage or verbose errors expose private litigation?
   - **Denial of Service**: Can unauthenticated endpoints (e.g., OTP requests, PDF generators) be spammed to exhaust quotas or compute?
   - **Elevation of Privilege**: Can a regular lawyer or client elevate to office owner or platform superadmin?
4. **Abuse-Case & Attack-Tree Synthesis**:
   - Build practical attack trees for the highest-impact threats (e.g., "Exfiltrate Case Files of Rival Firm").
5. **Mitigation & Residual Risk Scoring**:
   - Score threats using standard Severity (CRITICAL, HIGH, MEDIUM, LOW) and define concrete mitigations.

## Security Checks
- [ ] Are all boundary crossings protected by mutual authentication or cryptographic tokens?
- [ ] Is rate limiting enforced on public endpoints prone to Denial of Wallet / Resource Exhaustion?
- [ ] Are indirect object references (BOLA/IDOR) structurally prevented via tenant scoping?
- [ ] Is input sanitized before reaching external command or SQL execution?
- [ ] Are replay attacks prevented via nonces, timestamps, and idempotency keys on webhooks?

## Evidence Requirements
- Document exact data flow paths with entry and exit points.
- Map threats to specific STRIDE categories with realistic attack preconditions.
- Detail the exact failure mode if a proposed control is omitted.

## Output Format
```markdown
### 🎯 MEHLA Threat Model: [Component Name]

#### 1. Assets & Trust Boundaries
- **Assets**: [List of protected data entities]
- **Trust Boundaries**: [Client -> Edge -> DB -> Third Party]

#### 2. STRIDE Threat Analysis Matrix
| Threat ID | STRIDE Category | Attack Scenario | Likelihood | Impact | Severity | Countermeasure |
|---|---|---|---|---|---|---|
| TM-01 | Elevation of Privilege | Attacker tampers with user role in request payload | Low | Critical | HIGH | Role enforcement locked to DB JWT claim |

#### 3. Residual Risk Assessment
- **Identified Critical Risks**: [0]
- **Residual Risk Level**: [LOW / ACCEPTABLE / UNACCEPTABLE]
```

## Standards Baseline & References
- **NIST SP 800-218 SSDF**: PW.1.1 (Analyze Software Architecture and Design)
- **OWASP Threat Dragon / STRIDE Framework**
- **OWASP Top 10 (2025)** & **OWASP API Security Top 10 (2023)**
