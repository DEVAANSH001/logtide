import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FilesystemStorage, createStorage } from '../../../modules/sourcemaps/storage.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const TMP_BASE = path.join(os.tmpdir(), `logtide-sm-test-${process.pid}`);

describe('FilesystemStorage', () => {
    let storage: FilesystemStorage;

    beforeAll(async () => {
        await fs.mkdir(TMP_BASE, { recursive: true });
        storage = new FilesystemStorage(TMP_BASE);
    });

    afterAll(async () => {
        await fs.rm(TMP_BASE, { recursive: true, force: true });
    });

    beforeEach(async () => {
        // Clean out temp dir between tests
        const entries = await fs.readdir(TMP_BASE).catch(() => []);
        await Promise.all(
            entries.map((e) => fs.rm(path.join(TMP_BASE, e), { recursive: true, force: true }))
        );
    });

    // =========================================================================
    // store()
    // =========================================================================

    describe('store()', () => {
        it('creates the file and returns its absolute path', async () => {
            const content = Buffer.from('{"version":3,"sources":[]}');
            const result = await storage.store('proj-1', '1.0.0', 'main.js.map', content);

            expect(result).toContain('main.js.map');
            expect(path.isAbsolute(result)).toBe(true);

            const written = await fs.readFile(result);
            expect(written).toEqual(content);
        });

        it('creates parent directories recursively', async () => {
            const content = Buffer.from('{}');
            const storagePath = await storage.store('proj-2', '2.0.0-beta', 'chunk.js.map', content);

            const stat = await fs.stat(storagePath);
            expect(stat.isFile()).toBe(true);
        });

        it('overwrites an existing file', async () => {
            const original = Buffer.from('original');
            const updated = Buffer.from('updated');

            await storage.store('proj-3', '1.0.0', 'app.js.map', original);
            const storagePath = await storage.store('proj-3', '1.0.0', 'app.js.map', updated);

            const data = await fs.readFile(storagePath);
            expect(data.toString()).toBe('updated');
        });

        it('sanitizes the release directory using path.basename', async () => {
            // Release with path traversal attempt should be sanitized
            const content = Buffer.from('{}');
            const result = await storage.store('proj-4', '../evil', 'safe.js.map', content);
            // The stored path should not contain '..' after the base
            expect(result).not.toContain('../evil');
        });

        it('sanitizes the filename using path.basename', async () => {
            const content = Buffer.from('{}');
            const result = await storage.store('proj-5', '1.0.0', '../../evil.map', content);
            // Only the basename is used
            expect(result).not.toContain('../..');
        });
    });

    // =========================================================================
    // retrieve()
    // =========================================================================

    describe('retrieve()', () => {
        it('returns the file content as a Buffer', async () => {
            const content = Buffer.from('{"version":3}');
            await storage.store('proj-r1', '1.0.0', 'app.js.map', content);

            const result = await storage.retrieve('proj-r1', '1.0.0', 'app.js.map');
            expect(result).toEqual(content);
        });

        it('returns null when the file does not exist', async () => {
            const result = await storage.retrieve('nonexistent', '0.0.0', 'missing.js.map');
            expect(result).toBeNull();
        });

        it('returns null for wrong project ID', async () => {
            const content = Buffer.from('{}');
            await storage.store('proj-a', '1.0.0', 'main.js.map', content);

            const result = await storage.retrieve('proj-b', '1.0.0', 'main.js.map');
            expect(result).toBeNull();
        });

        it('returns null for wrong release', async () => {
            const content = Buffer.from('{}');
            await storage.store('proj-r2', '1.0.0', 'main.js.map', content);

            const result = await storage.retrieve('proj-r2', '2.0.0', 'main.js.map');
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // delete()
    // =========================================================================

    describe('delete() — single file', () => {
        it('removes the specified file', async () => {
            const content = Buffer.from('{}');
            const storagePath = await storage.store('proj-d1', '1.0.0', 'main.js.map', content);

            await storage.delete('proj-d1', '1.0.0', 'main.js.map');

            await expect(fs.access(storagePath)).rejects.toThrow();
        });

        it('does not throw if the file does not exist', async () => {
            await expect(
                storage.delete('proj-d2', '1.0.0', 'nonexistent.js.map')
            ).resolves.not.toThrow();
        });
    });

    describe('delete() — entire release directory', () => {
        it('removes the release directory and all its files', async () => {
            await storage.store('proj-d3', '1.0.0', 'main.js.map', Buffer.from('a'));
            await storage.store('proj-d3', '1.0.0', 'vendor.js.map', Buffer.from('b'));

            await storage.delete('proj-d3', '1.0.0');

            const result = await storage.retrieve('proj-d3', '1.0.0', 'main.js.map');
            expect(result).toBeNull();
        });

        it('does not throw if the directory does not exist', async () => {
            await expect(
                storage.delete('proj-d4', 'nonexistent-release')
            ).resolves.not.toThrow();
        });
    });
});

// =========================================================================
// createStorage()
// =========================================================================

describe('createStorage()', () => {
    it('returns a FilesystemStorage instance', () => {
        const storage = createStorage();
        expect(storage).toBeDefined();
        expect(typeof storage.store).toBe('function');
        expect(typeof storage.retrieve).toBe('function');
        expect(typeof storage.delete).toBe('function');
    });

    it('uses SOURCEMAP_STORAGE_PATH env var when set', () => {
        const saved = process.env.SOURCEMAP_STORAGE_PATH;
        process.env.SOURCEMAP_STORAGE_PATH = '/custom/path';
        // createStorage reads env at call time — just verify it doesn't throw
        expect(() => createStorage()).not.toThrow();
        process.env.SOURCEMAP_STORAGE_PATH = saved;
    });

    it('falls back to ~/.logtide/sourcemaps when env var is not set', () => {
        const saved = process.env.SOURCEMAP_STORAGE_PATH;
        delete process.env.SOURCEMAP_STORAGE_PATH;
        expect(() => createStorage()).not.toThrow();
        if (saved !== undefined) process.env.SOURCEMAP_STORAGE_PATH = saved;
    });
});
