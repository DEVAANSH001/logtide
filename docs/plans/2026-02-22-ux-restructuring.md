# UX Restructuring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the LogTide dashboard UX — group sidebar items, add global context bar, merge Service Map into Traces, move Sigma Rules into Security, simplify Projects, fix broken cross-page links.

**Architecture:** The sidebar gets section labels (Observe/Detect/Manage). A new `observeContextStore` persists project + time range across Observe pages. Service Map becomes a view tab inside Traces. Sigma Rules move from Alerts to Security. Project log viewer is deleted (937 lines of duplication).

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Tailwind CSS, ShadCN-Svelte components, Svelte stores (writable/derived pattern from `layoutStore`)

---

## Task 1: Create `observeContextStore`

**Files:**
- Create: `packages/frontend/src/lib/stores/observe-context.ts`
- Reference: `packages/frontend/src/lib/stores/layout.ts` (follow this pattern exactly)

**Step 1: Create the store**

```typescript
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

export type TimeRangeType = 'last_hour' | 'last_24h' | 'last_7d' | 'custom';

interface ObserveContextState {
  selectedProjects: string[];
  timeRangeType: TimeRangeType;
  customFrom: string;
  customTo: string;
}

const STORAGE_KEY = 'logtide_observe_context';

const DEFAULTS: ObserveContextState = {
  selectedProjects: [],
  timeRangeType: 'last_24h',
  customFrom: '',
  customTo: '',
};

function loadInitialState(): ObserveContextState {
  if (!browser) return DEFAULTS;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULTS, ...parsed };
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function persist(state: ObserveContextState) {
  if (browser) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
}

function createObserveContextStore() {
  const { subscribe, set, update } = writable<ObserveContextState>(loadInitialState());

  return {
    subscribe,

    setProjects: (projects: string[]) => {
      update((s) => {
        const newState = { ...s, selectedProjects: projects };
        persist(newState);
        return newState;
      });
    },

    setTimeRange: (type: TimeRangeType, customFrom?: string, customTo?: string) => {
      update((s) => {
        const newState = {
          ...s,
          timeRangeType: type,
          customFrom: customFrom || s.customFrom,
          customTo: customTo || s.customTo,
        };
        persist(newState);
        return newState;
      });
    },

    getTimeRange: (): { from: Date; to: Date } => {
      const state = get(observeContextStore);
      const now = new Date();
      switch (state.timeRangeType) {
        case 'last_hour':
          return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now };
        case 'last_24h':
          return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
        case 'last_7d':
          return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
        case 'custom': {
          const from = state.customFrom ? new Date(state.customFrom) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const to = state.customTo ? new Date(state.customTo) : now;
          return { from, to };
        }
        default:
          return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
      }
    },

    clear: () => {
      set(DEFAULTS);
      if (browser) sessionStorage.removeItem(STORAGE_KEY);
    },
  };
}

export const observeContextStore = createObserveContextStore();

export const selectedProjects = derived(observeContextStore, ($s) => $s.selectedProjects);
export const timeRangeType = derived(observeContextStore, ($s) => $s.timeRangeType);
```

**Step 2: Verify it compiles**

Run: `cd packages/frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

**Step 3: Commit**

```bash
git add packages/frontend/src/lib/stores/observe-context.ts
git commit -m "add observe context store"
```

---

## Task 2: Create `ObserveContextBar` component

**Files:**
- Create: `packages/frontend/src/lib/components/ObserveContextBar.svelte`
- Reference: `packages/frontend/src/lib/components/TimeRangePicker.svelte` for time range UI pattern
- Reference: `packages/frontend/src/routes/dashboard/search/+page.svelte:908-996` for project multi-select popover pattern

**Step 1: Create the component**

This component renders in the topbar on Observe pages. It shows:
- A project multi-select popover (using the same Popover + checkbox pattern from search page)
- A time range selector (using button group like security page, lines 166-191)

```svelte
<script lang="ts">
  import { currentOrganization } from '$lib/stores/organization';
  import { observeContextStore, selectedProjects as selectedProjectsStore } from '$lib/stores/observe-context';
  import { ProjectsAPI } from '$lib/api/projects';
  import { authStore } from '$lib/stores/auth';
  import type { Project } from '@logtide/shared';
  import type { TimeRangeType } from '$lib/stores/observe-context';
  import * as Popover from '$lib/components/ui/popover';
  import Button from '$lib/components/ui/button/button.svelte';
  import FolderKanban from '@lucide/svelte/icons/folder-kanban';
  import Clock from '@lucide/svelte/icons/clock';
  import Check from '@lucide/svelte/icons/check';

  let token = $state<string | null>(null);
  authStore.subscribe((state) => { token = state.token; });
  let projectsAPI = $derived(new ProjectsAPI(() => token));

  let projects = $state<Project[]>([]);
  let contextState = $state({ selectedProjects: [] as string[], timeRangeType: 'last_24h' as TimeRangeType, customFrom: '', customTo: '' });
  let lastLoadedOrg = $state<string | null>(null);

  $effect(() => {
    const unsubscribe = observeContextStore.subscribe((s) => { contextState = s; });
    return unsubscribe;
  });

  $effect(() => {
    if (!$currentOrganization) return;
    if ($currentOrganization.id === lastLoadedOrg) return;
    lastLoadedOrg = $currentOrganization.id;
    loadProjects();
  });

  async function loadProjects() {
    if (!$currentOrganization) return;
    try {
      const response = await projectsAPI.getProjects($currentOrganization.id);
      projects = response.projects;
      // Auto-select all projects if none selected
      if (contextState.selectedProjects.length === 0 && projects.length > 0) {
        observeContextStore.setProjects(projects.map(p => p.id));
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  function toggleProject(projectId: string) {
    const current = contextState.selectedProjects;
    if (current.includes(projectId)) {
      observeContextStore.setProjects(current.filter(id => id !== projectId));
    } else {
      observeContextStore.setProjects([...current, projectId]);
    }
  }

  function selectAllProjects() {
    observeContextStore.setProjects(projects.map(p => p.id));
  }

  function clearProjects() {
    observeContextStore.setProjects([]);
  }

  function setTimeRange(type: TimeRangeType) {
    observeContextStore.setTimeRange(type);
  }

  let projectLabel = $derived(() => {
    const sel = contextState.selectedProjects;
    if (sel.length === 0) return 'No project';
    if (sel.length === projects.length) return `All projects`;
    if (sel.length === 1) return projects.find(p => p.id === sel[0])?.name || '1 project';
    return `${sel.length} projects`;
  });

  const timeRangeOptions: { value: TimeRangeType; label: string }[] = [
    { value: 'last_hour', label: '1h' },
    { value: 'last_24h', label: '24h' },
    { value: 'last_7d', label: '7d' },
  ];
</script>

{#if projects.length > 0}
  <div class="flex items-center gap-2">
    <!-- Project selector -->
    <Popover.Root>
      <Popover.Trigger>
        <button class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-muted/50 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
          <FolderKanban class="w-3.5 h-3.5 text-muted-foreground" />
          <span class="max-w-[120px] truncate">{projectLabel()}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content class="w-[240px] p-2" align="start">
        <div class="flex items-center justify-between mb-2 px-1">
          <span class="text-xs font-medium text-muted-foreground">Projects</span>
          <div class="flex gap-1">
            <button class="text-xs text-primary hover:underline" onclick={selectAllProjects}>All</button>
            <span class="text-xs text-muted-foreground">|</span>
            <button class="text-xs text-primary hover:underline" onclick={clearProjects}>None</button>
          </div>
        </div>
        <div class="max-h-[200px] overflow-y-auto space-y-0.5">
          {#each projects as project}
            <label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={contextState.selectedProjects.includes(project.id)}
                onchange={() => toggleProject(project.id)}
                class="h-3.5 w-3.5 rounded border-border"
              />
              <span class="truncate">{project.name}</span>
            </label>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>

    <!-- Time range selector -->
    <div class="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
      {#each timeRangeOptions as opt}
        <button
          class="px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer {contextState.timeRangeType === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => setTimeRange(opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>
{/if}
```

**Step 2: Verify it compiles**

Run: `cd packages/frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

**Step 3: Commit**

```bash
git add packages/frontend/src/lib/components/ObserveContextBar.svelte
git commit -m "add observe context bar component"
```

---

## Task 3: Wire `ObserveContextBar` into `AppLayout.svelte`

**Files:**
- Modify: `packages/frontend/src/lib/components/AppLayout.svelte`

**Step 1: Add import and route detection**

Add after line 56 (`import { logoPath } from "$lib/utils/theme";`):

```typescript
import ObserveContextBar from "$lib/components/ObserveContextBar.svelte";
```

Add a derived that checks if the current route is an Observe page. Add inside the `<script>` block (after line 279):

```typescript
const isObservePage = $derived(
  page.url.pathname.startsWith('/dashboard/search') ||
  page.url.pathname.startsWith('/dashboard/traces') ||
  page.url.pathname.startsWith('/dashboard/metrics') ||
  page.url.pathname.startsWith('/dashboard/errors')
);
```

**Step 2: Render the context bar in the topbar**

In the header, after the org name badge (after line 498, the closing `{/if}` of `$currentOrganization`), add:

```svelte
{#if isObservePage}
  <ObserveContextBar />
{/if}
```

**Step 3: Commit**

```bash
git add packages/frontend/src/lib/components/AppLayout.svelte
git commit -m "wire observe context bar into topbar"
```

---

## Task 4: Restructure sidebar with section groups

**Files:**
- Modify: `packages/frontend/src/lib/components/AppLayout.svelte:233-269`

**Step 1: Replace `navigationItems` with grouped structure**

Replace the `navigationItems` array (lines 233-269) and the `NavItem` interface (lines 221-231) with:

```typescript
interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  external?: boolean;
  badge?: {
    id: string;
    type: 'new' | 'updated' | 'beta';
    showUntil?: string;
  };
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Observe",
    items: [
      { label: "Logs", href: "/dashboard/search", icon: FileText },
      { label: "Traces", href: "/dashboard/traces", icon: GitBranch },
      {
        label: "Metrics",
        href: "/dashboard/metrics",
        icon: BarChart3,
        badge: { id: 'metrics-feature', type: 'new', showUntil: '2026-09-01' }
      },
      { label: "Errors", href: "/dashboard/errors", icon: Bug },
    ],
  },
  {
    label: "Detect",
    items: [
      { label: "Alerts", href: "/dashboard/alerts", icon: AlertTriangle },
      { label: "Security", href: "/dashboard/security", icon: Shield },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];
```

**Step 2: Update sidebar template (desktop)**

Replace the `<nav>` block (lines 327-351) that iterates `navigationItems` with:

```svelte
<nav class="flex-1 p-4 space-y-1 overflow-y-auto">
  {#each navigationSections as section, i}
    {#if i > 0}
      <Separator class="my-2" />
    {/if}
    {#if section.label}
      <p class="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.label}</p>
    {/if}
    {#each section.items as item}
      {@const Icon = item.icon}
      <a
        href={item.href}
        target={item.external ? '_blank' : undefined}
        rel={item.external ? 'noopener noreferrer' : undefined}
        data-nav-item={item.label.toLowerCase()}
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors {item.external
          ? 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
          : isActive(item.href)
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'}"
      >
        <Icon class="w-4 h-4" />
        <span class="flex-1">{item.label}</span>
        {#if item.badge}
          <FeatureBadge
            id={item.badge.id}
            type={item.badge.type}
            showUntil={item.badge.showUntil}
          />
        {/if}
      </a>
    {/each}
  {/each}

  {#if user?.is_admin}
    <Separator class="my-2" />
    <a
      href="/dashboard/admin"
      class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors {isActive('/dashboard/admin')
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'}"
    >
      <Shield class="w-4 h-4" />
      <span>Admin</span>
    </a>
  {/if}

  <Separator class="my-2" />
  <a
    href="https://logtide.dev/docs"
    target="_blank"
    rel="noopener noreferrer"
    class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
  >
    <Book class="w-4 h-4" />
    <span>Docs</span>
  </a>
  <a
    href="https://github.com/logtide-dev/logtide"
    target="_blank"
    rel="noopener noreferrer"
    class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
  >
    <Github class="w-4 h-4" />
    <span>GitHub</span>
  </a>
</nav>
```

**Step 3: Apply the same change to the mobile drawer nav**

Replace the mobile `<nav>` block (lines 423-448) with the identical grouped structure but with `onclick={() => mobileMenuOpen = false}` on each `<a>`.

**Step 4: Remove the `Network` icon import**

Delete line 41: `import Network from "@lucide/svelte/icons/network";` — no longer needed since Service Map is removed from sidebar.

**Step 5: Commit**

```bash
git add packages/frontend/src/lib/components/AppLayout.svelte
git commit -m "restructure sidebar with section groups"
```

---

## Task 5: Update `CommandPalette.svelte`

**Files:**
- Modify: `packages/frontend/src/lib/components/CommandPalette.svelte`

**Step 1: Update nav items**

Replace `navItems` array (lines 37-46) with:

```typescript
import BarChart3 from '@lucide/svelte/icons/bar-chart-3';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'g d' },
  { label: 'Logs', href: '/dashboard/search', icon: FileText, shortcut: 'g s' },
  { label: 'Traces', href: '/dashboard/traces', icon: GitBranch, shortcut: 'g t' },
  { label: 'Metrics', href: '/dashboard/metrics', icon: BarChart3, shortcut: 'g m' },
  { label: 'Errors', href: '/dashboard/errors', icon: Bug, shortcut: 'g r' },
  { label: 'Alerts', href: '/dashboard/alerts', icon: AlertTriangle, shortcut: 'g a' },
  { label: 'Security', href: '/dashboard/security', icon: Shield, shortcut: 'g e' },
  { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban, shortcut: 'g p' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, shortcut: 'g x' },
];
```

**Step 2: Commit**

```bash
git add packages/frontend/src/lib/components/CommandPalette.svelte
git commit -m "update command palette nav items"
```

---

## Task 6: Integrate `observeContextStore` into Traces page

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/traces/+page.svelte`

**Step 1: Replace per-page project selector and time range with store**

Add import:
```typescript
import { observeContextStore } from '$lib/stores/observe-context';
```

Remove the per-page `selectedProject` state, `projects` state, `loadProjects()` function, and the `getTimeRange()` fallback function.

Replace with store subscription:
```typescript
let observeCtx = $state({ selectedProjects: [] as string[], timeRangeType: 'last_24h' as any, customFrom: '', customTo: '' });

$effect(() => {
  const unsubscribe = observeContextStore.subscribe((s) => {
    observeCtx = s;
  });
  return unsubscribe;
});
```

Replace `getTimeRange()` calls with `observeContextStore.getTimeRange()`.

Replace `selectedProject` references with `observeCtx.selectedProjects[0]` (traces page uses single project — take first selected).

**Step 2: Remove the project selector and TimeRangePicker from the template**

Delete the project `<Select.Root>` block and the `<TimeRangePicker>` from the filters card. The context bar in the topbar handles this now.

**Step 3: React to store changes**

Replace the org-change `$effect` with a store-change `$effect`:

```typescript
let lastContextKey = $state<string | null>(null);

$effect(() => {
  if (!$currentOrganization) return;
  const key = `${$currentOrganization.id}-${observeCtx.selectedProjects.join(',')}-${observeCtx.timeRangeType}`;
  if (key === lastContextKey) return;
  lastContextKey = key;
  loadTraces();
  loadServices();
});
```

**Step 4: Read URL params on mount for cross-page links**

Add to `onMount`:
```typescript
const urlParams = new URLSearchParams(window.location.search);
const urlService = urlParams.get('service');
const urlTraceId = urlParams.get('traceId');
const urlProjectId = urlParams.get('projectId');

if (urlProjectId) {
  observeContextStore.setProjects([urlProjectId]);
}
if (urlService) {
  selectedService = urlService;
}
if (urlTraceId) {
  // Navigate directly to the trace detail
  goto(`/dashboard/traces/${urlTraceId}?projectId=${urlProjectId || observeCtx.selectedProjects[0]}`);
}
```

**Step 5: Commit**

```bash
git add packages/frontend/src/routes/dashboard/traces/+page.svelte
git commit -m "integrate observe context store into traces page"
```

---

## Task 7: Merge Service Map into Traces page as a view tab

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/traces/+page.svelte`
- Reference: `packages/frontend/src/routes/dashboard/service-map/+page.svelte` (copy Service Map's side panel and full capabilities)
- Delete: `packages/frontend/src/routes/dashboard/service-map/+page.svelte` (and its route directory)

**Step 1: Add view switcher state**

```typescript
let activeView = $state<'list' | 'map'>('list');
```

**Step 2: Add view toggle buttons in the results card header**

After the stats cards, before the traces table:

```svelte
<div class="flex items-center gap-1 mb-4">
  <Button
    variant={activeView === 'list' ? 'default' : 'outline'}
    size="sm"
    onclick={() => activeView = 'list'}
  >
    <List class="w-4 h-4 mr-1.5" />
    List
  </Button>
  <Button
    variant={activeView === 'map' ? 'default' : 'outline'}
    size="sm"
    onclick={() => { activeView = 'map'; if (!dependencies) loadDependencies(); }}
  >
    <Network class="w-4 h-4 mr-1.5" />
    Map
  </Button>
</div>
```

**Step 3: Conditionally render List or Map view**

Wrap the existing traces table in `{#if activeView === 'list'}`. Add an `{:else}` block with the full Service Map rendering (including side panel, health legend, export PNG) copied from `service-map/+page.svelte` (lines 253-450).

The Map view should include:
- Legend row (Healthy/Degraded/Unhealthy + Log correlation)
- Export PNG button
- ServiceMap component (full height, `h-[500px]`)
- Side panel with node details (service name, health, stats, upstream/downstream, "View Traces" button that switches to List view filtered by service)

**Step 4: Remove the old inline Service Map toggle card**

Delete the collapsible "Show Service Map" / "Hide Service Map" card (lines 352-386).

**Step 5: Delete the standalone Service Map route**

```bash
rm -rf packages/frontend/src/routes/dashboard/service-map
```

**Step 6: Commit**

```bash
git add -A
git commit -m "merge service map into traces as view tab"
```

---

## Task 8: Integrate `observeContextStore` into Metrics page

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/metrics/+page.svelte`

**Step 1: Same pattern as Task 6 — replace per-page selectors with store**

Import `observeContextStore`, subscribe to it, remove `projects` state, remove `loadProjects()`, remove `getTimeRange()`, remove project `<Select.Root>` and `<TimeRangePicker>` from template.

For Metrics, use `observeCtx.selectedProjects[0]` since it only supports single-project view. If multiple projects are selected in the context bar, use the first one.

**Step 2: Fix the broken trace exemplar link**

In `goToTrace()` (around line 499), change:
```typescript
// Before:
goto(`/dashboard/traces?traceId=${traceId}`);
// After:
goto(`/dashboard/traces/${traceId}?projectId=${observeCtx.selectedProjects[0]}`);
```

**Step 3: Commit**

```bash
git add packages/frontend/src/routes/dashboard/metrics/+page.svelte
git commit -m "integrate observe context into metrics, fix trace link"
```

---

## Task 9: Integrate `observeContextStore` into Search page

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/search/+page.svelte`

**Step 1: Initialize from store, sync back to store**

The Search page is special — it keeps its own multi-project selector (it's more capable than the context bar). But it should:
1. Initialize `selectedProjects` from `observeContextStore` on mount
2. Sync `selectedProjects` and time range back to the store when they change

Import `observeContextStore` and in the init/mount:
```typescript
// Initialize from store
const ctxState = get(observeContextStore);
if (ctxState.selectedProjects.length > 0) {
  selectedProjects = ctxState.selectedProjects;
}
```

When `selectedProjects` changes (in the checkbox handler), sync back:
```typescript
observeContextStore.setProjects(selectedProjects);
```

When time range changes:
```typescript
observeContextStore.setTimeRange(timeRangeType, customFromTime, customToTime);
```

**Step 2: Remove per-page `getTimeRange()` fallback function**

Replace with `observeContextStore.getTimeRange()` call.

**Step 3: Fix silent error handling**

In the `catch` block of `loadLogs()` (around line 463), add:
```typescript
toastStore.error('Failed to load logs. Please try again.');
```

**Step 4: Fix `effectiveTotalLogs`**

The API already returns a total count. Use it instead of `logs.length`.

**Step 5: Commit**

```bash
git add packages/frontend/src/routes/dashboard/search/+page.svelte
git commit -m "integrate observe context into search, fix error handling"
```

---

## Task 10: Move Sigma Rules from Alerts to Security

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/alerts/+page.svelte` (remove Sigma tab)
- Create: `packages/frontend/src/routes/dashboard/security/rules/+page.svelte` (new Sigma rules page)
- Modify: `packages/frontend/src/routes/dashboard/security/+page.svelte` (add sub-nav, fix empty state link)

**Step 1: Create Security sub-navigation layout**

Create `packages/frontend/src/routes/dashboard/security/+layout.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import Button from '$lib/components/ui/button/button.svelte';
  import Shield from '@lucide/svelte/icons/shield';
  import { layoutStore } from '$lib/stores/layout';

  interface Props {
    children: import('svelte').Snippet;
  }
  let { children }: Props = $props();

  const currentPath = $derived($page.url.pathname);

  const tabs = [
    { label: 'Dashboard', href: '/dashboard/security' },
    { label: 'Rules', href: '/dashboard/security/rules' },
    { label: 'Incidents', href: '/dashboard/security/incidents' },
  ];

  function isTabActive(href: string) {
    if (href === '/dashboard/security') return currentPath === href;
    return currentPath.startsWith(href);
  }
</script>

<div class="border-b border-border bg-card">
  <div class="container mx-auto px-6">
    <nav class="flex items-center gap-1 -mb-px">
      {#each tabs as tab}
        <a
          href={tab.href}
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {isTabActive(tab.href)
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          {tab.label}
        </a>
      {/each}
    </nav>
  </div>
</div>

{@render children()}
```

Note: The existing `security/+page.svelte` will need its header adjusted since the sub-nav now provides context.

**Step 2: Create `/dashboard/security/rules/+page.svelte`**

Move the Sigma Rules tab content from `alerts/+page.svelte` (lines 550-590 and related state/functions) into this new page. The page should include:
- `SigmaRulesList` component
- `SigmaSyncDialog` button and dialog
- `DetectionPacksGalleryDialog` button and dialog
- `SigmaRuleDetailsDialog` for viewing rule details
- All the sigma-related state and loading logic from alerts page

**Step 3: Simplify Alerts page**

Remove from `alerts/+page.svelte`:
- The "Sigma Rules" tab and `TabsTrigger`
- All sigma-related imports, state, and functions
- Change `grid-cols-3` to `grid-cols-2` in the `TabsList`
- Keep only "Alert Rules" and "History" tabs
- In History tab, keep showing detection events (reliability/database/business categories) — these are operational, not security

**Step 4: Fix Security dashboard empty state link**

In `security/+page.svelte` line 220, change:
```typescript
// Before:
onAction={() => goto('/dashboard/alerts')}
// After:
onAction={() => goto('/dashboard/security/rules')}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "move sigma rules from alerts to security section"
```

---

## Task 11: Simplify Project detail pages

**Files:**
- Delete: `packages/frontend/src/routes/dashboard/projects/[id]/+page.svelte` (~937 lines)
- Modify: `packages/frontend/src/routes/dashboard/projects/[id]/+layout.svelte` (change tabs)
- Modify: `packages/frontend/src/routes/dashboard/projects/+page.svelte` (update "View Project" link)

**Step 1: Update project detail layout tabs**

In `[id]/+layout.svelte`, replace the 3-tab structure (lines 114-120) with 2 tabs:

```svelte
<Tabs.Root value={currentTab()} onValueChange={handleTabChange}>
  <Tabs.List class="grid w-full grid-cols-2">
    <Tabs.Trigger value="settings">API Keys & Settings</Tabs.Trigger>
    <Tabs.Trigger value="alerts">Alerts</Tabs.Trigger>
  </Tabs.List>
</Tabs.Root>
```

Update `currentTab` derived (lines 44-48):
```typescript
const currentTab = $derived(() => {
  if (currentPath.endsWith('/alerts')) return 'alerts';
  return 'settings';
});
```

Update `handleTabChange` (lines 89-96):
```typescript
function handleTabChange(tab: string) {
  const basePath = `/dashboard/projects/${projectId}`;
  if (tab === 'settings') { goto(basePath); }
  else { goto(`${basePath}/${tab}`); }
}
```

**Step 2: Rename settings page to be the default**

Move `packages/frontend/src/routes/dashboard/projects/[id]/settings/+page.svelte` to `packages/frontend/src/routes/dashboard/projects/[id]/+page.svelte` (replacing the deleted log viewer).

Or simpler: keep settings at its current route and make the default route redirect to settings:

Create a new `packages/frontend/src/routes/dashboard/projects/[id]/+page.svelte`:
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const projectId = $derived($page.params.id);

  onMount(() => {
    goto(`/dashboard/projects/${projectId}/settings`, { replaceState: true });
  });
</script>
```

**Step 3: Update project list "View Project" button**

In `projects/+page.svelte`, find the "View Project" link and change it to navigate to settings:
```typescript
// Change href from:
href={`/dashboard/projects/${project.id}`}
// To:
href={`/dashboard/projects/${project.id}/settings`}
```

Add a "View Logs" button next to it:
```svelte
<Button variant="outline" size="sm" onclick={() => goto(`/dashboard/search?project=${project.id}`)}>
  View Logs
</Button>
```

**Step 4: Commit**

```bash
git add -A
git commit -m "simplify project pages, remove duplicate log viewer"
```

---

## Task 12: Bug fixes batch

**Files:**
- Modify: `packages/frontend/src/routes/dashboard/traces/+page.svelte` (silent error fix)
- Modify: `packages/frontend/src/lib/components/dashboard/LogsChart.svelte` (locale fix)
- Modify: `packages/frontend/src/lib/components/dashboard/TopServicesWidget.svelte` (empty state)
- Modify: `packages/frontend/src/lib/components/dashboard/RecentErrorsWidget.svelte` (empty state)
- Delete: `packages/frontend/src/lib/components/Navigation.svelte` (dead code)

**Step 1: Fix Traces silent error handling**

In `traces/+page.svelte`, in the `catch` block of `loadTraces()`, add:
```typescript
toastStore.error('Failed to load traces');
```

**Step 2: Fix LogsChart locale**

In `LogsChart.svelte`, find the `it-IT` locale usage and replace with `undefined` (uses browser default):
```typescript
// Before:
new Date(label).toLocaleTimeString('it-IT', ...)
// After:
new Date(label).toLocaleTimeString(undefined, ...)
```

**Step 3: Add empty states to dashboard widgets**

In `TopServicesWidget.svelte`, add after the `{#each}` block:
```svelte
{#if services.length === 0}
  <p class="text-sm text-muted-foreground text-center py-4">No services yet</p>
{/if}
```

Same pattern for `RecentErrorsWidget.svelte`.

**Step 4: Delete Navigation.svelte**

```bash
rm packages/frontend/src/lib/components/Navigation.svelte
```

Verify it's not imported anywhere:
```bash
grep -r "Navigation" packages/frontend/src/lib/components/ --include="*.svelte" --include="*.ts"
```

**Step 5: Commit**

```bash
git add -A
git commit -m "fix locale bug, silent errors, empty states, remove dead code"
```

---

## Task 13: Update E2E tests

**Files:**
- Modify: E2E test files that reference removed/changed routes

**Step 1: Find affected tests**

```bash
grep -r "service-map\|/dashboard/projects/.*logs\|sigma.*alerts" packages/frontend/tests/ e2e/ --include="*.ts" -l
```

**Step 2: Update route references**

- Replace `/dashboard/service-map` references with `/dashboard/traces` (Map view)
- Replace `/dashboard/projects/[id]` log viewer references with `/dashboard/search?project=[id]`
- Update Sigma rule test paths from `/dashboard/alerts` to `/dashboard/security/rules`
- Update sidebar navigation selectors from flat list to grouped structure

**Step 3: Run E2E tests to verify**

```bash
npx playwright test --reporter=list 2>&1 | tail -30
```

**Step 4: Commit**

```bash
git add -A
git commit -m "update e2e tests for new navigation structure"
```

---

## Task 14: Final verification

**Step 1: Run type checks**

```bash
cd packages/frontend && npx svelte-check --tsconfig ./tsconfig.json
```

**Step 2: Run backend tests**

```bash
cd packages/backend && npx vitest run 2>&1 | tail -20
```

**Step 3: Build the frontend**

```bash
cd packages/frontend && npm run build
```

**Step 4: Manual smoke test checklist**

- [ ] Sidebar shows 3 groups (Observe/Detect/Manage) with section labels
- [ ] Context bar appears in topbar on Logs/Traces/Metrics/Errors pages
- [ ] Context bar does NOT appear on Dashboard/Alerts/Security/Projects/Settings
- [ ] Changing project in context bar reloads current Observe page
- [ ] Navigating between Observe pages preserves project + time range selection
- [ ] Traces page has List/Map view toggle
- [ ] Map view shows full Service Map with side panel and export
- [ ] `/dashboard/service-map` returns 404 (deleted)
- [ ] Security page has Dashboard/Rules/Incidents sub-nav
- [ ] Security → Rules shows Sigma rules list with sync button
- [ ] Alerts page has only 2 tabs (Alert Rules / History)
- [ ] Projects page "View Logs" goes to global search with project pre-filtered
- [ ] Project detail opens to Settings/API Keys tab (no Logs tab)
- [ ] Command palette (Cmd+K) shows all pages including Metrics
- [ ] Metrics exemplar trace link navigates to trace detail (not list)

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "final fixes from smoke test"
```
