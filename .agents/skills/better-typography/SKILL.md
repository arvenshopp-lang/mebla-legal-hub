---
name: better-typography
description: Advanced Arabic & Latin typography engineering for SaaS applications. Enforces modular type scales, RTL cursive script rules, tabular numerals for legal/financial figures, optical vertical rhythm, and line-height calibration.
license: MIT
---

# Better Typography — Master Arabic & Latin Type System

## Overview
`better-typography` sets rigorous typography standards for bilingual (Arabic RTL & English LTR) enterprise legal platforms. It ensures effortless readability, optimal scanability for lengthy legal briefs, and flawless numerical formatting for court cases and accounting.

---

## 1. Golden Rules of Arabic Typography (قواعد الطباعة العربية الحديثة)

### 1.1 Never Break Arabic Cursive Ligatures (تحذير تباعد الحروف)
> [!CAUTION]
> **DO NOT USE `tracking-wide` or positive `letter-spacing` on Arabic text.**
> Arabic is a cursive script where letters connect. Expanding letter spacing breaks the glyph connections (ligatures) and produces broken, amateurish typography.
> - **Arabic Text**: Use `tracking-normal` or `tracking-tight` (for large display headings only).
> - **English / Monospace / Numbers**: Positive tracking is allowed only on Latin uppercase labels and code tokens.

### 1.2 Line Height Calibration for Arabic (ارتفاع السطور)
* Arabic characters have higher ascenders (الألف، اللام، الكاف) and lower descenders (الياء، الراء، النون، الميم) compared to Latin text.
* Always provide generous line height for Arabic content:
  - Long paragraphs / Legal Briefs: `leading-relaxed` (1.625) to `leading-loose` (1.75).
  - Headings & Titles: `leading-snug` (1.3) to `leading-normal` (1.4).
  - Inputs & Small Badges: `leading-none` or `leading-normal`.

### 1.3 Tabular Numerals for Financial & Legal Numbers (الأرقام الجدولية)
* Court case numbers, Saudi Riyal currency amounts, dates, Hijri/Gregorian timelines, and percentage stats must use `tabular-nums` (`font-mono` or `font-variant-numeric: tabular-nums`).
* This ensures all digits occupy equal width, preventing jitter and misalignment in tables and accounting invoices.

---

## 2. Modular Typography Scale

| Role | Tailwind Class | Desktop Size | Line Height | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Hero** | `text-3xl md:text-4xl` | 32px - 36px | `leading-tight` | `font-black` | Landing page hero, primary dashboard greeting |
| **Heading 1 (Page Title)** | `text-2xl md:text-3xl` | 24px - 28px | `leading-snug` | `font-bold` | Main page titles (`/cases`, `/contracts`, `/calendar`) |
| **Heading 2 (Section Title)** | `text-lg md:text-xl` | 18px - 20px | `leading-snug` | `font-bold` | Card headers, modal titles, drawer headings |
| **Heading 3 (Card Title)** | `text-base md:text-lg` | 16px - 17px | `leading-normal` | `font-semibold` | Sub-sections, table column headers, form group titles |
| **Body Default** | `text-sm` | 14px | `leading-relaxed` | `font-normal` | Main content, case descriptions, table cell text |
| **Caption / Meta** | `text-xs` | 12px | `leading-normal` | `font-medium` | Timestamps, status labels, secondary metadata |
| **Overline / Category** | `text-[11px]` | 11px | `leading-none` | `font-bold` | Category badges, breadcrumbs, table overline tags |

---

## 3. High-Contrast Text Hierarchy
* **Primary Foreground**: `text-foreground` (Dark Charcoal / Pure White in dark mode) for headings and vital text.
* **Secondary Foreground**: `text-muted-foreground` (Slate 500/400) for metadata, labels, and helper notes.
* **Tertiary / Subdued**: `text-muted-foreground/70` for subtle hints, disabled text, and timestamps.
* **Brand Accent**: `text-primary` or `text-amber-600` for active states, link anchors, and highlights.

---

## 4. Typography Checklist
- [ ] Is `tracking-wide` eliminated on all Arabic text?
- [ ] Are all currency amounts (SAR) and case numbers styled with `tabular-nums` / `font-mono`?
- [ ] Are paragraph texts given at least `leading-relaxed`?
- [ ] Is text truncation (`truncate` or `line-clamp-2`) applied on long user inputs with tooltip hover?
- [ ] Is contrast ratio $\ge 4.5:1$ for all body text and $\ge 3:1$ for large titles?
