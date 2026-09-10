export interface SchemaField {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  modifiers: string[];
  foreignKey?: { table: string; column: string };
  line: number;
  character: number;
}

export interface SchemaRelation {
  type: string;
  model: string;
  foreignKey?: string;
  inferred?: boolean;
  line: number;
  character: number;
}

export interface SchemaModel {
  name: string;
  table?: string;
  fields: SchemaField[];
  relations: SchemaRelation[];
  line: number;
  character: number;
}

export type SchemaFormat = "lua" | "jade";

export interface ParsedSchema {
  models: SchemaModel[];
  errors: SchemaError[];
  isJadeFile: boolean;
  format: SchemaFormat;
}

export interface SchemaError {
  message: string;
  line: number;
  character: number;
  severity: "error" | "warning" | "information";
  length?: number;
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes"))
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1);
  return word;
}

function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word))
    return word.slice(0, -1) + "ies";
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z"))
    return word + "es";
  return word + "s";
}

export const FK_TYPES = ["Integer", "BigInt", "UUID", "CUID", "NanoID"];

/** Canonical type names accepted by the linter (PascalCase). */
const CANONICAL_TYPES = [
  "Integer",
  "String",
  "Text",
  "Boolean",
  "Timestamp",
  "Date",
  "UUID",
  "CUID",
  "NanoID",
  "Float",
  "Decimal",
  "BigInt",
  "JSON",
  "Enum",
] as const;

const RELATION_CALL_RE =
  /^(hasMany|hasOne|belongsTo|hasAndBelongsToMany|hasManyThrough)\s*\(\s*(\w+)\s*\)/;

/**
 * Detect schema format from content.
 * Declarative `.jade` wins when a `model Name {` block is present.
 */
export function detectSchemaFormat(content: string): SchemaFormat {
  if (/^\s*model\s+[A-Za-z_]\w*\s*\{/m.test(content)) {
    return "jade";
  }
  return "lua";
}

function canonicalTypeName(raw: string): string {
  const found = CANONICAL_TYPES.find(
    (t) => t.toLowerCase() === raw.toLowerCase()
  );
  return found ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

export class SchemaParser {
  private content: string;
  private lines: string[];
  private models: SchemaModel[] = [];
  private errors: SchemaError[] = [];
  private braceDepth = 0;
  private currentModel: SchemaModel | null = null;
  private isJadeFile = false;
  private format: SchemaFormat = "lua";

  constructor(content: string) {
    this.content = content;
    this.lines = content.split("\n");
    this.format = detectSchemaFormat(content);
  }

  parse(): ParsedSchema {
    this.models = [];
    this.errors = [];
    this.braceDepth = 0;
    this.currentModel = null;
    this.isJadeFile = false;
    this.format = detectSchemaFormat(this.content);

    if (this.format === "jade") {
      this.parseJade();
    } else {
      this.parseLua();
    }

    this.detectForeignKeyCandidates();

    return {
      models: this.models,
      errors: this.errors,
      isJadeFile: this.isJadeFile,
      format: this.format,
    };
  }

  getFormat(): SchemaFormat {
    return this.format;
  }

  // ─── Lua Entity style ───────────────────────────────────────────

  private parseLua(): void {
    for (let i = 0; i < this.lines.length; i++) {
      this.parseLuaLine(this.lines[i], i);
    }
  }

  private parseLuaLine(line: string, lineIndex: number): void {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("--")) {
      return;
    }

    if (
      /require\s*\(\s*["']jade["']\s*\)/.test(trimmed) ||
      /require\s*\(\s*["']jade\.init["']\s*\)/.test(trimmed)
    ) {
      this.isJadeFile = true;
    }

    for (const ch of trimmed) {
      if (ch === "{") this.braceDepth++;
      if (ch === "}") {
        this.braceDepth--;
        if (this.braceDepth <= 0 && this.currentModel) {
          this.currentModel = null;
          this.braceDepth = 0;
        }
      }
    }

    const entityMatch = trimmed.match(/Entity\s*\(\s*["'](\w+)["']\s*,\s*\{/);
    if (entityMatch) {
      const tableName = entityMatch[1];
      const modelName =
        singularize(tableName).charAt(0).toUpperCase() +
        singularize(tableName).slice(1);
      const model: SchemaModel = {
        name: modelName,
        table: tableName,
        fields: [],
        relations: [],
        line: lineIndex,
        character: line.indexOf("Entity"),
      };
      this.models.push(model);
      this.currentModel = model;
      this.braceDepth = 1;
      return;
    }

    const modelMatch = trimmed.match(/^(\w+)\s*=\s*\{/);
    if (modelMatch) {
      const modelName = modelMatch[1];
      const model: SchemaModel = {
        name: modelName,
        fields: [],
        relations: [],
        line: lineIndex,
        character: line.indexOf(modelName),
      };
      this.models.push(model);
      this.currentModel = model;
      this.braceDepth = 1;
      return;
    }

    if (this.currentModel) {
      const tableMatch = trimmed.match(/^table\s*=\s*["'](\w+)["']/);
      if (tableMatch) {
        this.currentModel.table = tableMatch[1];
        return;
      }

      const fieldMatch = trimmed.match(
        /^(\w+)\s*=\s*jade\.(\w+)\s*\(([^)]*)\)(.*)/
      );
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        const fieldArgs = fieldMatch[3];
        const modifierText = fieldMatch[4];
        const { modifiers, foreignKey } = this.parseLuaModifiers(modifierText);

        const field: SchemaField = {
          name: fieldName,
          type: fieldType,
          length: fieldArgs ? parseInt(fieldArgs, 10) : undefined,
          modifiers,
          foreignKey,
          line: lineIndex,
          character: line.indexOf(fieldName),
        };

        this.currentModel.fields.push(field);

        if (field.foreignKey) {
          this.pushBelongsToFromForeignKey(this.currentModel, field);
        }

        return;
      }

      const relationMatch = trimmed.match(
        /\{\s*type\s*=\s*["'](\w+)["']\s*,\s*model\s*=\s*["'](\w+)["']/
      );
      if (relationMatch) {
        this.currentModel.relations.push({
          type: relationMatch[1],
          model: relationMatch[2],
          line: lineIndex,
          character: line.indexOf("{"),
        });
      }
    }
  }

  private parseLuaModifiers(text: string): {
    modifiers: string[];
    foreignKey?: { table: string; column: string };
  } {
    const modifiers: string[] = [];
    let foreignKey: { table: string; column: string } | undefined;

    const fkMatch = text.match(
      /:foreignKey\s*\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*\)/
    );
    if (fkMatch) {
      foreignKey = { table: fkMatch[1], column: fkMatch[2] };
      modifiers.push("foreignKey");
    }

    const modifierRegex = /:(\w+)\s*\([^)]*\)/g;
    let match;
    while ((match = modifierRegex.exec(text)) !== null) {
      if (!modifiers.includes(match[1])) {
        modifiers.push(match[1]);
      }
    }

    if (text.includes("!")) {
      modifiers.push("unique");
      modifiers.push("notNull");
    }
    if (text.includes("?")) {
      modifiers.push("nullable");
    }

    return { modifiers, foreignKey };
  }

  private pushBelongsToFromForeignKey(model: SchemaModel, field: SchemaField): void {
    if (!field.foreignKey) return;
    const targetName = singularize(field.foreignKey.table);
    const modelName = targetName.charAt(0).toUpperCase() + targetName.slice(1);
    const exists = model.relations.some(
      (r) => r.type === "belongsTo" && r.foreignKey === field.name
    );
    if (!exists) {
      model.relations.push({
        type: "belongsTo",
        model: modelName,
        foreignKey: field.name,
        inferred: true,
        line: field.line,
        character: field.character,
      });
    }
  }

  // ─── Declarative .jade (aligned with core parsedeclarativeSchema) ─

  private parseJade(): void {
    this.isJadeFile = true;
    let current: SchemaModel | null = null;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("--")) {
        continue;
      }

      const modelMatch = trimmed.match(/^model\s+([A-Za-z_]\w*)\s*\{?\s*$/);
      if (modelMatch) {
        const modelName = modelMatch[1];
        const openInline = trimmed.endsWith("{");
        current = {
          name: modelName,
          table: pluralize(modelName.toLowerCase()),
          fields: [],
          relations: [],
          line: i,
          character: line.indexOf(modelName),
        };
        this.models.push(current);
        this.currentModel = current;
        this.braceDepth = openInline ? 1 : 0;
        if (!openInline) {
          this.errors.push({
            message: "Expected '{' after model name",
            line: i,
            character: Math.max(0, line.length - 1),
            severity: "error",
            length: 1,
          });
        }
        continue;
      }

      // Nested brace tracking: open on '{', close on '}'
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;

      if (closes > 0 && current && trimmed === "}") {
        this.braceDepth -= closes;
        if (this.braceDepth <= 0) {
          current = null;
          this.currentModel = null;
          this.braceDepth = 0;
        }
        continue;
      }

      if (current) {
        this.braceDepth += opens - closes;

        const tableMatch = trimmed.match(/^table\s*=\s*["']([\w.]+)["']/);
        if (tableMatch) {
          current.table = tableMatch[1];
          continue;
        }

        if (/^timestamps\s*=\s*(true|false)\s*$/.test(trimmed)) {
          continue;
        }

        if (/^id\s*=\s*false\s*$/.test(trimmed)) {
          continue;
        }

        const assignMatch = trimmed.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
        if (assignMatch) {
          this.parseJadeField(current, assignMatch[1], assignMatch[2], i, line);
          continue;
        }
      }
    }

    if (current) {
      this.errors.push({
        message: "Unclosed model block — expected '}'",
        line: current.line,
        character: current.character,
        severity: "error",
        length: current.name.length,
      });
    }
  }

  private parseJadeField(
    model: SchemaModel,
    fieldName: string,
    fieldDef: string,
    lineIndex: number,
    rawLine: string
  ): void {
    const character = rawLine.indexOf(fieldName);
    const def = fieldDef.trim();

    // Relation: hasMany(Post) / belongsTo(User) / hasOne(Profile)
    const relMatch = def.match(RELATION_CALL_RE);
    if (relMatch) {
      model.relations.push({
        type: relMatch[1],
        model: relMatch[2],
        line: lineIndex,
        character,
      });
      return;
    }

    // Strip trailing modifiers: !, ?, !default(...), .default(...)
    let typePart = def;
    const modifiers: string[] = [];
    let defaultValue: string | undefined;

    const defaultMatch =
      def.match(/!default\s*\((.+)\)\s*$/) || def.match(/\.default\s*\((.+)\)\s*$/);
    if (defaultMatch) {
      defaultValue = defaultMatch[1].trim().replace(/^["']|["']$/g, "");
      modifiers.push("default");
      // `!default(...)` also implies required (core: `!` anywhere means not_null)
      if (def.includes("!default")) {
        modifiers.push("notNull");
      }
      typePart = def
        .replace(/!default\s*\((.+)\)\s*$/, "")
        .replace(/\.default\s*\((.+)\)\s*$/, "");
    }

    if (typePart.includes("!")) {
      // Core declarative: `!` means required (notNull only)
      if (!modifiers.includes("notNull")) {
        modifiers.push("notNull");
      }
      typePart = typePart.replace(/!/g, "");
    }
    if (typePart.includes("?")) {
      modifiers.push("nullable");
      typePart = typePart.replace(/\?/g, "");
    }

    typePart = typePart.trim();

    // Type with args: String(120), Decimal(10,2), Integer(), Text()
    let typeName = typePart;
    let length: number | undefined;
    let precision: number | undefined;
    let scale: number | undefined;

    const typeWithArgs = typePart.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)$/);
    if (typeWithArgs) {
      typeName = typeWithArgs[1];
      const args = typeWithArgs[2].trim();
      if (args) {
        const dec = args.match(/^(\d+)\s*,\s*(\d+)$/);
        if (dec && typeName.toLowerCase() === "decimal") {
          precision = parseInt(dec[1], 10);
          scale = parseInt(dec[2], 10);
        } else if (/^\d+$/.test(args)) {
          length = parseInt(args, 10);
        }
      }
    }

    const type = canonicalTypeName(typeName);

    const field: SchemaField = {
      name: fieldName,
      type,
      length,
      precision,
      scale,
      modifiers,
      line: lineIndex,
      character,
    };
    if (defaultValue !== undefined) {
      field.modifiers = [...modifiers];
    }
    model.fields.push(field);
  }

  // ─── Shared post-processing ─────────────────────────────────────

  private detectForeignKeyCandidates(): void {
    for (const model of this.models) {
      for (const field of model.fields) {
        if (field.foreignKey) continue;
        if (!field.name.endsWith("_id")) continue;
        if (!FK_TYPES.includes(field.type)) continue;

        const base = field.name.slice(0, -3);
        const tableName = pluralize(base);
        const modelName = base.charAt(0).toUpperCase() + base.slice(1);

        const targetModel =
          this.models.find((m) => m.table === tableName) ||
          this.models.find((m) => m.name === modelName);
        if (!targetModel) continue;

        const exists = model.relations.some(
          (r) => r.type === "belongsTo" && r.foreignKey === field.name
        );
        if (exists) continue;

        model.relations.push({
          type: "belongsTo",
          model: targetModel.name,
          foreignKey: field.name,
          inferred: true,
          line: field.line,
          character: field.character,
        });
      }
    }
  }

  getModelAtLine(line: number): SchemaModel | undefined {
    return this.models.find((m) => m.line === line);
  }

  getFieldAtLine(
    line: number
  ): { model: SchemaModel; field: SchemaField } | undefined {
    for (const model of this.models) {
      const field = model.fields.find((f) => f.line === line);
      if (field) {
        return { model, field };
      }
    }
    return undefined;
  }

  findModelByName(name: string): SchemaModel | undefined {
    return this.models.find((m) => m.name === name);
  }

  findModelByTable(table: string): SchemaModel | undefined {
    return this.models.find((m) => m.table === table);
  }
}
