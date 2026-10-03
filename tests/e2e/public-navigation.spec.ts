import { expect, test } from '@playwright/test';

test('visitor can move from the public course catalog to login and back home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Estude a Bíblia com profundidade e propósito.' })).toBeVisible();

  await page.getByRole('link', { name: 'Acessar plataforma' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

  await page.getByRole('link', { name: 'Voltar ao site' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Estude a Bíblia com profundidade e propósito.' })).toBeVisible();
});

test('mobile navigation exposes the course and live links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.locator('summary[aria-label="Abrir menu"]').click();
  const mobileMenu = page.getByRole('navigation', { name: 'Navegação móvel' });
  await expect(mobileMenu.getByRole('link', { name: 'Cursos' })).toBeVisible();
  await expect(mobileMenu.getByRole('link', { name: 'Aulas ao vivo' })).toBeVisible();
});

test('public catalog exposes course search and filters', async ({ page }) => {
  await page.goto('/cursos');

  await expect(page.getByRole('heading', { name: 'Catálogo de cursos' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar cursos' })).toBeVisible();
  await expect(page.getByLabel('Faixa de preço')).toBeVisible();
});

test('course page presents its cover, learning details, and free preview', async ({ page }) => {
  await page.goto('/cursos');
  await page.locator('.catalog-course-card').first().click();

  await expect(page.locator('.public-course-hero')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Prévia gratuita · primeira aula')).toBeVisible();
});

test('public course feedback invites enrollment without exposing the private review form', async ({ page }) => {
  await page.goto('/cursos');
  await page.locator('.catalog-course-card').first().click();

  await expect(page.getByRole('heading', { name: 'Como foi sua experiência?' })).toBeVisible();
  await expect(page.getByText('Matricule-se no curso para compartilhar sua avaliação.')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Nota do curso' })).toHaveCount(0);
});

test('certificate page requires an authenticated course member', async ({ page }) => {
  await page.goto('/dashboard/cursos/45d21578-55d5-4f59-bc63-030fc43fe23a/certificado');
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('live cards download a calendar event with its reminder', async ({ page }) => {
  await page.goto('/');
  const calendarLink = page.getByRole('link', { name: 'Adicionar ao calendário' }).first();
  if (await calendarLink.count() === 0) test.skip(true, 'No live classes are available in this environment');

  const downloadPromise = page.waitForEvent('download');
  await calendarLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
});