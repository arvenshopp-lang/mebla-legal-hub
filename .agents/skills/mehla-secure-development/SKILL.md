---
name: "mehla-secure-development"
description: "Master Secure Software Development Lifecycle (SSDLC) skill for MEHLA Legal SaaS. Enforces Security Impact Assessments (SIA), Secure by Design, Least Privilege, Fail-Secure, Tenant Isolation, and Security Quality Gates before, during, and after any feature engineering."
---

# MEHLA Master Secure Development (SSDLC)

## Purpose
Establishes the mandatory secure development lifecycle for all feature development, refactoring, and integrations on the MEHLA High-Sensitivity Multi-Tenant Legal SaaS platform. Ensures that security is built-in from concept to deployment without introducing regressions, cross-tenant leakages, or security blindspots.

## When To Use
- Initiating any new feature, module, or user workflow (e.g., Client Portal, Wathiq queries, Contracts Lifecycle, AI integrations).
- Refactoring backend server functions, RPCs, database schemas, or authentication logic.
- Performing a mandatory **Security Impact Assessment (SIA)** prior to writing production code.
- Defining security acceptance criteria and negative test cases for user stories.

## Inputs Required
- Feature functional specifications or design document.
- Target data classification (Top Secret, Secret, Restricted, Public).
- Interacting actors (Office Owner, Lawyer, Client, Support Admin, Unauthenticated Public).
- External integrations involved (e.g., Mobile.net, WhatsLine, Wathiq, Najiz, Cloud Storage).

## Read-only Default
This skill operates strictly in **Read-Only / Assessment Mode** by default. It evaluates requirements, discovers threats, mandates controls, and defines test cases. No production modifications or database alterations are performed without explicit user sign-off.

## Steps
1. **Scope & Sensitivity Classification**:
   - Classify all data entities involved according to MEHLA's 4-tier data classification (Top Secret: legal vaults, credentials; Secret: PII, national IDs, billing; Restricted: internal tasks; Public: plan tiers).
2. **Security Impact Assessment (SIA)**:
   - Identify new trust boundaries, entry points, and authentication requirements.
   - Verify tenant boundary enforcement (`organization_id` mandatory in every query and mutation).
3. **Control Selection & Baseline Mapping**:
   - Map feature against OWASP ASVS 5.0 Level 2 controls and NIST SP 800-218 SSDF v1.1.
   - Select mandatory cryptographic, authentication, and authorization guardrails.
4. **Negative & Abuse Case Formulation**:
   - Define at least 3 negative abuse cases per feature (e.g., Tenant B attempting to access Tenant A's contract; parameter tampering; replay attacks).
5. **Pre-Implementation Security Gate Approval**:
   - Produce the Security Blueprint and wait for developer/admin review before coding.

## Security Checks
- [ ] **Tenant Scoping**: Are all queries, inserts, updates, and deletes scoped by `organization_id`?
- [ ] **Authentication Required**: Is unauthenticated access denied by default (`Deny by Default`)?
- [ ] **Input Validation**: Are all inputs strictly validated with Zod schemas with finite bounds and strict types?
- [ ] **Output Encoding**: Is all user-supplied data sanitized and encoded to prevent XSS in rendering and PDF generation?
- [ ] **Secrets Handling**: Are zero API keys, service role tokens, or passwords present in client bundles or git?
- [ ] **Fail-Secure Architecture**: Do authorization failures and external integration timeouts fail closed (return `FORBIDDEN` or safe error)?
- [ ] **Audit Trail**: Are state-changing mutations and privileged data accesses logged with correlation IDs?

## Evidence Requirements
Any identified security risk or gap must provide:
- `SIA-ID`: Unique tracking identifier.
- `Component`: Exact file path and route / RPC name.
- `Threat`: Specific abuse vector (e.g., IDOR, Missing RLS, Missing Rate Limit).
- `Impact`: Business and compliance consequence under Saudi PDPL / Legal Privilege.
- `Required Control`: Explicit code/database guardrail required prior to release.

## Severity Model
- **CRITICAL**: Cross-tenant boundary breach, unauthenticated data access, RCE, leaked master secrets.
- **HIGH**: Privilege escalation within an organization, client PII exposure, unverified file uploads.
- **MEDIUM**: Missing rate limits, verbose error messages in API responses, weak password policies.
- **LOW**: Minor security header misconfigurations, telemetry leaks without PII.
- **INFO**: Hardening opportunities and defensive architectural recommendations.

## Output Format
```markdown
### 🛡️ MEHLA Security Impact Assessment (SIA)
- **Feature Name**: [Feature Title]
- **Sensitivity Level**: [HIGH-SENSITIVITY / CONFIDENTIAL]
- **Target Actors**: [Lawyer, Client, Admin, Anon]

#### 1. Security Requirements & Controls Matrix
| Req ID | Security Requirement | Control Mechanism | ASVS / NIST Ref |
|---|---|---|---|
| SEC-01 | Tenant Isolation | Organization ID binding & RLS | ASVS 5.0.0 4.1 |

#### 2. Threat & Abuse Scenarios
- **Scenario A**: [Description of malicious attempt] -> **Mitigation**: [Applied Guardrail]

#### 3. Security Quality Gate Status
- **Verdict**: [APPROVED / REQUIRES_CHANGES / BLOCKED]
```

## Stop Conditions
- Stop immediately if a feature proposes bypassing Supabase RLS without an approved `SECURITY DEFINER` documented review.
- Stop if an external integration requires storing client passwords in plaintext.

## Prohibited Actions
- Never generate client-side authorization as the sole security boundary.
- Never disable automated guardrail checks in CI (`bun run security:check`).
- Never introduce dependencies with known High/Critical CVEs.

## Standards Baseline & References
- **OWASP ASVS**: 5.0.0 (Status: Stable | Checked: 2026-08)
- **NIST SSDF**: SP 800-218 v1.1 (Status: Final | Baseline)
- **CISA**: Secure by Design & Secure by Default Guidance (2024-2026)
- **MEHLA Docs**: `docs/security-guardrails.md` & `docs/saudi_cybersecurity_master_blueprint.md`
