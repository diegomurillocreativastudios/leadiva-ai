# Leadiva — Design System

> **Fuente de verdad visual** del producto.  
> **Estado:** Flat Design Institucional / Enterprise Clean con paleta mint pastel (aprobada en Stitch).  
> **Stitch:** proyecto **Leadiva Flat Institutional** (`projects/929484233158471895`). Design system **Leadiva Mint Pastel** (`assets/8031487489663830885`).

**Última actualización:** 2026-07-17

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

## 4. Logo

- Fuente: `public/leadiva.svg`
- Asset Stitch: `9223236306029932549` (Leadiva Logo Official)
- Local: `.stitch/assets/leadiva-logo.png`

---

## 5. Rutas de producto (únicas pantallas canónicas)

| Ruta | Screen ID | Título Stitch |
| --- | --- | --- |
| `/login` | `8285cca75b1745c3979acf51b4734e19` | `/login — Iniciar sesión` |
| `/register` | `d7fdcc5e81df4405b53cbfdd60815701` | `/register — Crear cuenta` |
| `/` | `367309a2a41d47769fec2984c9d371ee` | `/ — Inicio (menu perfil abierto)` — landing; menú en sidebar al click en perfil |
| Menú perfil | `00ed51a4ddbf40259d3e762e9280933b` | Componente: click en DM → Perfil / Configuración / Cerrar sesión |
| Modal Perfil | `5f642d4fe8d046fab9a19cf902668835` | Click en Perfil del menú → modal con Foto/Avatar, Nombres, Apellidos, Correo |
| `/oportunidades` | `3f380f21890c4a83bc5d187552c6d69c` | `/oportunidades — Lista` — cards + sidebar historial + Pregunta a Leadiva |
| `/oportunidades/[resultadoId]` | `d8109bc6d6064ad199052e00733b2623` | `/oportunidades/[resultadoId] — Detalle` — título, descripción, sitio web, fecha límite, monto |

Capturas: `.stitch/screenshots/flat-institutional/{login,register,home,oportunidades,detalle}-mint.png`

Proyecto: https://stitch.withgoogle.com/projects/929484233158471895

Cualquier otra pantalla en el canvas Stitch es legacy y debe eliminarse manualmente en la UI (la API MCP no expone `delete_screen`). Lista: `.stitch/delete-screens-manual.json`.

---

## 6. Radios

| Token | Valor | Clase |
| --- | --- | --- |
| `--radius-md` | `0.5rem` (8px) | `rounded-md` |
| `--radius-sm` | `0.375rem` | `rounded-sm` |

---

## 7. Elevación

- Cards / paneles / sidebar: **sin sombra** — `border border-surface-border`.
- Modales, dropdowns, toasts, drawer móvil: `shadow-md` / `shadow-sm`.
- Inputs: flat, sin inset shadow.

---

## 8. Componentes

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

## 9. Stack

- Next.js App Router · Tailwind CSS v4 (`@theme` en `globals.css`)
- **No** usar `tailwind.config.ts` para tokens
- No pegar HTML de Stitch como producción
