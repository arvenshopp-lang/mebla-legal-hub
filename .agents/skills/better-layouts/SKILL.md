---
name: better-layouts
description: Multi-device responsive layout architecture and grid engineering for enterprise SaaS. Enforces adaptive fluid containers, master-detail dual panes, sticky action toolbars, auto-fit KPI grids, and iOS safe-area ergonomics.
license: MIT
---

# Better Layouts — Master Responsive Layout & Grid Engineering

## Overview
`better-layouts` provides battle-tested layout patterns for complex, data-heavy legal workflows. It ensures that dashboards, case files, contract editors, and document viewers adapt seamlessly from ultra-wide 4K desktop displays down to compact mobile phones.

---

## 1. Breakpoint Taxonomy & Responsive Strategy

| Breakpoint | Width | Typical Device | Layout Behavior |
| :--- | :--- | :--- | :--- |
| **Mobile (`<640px`)** | 375px - 639px | iPhone / Android | 1-column stack, collapsible drawer navigation, bottom sheets, full-width cards |
| **Tablet (`sm / md`)** | 640px - 1023px | iPad / Surface | 2-column grids, collapsible sidebar icon rail, adaptive split view |
| **Desktop (`lg / xl`)** | 1024px - 1535px | Laptop / Desktop | Full sidebar + main workbench + dual-pane split view, 4-column KPI grids |
| **Wide (`2xl+`)** | 1536px+ | Ultrawide / 4K | Centered fluid container (`max-w-7xl` or `max-w-screen-2xl`) to prevent awkward line lengths |

---

## 2. Standard Layout Blueprints

### 2.1 The Dashboard Shell (الهيكل الرئيسي للمنصة)
```tsx
<div className="flex min-h-screen bg-background text-foreground" dir="rtl">
  {/* Desktop Persistent Sidebar */}
  <aside className="hidden lg:flex w-64 flex-col border-l border-border/70 bg-card p-4">
    {/* Nav items */}
  </aside>

  {/* Main Content Viewport */}
  <div className="flex flex-1 flex-col overflow-x-hidden">
    {/* Sticky Topbar with Glassmorphism */}
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/80 px-4 sm:px-6 backdrop-blur-md">
      {/* Mobile Drawer Trigger + Search + Notifications + Profile */}
    </header>

    {/* Content Container */}
    <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {children}
    </main>
  </div>
</div>
```

### 2.2 Adaptive KPI Metric Grids (شبكة الإحصائيات التلقائية)
```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {/* KPI Cards */}
</div>
```

### 2.3 Master-Detail Dual Pane (القضايا + المحامية بيان)
* On **Desktop (`lg+`)**: Main case details on right, side drawer or persistent assistant panel on left (`w-96` or `w-1/3`).
* On **Mobile (`<lg`)**: Full-screen case details with a floating action button (FAB) opening a full-height bottom-sheet drawer.

### 2.4 Sticky Action Toolbars
* Sticky filter bars and action headers (`sticky top-16 z-20 bg-background/90 backdrop-blur-sm p-4 rounded-xl border border-border/60`).

---

## 3. Mobile Ergonomics & Safe Areas (أجهزة الهواتف الذكية)
* Always add safe-area bottom padding for iOS home indicators:
  ```css
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  ```
* Avoid horizontal overflow (`overflow-x-hidden` on parent shells).
* Wrap data tables in scrollable containers with custom thin scrollbars:
  ```tsx
  <div className="overflow-x-auto rounded-xl border border-border/70">
    <table className="w-full text-right text-sm">...</table>
  </div>
  ```

---

## 4. Layout Quality Checklist
- [ ] Does the layout function without horizontal scrollbars at 375px width?
- [ ] Are containers constrained on wide monitors (`max-w-7xl` or `max-w-screen-2xl`)?
- [ ] Are sticky headers elevated with backdrop-blur for clean readability over scrollable content?
- [ ] Are KPI summary cards responsive from 1 column (mobile) to 4 columns (desktop)?
- [ ] Is iOS bottom safe area padding (`env(safe-area-inset-bottom)`) respected on mobile action bars?
