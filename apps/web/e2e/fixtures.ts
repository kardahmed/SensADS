/**
 * Fixtures Playwright partagées entre les specs.
 *
 * Définit les comptes de test (super_admin, admin, TM, client_owner, client_member).
 * Pour fonctionner, ces comptes doivent exister dans le projet Supabase de test.
 *
 * Variables d'env attendues (CI ou local .env.test) :
 *   E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_TM_EMAIL, E2E_TM_PASSWORD
 *   E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 *
 * Si les vars ne sont pas définies, les tests skip avec un message clair.
 */

import { test as base, expect, type Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  role: 'super_admin' | 'admin' | 'traffic_manager' | 'client_owner' | 'client_member';
}

export const TEST_USERS = {
  superAdmin: {
    email: process.env.E2E_SUPER_ADMIN_EMAIL ?? '',
    password: process.env.E2E_SUPER_ADMIN_PASSWORD ?? '',
    role: 'super_admin' as const,
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? '',
    password: process.env.E2E_ADMIN_PASSWORD ?? '',
    role: 'admin' as const,
  },
  tm: {
    email: process.env.E2E_TM_EMAIL ?? '',
    password: process.env.E2E_TM_PASSWORD ?? '',
    role: 'traffic_manager' as const,
  },
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? '',
    password: process.env.E2E_CLIENT_PASSWORD ?? '',
    role: 'client_owner' as const,
  },
} satisfies Record<string, TestUser>;

/**
 * Connecte un user via le formulaire de login.
 */
export async function login(page: Page, user: TestUser): Promise<void> {
  if (!user.email || !user.password) {
    test.skip(true, `Credentials manquants pour ${user.role} (E2E_${user.role.toUpperCase()}_EMAIL/PASSWORD)`);
  }
  await page.goto('/auth/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/mot de passe|password/i).fill(user.password);
  await page.getByRole('button', { name: /se connecter|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 10_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /menu|user/i }).first().click().catch(() => {});
  await page.getByText(/se déconnecter|logout|sign out/i).click().catch(() => {});
  await page.waitForURL(/\/auth\/login/, { timeout: 5000 }).catch(() => {});
}

/**
 * Skip helper si les credentials du user ne sont pas configurés.
 */
export function skipIfNoCredentials(user: TestUser): void {
  if (!user.email || !user.password) {
    test.skip(true, `Credentials E2E manquants pour ${user.role}`);
  }
}

export const test = base;
export { expect };
