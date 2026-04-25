import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DigestGeneratorService } from '../../../modules/digests/generator.js';
import { db } from '../../../database/connection.js';
import { sql } from 'kysely';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-message-id' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

describe('DigestGeneratorService Integration', () => {
  let generator: DigestGeneratorService;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    await db.deleteFrom('digest_recipients').execute();
    await db.deleteFrom('digest_configs').execute();
    await db.deleteFrom('logs').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('users').execute();
    
    generator = new DigestGeneratorService();
  });

  it('should correctly count log volume using reservoir abstract engine on database', async () => {
    // Create a user first (required for organization owner_id)
    const user = await db
      .insertInto('users')
      .values({
        email: 'test@example.com',
        password_hash: 'test_hash',
        name: 'Test User',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const org = await db
      .insertInto('organizations')
      .values({
        name: 'Test Org',
        slug: 'test-org',
        owner_id: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    
    const project = await db
      .insertInto('projects')
      .values({
        organization_id: org.id,
        name: 'Test Project',
        slug: 'test-project',
        user_id: user.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const config = await db
      .insertInto('digest_configs')
      .values({
        organization_id: org.id,
        frequency: 'daily',
        delivery_hour: 8,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await db
      .insertInto('digest_recipients')
      .values({
        organization_id: org.id,
        digest_config_id: config.id,
        email: 'digest@example.com',
        unsubscribe_token: 'test_token',
      })
      .execute();

    const now = new Date();
    const currentPeriodBucket = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const previousPeriodBucket = new Date(now.getTime() - 26 * 60 * 60 * 1000); // 26 hours ago

    // Count queries in the generator filter by organization_id.
    await sql`ALTER TABLE logs ADD COLUMN IF NOT EXISTS organization_id UUID`.execute(db);

    await sql`
      INSERT INTO logs (time, project_id, organization_id, service, level, message)
      SELECT ${currentPeriodBucket}::timestamptz, ${project.id}::uuid, ${org.id}::uuid, 'test-service', 'info', 'test log'
      FROM generate_series(1, 100)
    `.execute(db);

    await sql`
      INSERT INTO logs (time, project_id, organization_id, service, level, message)
      SELECT ${previousPeriodBucket}::timestamptz, ${project.id}::uuid, ${org.id}::uuid, 'test-service', 'info', 'test log'
      FROM generate_series(1, 50)
    `.execute(db);

    await generator.generateAndSendDigest({
      organizationId: org.id,
      digestConfigId: config.id,
      frequency: 'daily',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);

    const emailCall = mockSendMail.mock.calls[0][0];
    expect(emailCall.text).toContain('100'); // current count
    expect(emailCall.text).toContain('+50'); // previous was 50 (150 total inserted, 100 recent, 50 older)
  });
});
