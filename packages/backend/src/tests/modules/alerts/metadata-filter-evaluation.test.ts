import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';
import { alertsService } from '../../../modules/alerts/service.js';

describe('Alert Rule Evaluation with metadataFilters', () => {
    beforeEach(async () => {
        await db.deleteFrom('logs').execute();
        await db.deleteFrom('alert_history').execute();
        await db.deleteFrom('alert_rules').execute();
    });

    it('counts only logs matching metadata filter (equals)', async () => {
        const { organization, project } = await createTestContext();

        // Rule: threshold=2, filter environment equals production
        await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'prod only rule',
            level: ['error'],
            threshold: 2,
            timeWindow: 5,
            emailRecipients: [],
            metadataFilters: [{ key: 'environment', op: 'equals', value: 'production', include_missing: false }],
        });

        // 1 prod error (below threshold)
        await createTestLog({
            projectId: project.id,
            level: 'error',
            message: 'prod error',
            metadata: { environment: 'production' },
        });

        // 2 dev errors (should not be counted)
        for (let i = 0; i < 2; i++) {
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: `dev error ${i}`,
                metadata: { environment: 'development' },
            });
        }

        const triggered = await alertsService.checkAlertRules();

        // Only 1 prod log matches, threshold=2, so should NOT fire
        expect(triggered).toHaveLength(0);
    });

    it('include_missing=true counts logs without the key', async () => {
        const { organization, project } = await createTestContext();

        // Rule: threshold=1, filter environment not_equals development, include_missing=true
        await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'not dev include missing',
            level: ['error'],
            threshold: 1,
            timeWindow: 5,
            emailRecipients: [],
            metadataFilters: [{ key: 'environment', op: 'not_equals', value: 'development', include_missing: true }],
        });

        // 1 log with no environment key (matches because include_missing=true)
        await createTestLog({
            projectId: project.id,
            level: 'error',
            message: 'no env log',
            metadata: {},
        });

        // 1 log with environment=development (does not match)
        await createTestLog({
            projectId: project.id,
            level: 'error',
            message: 'dev log',
            metadata: { environment: 'development' },
        });

        const triggered = await alertsService.checkAlertRules();

        // keyless log matches, threshold=1, so SHOULD fire
        expect(triggered).toHaveLength(1);
        expect(triggered[0].rule_name).toBe('not dev include missing');
        expect(triggered[0].log_count).toBeGreaterThanOrEqual(1);
    });

    it('include_missing=false excludes logs without the key', async () => {
        const { organization, project } = await createTestContext();

        // Rule: threshold=1, filter environment not_equals development, include_missing=false
        await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'not dev exclude missing',
            level: ['error'],
            threshold: 1,
            timeWindow: 5,
            emailRecipients: [],
            metadataFilters: [{ key: 'environment', op: 'not_equals', value: 'development', include_missing: false }],
        });

        // 1 log with no environment key (excluded because include_missing=false)
        await createTestLog({
            projectId: project.id,
            level: 'error',
            message: 'no env log',
            metadata: {},
        });

        // 1 log with environment=development (does not match not_equals)
        await createTestLog({
            projectId: project.id,
            level: 'error',
            message: 'dev log',
            metadata: { environment: 'development' },
        });

        const triggered = await alertsService.checkAlertRules();

        // 0 logs match (keyless excluded, dev excluded), threshold=1, should NOT fire
        expect(triggered).toHaveLength(0);
    });

    it('no metadata_filters preserves existing threshold behavior', async () => {
        const { organization, project } = await createTestContext();

        await alertsService.createAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'plain threshold rule',
            level: ['error'],
            threshold: 3,
            timeWindow: 5,
            emailRecipients: [],
        });

        // 3 errors with any metadata
        for (let i = 0; i < 3; i++) {
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: `error ${i}`,
                metadata: { environment: i % 2 === 0 ? 'production' : 'development' },
            });
        }

        const triggered = await alertsService.checkAlertRules();

        // All 3 match, threshold=3, should fire
        expect(triggered).toHaveLength(1);
        expect(triggered[0].log_count).toBe(3);
    });
});
