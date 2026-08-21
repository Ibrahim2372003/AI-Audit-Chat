import { test, expect } from '@playwright/test';

/**
 * Primary flow, end to end, against the actual live page (app/page.jsx):
 * empty state -> submit a URL -> tool lifecycle progresses -> a real
 * findings table or a designed error banner renders (never a JSON dump,
 * never a crash) -> zero console errors along the way.
 *
 * Note: the live input has no <label>, only a placeholder — matching the
 * real markup as it exists today, not the labeled UrlInputForm component
 * (which isn't currently wired into this page).
 */
test('audits a URL end to end', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  await expect(
    page.getByText(/paste a page in, get a prioritized seo audit back/i)
  ).toBeVisible();

  const input = page.getByPlaceholder(/paste a url to audit/i);
  await input.fill('https://example.com');
  await page.getByRole('button', { name: /^send$/i }).click();

  await expect(page.getByText(/fetching meta tags/i)).toBeVisible();

  // A live external fetch can legitimately end either way; a raw JSON dump
  // or an unhandled crash cannot.
  await expect(
    page.getByRole('table').or(page.getByText(/failed to send|fetch failed|rate limit|api credits/i))
  ).toBeVisible({ timeout: 20_000 });

  expect(consoleErrors, `Console errors during the happy path: ${consoleErrors.join('\n')}`).toEqual(
    []
  );
});
