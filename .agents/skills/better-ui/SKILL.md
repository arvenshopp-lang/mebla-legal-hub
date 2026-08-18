---
name: better-ui
description: Professional UI craftsmanship and component engineering for modern SaaS applications. Enforces meticulous component anatomy, interaction states, visual elevation, micro-interactions, responsive touch targets, and dignified legal product design.
license: MIT
---

# Better UI — Master Design & Component Craftsmanship

## Overview
`better-ui` is the master skill for crafting high-polish, dignified, and tactile user interfaces. It transforms generic UI components into bespoke, responsive, and delightful interactions tailored specifically for enterprise legal SaaS (MEHLA).

---

## 1. Core Visual Principles

### 1.1 Dignity Over Gimmicks (وقار التصميم القانوني)
* Legal professionals work in high-stakes environments. The UI must convey **trust, precision, gravitas, and authority**.
* Avoid childish animations, excessive bouncing, or over-saturated candy gradients.
* Prioritize crisp borders (`border-border/60`), subtle background layering (`bg-card`, `bg-muted/40`, `bg-surface`), and disciplined shadow elevations.

### 1.2 Component States Mastery (دورة حياة الحالات التفاعلية)
Every interactive element must explicitly define and handle all 7 states:
1. **Default**: Crisp, clear contrast, intuitive affordance.
2. **Hover**: Smooth color/border transition (`transition-all duration-150 ease-out`), subtle scale or background brightening.
3. **Focus-Visible**: Distinct high-contrast focus ring (`ring-2 ring-primary ring-offset-2`). Never hide outline for keyboard users.
4. **Active (Pressed)**: Subtle scale down (`active:scale-[0.98]` or `active:translate-y-0.5`).
5. **Disabled**: Clear reduced opacity (`opacity-50 pointer-events-none cursor-not-allowed`) with informative tooltips explaining why.
6. **Loading / Busy**: Integrated spinner (`lucide-react` spin animation) with preserved layout width to prevent layout shifts (CLS).
7. **Empty / Error**: Human-centric empty states with clear calls-to-action (CTA) and descriptive recovery paths.

---

## 2. Component Design Specifications

### 2.1 Buttons & Action Triggers
* **Hierarchy**:
  - `Primary`: Solid primary brand color for the single main page action (e.g. "حفظ القضية", "إنشاء عقد").
  - `Secondary / Outline`: Bordered for secondary flows (e.g. "تعديل", "تصدير").
  - `Ghost / Subtle`: Minimalist for toolbar actions and table row icons.
  - `Destructive`: Controlled crimson/rose red for permanent actions with confirmation modal.
* **Touch Target**: Minimum height `44px` on mobile screens, `36px-40px` on desktop.

### 2.2 Cards, Panels & Modals
* **Borders & Radii**:
  - Small elements (badges, buttons): `rounded-lg` (8px).
  - Cards & inputs: `rounded-xl` (12px).
  - Modals, Drawers & Dashboard Banners: `rounded-2xl` (16px).
* **Glassmorphism with Restraint**:
  - Backdrop blur (`backdrop-blur-md bg-background/80`) reserved for sticky headers, modal overlays, and floating action bars.

### 2.3 Data Tables & High-Density Views
* Alternating subtle hover states on table rows (`hover:bg-muted/50 transition-colors`).
* Sticky table headers for long scrolls.
* Truncate long Arabic text with tooltips to prevent awkward wrapping.
* Action menus on the far left (in RTL) with clear kebab (`MoreVertical`) dropdowns.

---

## 3. Implementation Checklist
- [ ] Are all hover, active, focus-visible, and disabled states styled?
- [ ] Is layout shift (CLS) eliminated during loading and async data fetching?
- [ ] Are mobile touch targets $\ge 44\times 44\text{px}$?
- [ ] Do modals and drawers support click-outside and `Escape` key dismiss?
- [ ] Is there clear visual feedback (Toast / Badge) for all user actions?
