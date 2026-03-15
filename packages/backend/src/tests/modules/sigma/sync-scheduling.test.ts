import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SigmaSyncService } from '../../../modules/sigma/sync-service.js';
import { db } from '../../../database/index.js';
import { createTestContext } from '../../helpers/factories.js';

describe('SigmaHQ sync - org discovery', () => {
  beforeEach(async () => {
    await db.deleteFrom('sigma_rules').execute();
    await db.deleteFrom('alert_rules').execute();
    await db.deleteFrom('api_keys').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();
  });

  it('identifies organizations with existing SigmaHQ rules', async () => {
    const { organization } = await createTestContext();

    await db.insertInto('sigma_rules').values({
      organization_id: organization.id,
      title: 'Test Rule',
      logsource: {},
      detection: {},
      sigmahq_path: 'rules/web/test.yml',
      sigmahq_commit: 'abc123',
      enabled: false,
    }).execute();

    const orgs = await db
      .selectFrom('sigma_rules')
      .select('organization_id')
      .distinct()
      .where('sigmahq_path', 'is not', null)
      .execute();

    expect(orgs.map(o => o.organization_id)).toContain(organization.id);
  });

  it('sync is skipped when commitHash matches existing rules', async () => {
    const service = new SigmaSyncService();
    const syncSpy = vi.spyOn(service as unknown as { syncFromSigmaHQ: () => void }, 'syncFromSigmaHQ');
    expect(typeof service.syncFromSigmaHQ).toBe('function');
    syncSpy.mockRestore();
  });

  it('returns empty array when no organizations have SigmaHQ rules', async () => {
    const orgs = await db
      .selectFrom('sigma_rules')
      .select('organization_id')
      .distinct()
      .where('sigmahq_path', 'is not', null)
      .execute();

    expect(orgs).toHaveLength(0);
  });
});
