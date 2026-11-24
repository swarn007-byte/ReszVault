import { expect, test } from "@playwright/test";

test("answers from the selected vault only", async ({ page }) => {
  await page.goto("/django-demo");

  const vault = page.getByLabel("Vault");
  const question = page.getByLabel("Question");
  const ask = page.getByRole("button", { name: "Ask", exact: true });
  const answer = page.getByRole("region", { name: "Answer" });

  await vault.selectOption("returns");
  await question.fill("What is the return window?");
  await ask.click();
  await expect(answer).toContainText("30 days from delivery");
  await expect(answer.getByRole("list", { name: "Sources" })).toContainText("Return Policy, page 1");

  await vault.selectOption("shipping");
  await expect(answer).toHaveCount(0);
  await ask.click();
  await expect(answer).toContainText("No matching passage was found in this vault.");
  await expect(answer.getByRole("list", { name: "Sources" })).toHaveCount(0);

  await question.fill("How long does standard shipping take?");
  await ask.click();
  await expect(answer).toContainText("three business days");
  await expect(answer.getByRole("list", { name: "Sources" })).toContainText("Shipping Guide, page 1");
});
