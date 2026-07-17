# Leadiva

Inteligencia de oportunidades comerciales para Creativa Studios.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript (`strict`)
- Tailwind CSS + shadcn/ui
- Neon PostgreSQL + Drizzle ORM
- Auth.js (Credentials)
- Zod + Vitest
- pnpm

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- pnpm 10+
- Neon project + connection string

## Configuración

1. Copia variables de entorno:

```bash
cp .env.example .env.local
```

2. Completa al menos:

- `DATABASE_URL` (Neon pooled) — también se acepta `NEON_DB_URL`
- `AUTH_SECRET` (≥ 32 caracteres)
- `ALLOWED_EMAIL_DOMAINS` (por defecto dominios Creativa)

3. Instala y migra:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed   # candidatos demo opcionales
```

4. Arranca:

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Descripción |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` / `pnpm start` | Producción |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Generar migración Drizzle |
| `pnpm db:migrate` | Aplicar migraciones |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Seed de proyectos demo |

## Flujo MVP

1. Registro / login (dominios Creativa)
2. Onboarding de categorías (Software / IT / Consultoría / AI)
3. **Inicio** (`/home`) con resumen del pipeline
4. Catálogo **Proyectos** (`search_results`)
5. Detalle → **Convertir a Lead**
6. Seguimiento en **Leads** (`opportunities`)
7. Sync COMPRASAL: botón en Proyectos o `POST /api/jobs/sync-comprasal`
8. Sector privado (Grounding): botón **Buscar sector privado** o `POST /api/jobs/search-grounding`

## Vertex AI (sector privado)

Requiere proyecto GCP con Vertex AI habilitado y ADC:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

En `.env.local`:

```env
GCP_PROJECT_ID=YOUR_PROJECT_ID
GCP_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-flash-lite
```

Sin `GCP_PROJECT_ID`, la búsqueda responde OK pero no inventa candidatos (`configured: false`).

## Documentación

- Esquema DB: [docs/database-schema.md](docs/database-schema.md)
- Roadmap / ToDo completo: [docs/ROADMAP.md](docs/ROADMAP.md)

## Notas

- Google OAuth queda para una fase posterior.
- Grounding usa `@google/genai` + Google Search tool; nunca marca `VERIFIED` solo por aparecer en Google.
- No subas `.env.local` al repositorio.
