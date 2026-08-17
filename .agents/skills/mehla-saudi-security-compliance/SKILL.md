---
name: "mehla-saudi-security-compliance"
description: "Saudi National Cybersecurity Authority (NCA ECC/CSCC/DCC/CCC), Personal Data Protection Law (PDPL), SDAIA, CST, and ZATCA Phase 2 compliance mapping and gap analysis skill for MEHLA."
---

# MEHLA Saudi Cybersecurity & Regulatory Compliance Master Skill

## Purpose
Maps, assesses, and tracks MEHLA's technical security and privacy posture against the regulatory frameworks of the Kingdom of Saudi Arabia. Strictly avoids claiming full formal certification without audited evidence, using accurate maturity classifications.

## When To Use
- Trigger with `audit Saudi compliance` or when evaluating Saudi regulatory readiness.
- Reviewing compliance with Saudi Personal Data Protection Law (PDPL).
- Reviewing National Cybersecurity Authority (NCA) controls: ECC-1:2018, CSCC-1:2020, DCC-1:2022, CCC-2:2024.
- Preparing for enterprise legal client vendor risk assessments in Saudi Arabia.

## Strict Compliance Reporting Taxonomy
When reporting on any Saudi control or requirement, use ONLY the following classifications:
- **`CONTROL IMPLEMENTED`**: Fully built, verified with code/database evidence.
- **`PARTIAL`**: Partially implemented (e.g., control exists but lacks automated enforcement).
- **`NOT IMPLEMENTED`**: Requirement understood but not yet built.
- **`NOT APPLICABLE`**: Control does not apply to MEHLA's SaaS architecture.
- **`NOT VERIFIED`**: Requires third-party or production server verification.

## The 5 Saudi Regulatory Frameworks Mapped to MEHLA

### 1. Saudi Personal Data Protection Law (PDPL) — Royal Decree (M/148)
- **Data Residency**: Customer case data, personal data, and litigation documents must reside on infrastructure within the geographic borders of the Kingdom of Saudi Arabia.
- **Data Minimization**: Collect only necessary client information.
- **Data Subject Rights (DSR)**: Mechanism to fulfill requests for Access, Correction, and Destruction.
- **72h Breach Notification**: Documented procedure to notify SDAIA within 72 hours of a security incident.

### 2. NCA Essential Cybersecurity Controls (ECC-1:2018)
- Multi-factor authentication on administrative interfaces.
- Network segmentation, TLS 1.3 encryption in transit, AES-256 at rest.
- Regular vulnerability scanning and dependency audits in CI.

### 3. NCA Cloud Cybersecurity Controls for Subscribers (CSCC-1:2020)
- Multi-tenant data segregation (guaranteeing complete isolation of tenant databases and storage).
- Customer-controlled data encryption and key management.
- Restricted and auditable vendor/support access.

### 4. SDAIA National Data Management & Personal Data Classification (NDMO)
- 4-tier data classification: Top Secret (خزينة المستندات والأدلة), Secret (الهويات والبيانات البنكية), Restricted (المهام وسجلات العمل), Public (الاشتراكات والتسويق).

### 5. ZATCA Phase 2 E-Invoicing (Fatoora)
- Generation of compliant XML/JSON invoices with cryptographic stamps and QR codes for legal fee claims.

## Output Format
```markdown
### 🇸🇦 MEHLA Saudi Cybersecurity & Privacy Compliance Matrix

#### 1. Compliance Summary
- **Target Jurisdiction**: Kingdom of Saudi Arabia (KSA)
- **Primary Regulators**: NCA, SDAIA, CST, ZATCA

#### 2. Regulatory Alignment Table
| Framework | Domain / Control | Requirement | Status | MEHLA Implementation Evidence |
|---|---|---|---|---|
| PDPL Art. 4 | Data Subject Rights | Access & Correction API | CONTROL IMPLEMENTED | `src/lib/client-portal/` |
| PDPL Art. 24 | Incident Notification | 72h Notice Protocol | CONTROL IMPLEMENTED | `mehla-incident-response` |
| CSCC-1:2020 | Tenant Isolation | DB Row Level Security | CONTROL IMPLEMENTED | Supabase RLS migrations |
| ECC-1:2018 | Privileged Access | Admin MFA (AAL2) | CONTROL IMPLEMENTED | `admin-guard.server.ts` |
| ZATCA | E-Invoicing | QR Code on Invoices | CONTROL IMPLEMENTED | `src/lib/office-billing/` |

#### 3. Gap Analysis & Next Steps
- **Identified Gaps**: [List of items requiring production server migration]
```

## Standards Baseline & References
- **NCA ECC-1:2018**: Essential Cybersecurity Controls
- **NCA CSCC-1:2020**: Cloud Cybersecurity Controls (Subscribers)
- **Saudi PDPL (نظام حماية البيانات الشخصية)**: 1444H / 2023 & Executive Regulations
- **ZATCA E-Invoicing Regulations**: Phase 2 Integration
