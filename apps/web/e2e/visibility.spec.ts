/**
 * E2E — Vue client / vue agence.
 *
 * Vérifie que :
 *   1. Le client_owner ne voit AUCUN bouton ou lien vers /admin/* (sidebar épurée)
 *   2. Le client_owner accède bien à /client/* (BDC, devis, campagnes...)
 *   3. Le client_owner reçoit un 403/redirect s'il tente /admin/profitability
 *   4. Le toggle DZD/USD/Both est visible dans le header pour tous les rôles
 */

import { expect, test, login, TEST_USERS, skipIfNoCredentials } from './fixtures';

test.describe('Vue client (client_owner)', () => {
  test.beforeEach(async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.client);
    await login(page, TEST_USERS.client);
  });

  test('ne voit AUCUN lien /admin/* dans la sidebar', async ({ page }) => {
    // Pas de Calculator
    await expect(page.getByRole('link', { name: /calculator|calculateur/i })).toHaveCount(0);
    // Pas de Rentabilité
    await expect(page.getByRole('link', { name: /rentabilité|profitability/i })).toHaveCount(0);
    // Pas de Comptes pub
    await expect(page.getByRole('link', { name: /comptes pub/i })).toHaveCount(0);
    // Pas de Taux change
    await expect(page.getByRole('link', { name: /taux change|exchange rates/i })).toHaveCount(0);
  });

  test('accède bien aux pages /client/*', async ({ page }) => {
    await page.goto('/client');
    await expect(page).toHaveURL(/\/client/);
    // Sidebar contient bien des entrées /client/*
    await expect(page.getByRole('link', { name: /devis|quotes/i }).first()).toBeVisible();
  });

  test('redirigé loin de /admin/profitability', async ({ page }) => {
    await page.goto('/admin/profitability');
    // Doit rediriger vers /403 ou ailleurs (pas afficher la page)
    await expect(page).not.toHaveURL(/\/admin\/profitability/);
  });

  test('redirigé loin de /admin/calculator', async ({ page }) => {
    await page.goto('/admin/calculator');
    await expect(page).not.toHaveURL(/\/admin\/calculator/);
  });

  test('redirigé loin de /admin/exchange-rates', async ({ page }) => {
    await page.goto('/admin/exchange-rates');
    await expect(page).not.toHaveURL(/\/admin\/exchange-rates/);
  });
});

test.describe('Toggle DZD/USD/Both visible pour tous', () => {
  test('admin voit le toggle dans le header', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.admin);
    await login(page, TEST_USERS.admin);
    // Le bouton toggle est dans le header (à côté de la cloche)
    await expect(page.getByRole('button', { name: /DZD|USD/i }).first()).toBeVisible();
  });

  test('client voit le toggle dans le header', async ({ page }) => {
    skipIfNoCredentials(TEST_USERS.client);
    await login(page, TEST_USERS.client);
    await expect(page.getByRole('button', { name: /DZD|USD/i }).first()).toBeVisible();
  });
});
