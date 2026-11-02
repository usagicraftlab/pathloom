import { test, expect, selectCadCommand, selectCadMenuItem } from "./fixtures/cad.mjs";

test("P4-01 command DSL exposes all canonical 65 registry IDs and pins a new immutable version", async ({ page }) => {
  await selectCadMenuItem(page, "#modelCommandDsl");
  const dialog = page.locator(".model-command-dsl-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "正規65件を表示" }).click();
  const source = dialog.getByRole("textbox", { name: "コマンドDSL" });
  await expect(source).toHaveValue(/PATHLOOM COMMAND DSL 1/);
  expect(await source.inputValue().then((value) => (value.match(/^command /gm) || []).length)).toBe(65);
  await dialog.getByRole("button", { name: "検証して文書へ固定" }).click();
  await expect(dialog.getByRole("status")).toContainText("変更なし65件");

  const edited = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { commandDefinitionToDsl } = await import("/cad/commands/dsl.js");
    const command = commandById("C04");
    command.version = 2;
    command.defaults.widthMm = 72;
    return commandDefinitionToDsl(command);
  });
  await source.fill(edited);
  await dialog.getByRole("button", { name: "検証して文書へ固定" }).click();
  await expect(dialog.getByRole("status")).toContainText("1件を検証・登録して文書に版固定");
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.commandDefinitions.some(
        (definition) => definition.id === "C04" && definition.version === 2 && definition.defaults.widthMm === 72,
      ),
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).last().click();
  expect(await page.evaluate(async () => (await import("/cad/commands/registry.js")).findCommands().find((definition) => definition.id === "C04")?.version)).toBe(2);
  expect(await page.evaluate(() => window.PathloomModel.store.document.commandDefinitions.some((definition) => definition.id === "C04" && definition.version === 2))).toBe(true);
});

test("P4-01 alias collision is explicit and selected history can roll back and upgrade its pinned command version", async ({ page }) => {
  await selectCadCommand(page, "Box");
  await page.locator("#modelCommit").click();
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
  await page.locator(".model-history-entry").last().click();
  await selectCadMenuItem(page, "#modelCommandDsl");
  const dialog = page.locator(".model-command-dsl-dialog");
  const versionPanel = dialog.locator(".model-command-dsl-version");
  await expect(versionPanel).toBeVisible();
  await expect(versionPanel).toContainText("B01@2");
  await versionPanel.getByRole("button", { name: "版を切り替える" }).click();
  await expect(dialog.getByRole("status")).toContainText("rollback");
  expect(await page.evaluate(() => window.PathloomModel.store.document.features.at(-1).command.version)).toBe(1);
  await versionPanel.getByRole("button", { name: "版を切り替える" }).click();
  await expect(dialog.getByRole("status")).toContainText("upgrade");
  expect(await page.evaluate(() => window.PathloomModel.store.document.features.at(-1).command.version)).toBe(2);
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.commandDefinitions
        .filter((definition) => definition.id === "B01")
        .map((definition) => definition.version)
        .sort(),
    ),
  ).toEqual([1, 2]);

  const collision = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { commandDefinitionToDsl } = await import("/cad/commands/dsl.js");
    const command = commandById("C04");
    command.id = "user.issue20.rectangle";
    command.displayName = "Issue 20 Rectangle";
    command.aliases = ["Rectangle"];
    return commandDefinitionToDsl(command);
  });
  await dialog.getByRole("textbox", { name: "コマンドDSL" }).fill(collision);
  await dialog.getByRole("button", { name: "検証して文書へ固定" }).click();
  const conflict = dialog.locator("[data-command-dsl-conflict]");
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText("Rectangle ↔ C04");
  await conflict.getByLabel("代わりのalias").fill("Issue20Rectangle");
  await conflict.getByRole("button", { name: "別名を置換" }).click();
  await expect(conflict).toBeHidden();
  await dialog.getByRole("button", { name: "検証して文書へ固定" }).click();
  await expect(dialog.getByRole("status")).toContainText("1件を検証・登録して文書に版固定");
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.commandDefinitions.find(
        (definition) => definition.id === "user.issue20.rectangle",
      )?.aliases,
    ),
  ).toEqual(["Issue20Rectangle"]);
});
