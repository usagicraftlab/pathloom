import test from "node:test";
import assert from "node:assert/strict";
import { canonical, createCadDocument } from "../cad/document.js";
import {
  canonicalCommandDefinitions,
  commandById,
  findCommandTokenConflicts,
  registerCommand,
} from "../cad/commands/registry.js";
import {
  COMMAND_DSL_HEADER,
  changeFeatureCommandVersion,
  commandCatalogToDsl,
  commandDefinitionToDsl,
  inspectCommandDsl,
  parseCommandDsl,
  resolveCommandConflict,
} from "../cad/commands/dsl.js";
import { commandAiContext } from "../cad-chat.js";

test("P4-01 canonical 65 commands round-trip through the version-pinned DSL", () => {
  const definitions = canonicalCommandDefinitions();
  assert.equal(definitions.length, 65);
  const source = commandCatalogToDsl(definitions);
  assert.ok(source.startsWith(COMMAND_DSL_HEADER));
  assert.deepEqual(
    parseCommandDsl(source).map(({ id, version }) => `${id}@${version}`).sort(),
    definitions.map(({ id, version }) => `${id}@${version}`).sort(),
  );
  assert.equal(canonical(parseCommandDsl(source)), canonical(definitions));
});

test("P4-01 DSL reports line diagnostics and never evaluates source text", () => {
  globalThis.__pathloomDslExecuted = false;
  const source = commandDefinitionToDsl(commandById("C01")).replace(
    'defaults {"point":[0,0,0]}',
    'defaults (globalThis.__pathloomDslExecuted=true)',
  );
  assert.throws(() => parseCommandDsl(source), /CAD_COMMAND_DSL_SYNTAX: .*defaults/);
  assert.equal(globalThis.__pathloomDslExecuted, false);
  assert.throws(
    () => parseCommandDsl(source.replace(COMMAND_DSL_HEADER, "PATHLOOM COMMAND DSL 2")),
    /CAD_COMMAND_DSL_VERSION/,
  );
});

test("P4-01 alias conflicts preserve the existing command and require an explicit resolution", () => {
  const base = commandById("C04");
  const existing = {
    ...base,
    id: "test.dsl.existing",
    displayName: "DSL Existing",
    aliases: ["DSL_SHARED_ALIAS_20"],
  };
  registerCommand(existing);
  const candidate = {
    ...base,
    id: "test.dsl.candidate",
    displayName: "DSL Candidate",
    aliases: ["DSL_SHARED_ALIAS_20"],
  };
  assert.equal(findCommandTokenConflicts(candidate)[0].existingId, existing.id);
  assert.throws(
    () => registerCommand(candidate),
    (error) => error.code === "CAD_COMMAND_ALIAS_COLLISION",
  );
  const inspected = inspectCommandDsl(commandDefinitionToDsl(candidate));
  assert.equal(inspected.conflicts.length, 1);
  const resolved = resolveCommandConflict(candidate, {
    action: "replace-alias",
    alias: "DSL_REPLACED_ALIAS_20",
  });
  assert.deepEqual(resolved.aliases, ["DSL_REPLACED_ALIAS_20"]);
  assert.equal(findCommandTokenConflicts(resolved).length, 0);
  assert.equal(resolveCommandConflict(candidate, { action: "cancel" }), null);
});

test("P4-01 a catalog reports aliases shared inside the batch before anything is registered", () => {
  const base = commandById("C04");
  const first = {
    ...base,
    id: "test.dsl.batch.first",
    displayName: "DSL Batch First",
    aliases: ["DSL_BATCH_SHARED_20"],
  };
  const second = {
    ...base,
    id: "test.dsl.batch.second",
    displayName: "DSL Batch Second",
    aliases: ["DSL_BATCH_SHARED_20"],
  };
  const source = `${COMMAND_DSL_HEADER}\n\n${commandDefinitionToDsl(first, { header: false })}\n${commandDefinitionToDsl(second, { header: false })}`;
  const inspected = inspectCommandDsl(source);
  assert.equal(inspected.conflicts.length, 1);
  assert.equal(inspected.conflicts[0].existingId, first.id);
  assert.equal(commandById(first.id), null);
  assert.equal(commandById(second.id), null);
});

test("P4-01 feature command versions upgrade and roll back explicitly while both definitions stay pinned", () => {
  const document = createCadDocument();
  document.features.push({
    id: "feature-version",
    command: { id: "D05", version: 1, mode: "default" },
    featureRevision: 1,
    status: "valid",
    requestedHash: "old",
    diagnostics: [{ code: "OLD" }],
  });
  const upgraded = changeFeatureCommandVersion(document, "feature-version", 2);
  assert.deepEqual(upgraded, {
    changed: true,
    previousVersion: 1,
    targetVersion: 2,
    direction: "upgrade",
  });
  assert.equal(document.features[0].command.version, 2);
  assert.deepEqual(
    document.commandDefinitions.map(({ id, version }) => `${id}@${version}`).sort(),
    ["D05@1", "D05@2"],
  );
  assert.equal(document.features[0].status, "dirty");
  assert.equal(document.features[0].requestedHash, null);
  const rolledBack = changeFeatureCommandVersion(document, "feature-version", 1);
  assert.equal(rolledBack.direction, "rollback");
  assert.equal(document.features[0].command.version, 1);
});

test("P4-01 AI command editing reuses the local proposal path and forbids arbitrary code", () => {
  const context = commandAiContext(commandById("C04"), "既定幅を変更");
  assert.equal(context.request, "既定幅を変更");
  assert.match(context.commandDsl, /command "C04" version 1/);
  assert.match(context.rules.join("\n"), /new immutable version/);
  assert.match(context.rules.join("\n"), /Never return JavaScript/);
  assert.match(context.rules.join("\n"), /Aliases must not silently replace/);
});
