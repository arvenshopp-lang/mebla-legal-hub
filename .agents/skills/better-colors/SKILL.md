---
name: better-colors
description: Master color palette engineering and semantic token architecture for SaaS applications. Enforces dignified brand palettes, dark/light theme harmony, surface depth tokens, accessible contrast (WCAG 2.2 AA), and functional state colors.
license: MIT
---

# Better Colors — Master Palette & Semantic Color Architecture

## Overview
`better-colors` provides a structured, mathematically sound color token system. It preserves MEHLA's distinctive brand identity (Deep Navy, Judicial Emerald, Warm Gold Accents) while delivering consistent dark/light mode balance and accessible contrast ratios.

---

## 1. Core Brand Identity (لوحة الألوان الملكية الوقورة)

### 1.1 Palette DNA
* **Primary Brand (الكحلي الملكي الوقور)**: Deep Regal Navy (`#0F172A` / `#1E293B` in dark mode, `#0B132B` to `#1C2541`). Represents judicial authority, stability, and integrity.
* **Secondary Brand (الزمردي القضائي)**: Emerald Justice (`#059669` / `#10B981`). Represents victory, compliance, active cases, and verified status.
* **Accent Highlight (الذهبي الفاخر)**: Imperial Gold / Radiant Amber (`#D97706` / `#F59E0B`). Used sparingly for AI highlights (المحامية بيان ✨), urgent deadlines, and VIP subscriptions.
* **Neutral Surfaces (الأسطح المحايدة)**: Warm Slate and Crisp White (`#F8FAFC`, `#FFFFFF`, `#0F172A`).

---

## 2. Semantic Token System (نظام المتغيرات الدلالية)

### 2.1 Surface Elevation Tokens (طبقات الأسطح)
Never use raw hex colors in component code. Always use semantic CSS tokens:
1. `bg-background`: The canvas base (Light: `#FFFFFF` / `#F8FAFC`, Dark: `#0B0F19`).
2. `bg-card` / `bg-surface`: Elevated containers, case cards, and panels.
3. `bg-muted`: Secondary recessed backgrounds, table headers, search input fields (`bg-muted/50`).
4. `bg-popover`: Floating dropdowns, tooltips, dialogs, and context menus (`backdrop-blur-md`).

### 2.2 Functional Status Colors (ألوان الحالات الوظيفية)
Every status tag, badge, and alert must use a semantic 3-tier color formula:
* **Background Pill**: `bg-[color]-500/10` (Soft 10% opacity wash)
* **Text / Icon**: `text-[color]-700` (Light mode) or `text-[color]-400` (Dark mode)
* **Border**: `border-[color]-500/20` (Subtle 20% border)

```tsx
// Example Status Badge Pattern
<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
  <CheckCircle className="h-3.5 w-3.5" />
  <span>مكتملة / سارية</span>
</span>
```

### 2.3 Status Color Reference
| State | Color Family | Light Mode Text | Dark Mode Text | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Active / Success** | Emerald | `text-emerald-700` | `text-emerald-400` | الحكم لصالح الموكل، عقد ساري، جلسة مكتملة |
| **Pending / In Progress** | Sky / Blue | `text-blue-700` | `text-blue-400` | قيد الدراسة، جلسة قادمة، مراجعة المستند |
| **Warning / Urgent** | Amber / Gold | `text-amber-700` | `text-amber-400` | مهلة تنتهي قريباً (<48 ساعة)، سداد مطلوب |
| **Destructive / Error** | Rose / Crimson | `text-rose-700` | `text-rose-400` | حكم خاسر، مهلة منتهية، إلغاء الوكالة، خطأ |
| **Neutral / Archived** | Slate / Gray | `text-slate-600` | `text-slate-400` | قضية مغلقة، مسودة أولية، غير نشط |
| **AI / Copilot ✨** | Indigo / Violet | `text-indigo-700` | `text-indigo-400` | المحامية بيان، الفهرسة الذكية، تلخيص الوقائع |

---

## 3. Borders & Shadows Architecture
* **Subtle Layered Borders**: Use `border border-border/60` or `border-border/80` instead of harsh solid black lines.
* **Glow & Shadow Elevation**:
  - `shadow-sm`: Standard table rows, inputs.
  - `shadow-md`: Hovered cards, summary KPI widgets.
  - `shadow-xl`: Drawers, dialogs, floating action buttons.
  - `shadow-[color]/15`: Colored glow on primary CTAs (e.g. `hover:shadow-primary/20`).

---

## 4. Color Contrast & Accessibility Matrix
- [ ] All text on backgrounds satisfies WCAG 2.2 AA (minimum 4.5:1 ratio).
- [ ] Large headings ($\ge 18\text{pt}$) satisfy at least 3:1 ratio.
- [ ] Color is never the sole indicator of state (always accompany with icons or text labels).
- [ ] Dark mode maintains equivalent visual hierarchy without stark eye fatigue.
