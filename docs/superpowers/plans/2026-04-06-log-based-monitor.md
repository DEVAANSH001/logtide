# Log-Based Monitor Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `log_heartbeat` monitor type that checks if a service is alive by looking for recent logs, rename the existing `heartbeat` to "Heartbeat (Push)" in the UI, and show push instructions with the endpoint URL.

**Architecture:** Add `log_heartbeat` to the shared `MONITOR_TYPES` constant. The backend `runCheck()` method gets an explicit branch for the new type (calling the existing `runLogHeartbeatCheck`). The frontend form shows a "Service name" autocomplete field for log-based monitors and push endpoint instructions for heartbeat monitors.

**Tech Stack:** TypeScript, Fastify, Kysely, Svelte 5, Zod

---

### Task 1: Add `log_heartbeat` to shared constants and backend types

**Files:**
- Modify: `packages/shared/src/constants/monitoring-constants.ts:1`
- Modify: `packages/backend/src/database/types.ts:439`

- [ ] **Step 1: Update shared constants**

In `packages/shared/src/constants/monitoring-constants.ts`, change line 1:

```typescript
export const MONITOR_TYPES = ['http', 'tcp', 'heartbeat', 'log_heartbeat'] as const;
```

- [ ] **Step 2: Update database types**

In `packages/backend/src/database/types.ts`, change line 439:

```typescript
export type MonitorType = 'http' | 'tcp' | 'heartbeat' | 'log_heartbeat';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/shared && npx tsc --noEmit`
Run: `cd packages/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/monitoring-constants.ts packages/backend/src/database/types.ts
git commit -m "add log_heartbeat monitor type"
```

---

### Task 2: Update backend validation and runCheck logic

**Files:**
- Modify: `packages/backend/src/modules/monitoring/routes.ts:47-53`
- Modify: `packages/backend/src/modules/monitoring/service.ts:497-520`

- [ ] **Step 1: Update create validation in routes.ts**

In `packages/backend/src/modules/monitoring/routes.ts`, replace the `.refine()` block (lines 47-54):

```typescript
).refine(
  (d) => {
    if (d.type === 'http') return !!d.target && (d.target.startsWith('http://') || d.target.startsWith('https://'));
    if (d.type === 'tcp') return !!d.target && d.target.includes(':');
    if (d.type === 'log_heartbeat') return !!d.target && d.target.trim().length > 0;
    return true;
  },
  { message: 'Invalid target for monitor type' }
);
```

- [ ] **Step 2: Update update validation in routes.ts**

In the `PUT /:id` handler (around line 112-121), add log_heartbeat validation after the existing tcp check:

```typescript
      if (existing.type === 'log_heartbeat' && !parse.data.target?.trim()) {
        return reply.status(400).send({ error: 'Log-based monitor requires a service name' });
      }
```

- [ ] **Step 3: Update runCheck in service.ts**

In `packages/backend/src/modules/monitoring/service.ts`, replace the runCheck method body (lines 497-541):

```typescript
  async runCheck(monitor: Monitor): Promise<void> {
    let result: CheckResult;
    const httpConfig: HttpConfig = (monitor.httpConfig as HttpConfig) ?? {};

    try {
      if (monitor.type === 'http') {
        result = await runHttpCheck(monitor.target!, monitor.timeoutSeconds, httpConfig);
      } else if (monitor.type === 'tcp') {
        const { host, port } = parseTcpTarget(monitor.target!);
        result = await runTcpCheck(host, port, monitor.timeoutSeconds);
      } else if (monitor.type === 'log_heartbeat') {
        result = await runLogHeartbeatCheck(monitor.target!, monitor.projectId, monitor.intervalSeconds, reservoir);
      } else {
        // Ping-based heartbeat: client POSTs to the heartbeat endpoint
        result = await runHeartbeatCheck(monitor.id, monitor.intervalSeconds, this.db);
      }
    } catch {
      result = { status: 'down', responseTimeMs: null, statusCode: null, errorCode: 'unexpected' };
    }

    // Ping heartbeat 'up' results are recorded by the endpoint, not the worker.
    const skipWrite = monitor.type === 'heartbeat' && result.status === 'up';

    if (!skipWrite) {
      await this.db
        .insertInto('monitor_results')
        .values({
          time: new Date(),
          monitor_id: monitor.id,
          organization_id: monitor.organizationId,
          project_id: monitor.projectId,
          status: result.status,
          response_time_ms: result.responseTimeMs,
          status_code: result.statusCode,
          error_code: result.errorCode,
          is_heartbeat: false,
        })
        .execute();
    }

    // Use the status data we already fetched (avoids redundant DB read)
    await this.processCheckResult(monitor, result, monitor.status ?? null);
  }
```

Key changes:
- Explicit `log_heartbeat` branch instead of checking `monitor.target`
- `skipWrite` simplified: only skip for `heartbeat` type (push), not based on target presence

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd packages/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/monitoring/routes.ts packages/backend/src/modules/monitoring/service.ts
git commit -m "update backend for log_heartbeat type"
```

---

### Task 3: Update frontend types and API

**Files:**
- Modify: `packages/frontend/src/lib/api/monitoring.ts:4`

- [ ] **Step 1: Update MonitorType**

In `packages/frontend/src/lib/api/monitoring.ts`, change line 4:

```typescript
export type MonitorType = 'http' | 'tcp' | 'heartbeat' | 'log_heartbeat';
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/lib/api/monitoring.ts
git commit -m "add log_heartbeat to frontend types"
```

---

### Task 4: Update the monitoring list page form

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/monitoring/+page.svelte`

This is the main form where monitors are created/edited. Changes:

1. Add `log_heartbeat` to the formType state
2. Add "Log Based" and rename "Heartbeat" to "Heartbeat (Push)" in select options
3. Show a "Service name" autocomplete field when type is `log_heartbeat`
4. Show an info message for `heartbeat` type explaining the push endpoint
5. Hide timeout for both `heartbeat` and `log_heartbeat`

- [ ] **Step 1: Add imports and state for service autocomplete**

At the top of the `<script>` block, add the logs API import and service-related state. After the existing imports (around line 10), add:

```typescript
import { logsApi } from '$lib/api/logs';
```

After the `formEnabled` state declaration (around line 48), add:

```typescript
  let availableServices = $state<string[]>([]);
  let serviceSearchOpen = $state(false);
```

- [ ] **Step 2: Add effect to load services when type changes to log_heartbeat**

After the existing `$effect` block (around line 64), add:

```typescript
  $effect(() => {
    if (formType === 'log_heartbeat' && projectId && org) {
      logsApi.getServices({ organizationId: org.id, projectId }).then((services) => {
        availableServices = services;
      }).catch(() => { availableServices = []; });
    }
  });
```

- [ ] **Step 3: Update formType declaration and validation**

Change line 41:

```typescript
  let formType = $state<'http' | 'tcp' | 'heartbeat' | 'log_heartbeat'>('http');
```

In `validateForm()` (around line 104-118), add validation for `log_heartbeat` after the tcp check:

```typescript
      if (formType === 'log_heartbeat') {
        if (!formTarget || !formTarget.trim()) {
          return 'Service name is required for log-based monitors';
        }
      }
```

- [ ] **Step 4: Update the type select options**

Replace line 545 (`<option value="heartbeat">Heartbeat</option>`):

```svelte
              <option value="heartbeat">Heartbeat (Push)</option>
              <option value="log_heartbeat">Log Based</option>
```

- [ ] **Step 5: Replace the target field section**

Replace lines 550-562 (the `{#if formType !== 'heartbeat' || editingMonitor}` block) with:

```svelte
        {#if formType === 'log_heartbeat'}
          <div class={!editingMonitor ? '' : 'sm:col-span-2'}>
            <label class="mb-1 block text-sm font-medium">Service name</label>
            <div class="relative">
              <input
                bind:value={formTarget}
                onfocus={() => { serviceSearchOpen = true; }}
                onblur={() => { setTimeout(() => { serviceSearchOpen = false; }, 150); }}
                class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. logtide-worker"
              />
              {#if serviceSearchOpen && availableServices.length > 0}
                <div class="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
                  {#each availableServices.filter((s) => !formTarget || s.toLowerCase().includes(formTarget.toLowerCase())) as svc (svc)}
                    <button
                      type="button"
                      class="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                      onmousedown={() => { formTarget = svc; serviceSearchOpen = false; }}
                    >
                      {svc}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <p class="mt-1 text-xs text-muted-foreground">Monitor checks if this service sent logs recently</p>
          </div>
        {:else if formType === 'heartbeat'}
          <div class={!editingMonitor ? 'sm:col-span-2' : 'sm:col-span-2'}>
            <div class="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 px-3 py-2 text-sm text-blue-800 dark:text-blue-200">
              <p class="font-medium mb-1">Push-based heartbeat</p>
              <p class="text-xs">After creating this monitor, you'll get an endpoint URL. Your service must send periodic POST requests to it.</p>
            </div>
          </div>
        {:else if formType !== 'heartbeat' || editingMonitor}
          <div class={!editingMonitor ? '' : 'sm:col-span-2'}>
            <label class="mb-1 block text-sm font-medium">
              {formType === 'tcp' ? 'Target (host:port)' : 'URL'}
            </label>
            <input
              bind:value={formTarget}
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={formType === 'tcp' ? 'db.example.com:5432' : 'https://example.com/health'}
            />
          </div>
        {/if}
```

- [ ] **Step 6: Update timeout visibility**

Replace line 575 (`{#if formType !== 'heartbeat'}`) with:

```svelte
        {#if formType !== 'heartbeat' && formType !== 'log_heartbeat'}
```

- [ ] **Step 7: Update the monitor type icon function**

Around line 192, the icon function currently handles http/tcp/heartbeat. Add log_heartbeat:

```typescript
    if (type === 'http') return Globe;
    if (type === 'tcp') return Wifi;
    if (type === 'log_heartbeat') return Activity;
    return Heart;
```

(Activity icon is already imported as `@lucide/svelte/icons/activity` in the detail page — check the list page imports; if `Activity` is not imported, add `import Activity from '@lucide/svelte/icons/activity';` to the imports.)

- [ ] **Step 8: Update the monitor card type display in the list**

Around line 683, where monitor types are displayed in the card, update to handle the new type. Find the block:

```svelte
                  {#if monitor.type === 'http'}
```

Add after the existing tcp case:

```svelte
                  {:else if monitor.type === 'log_heartbeat'}
                    Log Based
```

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/routes/dashboard/monitoring/+page.svelte
git commit -m "add log-based monitor type to create form"
```

---

### Task 5: Update the monitor detail page

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/monitoring/[id]/+page.svelte`

Changes:
1. Show "Service: <name>" for log_heartbeat monitors
2. Show heartbeat push endpoint only for `heartbeat` type (already does, but verify)
3. Hide timeout for `log_heartbeat` (same as heartbeat)
4. Add Activity icon for log_heartbeat

- [ ] **Step 1: Update timeout visibility**

In `packages/frontend/src/routes/dashboard/monitoring/[id]/+page.svelte`, find line 201:

```svelte
          {#if monitor.type !== 'heartbeat'}
```

Replace with:

```svelte
          {#if monitor.type !== 'heartbeat' && monitor.type !== 'log_heartbeat'}
```

- [ ] **Step 2: Add service name display for log_heartbeat**

After the target display block (around line 196, after `{/if}`), add:

```svelte
          {#if monitor.type === 'log_heartbeat' && monitor.target}
            <div class="flex justify-between gap-2">
              <dt class="text-muted-foreground">Service</dt>
              <dd class="font-mono text-xs">{monitor.target}</dd>
            </div>
          {/if}
```

- [ ] **Step 3: Update heartbeat endpoint section**

Line 242 already checks `{#if monitor.type === 'heartbeat'}` — this is correct, as we only want to show the push endpoint for ping-based heartbeats. No change needed.

- [ ] **Step 4: Add a description for log_heartbeat on the detail page**

After the heartbeat endpoint block (after line 255), add:

```svelte
        {#if monitor.type === 'log_heartbeat'}
          <div class="mt-4 pt-4 border-t">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Log-based monitoring</p>
            <p class="text-xs text-muted-foreground">
              This monitor checks if the service <code class="bg-muted rounded px-1">{monitor.target}</code> has sent logs within the last {Math.round(monitor.intervalSeconds * 1.5)}s (interval × 1.5).
            </p>
          </div>
        {/if}
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/dashboard/monitoring/[id]/+page.svelte
git commit -m "update monitor detail page for log_heartbeat"
```

---

### Task 6: Update the public status page rendering

**Files:**
- Modify: `packages/frontend/src/routes/status/[projectSlug]/+page.svelte` (if it displays type info)

- [ ] **Step 1: Check if the status page references monitor type**

Search for `heartbeat` or `type` references in the status page. If it shows type labels, add `log_heartbeat` → "Log Based". If it only shows name + status (which is the common pattern for public status pages), no change is needed.

- [ ] **Step 2: Commit if changes were made**

```bash
git add packages/frontend/src/routes/status/
git commit -m "update status page for log_heartbeat display"
```

---

### Task 7: Manual testing checklist

- [ ] **Step 1: Test creating a Log Based monitor from UI**

1. Go to Dashboard → Monitoring
2. Click "Add Monitor"
3. Select type "Log Based"
4. Verify: service name autocomplete field appears with suggestions from active services
5. Type a partial name → verify filtering works
6. Select a service → create monitor
7. Verify: monitor shows as "Log Based" in the list
8. Verify: within 1-2 check intervals, status changes to "up" if that service is sending logs

- [ ] **Step 2: Test creating a Heartbeat (Push) monitor from UI**

1. Select type "Heartbeat (Push)"
2. Verify: info box appears explaining push-based heartbeat
3. Create the monitor
4. Go to detail page → verify endpoint URL is shown
5. Copy the URL and POST to it → verify status goes to "up"

- [ ] **Step 3: Test editing existing monitors**

1. Edit one of the existing heartbeat monitors (backend, frontend, etc.)
2. Verify the form loads correctly

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix issues found during manual testing"
```
