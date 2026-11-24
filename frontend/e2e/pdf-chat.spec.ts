import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/return-policy.pdf", import.meta.url));

test("guest uploads a PDF and gets a grounded answer", async ({ page, browser }) => {
  await page.goto("/guest");
  const upload = page.locator('input[type="file"]');
  const fileRequest = page.waitForResponse(
    (response) => response.url().endsWith("/books/upload") && response.request().method() === "POST",
  );
  await upload.setInputFiles(fixture);
  const created = await fileRequest;
  expect(created.status()).toBe(202);
  const { book } = await created.json();
  const guestId = await page.evaluate(() => localStorage.getItem("reszvault-guest-id"));
  expect(guestId).toBeTruthy();

  try {
    const question = page.getByPlaceholder("Type your message here...");
    await question.fill("What is the return window?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/30 days from delivery/)).toBeVisible();

    const otherGuest = await browser.newContext();
    try {
      const otherPage = await otherGuest.newPage();
      const listRequest = otherPage.waitForResponse((response) => response.url().endsWith("/books"));
      await otherPage.goto("/guest");
      expect(await (await listRequest).json()).toEqual({ books: [] });
    } finally {
      await otherGuest.close();
    }
  } finally {
    await page.request.delete(`/books/${book.id}`, { headers: { "x-guest-id": guestId ?? "" } });
  }
});

test("guest sees conflicting policies and both page citations", async ({ page }) => {
  await page.goto("/guest");
  const upload = page.locator('input[type="file"]');
  const bookIds: string[] = [];

  try {
    for (const filename of ["return-policy.pdf", "short-return-policy.pdf"]) {
      const file = fileURLToPath(new URL(`./fixtures/${filename}`, import.meta.url));
      const pending = page.waitForResponse(
        (response) => response.url().endsWith("/books/upload") && response.request().method() === "POST",
      );
      await upload.setInputFiles(file);
      const response = await pending;
      expect(response.status()).toBe(202);
      const { book } = await response.json();
      bookIds.push(book.id);
      await expect(page.getByRole("button", { name: "Upload PDFs" })).toBeEnabled();
    }

    await page.getByPlaceholder("Type your message here...").fill("Is the return window 15 or 30 days?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/sources give different durations/)).toBeVisible();
    await expect(page.getByText(/30 days from delivery/)).toBeVisible();
    await expect(page.getByText(/15 days from delivery/)).toBeVisible();
    await expect(page.getByText("return-policy (page 1):", { exact: true })).toBeVisible();
    await expect(page.getByText("short-return-policy (page 1):", { exact: true })).toBeVisible();
  } finally {
    const guestId = await page.evaluate(() => localStorage.getItem("reszvault-guest-id"));
    for (const id of bookIds) {
      await page.request.delete(`/books/${id}`, { headers: { "x-guest-id": guestId ?? "" } });
    }
  }
});
