# UX Restructuring Design

**Date:** 2026-02-22
**Branch:** feature/0.7-ux
**Status:** Approved

## Problem

The current UI has 11 flat sidebar items with no grouping. Observability features (Traces, Metrics, Service Map) are separate islands with no shared context. Alerts and Security overlap confusingly (Sigma rules managed in Alerts, output shown in Security). Project pages duplicate the global log search with a worse, copy-pasted version. Cross-page links are broken. No context (project, time range) persists across page navigation.

## Design

### 1. Sidebar Restructuring

**Before:** Dashboard | Projects | Logs | Traces | Metrics | Service Map | Alerts | Errors | Security | Docs | Settings

**After:**

```
Dashboard                          (standalone at top)

── OBSERVE ──────────────
   Logs                            /dashboard/search
   Traces                          /dashboard/traces (absorbs Service Map)
   Metrics                         /dashboard/metrics
   Errors                          /dashboard/errors

── DETECT ───────────────
   Alerts                          threshold/anomaly rules + alert history
   Security                        Sigma rules + SIEM dashboard + incidents

── MANAGE ───────────────
   Projects                        list + API keys + settings (NO log viewer)
   Settings                        org settings, channels, PII, audit
```

- Service Map removed from sidebar → tab inside Traces
- Sigma Rules tab removed from Alerts → sub-page of Security
- Section labels: small gray uppercase text + separator
- Docs link moves to sidebar footer
- Command palette updated to match

### 2. Global Context Bar

Persistent bar in the topbar on all Observe pages (`/dashboard/search`, `/dashboard/traces`, `/dashboard/metrics`, `/dashboard/errors`).

```
[Logo] OrgName │ Project: [All ▼]  Time: [Last 24h ▼] │ 🔔 👤
```

- New `observeContextStore` with `selectedProjects: string[]`, `timeRange: { type, from?, to? }`
- Persisted to `sessionStorage`
- Renders only on Observe routes
- Each Observe page reads from the store (removes per-page project/time selectors)
- Per-page filters (service, level, trace ID) remain local
- Search page keeps its multi-project selector but initializes from the store
- Extract duplicated `getTimeRange()` into shared utility

### 3. Traces Absorbs Service Map

Traces page gets a view switcher at the top of results:

```
[List] [Map]
```

- **List view** (default): current traces table
- **Map view**: full Service Map with side panel, health legend, export PNG
- Stats cards and filters visible in all views
- Clicking a node in Map → switches to List filtered by that service
- Delete `/dashboard/service-map/` route entirely

### 4. Security Absorbs Sigma Rules

**Alerts (simplified):** 2 tabs → Alert Rules | History (threshold/anomaly only)

**Security (expanded):** horizontal sub-nav → Dashboard | Rules | Incidents

```
/dashboard/security              → SIEM Dashboard
/dashboard/security/rules        → Sigma Rules (moved from Alerts)
/dashboard/security/incidents    → Incident list
/dashboard/security/incidents/[id] → Incident detail
```

- Security empty state links to `/dashboard/security/rules`
- Detection events category `security` → Security
- Detection events category `reliability/database/business` → Alerts History

### 5. Projects Simplified

**Before:** 3 tabs → Logs | Alerts | Settings
**After:** 2 tabs → API Keys | Settings

- Delete project log viewer (`projects/[id]/+page.svelte`, ~937 lines)
- "View Logs" on project card → `/dashboard/search?project={id}`
- Default tab = API Keys

### 6. Bug Fixes

- Metrics trace link: navigate to `/dashboard/traces/{traceId}?projectId={id}`
- Traces page reads `service`, `projectId`, `traceId` from URL params
- Search/Traces: show error toast on API failure instead of silent empty
- LogsChart: use browser locale instead of hardcoded `it-IT`
- Search checkboxes: replace raw `<input>` with ShadCN Checkbox
- Add empty states to TopServicesWidget/RecentErrorsWidget
- Fix `effectiveTotalLogs` to use API total
- Remove dead code: `filteredLogs`, `Navigation.svelte`, unreachable `pageSize`
