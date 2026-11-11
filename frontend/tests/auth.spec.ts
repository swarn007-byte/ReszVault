import { test, expect } from '@playwright/test';

test('an invalid auth response never signs the user in', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email', route => route.fulfill({ contentType: 'text/html', body: '<html>Unavailable</html>' }));
  await page.goto('/login');
  await page.getByLabel('Email address').fill('researcher@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('research-password');
  await page.getByRole('button', { name: 'Enter workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page).toHaveURL(/\/login$/);
});
