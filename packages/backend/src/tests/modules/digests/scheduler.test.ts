import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DigestScheduler, digestScheduler } from '../../../modules/digests/scheduler.js';
import { db } from '../../../database/connection.js';
import { getCronRegistry } from '../../../queue/queue-factory.js';


vi.mock('../../../database/connection.js', () => {
    return {
        db: {
            selectFrom: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn(),
        },
    };
});


vi.mock('../../../queue/queue-factory.js', () => {
    return {
        getCronRegistry: vi.fn().mockReturnValue({
            registerCronJobs: vi.fn().mockResolvedValue(undefined),
        }),
    };
});

describe('DigestScheduler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('registerAllDigests', () => {
        it('should log and return early if no active configs are found', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            ((db as any).execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            const scheduler = new DigestScheduler();
            await scheduler.registerAllDigests();

            expect(consoleSpy).toHaveBeenCalledWith('[DigestScheduler] No active digest configs found');
            expect(getCronRegistry().registerCronJobs).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should correctly register a daily and a weekly cron job', async () => {
            const mockConfigs = [
                {
                    id: 'conf_1',
                    organization_id: 'org_1',
                    frequency: 'daily',
                    delivery_hour: 8,
                    delivery_day_of_week: null
                },
                {
                    id: 'conf_2',
                    organization_id: 'org_2',
                    frequency: 'weekly',
                    delivery_hour: 14,
                    delivery_day_of_week: 1
                }
            ];

            ((db as any).execute as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfigs);
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            const scheduler = new DigestScheduler();
            await scheduler.registerAllDigests();

            const expectedItems = [
                {
                    task: 'digest-generation',
                    cronExpression: '0 8 * * *',
                    payload: {
                        organizationId: 'org_1',
                        digestConfigId: 'conf_1',
                        frequency: 'daily'
                    },
                    identifier: 'digest:org_1'
                },
                {
                    task: 'digest-generation',
                    cronExpression: '0 14 * * 1',
                    payload: {
                        organizationId: 'org_2',
                        digestConfigId: 'conf_2',
                        frequency: 'weekly'
                    },
                    identifier: 'digest:org_2'
                }
            ];

            expect(getCronRegistry().registerCronJobs).toHaveBeenCalledWith(expectedItems);
            expect(consoleSpy).toHaveBeenCalledWith('[DigestScheduler] Registered 2 digest schedule(s)');

            consoleSpy.mockRestore();
        });
    });

    describe('export instance', () => {
        it('should export a singleton instance', () => {
            expect(digestScheduler).toBeInstanceOf(DigestScheduler);
        });
    });
});
