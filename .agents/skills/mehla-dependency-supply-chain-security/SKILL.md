---
name: "mehla-dependency-supply-chain-security"
description: "Software Bill of Materials (SBOM), dependency vulnerability scanning (CVEs), lockfile integrity, typosquatting prevention, and supply chain security auditor for MEHLA."
---

# MEHLA Dependency & Supply Chain Security Master Skill

## Purpose
Governs software supply chain integrity for MEHLA. Evaluates third-party npm packages, locked dependency trees, Software Bill of Materials (SBOM / CycloneDX), known CVEs, malicious package detection, install script safety, and provenance verification.

## When To Use
- Trigger with `audit dependencies` or before adding/upgrading packages in `package.json`.
- Reviewing Dependabot / OSV security vulnerability alerts.
- Generating or auditing CycloneDX / SPDX SBOM manifests.
- Pre-release security gates.

## Strict Rules
1. **Never update dependencies automatically** without human assessment and explicit approval.
2. The sequence is strictly: **ASSESS -> PROPOSE -> AWAIT APPROVAL -> EXECUTE & VERIFY**.
3. Direct commits modifying `package.json` or `package-lock.json` must be tested against `npm run build` and security scans.

## Technical Checks & Evaluation Criteria

### 1. Known Vulnerability Scanning
- Run `npm audit` or `bun audit` to identify known CVEs.
- Classify by severity:
  - **CRITICAL / HIGH**: Blocker for release; must be mitigated or replaced.
  - **MEDIUM / LOW**: Evaluated for reachability (is the vulnerable function executed in MEHLA?).

### 2. Malicious Package & Typosquatting Defense
- Verify package popularity, maintainer history, and publish dates before introducing new libraries.
- Reject unmaintained libraries (> 2 years without commits) for critical legal or cryptographic paths.
- Audit `postinstall` / `preinstall` scripts in packages to prevent build-time remote code execution.

### 3. Lockfile Integrity & Pinned Versions
- Ensure `package-lock.json` / `pnpm-lock.yaml` is committed and enforced in CI (`npm ci` / `bun install --frozen-lockfile`).
- Prevent arbitrary floating version ranges (`*` or `latest`).

### 4. Software Bill of Materials (SBOM)
- Support generation of CycloneDX 1.6 / SPDX 2.3 JSON manifests for enterprise legal SaaS compliance.

## Output Format
```markdown
### 📦 MEHLA Dependency & Supply Chain Audit

#### 1. Audit Summary
- **Total Dependencies**: [X packages]
- **Critical / High CVEs**: [0]
- **Lockfile Status**: [FROZEN & VERIFIED]

#### 2. Vulnerability Assessment Matrix
| Package | Version | CVE ID | Severity | Reachability in MEHLA | Proposed Fix |
|---|---|---|---|---|---|
| None | - | - | - | - | - |
```

## Standards Baseline & References
- **NIST SP 800-218 SSDF**: PS.1.1 (Protect All Software from Unauthorized Access) & PW.4.1 (Reuse Secure Third-Party Software)
- **SLSA (Supply-chain Levels for Software Artifacts)**: Level 2 / Level 3 Readiness
- **CycloneDX**: Specification v1.6 (Status: Stable)
