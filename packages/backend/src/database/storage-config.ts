import type { EngineType, StorageConfig } from '@logtide/reservoir';

export const STORAGE_ENGINE: EngineType =
  (process.env.STORAGE_ENGINE as EngineType) || 'timescale';

export function getClickHouseConfig(): StorageConfig {
  return {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
    database: process.env.CLICKHOUSE_DATABASE || 'logtide',
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  };
}

export function getMongoDBConfig(): StorageConfig {
  // Parse URI or use individual env vars
  const uri = process.env.MONGODB_URI;
  if (uri) {
    // Extract host/port/database from URI for StorageConfig compatibility
    try {
      const url = new URL(uri);
      return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port || '27017', 10),
        database: url.pathname.replace('/', '') || process.env.MONGODB_DATABASE || 'logtide',
        username: decodeURIComponent(url.username || ''),
        password: decodeURIComponent(url.password || ''),
      };
    } catch {
      // Fallback for non-standard URIs (e.g. replica set URIs)
    }
  }

  return {
    host: process.env.MONGODB_HOST || 'localhost',
    port: parseInt(process.env.MONGODB_PORT || '27017', 10),
    database: process.env.MONGODB_DATABASE || 'logtide',
    username: process.env.MONGODB_USERNAME || '',
    password: process.env.MONGODB_PASSWORD || '',
  };
}

export function validateStorageConfig(): void {
  if (!['timescale', 'clickhouse', 'mongodb'].includes(STORAGE_ENGINE)) {
    throw new Error(`Invalid STORAGE_ENGINE: "${STORAGE_ENGINE}". Must be "timescale", "clickhouse", or "mongodb".`);
  }
  if (STORAGE_ENGINE === 'clickhouse') {
    if (!process.env.CLICKHOUSE_HOST) {
      throw new Error('Missing CLICKHOUSE_HOST (required when STORAGE_ENGINE=clickhouse)');
    }
    if (!process.env.CLICKHOUSE_DATABASE) {
      throw new Error('Missing CLICKHOUSE_DATABASE (required when STORAGE_ENGINE=clickhouse)');
    }
  }
  if (STORAGE_ENGINE === 'mongodb') {
    if (!process.env.MONGODB_URI && !process.env.MONGODB_HOST) {
      throw new Error('Missing MONGODB_URI or MONGODB_HOST (required when STORAGE_ENGINE=mongodb)');
    }
  }
}
