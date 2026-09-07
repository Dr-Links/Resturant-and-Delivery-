import { test, expect } from '@playwright/test';

// Lightweight, server-rendered pages only — the AR/3D table experience is left
// out of E2E on purpose (WebGL model-viewer is unreliable in headless CI).

test('landing page shows the hero and entry points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /see the food/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /open table 12/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /driver dashboard/i })).toBeVisible();
});

test('staff login page renders the sign-in form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /staff sign in/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('driver dashboard prompts a driver to sign in', async ({ page }) => {
  await page.goto('/driver');
  await expect(page.getByRole('heading', { name: /driver sign in/i })).toBeVisible();
  await expect(page.getByPlaceholder(/email/i)).toBeVisible();
});

test('delivery page is reachable', async ({ page }) => {
  const res = await page.goto('/delivery');
  expect(res?.status()).toBeLessThan(400);
});
