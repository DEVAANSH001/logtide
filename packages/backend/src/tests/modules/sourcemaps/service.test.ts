import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SourceMapsService } from '../../../modules/sourcemaps/service.js';
import { FilesystemStorage } from '../../../modules/sourcemaps/storage.js';
import { db } from '../../../database/index.js';
import { createTestContext } from '../../helpers/factories.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const TMP_BASE = path.join(os.tmpdir(), `logtide-svc-test-${process.pid}`);

describe('SourceMapsService', () => {
    let service: SourceMapsService;
    let testProject: any;
    let testOrg: any;

    beforeAll(async () => {
        await fs.mkdir(TMP_BASE, { recursive: true });
        const storage = new FilesystemStorage(TMP_BASE);
        service = new SourceMapsService(db, storage);
    });

    afterAll(async () => {
        await fs.rm(TMP_BASE, { recursive: true, force: true });
    });

    beforeEach(async () => {
        // Cleanup DB (sourcemaps not in global setup, projects deleted by global setup)
        await db.deleteFrom('sourcemaps' as any).execute();

        const ctx = await createTestContext();
        testProject = ctx.project;
        testOrg = ctx.organization;

        // Clean temp storage
        const entries = await fs.readdir(TMP_BASE).catch(() => []);
        await Promise.all(
            entries.map((e) => fs.rm(path.join(TMP_BASE, e), { recursive: true, force: true }))
        );
    });

    // =========================================================================
    // storeMap()
    // =========================================================================

    describe('storeMap()', () => {
        it('stores the file and inserts a DB record', async () => {
            const content = Buffer.from('{"version":3,"sources":["app.ts"]}');

            const record = await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'app.js.map',
                content,
            });

            expect(record.id).toBeDefined();
            expect(record.projectId).toBe(testProject.id);
            expect(record.organizationId).toBe(testOrg.id);
            expect(record.release).toBe('1.0.0');
            expect(record.fileName).toBe('app.js.map');
            expect(record.fileSize).toBe(content.length);
            expect(record.storagePath).toBeTruthy();
            expect(record.uploadedAt).toBeInstanceOf(Date);
        });

        it('upserts on conflict (same project + release + filename)', async () => {
            const first = Buffer.from('version 1');
            const second = Buffer.from('version 2 updated');

            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'main.js.map',
                content: first,
            });

            const record = await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'main.js.map',
                content: second,
            });

            expect(record.fileSize).toBe(second.length);

            // Only one record should exist
            const rows = await (db as any).selectFrom('sourcemaps').selectAll()
                .where('project_id', '=', testProject.id)
                .execute();
            expect(rows.length).toBe(1);
        });

        it('throws for filename with path separators', async () => {
            await expect(
                service.storeMap({
                    projectId: testProject.id,
                    organizationId: testOrg.id,
                    release: '1.0.0',
                    fileName: 'subdir/main.js.map',
                    content: Buffer.from('{}'),
                })
            ).rejects.toThrow('Invalid file name');
        });

        it('throws for filename with .. traversal', async () => {
            await expect(
                service.storeMap({
                    projectId: testProject.id,
                    organizationId: testOrg.id,
                    release: '1.0.0',
                    fileName: '../evil.map',
                    content: Buffer.from('{}'),
                })
            ).rejects.toThrow('Invalid file name');
        });
    });

    // =========================================================================
    // listMaps()
    // =========================================================================

    describe('listMaps()', () => {
        it('returns empty array when no maps exist', async () => {
            const result = await service.listMaps(testProject.id);
            expect(result).toEqual([]);
        });

        it('returns all maps for a project ordered by uploadedAt desc', async () => {
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'first.js.map',
                content: Buffer.from('a'),
            });
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '2.0.0',
                fileName: 'second.js.map',
                content: Buffer.from('b'),
            });

            const result = await service.listMaps(testProject.id);
            expect(result.length).toBe(2);
            // Should be in camelCase
            expect(result[0].projectId).toBe(testProject.id);
        });

        it('filters by release when provided', async () => {
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'a.js.map',
                content: Buffer.from('a'),
            });
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '2.0.0',
                fileName: 'b.js.map',
                content: Buffer.from('b'),
            });

            const result = await service.listMaps(testProject.id, '1.0.0');
            expect(result.length).toBe(1);
            expect(result[0].release).toBe('1.0.0');
        });

        it('does not return maps for other projects', async () => {
            const ctx2 = await createTestContext();
            await service.storeMap({
                projectId: ctx2.project.id,
                organizationId: ctx2.organization.id,
                release: '1.0.0',
                fileName: 'other.js.map',
                content: Buffer.from('other'),
            });

            const result = await service.listMaps(testProject.id);
            expect(result.length).toBe(0);
        });
    });

    // =========================================================================
    // deleteMaps()
    // =========================================================================

    describe('deleteMaps()', () => {
        it('returns 0 when no maps match', async () => {
            const count = await service.deleteMaps(testProject.id, 'nonexistent');
            expect(count).toBe(0);
        });

        it('deletes all maps for a release', async () => {
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'a.js.map',
                content: Buffer.from('a'),
            });
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'b.js.map',
                content: Buffer.from('b'),
            });

            const count = await service.deleteMaps(testProject.id, '1.0.0');
            expect(count).toBe(2);

            const remaining = await service.listMaps(testProject.id, '1.0.0');
            expect(remaining.length).toBe(0);
        });

        it('deletes only the specified file when fileName is provided', async () => {
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'keep.js.map',
                content: Buffer.from('keep'),
            });
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'delete.js.map',
                content: Buffer.from('delete'),
            });

            const count = await service.deleteMaps(testProject.id, '1.0.0', 'delete.js.map');
            expect(count).toBe(1);

            const remaining = await service.listMaps(testProject.id, '1.0.0');
            expect(remaining.length).toBe(1);
            expect(remaining[0].fileName).toBe('keep.js.map');
        });
    });

    // =========================================================================
    // getMapContent()
    // =========================================================================

    describe('getMapContent()', () => {
        it('returns the raw Buffer content for a stored map', async () => {
            const content = Buffer.from('{"version":3}');
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'app.js.map',
                content,
            });

            const result = await service.getMapContent(testProject.id, '1.0.0', 'app.js.map');
            expect(result).toEqual(content);
        });

        it('returns null for non-existent file', async () => {
            const result = await service.getMapContent(testProject.id, '1.0.0', 'missing.js.map');
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // findMap()
    // =========================================================================

    describe('findMap()', () => {
        it('derives the .map filename from a JS file path and retrieves it', async () => {
            const content = Buffer.from('{"version":3}');
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'main.abc123.js.map',
                content,
            });

            const result = await service.findMap(testProject.id, '1.0.0', '/assets/main.abc123.js');
            expect(result).toEqual(content);
        });

        it('strips query strings from the JS filename', async () => {
            const content = Buffer.from('{}');
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'chunk.js.map',
                content,
            });

            const result = await service.findMap(testProject.id, '1.0.0', '/dist/chunk.js?v=123');
            expect(result).toEqual(content);
        });

        it('returns null when the map file does not exist', async () => {
            const result = await service.findMap(testProject.id, '1.0.0', 'nonexistent.js');
            expect(result).toBeNull();
        });

        it('handles full URLs', async () => {
            const content = Buffer.from('{}');
            await service.storeMap({
                projectId: testProject.id,
                organizationId: testOrg.id,
                release: '1.0.0',
                fileName: 'app.bundle.js.map',
                content,
            });

            const result = await service.findMap(
                testProject.id,
                '1.0.0',
                'https://example.com/static/app.bundle.js'
            );
            expect(result).toEqual(content);
        });
    });
});
