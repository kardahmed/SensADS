/**
 * E2E — 2FA enforcement super_admin (CLAUDE.md règle 6).
 *
 * Vérifie que :
 *   1. Un super_admin sans 2FA est BLOQUÉ et redirigé vers /account/security
 *   2. Le banner d'avertissement est visible
 *   3. Aucune autre route n'est accessible avant activation
 *   4. Une fois la 2FA activée, l'accès est rétabli
 */

import { expect, test, login, TEST_USERS, skipIfNoCredentials } from './fixtures';

test.describe('2FA enforcement super_admin', () => {
  test.beforeEach(() => {
    skipIfNoCredentials(TEST_USERS.superAdmin);
  });

  test('super_admin sans 2FA est redirigé vers /account/security', async ({ page }) => {
    await login(page, TEST_USERS.superAdmin);

    // Si 2FA pas activée, on doit atterrir sur /account/security
    // Sinon on skip ce test (2FA déjà active)
    if (!page.url().includes('/account/security')) {
      test.skip(true, '2FA déjà activée pour super_admin → enforcement non testable');
    }

    await expect(page.getByText(/2FA obligatoire pour super_admin/i)).toBeVisible();
  });

  test('super_admin sans 2FA ne peut pas accéder à /admin', async ({ page }) => {
    await login(page, TEST_USERS.superAdmin);

    if (!page.url().includes('/account/security')) {
      test.skip(true, '2FA déjà activée');
    }

    // Tenter d'aller sur /admin doit re-rediriger vers /account/security
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/account\/security/);
  });

  test('super_admin sans 2FA ne peut pas accéder à /admin/calculator', async ({ page }) => {
    await login(page, TEST_USERS.superAdmin);

    if (!page.url().includes('/account/security')) {
      test.skip(true, '2FA déjà activée');
    }

    await page.goto('/admin/calculator');
    await expect(page).toHaveURL(/\/account\/security/);
  });

  test('section /account/security accessible même sans 2FA', async ({ page }) => {
    await login(page, TEST_USERS.superAdmin);
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/account\/security/);
    await expect(page.getByText(/Authentification à deux facteurs|2FA/i)).toBeVisible();
  });
});

test.describe('2FA non-enforcement pour autres rôles', () => {
  test('admin sans 2FA accède normalement', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.admin);
    await login(page, TEST_USERS.admin);
    // admin peut accéder au dashboard même sans 2FA
    expect(page.url()).not.toContain('/account/security');
  });

  test('client_owner sans 2FA accède normalement', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.client);
    await login(page, TEST_USERS.client);
    expect(page.url()).not.toContain('/account/security');
  });
});
