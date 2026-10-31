import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { commandById } from "../cad/commands/registry.js";

const root = new URL("../", import.meta.url);
const acceptance = JSON.parse(
  readFileSync(new URL("docs/cad-65-command-fixtures.json", root), "utf8"),
);
const ledgerText = readFileSync(
  new URL("docs/cad-command-status.md", root),
  "utf8",
);

const expected = [
  ...Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 14 }, (_, i) => `E${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 11 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 11 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 8 }, (_, i) => `B${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 9 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`),
];

function ledgerRows() {
  return ledgerText
    .split("\n")
    .filter((line) => /^\| [CESFBD]\d{2} \|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

test("Issue 19 fixture inventory closes the canonical 65 IDs without duplicates", () => {
  assert.equal(expected.length, 65);
  assert.deepEqual(acceptance.canonicalIds, expected);
  assert.equal(new Set(acceptance.canonicalIds).size, 65);
  assert.deepEqual(Object.keys(acceptance.commands), expected);

  for (const id of expected) {
    const evidenceName = acceptance.commands[id];
    const evidence = acceptance.evidenceSets[evidenceName];
    assert.ok(evidence, `${id}: missing evidence set ${evidenceName}`);
    for (const kind of ["normal", "failure"]) {
      assert.ok(evidence[kind]?.length, `${id}: missing ${kind} fixture`);
      for (const fixture of evidence[kind]) {
        assert.ok(fixture.test?.trim(), `${id}: missing ${kind} test name`);
        const fixtureUrl = new URL(fixture.path, root);
        assert.ok(
          existsSync(fixtureUrl),
          `${id}: missing ${kind} fixture file ${fixture.path}`,
        );
        assert.match(
          readFileSync(fixtureUrl, "utf8"),
          new RegExp(fixture.test.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          `${id}: missing ${kind} test ${fixture.test}`,
        );
      }
    }
    const command = commandById(id);
    assert.equal(command.id, id, `${id}: latest public registry command missing`);
  }
});

test("Issue 19 command ledger has one modes/evidence/limitations row for every ID", () => {
  const rows = ledgerRows();
  assert.equal(rows.length, 65);
  assert.deepEqual(rows.map((row) => row[0]), expected);
  for (const row of rows) {
    const [id, , , , modes, , , , , , diagnostics, fixture, , limitations] = row;
    assert.ok(modes, `${id}: modes cell is empty`);
    assert.ok(diagnostics, `${id}: diagnostics cell is empty`);
    assert.ok(fixture, `${id}: normal fixture cell is empty`);
    assert.ok(limitations, `${id}: limitations cell is empty`);
  }
});
