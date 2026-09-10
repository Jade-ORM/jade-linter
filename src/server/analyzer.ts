import { SchemaParser, ParsedSchema, SchemaModel, SchemaField, SchemaError, SchemaFormat } from "./parser";
import { getTypeByName } from "../schema/types";
import { getModifierByName } from "../schema/modifiers";
import { SchemaIndex } from "./schema-index";

export interface AnalysisResult {
  schema: ParsedSchema;
  diagnostics: SchemaError[];
}

export class SchemaAnalyzer {
  private parser: SchemaParser;
  private schemaIndex: SchemaIndex;

  constructor(content: string, schemaIndex?: SchemaIndex) {
    this.parser = new SchemaParser(content);
    this.schemaIndex = schemaIndex || new SchemaIndex();
    // Parse eagerly so getFormat / findModel* work before analyze()
    this.parser.parse();
  }

  getFormat(): SchemaFormat {
    return this.parser.getFormat();
  }

  analyze(): AnalysisResult {
    const schema = this.parser.parse();
    const diagnostics: SchemaError[] = [...schema.errors];

    // Get all models from index for cross-reference
    const allModels = this.schemaIndex.getAllModels();

    // Validate each model
    for (const model of schema.models) {
      this.validateModel(model, schema, diagnostics, allModels);
    }

    return { schema, diagnostics };
  }

  private validateModel(
    model: SchemaModel,
    schema: ParsedSchema,
    diagnostics: SchemaError[],
    allModels: SchemaModel[]
  ): void {
    // Validate fields
    for (const field of model.fields) {
      this.validateField(field, model, schema, diagnostics);
    }

    // Validate relations
    for (const relation of model.relations) {
      this.validateRelation(relation, model, schema, diagnostics, allModels);
    }
  }

  private validateField(
    field: SchemaField,
    model: SchemaModel,
    schema: ParsedSchema,
    diagnostics: SchemaError[]
  ): void {
    // Check if type exists
    const type = getTypeByName(field.type);
    if (!type) {
      diagnostics.push({
        message: `Unknown type '${field.type}'. Valid types: Integer, String, Text, Boolean, Timestamp, Date, UUID, CUID, NanoID, Float, Decimal, BigInt, JSON, Enum`,
        line: field.line,
        character: field.character,
        severity: "error",
        length: field.type.length
      });
      return;
    }

    // Check if String has length (Lua Entity style only; .jade defaults to 255)
    if (schema.format === "lua" && field.type === "String" && !field.length) {
      diagnostics.push({
        message: "String requires a length. Example: jade.String(120)",
        line: field.line,
        character: field.character,
        severity: "warning"
      });
    }

    // Check modifiers
    for (const modifier of field.modifiers) {
      const mod = getModifierByName(modifier);
      if (!mod) {
        diagnostics.push({
          message: `Unknown modifier '${modifier}'`,
          line: field.line,
          character: field.character,
          severity: "error",
          length: modifier.length
        });
      }
    }

    // Info: Primary key auto
    if (field.name === "id" && field.type === "Integer") {
      diagnostics.push({
        message: "Field 'id' is an automatic Primary Key",
        line: field.line,
        character: field.character,
        severity: "information"
      });
    }

    // Warning: created_at without defaultNow
    if (field.name === "created_at" && field.type === "Timestamp") {
      if (!field.modifiers.includes("default") && !field.modifiers.includes("defaultNow")) {
        diagnostics.push({
          message: "Field 'created_at' should have defaultNow()",
          line: field.line,
          character: field.character,
          severity: "warning"
        });
      }
    }
  }

  private validateRelation(
    relation: { type: string; model: string; foreignKey?: string; inferred?: boolean; line: number; character: number },
    model: SchemaModel,
    schema: ParsedSchema,
    diagnostics: SchemaError[],
    allModels: SchemaModel[]
  ): void {
    // Check if referenced model exists (in current schema OR in index)
    const referencedInCurrent = schema.models.find(m => m.name === relation.model);
    const referencedInIndex = allModels.find(m => m.name === relation.model);

    if (!referencedInCurrent && !referencedInIndex) {
      diagnostics.push({
        message: `Model '${relation.model}' does not exist. Available models: ${allModels.map(m => m.name).join(", ") || "(none)"}`,
        line: relation.line,
        character: relation.character,
        severity: "error",
        length: relation.model.length
      });
    }

    // Check relation type
    const validRelationTypes = ["belongsTo", "hasMany", "hasOne", "hasAndBelongsToMany", "hasManyThrough"];
    if (!validRelationTypes.includes(relation.type)) {
      diagnostics.push({
        message: `Unknown relation type '${relation.type}'. Valid types: belongsTo, hasMany, hasOne, hasAndBelongsToMany, hasManyThrough`,
        line: relation.line,
        character: relation.character,
        severity: "error",
        length: relation.type.length
      });
    }

    // Info: inferred relation
    if (relation.inferred) {
      diagnostics.push({
        message: `Inferred '${relation.type}' relation via '${relation.foreignKey}' → ${relation.model}`,
        line: relation.line,
        character: relation.character,
        severity: "information",
        length: (relation.foreignKey || "").length
      });
    }
  }

  getModelAtLine(line: number): SchemaModel | undefined {
    return this.parser.getModelAtLine(line);
  }

  getFieldAtLine(line: number): { model: SchemaModel; field: SchemaField } | undefined {
    return this.parser.getFieldAtLine(line);
  }

  findModelByName(name: string): SchemaModel | undefined {
    // First check current schema
    const currentModel = this.parser.findModelByName(name);
    if (currentModel) {
      return currentModel;
    }
    // Then check index
    return this.schemaIndex.getModelByName(name);
  }

  findModelByTable(table: string): SchemaModel | undefined {
    // First check current schema
    const currentModel = this.parser.findModelByTable(table);
    if (currentModel) {
      return currentModel;
    }
    // Then check index
    return this.schemaIndex.getModelByTable(table);
  }

  getAllModels(): SchemaModel[] {
    const currentModels = this.parser.parse().models;
    const indexModels = this.schemaIndex.getAllModels();

    // Merge, preferring current schema
    const merged = new Map<string, SchemaModel>();
    for (const model of indexModels) {
      merged.set(model.name, model);
    }
    for (const model of currentModels) {
      merged.set(model.name, model);
    }

    return Array.from(merged.values());
  }
}
