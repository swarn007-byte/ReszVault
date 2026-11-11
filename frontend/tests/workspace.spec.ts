import { test, expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import process from "node:process";

const apiURL = (
  process.env.PLAYWRIGHT_API_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");

function researchPdf() {
  const stream =
    "BT /F1 12 Tf 40 730 Td (The research station uses solar panels for power.) Tj 0 -20 Td (Its battery stores energy for the night.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function createVault(page: Page, name: string) {
  await page.goto("/?create=1");
  await page.getByLabel("Vault name", { exact: true }).fill(name);
  await page
    .getByLabel("Description")
    .fill("Documents and notes for the research station.");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function tools(page: Page, open: boolean) {
  if (open && !(await page.locator(".vault-details").isVisible())) {
    await page.getByRole("button", { name: "Show details" }).click();
  }
  if (!open && (await page.locator(".vault-details").isVisible())) {
    await page.getByRole("button", { name: "Hide details" }).click();
  }
}

test.afterEach(async ({ page, request }) => {
  // Each test has a fresh browser context and its own guest identity.
  const guest = await page
    .evaluate(() => localStorage.getItem("reszvault-guest-id"))
    .catch(() => null);
  if (!guest) return;
  const headers = { "x-guest-id": guest };
  const response = await request.get(`${apiURL}/books`, {
    headers,
  });
  if (!response.ok()) return;
  const body = (await response.json()) as { books: { id: string }[] };
  for (const book of body.books)
    await request.delete(`${apiURL}/books/${book.id}`, { headers });
});

test("research stays scoped from upload through notebook export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createVault(page, "Ocean research");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const note = page.getByRole("textbox", {
    name: "Research notes",
    exact: true,
  });
  await note.fill("## Observation\n\nThe station uses solar panels.");
  await note.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("solar");
    element.focus();
    element.setSelectionRange(start, start + 5);
  });
  await tools(page, true);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "sage paper", exact: true }).click();
  await tools(page, false);
  await expect(note).toHaveValue(/\*\*solar\*\*/);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.locator(".note-preview").getByRole("heading", { name: "Observation" }),
  ).toBeVisible();
  await page.reload();
  await expect(note).toHaveValue(/\*\*solar\*\*/);
  await expect(page.locator(".note-paper")).toHaveClass(/sage/);

  await page.getByRole("button", { name: /^Sources/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "research-station.pdf",
    mimeType: "application/pdf",
    buffer: researchPdf(),
  });
  await expect(page.locator(".library-source-list > button")).toContainText(
    "Indexed",
  );
  await page.locator(".library-source-list > button").click();
  await expect(
    page.getByRole("dialog", { name: "Preview research-station", exact: true }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="research-station"]')).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByRole("button", { name: "Ask sources", exact: true }).click();
  await tools(page, false);
  await page.getByRole("button", { name: /Get the big picture/ }).click();
  await expect(
    page.getByRole("button", { name: "Save to notebook", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".assistant-message .markdown")).toContainText(
    "solar panels",
  );
  await page
    .getByRole("button", { name: "Save to notebook", exact: true })
    .click();
  await expect(note).toHaveValue(/Research insight/);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const markdown = Buffer.concat(chunks).toString();
  expect(markdown).toContain("solar panels");
  expect(markdown).toContain("## Conversations");
  expect(markdown).toContain("[[research-station]]");

  await createVault(page, "Field notes");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(note).toHaveValue("");
  await expect(page.locator(".source-row")).toHaveCount(0);
  await expect(page.locator(".history-nav button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  expect(errors).toEqual([]);
});

test("library search, pinning, navigation, and appearance persist", async ({
  page,
}) => {
  await createVault(page, "Ocean research");
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search vaults" }).fill("Ocean");
  await expect(page.locator(".folder-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open Ocean research", exact: true })
    .hover();
  await page
    .getByRole("button", { name: "Pin Ocean research", exact: true })
    .click();
  await page.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(page.locator(".folder-item")).toHaveCount(1);
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".folder-grid")).toHaveClass(/list-view/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unpin Ocean research", exact: true }),
  ).toBeAttached();
  await page.goto("/settings");
  await page.getByRole("button", { name: "After hours", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  if (page.viewportSize()!.width < 760) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("button", { name: "Ocean research", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ocean research", exact: true }),
    ).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});

test("unreadable sources show an indexing error and can be removed", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await createVault(page, "Source review");
  await page.getByRole("button", { name: /^Sources/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "unreadable.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("Unreadable PDF content"),
  });
  await expect(page.locator(".library-source-list > button")).toContainText(
    "Failed",
  );
  await expect(
    page.locator(".source-library").getByRole("alert"),
  ).toBeVisible();
  await tools(page, true);
  await page
    .getByRole("button", { name: "Remove unreadable", exact: true })
    .click();
  await expect(page.locator(".source-row")).toHaveCount(0);
});
