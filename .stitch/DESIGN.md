# Leadiva — Design System

> **Fuente de verdad visual** del producto.  
> **Estado:** Flat Design Institucional / Enterprise Clean con paleta mint pastel (aprobada en Stitch).  
> **Stitch:** proyecto **Leadiva Flat Institutional** (`projects/929484233158471895`). Design system **Leadiva Mint Pastel** (`assets/8031487489663830885`).

**Última actualización:** 2026-07-15

---

## 1. Producto y lenguaje visual

Leadiva es un SaaS interno light con lenguaje **Flat Institutional**:

- Superficies planas; separación por bordes 1px.
- Sin skeuomorphism, neumorphism, glassmorphism ni gradientes decorativos.
- Sombras solo en overlays reales (modales, dropdowns, toasts, drawer móvil).
- Alta densidad de datos; tipografía legible en tamaños pequeños.
- Border-radius moderado (6–8px).

---

## 2. Modo y tipografía

| Token | Valor |
| --- | --- |
| Color mode | Light only (MVP) |
| Body / UI | Geist (`--font-sans`) via `next/font` |
| Mono | Geist Mono |
| Escala | `text-xs` meta · `text-sm` body · `text-base` títulos de card · `text-2xl` títulos de página |

---

## 3. Paleta (tira de referencia del usuario)

| Rol | Hex | Token / clase |
| --- | --- | --- |
| Soft coral | `#f9a79b` | `accent-coral` |
| Peach (izquierda) | `#fbcab9` | `accent-peach` |
| **Mint centro** | `#d9eedb` | `accent-mint` |
| Aqua (derecha) | `#9ce5de` | `accent-aqua` |
| Teal CTA | `#05aba9` | `accent` |
| Teal hover | `#048f8d` | `accent-dark` |

### Superficies

| Token | Hex | Clase |
| --- | --- | --- |
| `surface-base` | `#f4faf6` | `bg-surface-base` |
| `surface-raised` | `#ffffff` | `bg-surface-raised` |
| `surface-border` | `#d5e8e0` | `border-surface-border` |
| `surface-pressed` | `#e8f3ec` | `bg-surface-pressed` |

### Texto

| Token | Hex |
| --- | --- |
| `text-primary` | `#1c1917` |
| `text-secondary` | `#5f6b66` |

### Status

| Token | Hex | Uso |
| --- | --- | --- |
| `status-open` | `#05aba9` | Abierta / vigente |
| `status-evaluating` | `#c47a5a` | En evaluación |
| `status-won` | `#048f8d` | Adjudicada / ganado |
| `status-lost` | `#dc2626` | Perdida |
| `status-expiring` | `#e07a66` | Por vencer |
| `status-inactive` | `#a8a29e` | Inactivo / duplicado |

---

## 4. Radios

| Token | Valor | Clase |
| --- | --- | --- |
| `--radius-md` | `0.5rem` (8px) | `rounded-md` |
| `--radius-sm` | `0.375rem` | `rounded-sm` |

Aliases legacy `rounded-skeu*` siguen mapeados a 8px pero preferir `rounded-md`.

---

## 5. Elevación

- Cards / paneles / sidebar: **sin sombra** — `border border-surface-border`.
- Modales, dropdowns, toasts, drawer móvil: `shadow-md` / `shadow-sm`.
- Inputs: flat, sin inset shadow.

---

## 6. Componentes

Preferir primitivos Leadiva (`SkeuButton`, `SkeuCard`, `SkeuInput`, …) — estilos ya flat; el prefijo `Skeu` es legacy de nombre.

### CTA

`bg-accent text-white hover:bg-accent-dark`

### Input

`bg-surface-raised border-surface-border focus:ring-accent/40`

### Card

`bg-surface-raised border-surface-border rounded-md`

### Tabla

Header `bg-accent-mint/60`, zebra `even:bg-surface-base`, hover `hover:bg-accent-mint/40`.

### Nav activa

`bg-accent-mint text-accent border-l-2 border-l-accent`

---

## 7. Pantallas Stitch (mint)

| Pantalla | Screen ID |
| --- | --- |
| Dashboard | `43ad10c87a2444a4b33a6e97becf2e06` |
| Leads | `83d2653bd32e4ac4adaa50ac0983662c` |

Capturas: `.stitch/screenshots/flat-institutional/dashboard-mint.png`, `leads-mint.png`

Proyecto: https://stitch.withgoogle.com/projects/929484233158471895

---

## 8. Stack

- Next.js App Router · Tailwind CSS v4 (`@theme` en `globals.css`)
- **No** usar `tailwind.config.ts` para tokens
- No pegar HTML de Stitch como producción
