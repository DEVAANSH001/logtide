import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext } from '../../helpers/factories.js';
import { alertsService } from '../../../modules/alerts/service.js';

describe('AlertsService metadata_filters persistence', () => {
    beforeEach(async () => {
        await db.deleteFrom('alert_history').execute();
        await db.deleteFrom('alert_rules').execute();
    });

    it('persists and returns metadata_filters on create', async () => {
        const { organization, project } = await createTestContext();

        const rule = await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'prod errors',
            level: ['error'],
            threshold: 1,
            timeWindow: 60,
            emailRecipients: [],
            metadataFilters: [
                { key: 'environment', op: 'not_equals', value: 'development', include_missing: true },
            ],
        });

        expect(rule.metadataFilters).toHaveLength(1);
        expect(rule.metadataFilters[0]).toMatchObject({
            key: 'environment',
            op: 'not_equals',
            value: 'development',
            include_missing: true,
        });

        const reloaded = await alertsService.getAlertRule(rule.id, organization.id);
        expect(reloaded).not.toBeNull();
        expect(reloaded!.metadataFilters).toHaveLength(1);
        expect(reloaded!.metadataFilters[0].op).toBe('not_equals');
    });

    it('defaults to empty array when omitted', async () => {
        const { organization, project } = await createTestContext();

        const rule = await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'any',
            level: ['error'],
            threshold: 1,
            timeWindow: 60,
            emailRecipients: [],
        });

        expect(rule.metadataFilters).toEqual([]);
    });

    it('updates metadata_filters', async () => {
        const { organization, project } = await createTestContext();

        const rule = await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'update test',
            level: ['error'],
            threshold: 1,
            timeWindow: 60,
            emailRecipients: [],
        });

        expect(rule.metadataFilters).toEqual([]);

        const updated = await alertsService.updateAlertRule(rule.id, organization.id, {
            metadataFilters: [{ key: 'region', op: 'equals', value: 'eu-west', include_missing: false }],
        });

        expect(updated).not.toBeNull();
        expect(updated!.metadataFilters).toHaveLength(1);
        expect(updated!.metadataFilters[0].key).toBe('region');
        expect(updated!.metadataFilters[0].op).toBe('equals');
        expect(updated!.metadataFilters[0].value).toBe('eu-west');
    });

    it('can clear metadata_filters by setting to empty array', async () => {
        const { organization, project } = await createTestContext();

        const rule = await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'clear test',
            level: ['error'],
            threshold: 1,
            timeWindow: 60,
            emailRecipients: [],
            metadataFilters: [{ key: 'env', op: 'equals', value: 'prod', include_missing: false }],
        });

        expect(rule.metadataFilters).toHaveLength(1);

        const updated = await alertsService.updateAlertRule(rule.id, organization.id, {
            metadataFilters: [],
        });

        expect(updated).not.toBeNull();
        expect(updated!.metadataFilters).toEqual([]);
    });
});
