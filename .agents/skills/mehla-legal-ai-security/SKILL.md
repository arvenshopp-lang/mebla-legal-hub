---
name: "mehla-legal-ai-security"
description: "Legal AI domain security, statutory provenance, citation integrity, anti-hallucination guardrails, and judicial privilege protection skill for MEHLA and Bayan Copilot."
---

# MEHLA Legal AI Security & Provenance Master Skill

## Purpose
Secures specialized Legal AI systems in MEHLA (distinct from general AI security). Enforces judicial accuracy, statutory provenance, citation verification, prevention of legal hallucinations, and protection of attorney-client privilege.

## When To Use
- Trigger with `audit legal AI security` or when modifying «المحامية بيان» legal reasoning engine (`src/lib/ai/saudi-legal-corpus.server.ts`, `src/lib/ai/bayan-copilot.server.ts`).
- Reviewing automated memo drafting, contract analysis, and statutory citation generation.
- Auditing legal consultation outputs to ensure ethical and professional compliance.

## Core Legal AI Guardrails & Rules

### 1. Mandatory Statutory Citation & Provenance
- Every legal assertion, claim, or statutory interpretation MUST cite the exact Saudi law name, Article Number, and Royal Decree (e.g. `المادة 77 من نظام العمل الصادر بالمرسوم الملكي م/51 وتعديلاته م/164`).
- Unsubstantiated legal claims or fictional statutory citations are strictly prohibited (Zero Tolerance for Legal Hallucinations).

### 2. Attorney-Client Privilege & Confidentiality Boundaries
- The Legal AI engine must treat all case details and client communications as privileged attorney-client work product under Article 11 of the Saudi Code of Law Practice.
- Case facts from Case A must NEVER be used to answer queries or generate suggestions for Case B, even within the same law firm, if marked confidential or assigned to a different legal team.

### 3. Clear Disclaimer & Human-in-the-Loop Mandate
- Legal AI outputs must always be labeled as: **"تحليل استرشادي للمحامي يتطلب المراجعة والاعتماد المهني"**.
- The AI must never represent itself as a licensed human attorney or issuing binding judicial rulings.

### 4. Statutory Versioning & Date Awareness
- The Legal AI corpus must ground responses in the current, active version of Saudi laws (e.g. recognizing the Civil Transactions Law of 1444H and the 1446H amendments to the Labor Law).

## Security Checks
- [ ] Are all statutory references grounded in `SAUDI_LEGAL_ENCYCLOPEDIA`?
- [ ] Is confidential case data isolated from global AI context?
- [ ] Is human review explicitly required before submitting AI-drafted legal memos to court portals?

## Output Format
```markdown
### ⚖️ MEHLA Legal AI Provenance & Security Report

#### 1. Legal AI Posture
- **Corpus Version**: [75+ Saudi Statutes & Supreme Court Principles Active]
- **Citation Provenance**: [100% GROUNDED IN ROYAL DECREES]
- **Attorney-Client Privilege**: [ENFORCED]

#### 2. Verdict
- **Status**: [LEGAL_AI_SECURITY_VERIFIED]
```

## Standards Baseline & References
- **Saudi Code of Law Practice (نظام المحاماة)**: Royal Decree (M/38) & Code of Professional Conduct
- **SDAIA AI Ethics Principles (مبادئ أخلاقيات الذكاء الاصطناعي)**: Fairness, Reliability, Transparency & Accountability
