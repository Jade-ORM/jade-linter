import { CompletionItem, CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { SchemaAnalyzer } from "./analyzer";
import { SchemaIndex } from "./schema-index";
import { JADE_TYPES } from "../schema/types";
import { JADE_MODIFIERS, SHORTHAND_MODIFIERS } from "../schema/modifiers";

export class CompletionProvider {
  private analyzer: SchemaAnalyzer;
  private schemaIndex: SchemaIndex;

  constructor(analyzer: SchemaAnalyzer, schemaIndex: SchemaIndex) {
    this.analyzer = analyzer;
    this.schemaIndex = schemaIndex;
  }

  getCompletions(line: string, character: number): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Check context — order matters (more specific first)
    if (this.isAfterJade(line, character)) {
      items.push(...this.getTypeCompletions());
    } else if (this.isAfterType(line, character)) {
      items.push(...this.getModifierCompletions());
    } else if (this.isInForeignKey(line, character)) {
      items.push(...this.getTableNameCompletions());
    } else if (this.isInModelReference(line, character)) {
      items.push(...this.getModelNameCompletions());
    } else if (this.isInRelations(line, character)) {
      items.push(...this.getRelationTypeCompletions());
    } else if (this.isInNestedConnect(line, character)) {
      items.push(...this.getNestedFieldCompletions(line, "connect"));
    } else if (this.isInNestedCreate(line, character)) {
      items.push(...this.getNestedFieldCompletions(line, "create"));
    } else if (this.isInNestedRelation(line, character)) {
      items.push(...this.getNestedRelationCompletions());
    } else {
      items.push(...this.getGeneralCompletions());
    }

    return items;
  }

  private isAfterJade(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    return /jade\.$/.test(beforeCursor);
  }

  private isAfterType(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    return /jade\.\w+\(\)\s*\./.test(beforeCursor);
  }

  private isInForeignKey(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    return /foreignKey\(\s*["']/.test(beforeCursor);
  }

  private isInModelReference(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    // Check for model = "|" or model = "|"
    return /model\s*=\s*["']$/.test(beforeCursor);
  }

  private isInRelations(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    return /type\s*=\s*["']$/.test(beforeCursor);
  }

  /** Inside a relation field: `user = { ` → suggest connect, create, connectOrCreate */
  private isInNestedRelation(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    // Match: word = {  where word looks like a relation name (ends with nothing after {)
    return /\w+\s*=\s*\{\s*$/.test(beforeCursor) && /Entity\s*\(/.test(line) === false;
  }

  /** Inside connect block: `connect = { ` → suggest target entity fields */
  private isInNestedConnect(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    return /connect\s*=\s*\{\s*$/.test(beforeCursor);
  }

  /** Inside create block: `create = { ` → suggest target entity fields */
  private isInNestedCreate(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    return /create\s*=\s*\{\s*$/.test(beforeCursor);
  }

  private getTypeCompletions(): CompletionItem[] {
    return JADE_TYPES.map(type => {
      const item: CompletionItem = {
        label: type.name,
        kind: CompletionItemKind.Class,
        detail: type.description,
        documentation: `SQL: ${type.sqlType}`
      };

      if (type.hasLength) {
        item.insertText = `${type.name}(\${1:${type.defaultLength || 255}})`;
        item.insertTextFormat = InsertTextFormat.Snippet;
      } else {
        item.insertText = `${type.name}()`;
        item.insertTextFormat = InsertTextFormat.Snippet;
      }

      return item;
    });
  }

  private getModifierCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Add shorthand modifiers
    SHORTHAND_MODIFIERS.forEach(shorthand => {
      items.push({
        label: shorthand.symbol,
        kind: CompletionItemKind.Operator,
        detail: shorthand.description,
        documentation: `Expands to: ${shorthand.expandsTo.join(", ")}`
      });
    });

    // Add full modifiers
    JADE_MODIFIERS.forEach(modifier => {
      const item: CompletionItem = {
        label: `:${modifier.name}`,
        kind: CompletionItemKind.Method,
        detail: modifier.description
      };

      if (modifier.hasParams && modifier.paramNames) {
        const params = modifier.paramNames
          .map((p, i) => `\${${i + 1}:${p}}`)
          .join(", ");
        item.insertText = `:${modifier.name}(${params})`;
        item.insertTextFormat = InsertTextFormat.Snippet;
      } else {
        item.insertText = `:${modifier.name}()`;
        item.insertTextFormat = InsertTextFormat.Snippet;
      }

      items.push(item);
    });

    return items;
  }

  private getModelNameCompletions(): CompletionItem[] {
    const models = this.schemaIndex.getAllModels();

    return models.map(model => ({
      label: model.name,
      kind: CompletionItemKind.Enum,
      detail: `Model ${model.name}`,
      documentation: model.table ? `Table: ${model.table}` : undefined
    }));
  }

  private getTableNameCompletions(): CompletionItem[] {
    const tables = this.schemaIndex.getTableNames();

    return tables.map(table => ({
      label: table,
      kind: CompletionItemKind.Enum,
      detail: `Table: ${table}`
    }));
  }

  private getRelationTypeCompletions(): CompletionItem[] {
    const relationTypes = ["belongsTo", "hasMany", "hasOne", "hasAndBelongsToMany", "hasManyThrough"];

    return relationTypes.map(type => ({
      label: type,
      kind: CompletionItemKind.Enum,
      detail: `Relation type: ${type}`
    }));
  }

  private getNestedRelationCompletions(): CompletionItem[] {
    return [
      {
        label: "connect",
        kind: CompletionItemKind.Keyword,
        detail: "Reference an existing record",
        documentation: "{ connect = { id = 1 } } or { connect = { email = \"...\" } }",
        insertText: "connect = { ${1:id} = ${2:1} }",
        insertTextFormat: InsertTextFormat.Snippet,
      },
      {
        label: "create",
        kind: CompletionItemKind.Keyword,
        detail: "Create a new related record",
        documentation: "{ create = { name = \"...\", email = \"...\" } }",
        insertText: "create = {\n\t${1:name} = ${2:\"value\"},\n}",
        insertTextFormat: InsertTextFormat.Snippet,
      },
      {
        label: "connectOrCreate",
        kind: CompletionItemKind.Keyword,
        detail: "Find existing or create new record",
        documentation: "{ connectOrCreate = { where = { email = \"...\" }, create = { name = \"...\" } } }",
        insertText: "connectOrCreate = {\n\twhere = { ${1:email} = ${2:\"value\"} },\n\tcreate = { ${3:name} = ${4:\"value\"} },\n}",
        insertTextFormat: InsertTextFormat.Snippet,
      },
      {
        label: "id",
        kind: CompletionItemKind.Keyword,
        detail: "Shorthand for connect by ID",
        documentation: "{ id = 1 } — equivalent to { connect = { id = 1 } }",
        insertText: "id = ${1:1}",
        insertTextFormat: InsertTextFormat.Snippet,
      },
    ];
  }

  /** Suggest fields from the target entity for nested connect/create blocks */
  private getNestedFieldCompletions(line: string, context: "connect" | "create"): CompletionItem[] {
    const models = this.schemaIndex.getAllModels();

    // Try to infer which relation we're inside from the line
    // Look for pattern: relationName = { connect = { or relationName = { create = {
    const relMatch = line.match(/(\w+)\s*=\s*\{/);
    const relName = relMatch ? relMatch[1] : null;

    if (!relName) {
      // Fallback: suggest common FK fields
      return [
        { label: "id", kind: CompletionItemKind.Field, detail: "Primary key" },
      ];
    }

    // Find the target model by relation name (table name convention)
    const targetTable = relName; // e.g., "user" -> need to find "users" table
    const targetModel = models.find(m => m.table === targetTable)
      || models.find(m => m.table === targetTable + "s")
      || models.find(m => m.name.toLowerCase() === targetTable.toLowerCase());

    if (!targetModel) {
      return [
        { label: "id", kind: CompletionItemKind.Field, detail: "Primary key" },
      ];
    }

    // For connect: suggest unique fields (id, email, etc.)
    if (context === "connect") {
      return targetModel.fields
        .filter(f => f.name === "id" || f.modifiers.includes("unique") || f.name === "email")
        .map(f => ({
          label: f.name,
          kind: CompletionItemKind.Field,
          detail: `${f.type}${f.modifiers.includes("unique") ? " (unique)" : ""}`,
        }));
    }

    // For create: suggest all required fields
    return targetModel.fields
      .filter(f => f.name !== "id" && f.name !== "created_at" && f.name !== "updated_at")
      .map(f => ({
        label: f.name,
        kind: CompletionItemKind.Field,
        detail: f.type,
        documentation: f.modifiers.length > 0 ? f.modifiers.join(", ") : undefined,
      }));
  }

  private getGeneralCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Add jade keyword
    items.push({
      label: "jade",
      kind: CompletionItemKind.Module,
      detail: "Jade ORM module"
    });

    // Add common patterns
    items.push({
      label: "Schema",
      kind: CompletionItemKind.Class,
      detail: "Jade Schema definition",
      insertText: "Schema({\n\tmodels: {\n\t\t${1:ModelName}: {\n\t\t\tfields: {\n\t\t\t\t${2:id} = jade.Integer(),\n\t\t\t}\n\t\t}\n\t}\n})",
      insertTextFormat: InsertTextFormat.Snippet
    });

    items.push({
      label: "Entity",
      kind: CompletionItemKind.Class,
      detail: "Jade Entity definition",
      insertText: 'Entity("${1:table_name}", {\n\t${2:id} = jade.Integer():primaryKey(),\n})',
      insertTextFormat: InsertTextFormat.Snippet
    });

    // Public modules only — jade.test / jade.Seed are require-only, not on the jade table
    const modules = [
      { name: "SoftDelete", detail: "Soft delete setup — jade.SoftDelete.setup(entity)" },
      { name: "Audit", detail: "Audit trail — jade.Audit.setup(entity)" },
      { name: "Encryption", detail: "Column encryption — jade.Encryption.configure({...})" },
      { name: "Events", detail: "Event system — jade.Events.define(entity, names)" },
      { name: "cache", detail: "Query caching — jade.cache.get/set/delete" },
      { name: "database", detail: "Multi-database — jade.database.configure({...})" },
    ];

    modules.forEach(mod => {
      items.push({
        label: mod.name,
        kind: CompletionItemKind.Module,
        detail: mod.detail
      });
    });

    return items;
  }
}
