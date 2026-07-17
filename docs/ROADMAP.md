# Leadiva — Roadmap & ToDo completo

> **Fuente de verdad** del plan de producto e implementación.  
> **Última actualización:** 2026-07-15  
> **Leyenda:** `[x]` hecho · `[ ]` pendiente · `(~)` parcial / stub  
> **Docs relacionadas:** [database-schema.md](./database-schema.md) · [search-grounding-metrics.md](./search-grounding-metrics.md) · [README](../README.md)

---

## Cómo usar este documento

1. Trabajar **una etapa a la vez** (evitar saltar a fas es posteriores sin cerrar el MVP de la actual).
2. Marcar `[x]` solo cuando el ítem cumple la definición de completado (funciona, valida, autoriza, sin secretos expuestos).
3. Al iniciar una sesión: elegir 1–3 ítems de la etapa activa y copiarlos a un `task.md` temporal si hace falta.
4. Prioridad MVP: **auth → proyectos → leads → COMPRASAL → grounding privado → LinkedIn → jobs → deploy**.

---

## Vista rápida de etapas

| Etapa | Nombre | Estado |
| ---: | --- | --- |
| 0 | Fundación del repo | ✅ Hecha |
| 1 | Auth & onboarding | ✅ Casi completa |
| 2 | Base de datos & esquema | ✅ MVP congelado |
| 3 | Shell UI & design system | ✅ Hecha |
| 4 | Proyectos (`search_results`) | ✅ Hecha |
| 5 | Leads (`opportunities`) | ✅ Hecha |
| 6 | COMPRASAL | ✅ Hecha |
| 7 | Sector privado + Grounding | ✅ MVP hecho |
| 8 | LinkedIn | 🔴 Pendiente |
| 9 | Perfiles & ejecuciones de búsqueda | 🔴 Pendiente |
| 10 | IA: clasificación, score, extracción | 🔴 Pendiente |
| 11 | Documentos & Cloud Storage | 🔴 Pendiente |
| 12 | Jobs async (Tasks / Scheduler) | 🔴 Pendiente |
| 13 | Roles, admin & seguridad dura | 🔴 Pendiente |
| 14 | Observabilidad & costos | 🔴 Pendiente |
| 15 | Pruebas | 🟡 Mínimo |
| 16 | Deploy (Cloud Run) | 🔴 Pendiente |
| 17 | Post-MVP | ⚪ Futuro |

---

## Etapa 0 — Fundación del repo

- [x] Proyecto Next.js App Router + TypeScript strict
- [x] Tailwind CSS v4 + shadcn/ui base
- [x] pnpm, Node 22, scripts (`dev`, `build`, `lint`, `typecheck`, `test`)
- [x] Estructura modular (`app/`, `features/`, `server/`, `schemas/`, `env/`)
- [x] Validación de env en `src/env/server.ts`
- [x] `.env.example` + README de arranque
- [x] Drizzle Kit + Neon connectivity
- [x] Reglas Cursor (fullstack + technical + skeuomorphism)
- [x] Documento de esquema `docs/database-schema.md`
- [x] Este roadmap `docs/ROADMAP.md`

---

## Etapa 1 — Auth & onboarding

### Hecho

- [x] Auth.js con Credentials (email + password)
- [x] Registro con restricción por `ALLOWED_EMAIL_DOMAINS`
- [x] Login / logout
- [x] Hash de contraseña (`bcryptjs`)
- [x] Sesión en servidor (`requireSession` / helpers)
- [x] Onboarding de categorías de interés (`SOFTWARE`, `IT`, `CONSULTING`, `AI`)
- [x] Proxy/middleware de rutas protegidas
- [x] Páginas login / register / onboarding

### Pendiente

- [ ] Recuperación / reset de contraseña
- [ ] Bloqueo / desactivación de usuario inactivo en login
- [ ] Rate limiting en login/registro
- [ ] Auditoría de eventos auth (login fallido, registro)
- [ ] Google OAuth / Google Workspace *(fase posterior — ver Etapa 17)*
- [ ] Sincronizar `image_url` desde OAuth cuando exista

---

## Etapa 2 — Base de datos & esquema MVP

### Hecho

- [x] Tablas: `users`, `organizations`, `search_profiles`, `search_executions`, `search_results`
- [x] Tablas: `opportunities`, `opportunity_sources`, `opportunity_documents`, `opportunity_notes`, `opportunity_status_history`
- [x] Enums / constantes de dominio
- [x] Migración inicial versionada (`0000_init_mvp`)
- [x] Índices de dedupe (`normalized_url`, `source_type + external_id`)
- [x] Seed opcional de proyectos demo (`pnpm db:seed`)
- [x] Cliente DB pooled reutilizable

### Pendiente

- [ ] Constraints adicionales de negocio revisadas en Neon real
- [ ] Índices para filtros de UI (status, deadline, assigned_to, category)
- [ ] Script de seed de perfiles de búsqueda por defecto
- [ ] Branch Neon para preview / staging documentado
- [ ] Checklist de rollback para migraciones destructivas

---

## Etapa 3 — Shell UI & design system skeuomorphic

### Hecho

- [x] Tokens light en `globals.css` (surface, accent, skeu shadows)
- [x] Layout dashboard + sidebar
- [x] Páginas base: Proyectos, Leads, Settings
- [x] Componentes shadcn: button, card, input, table, badge, select, etc.
- [x] Skeuomorphism aplicado de forma consistente en auth + dashboard
- [x] Primitivos reutilizables: `SkeuButton`, `SkeuInput`, `SkeuCard`, `SkeuToggle`
- [x] Estados vacíos / carga / error uniformes (`EmptyState`, `PageLoading`, `PageError`)
- [x] `loading.tsx` / `error.tsx` / `not-found.tsx` en dashboard (+ root 404)
- [x] Dashboard home `/home` con resumen (conteos, deadlines, actividad)
- [x] Responsive mobile (sidebar drawer + top bar; tablas con scroll)
- [x] Accesibilidad base: labels, focus rings, `prefers-reduced-motion`, aria en menú
- [x] Toasts (Sonner) en sync COMPRASAL y mutaciones de lead

---

## Etapa 4 — Proyectos (`search_results`)

> Catálogo de **candidatos** descubiertos. Aún no son leads comerciales.

### Hecho

- [x] Listado de proyectos
- [x] Detalle de proyecto `[id]`
- [x] Botón sync COMPRASAL (dispara job)
- [x] Conversión a Lead desde detalle *(vía servicio / UI existente)*
- [x] Filtros servidor: fuente, categoría, verificación, país, vigencia, texto, modalidad, ejecución
- [x] Ordenamiento: deadline, score, descubierto, organización
- [x] Paginación offset (página / pageSize)
- [x] Badges claros: fuente, verificación, vigencia, score preliminar
- [x] Descarte de candidato con motivo (`discard_reason`)
- [x] Deduplicación visible en UI (“posible duplicado” por org / content hash)
- [x] Vista agrupada por `search_execution_id` + filtro por ejecución
- [x] Acciones masivas (descartar / convertir selección)
- [x] Enlace seguro a URL original (`ExternalLink`, `noopener noreferrer`)
- [x] Empty state distinto: catálogo vacío vs filtros sin matches

---

## Etapa 5 — Leads (`opportunities`)

> Pipeline comercial a partir de candidatos aceptados.

### Hecho

- [x] Listado de leads
- [x] Detalle de lead
- [x] Acciones de lead (estado, asignación, datos comerciales)
- [x] Servicio `opportunity.service` (núcleo)
- [x] Machine de estados + validación de transiciones (`lead-pipeline`)
  - `DETECTED` → `UNDER_REVIEW` → `APPROVED` → `PREPARING_PROPOSAL` → `PROPOSAL_SENT` → `WON` / `LOST`
  - Salidas: `DISCARDED`, `EXPIRED`, `DUPLICATE`
- [x] Historial de estados en UI (autor + motivo)
- [x] Notas internas CRUD
- [x] Asignar responsable interno
- [x] Campos: próxima acción, deadline, monto estimado, organización
- [x] Fuentes evidenciales en detalle (`opportunity_sources`)
- [x] Score de compatibilidad + explicación siempre visibles
- [x] Filtros: estado, asignado, fuente, deadline, score
- [x] Paginación servidor
- [x] Marcar vencidos automáticamente al listar / abrir detalle
- [x] Prevenir doble conversión (`origin_search_result_id` único + reuso del lead existente)
- [x] Migración `0001_add_lead_next_action` (`next_action`, `next_action_at`)

---

## Etapa 6 — Integración COMPRASAL

### Hecho

- [x] Adaptador: `client`, `schemas`, `mapper`, `service`, `filters`, `prepare`
- [x] Route `POST /api/jobs/sync-comprasal`
- [x] Normalización a `search_results`
- [x] Robustez: paginación, timeouts, retries, errores parciales (`PARTIALLY_COMPLETED`)
- [x] Separación activos vs históricos (adjudicados / cerrados / plazo vencido)
- [x] Dedupe: batch + processId (awards) + URL + content hash (upsert)
- [x] Colapso de adjudicaciones hermanas a 1 fila por proceso de compra
- [x] Remap: rechaza ruido (cursos) y elimina duplicados de proceso ya guardados
- [x] Badge “Duplicado” solo por content hash (no por misma institución)
- [x] Perfiles COMPRASAL por defecto (general, software/IT, consultoría/AI)
- [x] `search_execution` por sync con métricas (`metrics` jsonb)
- [x] Filtros deterministas pre-Gemini (empleo/cursos plural/histórico/invalid)
- [x] Relevancia Creativa: keywords + categorías de intereses + exclusiones (`IRRELEVANT`)
- [x] Listado Proyectos: scope “Solo mis intereses” por defecto + sort por score
- [x] Sync usa `interestCategories` del usuario autenticado
- [x] Fuente COMPRASAL solo vía API pública (sin Google Search)
- [x] UI: última sync + contadores creados/actualizados/descartados
- [x] Tests con fixtures (filters, prepare, parse, mapper, content-hash)
- [x] Migración `0002_add_search_execution_metrics`

---

## Etapa 7 — Sector privado + Google Search Grounding

### Hecho (MVP)

- [x] Cliente Vertex AI (`@google/genai` + ADC)
- [x] Env: `GCP_PROJECT_ID`, `GCP_LOCATION`, `VERTEX_MODEL`, límites de búsqueda
- [x] Flujo: perfil → grounding → filtros → dedupe → `search_results`
- [x] Conservar citations, query, URL, snippet, dominio en `raw_data`
- [x] Filtros: excluir empleos, cursos, noticias genéricas, vencidos, irrelevantes
- [x] No marcar `VERIFIED` solo por aparecer en Google (`PENDING` + flags en raw)
- [x] Validación Zod de respuesta estructurada + reintento controlado
- [x] Límites: max queries, max candidatos; tokens y costo estimado en ejecución
- [x] UI: botón “Buscar sector privado” + tarjeta de última búsqueda
- [x] Upsert por `normalized_url` / `content_hash` (reanalizar solo si cambia)
- [x] Tests con fixtures (sin Vertex real)

### Pendiente (post-MVP / Etapa 12)

- [ ] Progreso async sin bloquear HTTP (Cloud Tasks)
- [ ] Selector de query libre en UI (hoy usa query por intereses)
---

## Etapa 8 — LinkedIn (descubrimiento)

> LinkedIn es fuente de **descubrimiento**, no scraping autenticado.

### Pendiente

- [ ] Perfil de búsqueda LinkedIn (consultorías, RFP, TDR, proyectos)
- [ ] Descubrimiento vía Grounding (mismo pipeline que Etapa 7, `source_type=LINKEDIN`)
- [ ] Ingreso manual / semiautomático de URL de LinkedIn
- [ ] Validación contra publicación o fuente oficial complementaria
- [ ] Estados de verificación explícitos en UI
- [ ] Prohibido: cookies de sesión, automatización de cuentas, scrape de perfiles
- [ ] Pruebas con fixtures (sin LinkedIn real)

---

## Etapa 9 — Perfiles & ejecuciones de búsqueda

### Pendiente

- [ ] CRUD de `search_profiles` (UI Settings o sección dedicada)
- [ ] Campos: keywords, excluded, countries, sectors, domains, source_type
- [ ] Crear `search_execution` al iniciar (status `PENDING`)
- [ ] API: iniciar / consultar / cancelar ejecución
- [ ] Progreso en UI sin bloquear la petición HTTP
- [ ] Métricas por ejecución: queries, encontrados, descartados, leads, tokens, costo, errores
- [ ] Evitar solapamientos incompatibles (mismo perfil + fuente)
- [ ] Historial de ejecuciones consultable
- [ ] Idempotencia: reintento no crea duplicados

---

## Etapa 10 — IA: clasificación, score y extracción

### Pendiente

- [ ] Prompts versionados en `server/integrations/vertex-ai/prompts/`
- [ ] Clasificación de oportunidad (tipo, categoría, relevancia)
- [ ] Score de compatibilidad Creativa + `relevance_explanation`
- [ ] Extracción de requisitos / deadline / contacto cuando aporta valor
- [ ] Respuestas JSON + Zod; reintento controlado si falla schema
- [ ] Temperatura baja; Flash-Lite por defecto
- [ ] No llamar Gemini sobre duplicados / sin org / ya analizados
- [ ] Guardar: model, prompt version, input/output tokens, duración, costo
- [ ] UI: “análisis IA” nunca como hecho confirmado sin fuente
- [ ] Tests con mocks (nunca llamadas reales en CI)

---

## Etapa 11 — Documentos & Cloud Storage

### Pendiente

- [ ] Bucket privado + lifecycle de temporales
- [ ] Upload seguro (tipo real, tamaño, nombre sanitizado)
- [ ] Metadatos en `opportunity_documents` (hash, mime, size, object name)
- [ ] Dedupe por hash
- [ ] Signed URLs de corta duración
- [ ] Extracción de texto (PDF) antes de OCR
- [ ] Document AI solo si no hay texto extraíble *(post-MVP ok)*
- [ ] Protección SSRF al fetch de URLs externas
- [ ] UI: listar / adjuntar / abrir documento en detalle de lead

---

## Etapa 12 — Jobs async (Cloud Tasks / Scheduler / Jobs)

### Pendiente

- [ ] No mantener HTTP abierto en búsquedas largas (siempre 202 + worker)
- [ ] Cloud Tasks y cola por tipo de job
- [ ] Workers protegidos (OIDC / secret compartido)
- [ ] Endpoints worker: sync COMPRASAL, grounding privado, LinkedIn, expire leads
- [ ] Cloud Scheduler: sync diario COMPRASAL, búsquedas programadas
- [ ] Cloud Run Jobs para lotes pesados si aplica
- [ ] Idempotencia + nombres deterministas de tareas
- [ ] Timeouts, reintentos acotados, backoff
- [ ] Modo local/dev: ejecución inline o cola fake documentada

---

## Etapa 13 — Roles, admin & seguridad

### Pendiente

- [ ] Roles efectivos en servidor: `ADMIN`, `COMMERCIAL_ANALYST`, `TECHNICAL_REVIEWER`, `MANAGEMENT`, `VIEWER`
- [ ] `requireRole` en Server Actions / Route Handlers sensibles
- [ ] UI settings: gestión de usuarios (solo ADMIN)
- [ ] No confiar en rol enviado por el cliente
- [ ] Sanitización de inputs / nombres de archivo
- [ ] Bloqueo SSRF (localhost, IPs privadas, metadata)
- [ ] Límites de tamaño/tipos en uploads
- [ ] Secret Manager (o vars seguras Cloud Run) en prod
- [ ] Nunca secretos en `NEXT_PUBLIC_*`
- [ ] Audit log de acciones administrativas relevantes

---

## Etapa 14 — Observabilidad & costos

### Hecho (parcial — Grounding)

- [x] Semántica corregida de `candidatesFound` (pre-filtro, no created+updated)
- [x] Outcomes de ejecución en `search_executions.metrics.outcome`
- [x] Métricas por etapa Grounding / normalización / filtros / verificación / persistencia
- [x] `discardCounts` + muestra de trazas descartadas
- [x] Logs estructurados del pipeline Grounding
- [x] UI mínima de diagnóstico en panel de actividad (proyectos)
- [x] Doc: [search-grounding-metrics.md](./search-grounding-metrics.md)

### Pendiente

- [ ] Logger JSON estructurado (sin `console.log` suelto en prod)
- [ ] Correlation ids: `requestId`, `searchExecutionId`, `opportunityId`
- [ ] Errores tipados (`AppError` + códigos)
- [ ] Métricas por integración COMPRASAL alineadas al mismo contrato
- [ ] Presupuesto diario/mensual configurable (alerta / corte)
- [ ] Panel simple de costos por fuente / ejecución *(UI mínima)*
- [ ] Health endpoint ligero para Cloud Run

---

## Etapa 15 — Pruebas

### Hecho

- [x] Vitest configurado
- [x] Test de normalización (`normalization.test.ts`)

### Pendiente

- [ ] Unit: mapper COMPRASAL
- [ ] Unit: dedupe / URL normalization
- [ ] Unit: validación fechas / vigencia
- [ ] Unit: scoring / clasificación (mocks)
- [ ] Unit: permisos / roles
- [ ] Unit: schemas Zod críticos
- [ ] Integration: repositories / services con DB de test
- [ ] Integration: Route Handlers authz
- [ ] E2E (Playwright): login → onboarding → proyectos → convertir lead → cambiar estado
- [ ] CI: lint + typecheck + test en cada PR
- [ ] Fixtures realistas; cero llamadas reales a Gemini/Google en CI

---

## Etapa 16 — Deploy & operaciones

### Pendiente

- [ ] Dockerfile multi-stage (`output: "standalone"`)
- [ ] Cloud Run service (stateless, `PORT`, non-root)
- [ ] Variables / secretos de producción
- [ ] Migraciones **fuera** del boot de la app (job o paso CI)
- [ ] Dominio + HTTPS
- [ ] Scheduler + Tasks apuntando a workers
- [ ] Monitoreo básico (logs, errores 5xx, latencia)
- [ ] Runbook: deploy, rollback, rotar secretos
- [ ] `.env.example` actualizado con todas las vars nuevas

---

## Etapa 17 — Post-MVP (backlog)

No bloquear el MVP con estos ítems.

### Auth

- [ ] Google OAuth / Workspace
- [ ] Dominio corporativo estricto vía Google

### Dominio avanzado

- [ ] `organization_contacts`
- [ ] `opportunity_requirements`
- [ ] `opportunity_scores` (histórico de scoring)
- [ ] Tags / colaboradores
- [ ] Notificaciones (email / Slack)
- [ ] Saved filters
- [ ] Proposal submissions tracking
- [ ] Audit logs exhaustivos

### Producto

- [ ] Dashboard analítico (embudo, win rate, tiempo por etapa)
- [ ] Export CSV / Excel de leads
- [ ] Alertas de deadline
- [ ] Comparación “fit Creativa” multi-criterio editable
- [ ] OCR Document AI en escaneados
- [ ] Multi-país / multi-idioma de búsqueda

---

## Definición de “MVP listo para Creativa”

El MVP se considera usable en producción interna cuando:

1. [ ] Empleados Creativa se registran/login y completan onboarding
2. [x] Sync COMPRASAL llena Proyectos sin duplicados graves
3. [ ] Se puede convertir Proyecto → Lead y mover estados del pipeline
4. [ ] Hay notas, asignación y trazabilidad de fuente en el lead
5. [ ] Al menos una búsqueda privada o LinkedIn vía Grounding produce candidatos reales
6. [ ] Jobs largos no bloquean la UI (202 + progreso o al menos ejecución confiable)
7. [ ] Roles básicos impiden acciones no autorizadas
8. [ ] Deploy en Cloud Run + Neon estable
9. [ ] Lint, typecheck y tests críticos pasan en CI
10. [ ] Costos de Gemini tienen límites y registro por ejecución

---

## Orden de ejecución sugerido (próximas sesiones)

```text
1. ✅ Etapa 3 cerrada (UI skeu + /home + estados de ruta)
2. ✅ Etapa 4 cerrada (catálogo Proyectos completo)
3. ✅ Etapa 5 cerrada (pipeline leads completo)
4. ✅ Etapa 6 cerrada (COMPRASAL producción + tests)
5. Implementar Etapa 7 de verdad (Grounding privado)
6. Etapa 9 + 12 (executions + async)
7. Etapa 8 LinkedIn sobre el mismo pipeline
8. Etapa 10 IA scoring
9. Etapa 13–16 seguridad, obs, tests, deploy
```

---

## Checklist de sesión (copiar al empezar)

```md
### Sesión — YYYY-MM-DD

**Etapa activa:**
**Objetivo:**

- [ ] Ítem 1
- [ ] Ítem 2
- [ ] Ítem 3

**Hecho:**
**Riesgos / pendientes:**
**Vars / migraciones nuevas:**
```

---

*Mantener este archivo actualizado al cerrar cada etapa. No inventar tablas ni APIs fuera de `docs/database-schema.md` sin actualizar ambos documentos.*
