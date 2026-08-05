# AutoAnki Application Design System & Context Reference

This document is the authoritative design system reference for the **AutoAnki App**. It defines all visual themes, color palettes, neumorphic UI standards, button variants, animations, Framer Motion parameters, typography, and component styling rules to ensure absolute consistency across current and future developments.

---

## 1. Core Color Palettes & Theme System

The application supports dual themes (**Light** and **Dark**) controlled by `settingsThemeMode`.

### Light Theme (`neu-bg-light`, `neu-card-light`, `neu-btn-light`)
- **Background Base**: `#e6ecf5` (Soft slate grey-blue)
- **Primary Text**: `#1e293b` (Slate 800)
- **Muted Text**: `#64748b` (Slate 500)
- **Highlight Drop Shadow**: `#ffffff` (Pure white top-left highlight)
- **Dark Drop Shadow**: `#c2c8d4` / `#c5cbd6` (Soft grey bottom-right depth shadow)
- **Pressed Inset Shadow**: `inset 4px 4px 8px #c5cbd6, inset -4px -4px 8px #ffffff`
- **Border Spec**: `1px solid rgba(255, 255, 255, 0.7)`

### Dark Theme (`neu-bg-dark`, `neu-card-dark`, `neu-btn-dark`)
- **Background Base**: `#222730` (Warm dark grey — **never pitch black `#000000`**)
- **Primary Text**: `#f1f5f9` (Slate 100)
- **Muted Text**: `#94a3b8` (Slate 400)
- **Highlight Drop Shadow**: `#2d3440` (Elevated dark highlight top-left)
- **Dark Drop Shadow**: `#171a20` (Deep shadow bottom-right)
- **Pressed Inset Shadow**: `inset 4px 4px 9px #171a20, inset -4px -4px 9px #2d3440`
- **Border Spec**: `1px solid rgba(255, 255, 255, 0.06)`

### Semantic Accents
- **Blue (Primary / Action)**: `#2563eb` (Light) / `#3b82f6` (Dark)
- **Purple (Gemini / AI Pipeline)**: `#8b5cf6` (Light) / `#6d28d9` (Dark)
- **Emerald (Success / Save / Complete)**: `#10b981` / `#059669`
- **Red (Danger / Delete / Remove)**: `#ef4444` / `#dc2626`

---

## 2. Neumorphic Elevation & Utility Classes

| Utility Class | Purpose | Light Spec (`#e6ecf5`) | Dark Spec (`#222730`) |
| :--- | :--- | :--- | :--- |
| `.neu-bg-*` | Container background | `#e6ecf5`, text `#1e293b` | `#222730`, text `#f1f5f9` |
| `.neu-card-*` | Main cards/panels | `shadow: 6px 6px 14px #c2c8d4, -6px -6px 14px #ffffff`, `radius: 1.5rem` | `shadow: 6px 6px 14px #171a20, -6px -6px 14px #2d3440`, `radius: 1.5rem` |
| `.neu-item-*` | Sub-items / List items | `shadow: 3px 3px 7px #c2c8d4, -3px -3px 7px #ffffff`, `radius: 0.85rem` | `shadow: 3px 3px 7px #171a20, -3px -3px 7px #2d3440`, `radius: 0.85rem` |
| `.neu-pressed-*` | Input fields / Inset areas | `shadow: inset 4px 4px 8px #c5cbd6, inset -4px -4px 8px #ffffff`, `radius: 1rem` | `shadow: inset 4px 4px 9px #171a20, inset -4px -4px 9px #2d3440`, `radius: 1rem` |
| `.neu-btn-*` | Interactive Neumorphic Buttons | Dual shadow elevated, inset on `:active` | Dual shadow elevated, inset on `:active` |
| `.neu-btn-accent-*` | Primary Gradient Action Buttons | `linear-gradient(145deg, #2563eb, #1d4ed8)` | `linear-gradient(145deg, #3b82f6, #2563eb)` |

---

## 3. Typography & Scrollbar Rules

### Typography
- **Primary Body**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- **Branding Header**: `'Bebas Neue'`, `sans-serif`
- **Data & Monospace**: `'Plus Jakarta Sans'`, `'Space Grotesk'`, `font-mono`

### Global Scrollbar Rule (Pure Neumorphic Cleanliness)
All scrollbars in the app are explicitly hidden while preserving full scrollability:
```css
*, .custom-scrollbar {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
::-webkit-scrollbar, .custom-scrollbar::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
```

---

## 4. Interactive Components & Button System

### `UiverseButton` Component (`src/components/UiverseButton.jsx`)
High-fidelity 3D Neumorphic button supporting:
- **Interactive Checkmark Draw Animation**: SVG stroke path animation (`drawCheck`), spring pop (`popCheck`), and sparkle particle burst (`sparkleBurst`).
- **Letter Wave Text Spans**: Individual letter delays (`--i`) for letter wave transitions.
- **Sizes**:
  - `sm`: `min-width: 100px`, `height: 36px`, `font-size: 11px`
  - `md`: `min-width: 140px`, `height: 42px`, `font-size: 13px`
  - `lg`: `min-width: 180px`, `height: 48px`, `font-size: 15px`
  - `fullWidth`: `width: 100%; min-width: 0;`

### Action Header Layout Standard
When rendering action buttons inside card/column headers (e.g. *Current Page Cards* header), group all actions into a uniform single-row grid:
```jsx
<div className="grid grid-cols-3 gap-2 w-full items-center">
  {/* Regenerate Button */}
  <button className="h-[36px] w-full px-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-700 text-white shadow-md ...">
    <Sparkles className="w-4 h-4" /> Regenerate
  </button>

  {/* Save Page Button */}
  <UiverseButton icon={<Save className="w-4 h-4 text-blue-500" />} size="sm" fullWidth>
    Save
  </UiverseButton>

  {/* Save All Button */}
  <UiverseButton icon={<CheckCircle className="w-4 h-4 text-emerald-500" />} size="sm" fullWidth>
    Save All
  </UiverseButton>
</div>
```

---

## 5. Animations & Keyframes (`src/index.css`)

1. **`gradientBG`**: 12s smooth position animation for shifting background gradients.
2. **`drawCheck`**: 0.4s ease-out SVG checkmark stroke drawing animation.
3. **`popCheck`**: 0.3s elastic scale animation when checkmark confirms.
4. **`sparkleBurst`**: 0.6s particle opacity & expand burst effect on button click.
5. **`flipDownFront` & `flipDownBack`**: 180-degree card flip transitions.

---

## 6. Framer Motion Interaction Standards

- **Hover Transition**: `whileHover={{ scale: 1.02 }}`
- **Tap / Active Transition**: `whileTap={{ scale: 0.97 }}`
- **Spring Physics Config**: `{ type: 'spring', stiffness: 220, damping: 20 }`

---

## 7. Storage & Action Conventions

- **Save Single Page**: `saveQueueItemToCloud(activeQueueId)` -> Writes current page and flashcards to Local Library (and ImgBB cloud if cloud mode enabled).
- **Save All Pages**: `saveAllProcessedToCloud()` -> Bulk processes and saves all completed pages (`status === 'done'`) in the queue to Local Library (and ImgBB cloud if cloud mode enabled).
