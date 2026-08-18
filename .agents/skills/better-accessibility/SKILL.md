---
name: better-accessibility
description: Production-grade accessibility (a11y) engineering and WCAG 2.2 AA compliance for web applications. Enforces full keyboard navigation, screen reader optimization, ARIA landmarks, focus rings, minimum touch targets, and reduced-motion safety.
license: MIT
---

# Better Accessibility — WCAG 2.2 AA Master Engineering

## Overview
`better-accessibility` ensures every component, route, and modal in the MEHLA platform is accessible to all users regardless of motor, visual, or cognitive abilities. It provides strict automated and architectural patterns for WCAG 2.2 AA compliance.

---

## 1. Keyboard Navigability (التنقل الكامل عبر لوحة المفاتيح)

### 1.1 Natural Tab Sequence & Interactive Traps
* Every actionable element (`<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`) must be reachable via `Tab` key in natural reading order (Right-to-Left in Arabic).
* **Modal & Drawer Focus Trapping**:
  - When a modal/drawer opens, focus must automatically move inside the container.
  - Tabbing must cycle exclusively within the modal until closed.
  - Pressing `Escape` must immediately close the modal and return focus to the trigger button.

### 1.2 Unmissable Focus Rings (مؤشر التركيز البصري)
Never remove outlines with `outline-none` unless replacing with an accessible `focus-visible` ring:
```tsx
// Compliant Focus Ring Class
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
```

---

## 2. Screen Readers & Semantic HTML (التوافق مع قارئات الشاشة)

### 2.1 Landmark Elements
Always structure pages with semantic HTML landmarks:
* `<header role="banner">`: Navigation topbar, user profile menu.
* `<nav aria-label="القائمة الرئيسية">`: Sidebar and breadcrumbs.
* `<main id="main-content">`: Main dashboard content and case workbenches.
* `<aside>`: Bayan AI Copilot drawer, side filters.
* `<footer>`: Status bar, copyright, support links.

### 2.2 Accessible Icon Buttons
Every icon-only button must have an explicit `aria-label` in Arabic:
```tsx
// Incorrect:
<button onClick={handlePrint}><Printer className="h-4 w-4" /></button>

// Correct:
<button
  onClick={handlePrint}
  aria-label="طباعة تقرير القضية"
  title="طباعة تقرير القضية"
  className="..."
>
  <Printer className="h-4 w-4" aria-hidden="true" />
</button>
```

### 2.3 Dynamic Live Announcements (`aria-live`)
* Use `aria-live="polite"` on search count badges, AI generation status, and real-time form validations so screen readers announce changes without interrupting speech.

---

## 3. Touch Target Ergonomics & Motion Safety

### 3.1 44px Minimum Touch Area
* All interactive touch targets on mobile and tablet must measure at least `44px × 44px` (or use invisible hit-padding with `-m-2 p-2`).

### 3.2 Respect `prefers-reduced-motion`
* Wrap all CSS animations and transitions with motion reduction fallbacks:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 4. Accessibility Audit Checklist
- [ ] Can the entire application be operated without touching a mouse?
- [ ] Does pressing `Escape` dismiss all open menus, modals, and drawers?
- [ ] Do all icon-only buttons have descriptive `aria-label` attributes?
- [ ] Are all form inputs explicitly associated with `<label htmlFor="...">`?
- [ ] Are color contrast ratios $\ge 4.5:1$ across all pages?
- [ ] Are mobile touch targets $\ge 44\times 44\text{px}$?
