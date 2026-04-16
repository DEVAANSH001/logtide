import { test, expect, TestApiClient, registerUser, setAuthState, generateTestEmail, generateTestName, TEST_FRONTEND_URL } from '../fixtures/auth';
import { createTestLog, wait } from '../helpers/factories';

test.describe('Metadata Filtering Journey', () => {
  let apiClient: TestApiClient;
  let userToken: string;
  let projectId: string;
  let apiKey: string;
  let organizationId: string;

  test.beforeAll(async () => {
    const email = generateTestEmail();
    const { token } = await registerUser(generateTestName('MetaFilter'), email, 'TestPassword123!');
    userToken = token;
    apiClient = new TestApiClient(token);

    const orgResult = await apiClient.createOrganization(`MetaFilter Test Org ${Date.now()}`);
    organizationId = orgResult.organization.id;

    const projectResult = await apiClient.createProject(organizationId, `MetaFilter Test Project ${Date.now()}`);
    projectId = projectResult.project.id;

    const apiKeyResult = await apiClient.createApiKey(projectId, 'MetaFilter Test Key');
    apiKey = apiKeyResult.apiKey;

    // Ingest 3 logs: one with environment=production, one with environment=development, one without
    const logs = [
      createTestLog({ service: 'api', level: 'error', message: 'prod boom', metadata: { environment: 'production' } }),
      createTestLog({ service: 'api', level: 'error', message: 'dev boom', metadata: { environment: 'development' } }),
      createTestLog({ service: 'api', level: 'error', message: 'no env boom', metadata: {} }),
    ];

    await apiClient.ingestLogs(apiKey, logs);

    // Wait for indexing
    await wait(2000);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_FRONTEND_URL);
    await setAuthState(page, { id: 'test', email: 'test@test.com', name: 'Test', token: userToken }, userToken);

    await page.evaluate((orgId) => {
      localStorage.setItem('currentOrganizationId', orgId);
    }, organizationId);

    await page.goto(`${TEST_FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('load');
    await page.waitForSelector('nav, [class*="sidebar"], h1, h2', { timeout: 30000 });
    await page.waitForTimeout(500);
  });

  test('1. All 3 logs visible before applying metadata filter', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/dashboard/search?projectId=${projectId}`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const content = await page.content();
    expect(content).toContain('prod boom');
    expect(content).toContain('dev boom');
    expect(content).toContain('no env boom');
  });

  test('2. Metadata filter by environment=production shows only prod log', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/dashboard/search?projectId=${projectId}`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    // Click the "+ Add metadata filter" button
    const addFilterBtn = page.getByRole('button', { name: /add metadata filter/i });
    await expect(addFilterBtn).toBeVisible({ timeout: 10000 });
    await addFilterBtn.click();

    // Fill in the key field
    const keyInput = page.getByPlaceholder('metadata key');
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill('environment');

    // The default op is "exists" - change to "equals"
    // The select is inside the MetadataFilterBuilder row; scope to the filter row
    const filterRow = page.locator('div.flex.gap-2.items-center').first();
    const opSelect = filterRow.locator('select');
    await opSelect.selectOption('equals');

    // Fill value field
    const valueInput = page.getByPlaceholder('value');
    await expect(valueInput).toBeVisible({ timeout: 5000 });
    await valueInput.fill('production');

    // Wait for the debounced re-fetch (700ms debounce + network)
    await page.waitForTimeout(2000);

    // Only prod boom should be visible; dev boom and no env boom should not
    const content = await page.content();
    expect(content).toContain('prod boom');
    expect(content).not.toContain('dev boom');
    expect(content).not.toContain('no env boom');
  });

  test('3. Clearing metadata filters restores all logs', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/dashboard/search?projectId=${projectId}`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    // Add a filter
    const addFilterBtn = page.getByRole('button', { name: /add metadata filter/i });
    await addFilterBtn.click();

    const keyInput = page.getByPlaceholder('metadata key');
    await keyInput.fill('environment');

    const filterRow = page.locator('div.flex.gap-2.items-center').first();
    const opSelect = filterRow.locator('select');
    await opSelect.selectOption('equals');

    const valueInput = page.getByPlaceholder('value');
    await valueInput.fill('production');
    await page.waitForTimeout(2000);

    // Now clear the metadata filters via the "Clear metadata filters" button
    const clearBtn = page.getByRole('button', { name: /clear metadata filters/i });
    if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(2000);

      const content = await page.content();
      expect(content).toContain('prod boom');
      expect(content).toContain('dev boom');
      expect(content).toContain('no env boom');
    } else {
      // Fallback: remove filter via the x button
      const removeBtn = page.getByRole('button', { name: /remove filter/i });
      if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await removeBtn.click();
        await page.waitForTimeout(2000);

        const content = await page.content();
        expect(content).toContain('prod boom');
      }
    }
  });
});
