import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClickHouseConfig, getMongoDBConfig, validateStorageConfig, STORAGE_ENGINE } from '../../database/storage-config.js';

describe('storage-config', () => {
  describe('STORAGE_ENGINE', () => {
    it('should default to timescale when STORAGE_ENGINE env is not set', () => {
      // In test env STORAGE_ENGINE is typically not set
      expect(STORAGE_ENGINE).toBe('timescale');
    });

    it('should be a valid EngineType string', () => {
      expect(['timescale', 'clickhouse']).toContain(STORAGE_ENGINE);
    });
  });

  describe('getClickHouseConfig()', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return default values when no env vars are set', () => {
      const config = getClickHouseConfig();

      expect(config).toEqual({
        host: 'localhost',
        port: 8123,
        database: 'logtide',
        username: 'default',
        password: '',
      });
    });

    it('should use CLICKHOUSE_HOST from env', () => {
      vi.stubEnv('CLICKHOUSE_HOST', 'ch-server.internal');

      const config = getClickHouseConfig();
      expect(config.host).toBe('ch-server.internal');
    });

    it('should use CLICKHOUSE_PORT from env and parse as integer', () => {
      vi.stubEnv('CLICKHOUSE_PORT', '9000');

      const config = getClickHouseConfig();
      expect(config.port).toBe(9000);
    });

    it('should use CLICKHOUSE_DATABASE from env', () => {
      vi.stubEnv('CLICKHOUSE_DATABASE', 'custom_db');

      const config = getClickHouseConfig();
      expect(config.database).toBe('custom_db');
    });

    it('should use CLICKHOUSE_USERNAME and CLICKHOUSE_PASSWORD from env', () => {
      vi.stubEnv('CLICKHOUSE_USERNAME', 'admin');
      vi.stubEnv('CLICKHOUSE_PASSWORD', 's3cret!');

      const config = getClickHouseConfig();
      expect(config.username).toBe('admin');
      expect(config.password).toBe('s3cret!');
    });

    it('should return all env values when fully configured', () => {
      vi.stubEnv('CLICKHOUSE_HOST', '10.0.0.5');
      vi.stubEnv('CLICKHOUSE_PORT', '18123');
      vi.stubEnv('CLICKHOUSE_DATABASE', 'prod_logs');
      vi.stubEnv('CLICKHOUSE_USERNAME', 'logtide');
      vi.stubEnv('CLICKHOUSE_PASSWORD', 'p@ssword');

      const config = getClickHouseConfig();
      expect(config).toEqual({
        host: '10.0.0.5',
        port: 18123,
        database: 'prod_logs',
        username: 'logtide',
        password: 'p@ssword',
      });
    });

    it('should default port to 8123 when CLICKHOUSE_PORT is empty', () => {
      vi.stubEnv('CLICKHOUSE_PORT', '');

      const config = getClickHouseConfig();
      // parseInt('', 10) returns NaN; the fallback || '8123' handles empty string
      expect(config.port).toBe(8123);
    });
  });

  describe('validateStorageConfig()', () => {
    it('should not throw when STORAGE_ENGINE is timescale (default)', () => {
      // STORAGE_ENGINE is 'timescale' in test env by default
      expect(() => validateStorageConfig()).not.toThrow();
    });

    // Dynamic import tests for non-default engine values
    it('should throw for invalid engine value', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'oracle');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).toThrow('Invalid STORAGE_ENGINE');
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('should throw for clickhouse without CLICKHOUSE_HOST', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'clickhouse');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).toThrow('Missing CLICKHOUSE_HOST');
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('should throw for clickhouse with HOST but without CLICKHOUSE_DATABASE', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'clickhouse');
      vi.stubEnv('CLICKHOUSE_HOST', 'localhost');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).toThrow('Missing CLICKHOUSE_DATABASE');
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('should not throw for clickhouse with both required vars', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'clickhouse');
      vi.stubEnv('CLICKHOUSE_HOST', 'localhost');
      vi.stubEnv('CLICKHOUSE_DATABASE', 'logtide');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).not.toThrow();
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('should throw for mongodb without MONGODB_URI or MONGODB_HOST', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'mongodb');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).toThrow('Missing MONGODB_URI or MONGODB_HOST');
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('should not throw for mongodb with MONGODB_URI', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'mongodb');
      vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).not.toThrow();
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('should not throw for mongodb with MONGODB_HOST', async () => {
      vi.resetModules();
      vi.stubEnv('STORAGE_ENGINE', 'mongodb');
      vi.stubEnv('MONGODB_HOST', 'localhost');
      const { validateStorageConfig: validate } = await import('../../database/storage-config.js');
      expect(() => validate()).not.toThrow();
      vi.unstubAllEnvs();
      vi.resetModules();
    });
  });

  describe('getMongoDBConfig()', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return defaults when no env vars are set', () => {
      const config = getMongoDBConfig();
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(27017);
      expect(config.database).toBe('logtide');
      expect(config.username).toBe('');
      expect(config.password).toBe('');
    });

    it('should parse MONGODB_URI for host, port, database, credentials', () => {
      vi.stubEnv('MONGODB_URI', 'mongodb://admin:secret@mongo.example.com:27018/mydb');
      const config = getMongoDBConfig();
      expect(config.host).toBe('mongo.example.com');
      expect(config.port).toBe(27018);
      expect(config.database).toBe('mydb');
      expect(config.username).toBe('admin');
      expect(config.password).toBe('secret');
    });

    it('should parse authSource from MONGODB_URI query string', () => {
      vi.stubEnv('MONGODB_URI', 'mongodb://user:pass@localhost:27017/mydb?authSource=admin');
      const config = getMongoDBConfig();
      expect((config as any).options?.authSource).toBe('admin');
    });

    it('should fall back to individual env vars when MONGODB_URI is not set', () => {
      vi.stubEnv('MONGODB_HOST', 'mongo.internal');
      vi.stubEnv('MONGODB_PORT', '27019');
      vi.stubEnv('MONGODB_DATABASE', 'proddb');
      vi.stubEnv('MONGODB_USERNAME', 'dbuser');
      vi.stubEnv('MONGODB_PASSWORD', 'dbpass');
      const config = getMongoDBConfig();
      expect(config.host).toBe('mongo.internal');
      expect(config.port).toBe(27019);
      expect(config.database).toBe('proddb');
      expect(config.username).toBe('dbuser');
      expect(config.password).toBe('dbpass');
    });

    it('should include authSource in options when MONGODB_AUTH_SOURCE is set', () => {
      vi.stubEnv('MONGODB_HOST', 'localhost');
      vi.stubEnv('MONGODB_AUTH_SOURCE', 'admin');
      const config = getMongoDBConfig();
      expect((config as any).options?.authSource).toBe('admin');
    });

    it('should not include options when MONGODB_AUTH_SOURCE is not set', () => {
      vi.stubEnv('MONGODB_HOST', 'localhost');
      const config = getMongoDBConfig();
      expect((config as any).options).toBeUndefined();
    });
  });
});
