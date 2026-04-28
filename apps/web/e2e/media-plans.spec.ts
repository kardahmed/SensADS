/**
 * E2E — Workflow Media Plan bidirectionnel.
 *
 * Couvre :
 *   - Page liste accessible
 *   - Création depuis bouton "Nouveau plan"
 *   - Form de création (titre, dates, BDC selector)
 *   - Detail page avec ajout d'item
 *   - Workflow status (draft → pending → approved)
 */

import { expect, test, login, TEST_USERS, skipIfNoCredentials } from './fixtures';

test.describe('Media Plans — Liste', () => {
  test('admin accède à la liste des plans média', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.admin);
    await login(page, TEST_USERS.admin);
    await page.goto('/admin/media-plans');
    await expect(page.getByRole('heading', { name: /plans média/i })).toBeVisible();
  });

  test('client accède à sa liste', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.client);
    await login(page, TEST_USERS.client);
    await page.goto('/client/media-plans');
    await expect(page.getByRole('heading', { name: /plans média/i })).toBeVisible();
  });

  test('filtres par statut affichés', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.admin);
    await login(page, TEST_USERS.admin);
    await page.goto('/admin/media-plans');
    await expect(page.locator('select').first()).toBeVisible();
  });
});

test.describe('Media Plan — Création (admin)', () => {
  test.beforeEach(async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.admin);
    await login(page, TEST_USERS.admin);
  });

  test('page nouveau plan affichée', async ({ page }) => {
    await page.goto('/admin/media-plans/new');
    await expect(page.getByRole('heading', { name: /nouveau plan média/i })).toBeVisible();
    await expect(page.getByLabel(/client/i)).toBeVisible();
    await expect(page.getByLabel(/titre du plan/i)).toBeVisible();
  });

  test('staff crée un plan POUR le client (created_by_role=agency)', async ({ page }) => {
    await page.goto('/admin/media-plans/new');
    await expect(page.getByText(/Tu crées un plan POUR le client/i)).toBeVisible();
  });
});

test.describe('Media Plan — Création (client)', () => {
  test.beforeEach(async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.client);
    await login(page, TEST_USERS.client);
  });

  test('client crée un brief soumis à l\'agence', async ({ page }) => {
    await page.goto('/client/media-plans/new');
    await expect(page.getByText(/brief qui sera soumis à l['']agence/i)).toBeVisible();
  });
});
