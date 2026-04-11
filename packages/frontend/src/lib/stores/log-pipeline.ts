import { writable, derived } from 'svelte/store';
import {
  logPipelineAPI,
  type Pipeline,
  type CreatePipelineInput,
  type UpdatePipelineInput,
} from '$lib/api/log-pipeline';

// ============================================================================
// TYPES
// ============================================================================

export interface PipelineStoreState {
  pipelines: Pipeline[];
  loading: boolean;
  error: string | null;
}

const initialState: PipelineStoreState = {
  pipelines: [],
  loading: false,
  error: null,
};

// ============================================================================
// STORE
// ============================================================================

function createPipelineStore() {
  const { subscribe, set, update } = writable<PipelineStoreState>(initialState);

  return {
    subscribe,

    /**
     * Load all pipelines for an organization
     */
    async load(organizationId: string, projectId?: string) {
      update((s) => ({ ...s, loading: true, error: null }));

      try {
        const pipelines = await logPipelineAPI.list(organizationId, projectId);
        update((s) => ({ ...s, pipelines, loading: false }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load pipelines';
        update((s) => ({ ...s, pipelines: [], loading: false, error: errorMessage }));
      }
    },

    /**
     * Get a single pipeline
     */
    async get(id: string, organizationId: string): Promise<Pipeline> {
      return logPipelineAPI.get(id, organizationId);
    },

    /**
     * Create a new pipeline
     */
    async create(organizationId: string, input: CreatePipelineInput): Promise<Pipeline> {
      const pipeline = await logPipelineAPI.create(organizationId, input);
      update((s) => ({ ...s, pipelines: [...s.pipelines, pipeline] }));
      return pipeline;
    },

    /**
     * Update a pipeline
     */
    async update(
      id: string,
      organizationId: string,
      input: UpdatePipelineInput
    ): Promise<Pipeline> {
      const pipeline = await logPipelineAPI.update(id, organizationId, input);
      update((s) => ({
        ...s,
        pipelines: s.pipelines.map((p) => (p.id === id ? pipeline : p)),
      }));
      return pipeline;
    },

    /**
     * Delete a pipeline
     */
    async delete(id: string, organizationId: string): Promise<void> {
      await logPipelineAPI.delete(id, organizationId);
      update((s) => ({
        ...s,
        pipelines: s.pipelines.filter((p) => p.id !== id),
      }));
    },

    /**
     * Toggle pipeline enabled state
     */
    async toggleEnabled(pipeline: Pipeline, organizationId: string): Promise<Pipeline> {
      const updated = await logPipelineAPI.update(pipeline.id, organizationId, {
        enabled: !pipeline.enabled,
      });
      update((s) => ({
        ...s,
        pipelines: s.pipelines.map((p) => (p.id === updated.id ? updated : p)),
      }));
      return updated;
    },

    /**
     * Reset store
     */
    reset() {
      set(initialState);
    },
  };
}

export const pipelineStore = createPipelineStore();

// ============================================================================
// DERIVED STORES
// ============================================================================

/**
 * Only enabled pipelines
 */
export const enabledPipelines = derived(pipelineStore, ($store) =>
  $store.pipelines.filter((p) => p.enabled)
);

/**
 * Pipeline count
 */
export const pipelineCount = derived(pipelineStore, ($store) => $store.pipelines.length);

/**
 * Enabled pipeline count
 */
export const enabledPipelineCount = derived(enabledPipelines, ($enabled) => $enabled.length);
