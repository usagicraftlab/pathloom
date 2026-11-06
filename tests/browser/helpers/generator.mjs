import { expect } from "@playwright/test";

export async function ensurePrintableGenerator(page) {
  if (!(await page.locator("#cadStatus").getByText("コンポーネントを追加").count())) {
    return;
  }
  for (const name of ["Rectangle", "Stack / loft"]) {
    await page.locator("#cadSteps").click({ button: "right" });
    const search = page.getByRole("searchbox", { name: "Search components" });
    await search.fill(name);
    await search.press("Enter");
  }
  await expect(page.locator("#cadStatus")).toContainText("layers");
}
