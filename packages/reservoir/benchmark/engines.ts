import type { EngineType } from '../src/index.js';
import { StorageEngineFactory } from '../src/index.js';
import type { StorageEngine } from '../src/index.js';
import { ENGINE_CONFIGS } from './config.js';

export interface EngineHandle {
  type: EngineType;
  engine: StorageEngine;
}

export async function createEngine(type: EngineType): Promise<EngineHandle> {
  const config = ENGINE_CONFIGS[type];
  const engine = StorageEngineFactory.create(type, config);

  console.log(`  [${type}] connecting...`);
  await engine.connect();

  console.log(`  [${type}] initializing schema...`);
  await engine.initialize();

  const health = await engine.healthCheck();
  if (health.status === 'unhealthy') {
    throw new Error(`${type} engine is unhealthy: ${health.error}`);
  }
  console.log(`  [${type}] ready (${health.responseTimeMs}ms health check)`);

  return { type, engine };
}

export async function createEngines(types: EngineType[]): Promise<EngineHandle[]> {
  console.log('\n--- Initializing engines ---');
  const handles: EngineHandle[] = [];

  for (const type of types) {
    try {
      const handle = await createEngine(type);
      handles.push(handle);
    } catch (err) {
      console.error(`  [${type}] FAILED to initialize: ${err}`);
    }
  }

  if (handles.length === 0) {
    throw new Error('No engines could be initialized');
  }

  console.log(`  ${handles.length}/${types.length} engines ready\n`);
  return handles;
}

export async function destroyEngines(handles: EngineHandle[]): Promise<void> {
  console.log('\n--- Shutting down engines ---');
  for (const { type, engine } of handles) {
    try {
      await engine.disconnect();
      console.log(`  [${type}] disconnected`);
    } catch (err) {
      console.error(`  [${type}] error disconnecting: ${err}`);
    }
  }
}
