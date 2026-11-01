import { canonical, clone } from "../document.js";
import {
  allCommandDefinitions,
  canonicalCommandDefinitions,
  commandById,
  findCommandTokenConflicts,
  validateCommandDefinition,
} from "./registry.js";

export const COMMAND_DSL_HEADER = "PATHLOOM COMMAND DSL 1";

const orderedFields = [
  ["display", "displayName"],
  ["aliases", "aliases"],
  ["category", "category"],
  ["description", "description"],
  ["operation", "baseOperation"],
  ["mode", "mode"],
  ["adapter", "adapter"],
  ["result", "resultPolicy"],
  ["inputs", "inputs"],
  ["defaults", "defaults"],
  ["settings", "settings"],
];
const reserved = new Set([
  "format",
  "schemaVersion",
  "id",
  "version",
  ...orderedFields.map(([, property]) => property),
]);

function json(value) {
  return JSON.stringify(value);
}

export function commandDefinitionToDsl(raw, { header = true } = {}) {
  const definition = validateCommandDefinition(raw);
  const lines = header ? [COMMAND_DSL_HEADER, ""] : [];
  lines.push(`command ${json(definition.id)} version ${definition.version}`);
  for (const [keyword, property] of orderedFields)
    if (Object.hasOwn(definition, property))
      lines.push(`${keyword} ${json(definition[property])}`);
  const extensions = Object.fromEntries(
    Object.entries(definition).filter(([key]) => !reserved.has(key)),
  );
  if (Object.keys(extensions).length)
    lines.push(`extensions ${json(extensions)}`);
  lines.push("end");
  return lines.join("\n") + "\n";
}

export function commandCatalogToDsl(
  definitions = canonicalCommandDefinitions(),
) {
  if (!Array.isArray(definitions) || !definitions.length)
    throw new Error("CAD_COMMAND_DSL_EMPTY: コマンドがありません");
  return (
    COMMAND_DSL_HEADER +
    "\n\n" +
    definitions
      .map((definition) => commandDefinitionToDsl(definition, { header: false }).trimEnd())
      .join("\n\n") +
    "\n"
  );
}

function parseValue(source, lineNumber, keyword) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(
      `CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目の${keyword}はJSON値として読めません`,
    );
  }
}

export function parseCommandDsl(source) {
  if (typeof source !== "string" || source.length > 2_000_000)
    throw new Error("CAD_COMMAND_DSL_SIZE: DSLが大きすぎます");
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let index = 0;
  while (index < lines.length && (!lines[index].trim() || lines[index].trimStart().startsWith("#"))) index++;
  if (lines[index]?.trim() !== COMMAND_DSL_HEADER)
    throw new Error(`CAD_COMMAND_DSL_VERSION: 先頭に「${COMMAND_DSL_HEADER}」が必要です`);
  index++;
  const definitions = [];
  let current = null;
  for (; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    const command = /^command\s+("(?:[^"\\]|\\.)*")\s+version\s+(\d+)$/.exec(line);
    if (command) {
      if (current)
        throw new Error(`CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目の前にendが必要です`);
      current = {
        format: "pathloom-command",
        schemaVersion: 1,
        id: parseValue(command[1], lineNumber, "command"),
        version: Number(command[2]),
      };
      continue;
    }
    if (line === "end") {
      if (!current)
        throw new Error(`CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目のendに対応するcommandがありません`);
      definitions.push(validateCommandDefinition(current));
      current = null;
      continue;
    }
    if (!current)
      throw new Error(`CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目はcommandの外です`);
    const field = /^(display|aliases|category|description|operation|mode|adapter|result|inputs|defaults|settings|extensions)\s+(.+)$/.exec(line);
    if (!field)
      throw new Error(`CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目の命令は未対応です`);
    const value = parseValue(field[2], lineNumber, field[1]);
    if (field[1] === "extensions") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目のextensionsはobjectが必要です`);
      for (const [key, extension] of Object.entries(value)) {
        if (reserved.has(key))
          throw new Error(`CAD_COMMAND_DSL_SYNTAX: extensionsは${key}を上書きできません`);
        current[key] = extension;
      }
      continue;
    }
    const property = orderedFields.find(([keyword]) => keyword === field[1])?.[1];
    if (Object.hasOwn(current, property))
      throw new Error(`CAD_COMMAND_DSL_SYNTAX: ${lineNumber}行目の${field[1]}が重複しています`);
    current[property] = value;
  }
  if (current) throw new Error("CAD_COMMAND_DSL_SYNTAX: 最後のcommandにendがありません");
  if (!definitions.length) throw new Error("CAD_COMMAND_DSL_EMPTY: commandがありません");
  const keys = new Set();
  for (const definition of definitions) {
    const key = `${definition.id}@${definition.version}`;
    if (keys.has(key)) throw new Error(`CAD_COMMAND_DSL_DUPLICATE: ${key}`);
    keys.add(key);
  }
  return definitions;
}

export function inspectCommandDsl(source) {
  const definitions = parseCommandDsl(source);
  const batchConflicts = [];
  const tokens = new Map();
  for (const definition of definitions) {
    for (const [field, values] of [
      ["id", [definition.id]],
      ["displayName", [definition.displayName]],
      ["alias", definition.aliases],
    ]) {
      for (const token of values) {
        const normalized = token.trim().normalize("NFKC").toLowerCase();
        const existing = tokens.get(normalized);
        if (existing && existing.id !== definition.id) {
          batchConflicts.push({
            commandId: definition.id,
            commandVersion: definition.version,
            token,
            field,
            existingId: existing.id,
            existingVersion: existing.version,
            existingToken: existing.token,
          });
        } else if (!existing) {
          tokens.set(normalized, {
            id: definition.id,
            version: definition.version,
            token,
          });
        }
      }
    }
  }
  return {
    definitions,
    conflicts: [
      ...definitions.flatMap((definition) =>
        findCommandTokenConflicts(definition).map((conflict) => ({
          commandId: definition.id,
          commandVersion: definition.version,
          ...conflict,
        })),
      ),
      ...batchConflicts,
    ],
  };
}

export function resolveCommandConflict(raw, resolution) {
  if (resolution?.action === "cancel") return null;
  const definition = validateCommandDefinition(raw);
  const conflicts = findCommandTokenConflicts(definition);
  if (!conflicts.length) return definition;
  const next = clone(definition);
  if (resolution?.action === "rename") {
    if (typeof resolution.id !== "string" || !resolution.id.trim())
      throw new Error("CAD_COMMAND_ALIAS_RESOLUTION: 新しいcommand IDが必要です");
    if (typeof resolution.displayName !== "string" || !resolution.displayName.trim())
      throw new Error("CAD_COMMAND_ALIAS_RESOLUTION: 新しい表示名が必要です");
    next.id = resolution.id.trim();
    next.displayName = resolution.displayName.trim();
    next.aliases = (resolution.aliases || [next.displayName]).map((value) => String(value).trim()).filter(Boolean);
  } else if (resolution?.action === "replace-alias") {
    const replacement = String(resolution.alias || "").trim();
    if (!replacement)
      throw new Error("CAD_COMMAND_ALIAS_RESOLUTION: 代わりのaliasが必要です");
    const blocked = new Set(conflicts.map((conflict) => conflict.token.normalize("NFKC").toLowerCase()));
    next.aliases = next.aliases.filter(
      (alias) => !blocked.has(alias.normalize("NFKC").toLowerCase()),
    );
    next.aliases.push(replacement);
  } else {
    throw new Error("CAD_COMMAND_ALIAS_RESOLUTION: 解決方法を選択してください");
  }
  const normalized = validateCommandDefinition(next);
  const remaining = findCommandTokenConflicts(normalized);
  if (remaining.length)
    throw new Error(
      `CAD_COMMAND_ALIAS_COLLISION: 未解決の名前があります（${remaining.map((entry) => entry.token).join(", ")}）`,
    );
  return normalized;
}

export function commandVersionOptions(id) {
  return allCommandDefinitions()
    .filter((definition) => definition.id === id)
    .sort((a, b) => a.version - b.version);
}

export function pinCommandDefinition(document, raw) {
  const definition = validateCommandDefinition(raw);
  const existing = document.commandDefinitions.find(
    (candidate) => candidate.id === definition.id && candidate.version === definition.version,
  );
  if (existing && canonical(existing) !== canonical(definition))
    throw new Error(
      `CAD_COMMAND_VERSION_CONFLICT: ${definition.id}@${definition.version}の保存済み内容が異なります`,
    );
  if (!existing) document.commandDefinitions.push(clone(definition));
  return definition;
}

export function changeFeatureCommandVersion(document, featureId, targetVersion) {
  const feature = document.features.find((candidate) => candidate.id === featureId);
  if (!feature) throw new Error("CAD_COMMAND_VERSION_TARGET: 対象の履歴がありません");
  if (!Number.isInteger(targetVersion) || targetVersion < 1)
    throw new Error("CAD_COMMAND_VERSION_TARGET: 有効な版を選択してください");
  const current =
    commandById(feature.command.id, feature.command.version) ||
    document.commandDefinitions.find(
      (definition) =>
        definition.id === feature.command.id && definition.version === feature.command.version,
    );
  const target =
    commandById(feature.command.id, targetVersion) ||
    document.commandDefinitions.find(
      (definition) => definition.id === feature.command.id && definition.version === targetVersion,
    );
  if (!current || !target)
    throw new Error("CAD_COMMAND_VERSION_MISSING: 保存済みのcommand版が見つかりません");
  if (
    current.baseOperation.id !== target.baseOperation.id ||
    current.baseOperation.version !== target.baseOperation.version
  )
    throw new Error("CAD_COMMAND_VERSION_INCOMPATIBLE: native operationが異なる版へは切り替えられません");
  if (feature.command.version === targetVersion) return { changed: false, direction: "same" };
  const previousVersion = feature.command.version;
  pinCommandDefinition(document, current);
  pinCommandDefinition(document, target);
  feature.command.version = targetVersion;
  feature.command.mode = target.mode;
  feature.featureRevision++;
  feature.status = "dirty";
  feature.requestedHash = null;
  feature.diagnostics = [];
  document.documentRevision++;
  return {
    changed: true,
    previousVersion,
    targetVersion,
    direction: targetVersion > previousVersion ? "upgrade" : "rollback",
  };
}
