import { Hover, MarkupContent, MarkupKind } from "vscode-languageserver";
import { SchemaAnalyzer } from "./analyzer";
import { SchemaIndex } from "./schema-index";
import { getTypeByName } from "../schema/types";
import { getModifierByName, SHORTHAND_MODIFIERS } from "../schema/modifiers";

export class HoverProvider {
  private analyzer: SchemaAnalyzer;
  private schemaIndex: SchemaIndex;

  private static RELATION_TYPES: Record<string, string> = {
    belongsTo: "Defines a foreign key reference to another model. The foreign key is stored on this model's table.",
    hasMany: "Defines a one-to-many relationship. The foreign key is stored on the target model's table.",
    hasOne: "Defines a one-to-one relationship. The foreign key is stored on the target model's table.",
    hasAndBelongsToMany: "Defines a many-to-many relationship via a pivot/join table.",
    hasManyThrough: "Defines a many-to-many relationship through an intermediate model.",
  };

  private static NESTED_KEYWORDS: Record<string, { desc: string; example: string }> = {
    connect: {
      desc: "Reference an existing record by unique field.",
      example: "{ connect = { id = 1 } }\n{ connect = { email = \"user@example.com\" } }",
    },
    create: {
      desc: "Create a new related record inline.",
      example: "{ create = { name = \"Alice\", email = \"alice@example.com\" } }",
    },
    connectOrCreate: {
      desc: "Find an existing record or create it if not found.",
      example: "{ connectOrCreate = {\n  where = { email = \"alice@example.com\" },\n  create = { name = \"Alice\", email = \"alice@example.com\" }\n} }",
    },
  };

  constructor(analyzer: SchemaAnalyzer, schemaIndex: SchemaIndex) {
    this.analyzer = analyzer;
    this.schemaIndex = schemaIndex;
  }

  getHover(line: string, character: number): Hover | null {
    const word = this.getWordAtPosition(line, character);
    if (!word) {
      return null;
    }

    // Check if it's a Jade type
    const type = getTypeByName(word);
    if (type) {
      return this.createTypeHover(type);
    }

    // Check if it's a modifier (without :)
    const modifier = getModifierByName(word);
    if (modifier) {
      return this.createModifierHover(modifier);
    }

    // Check shorthand modifiers
    const shorthand = SHORTHAND_MODIFIERS.find(s => s.symbol === word);
    if (shorthand) {
      return this.createShorthandHover(shorthand);
    }

    // Check if it's a model name
    const model = this.schemaIndex.getModelByName(word);
    if (model) {
      return this.createModelHover(model);
    }

    // Check if it's a relation type
    const relationDesc = HoverProvider.RELATION_TYPES[word];
    if (relationDesc) {
      return this.createRelationTypeHover(word, relationDesc);
    }

    // Check if it's a nested relation keyword (connect, create, connectOrCreate)
    const nestedInfo = HoverProvider.NESTED_KEYWORDS[word];
    if (nestedInfo) {
      return this.createNestedKeywordHover(word, nestedInfo.desc, nestedInfo.example);
    }

    // Check if it's an FK field (ends with _id) — show inferred relation for any FK type
    if (word.endsWith("_id")) {
      const base = word.slice(0, -3);
      const tableName = base + "s";
      const targetModel =
        this.analyzer.findModelByName(
          base.charAt(0).toUpperCase() + base.slice(1)
        ) || this.analyzer.findModelByTable(tableName);

      if (targetModel) {
        return this.createFKHover(word, targetModel.name);
      }
    }

    return null;
  }

  private getWordAtPosition(line: string, character: number): string | null {
    const beforeCursor = line.substring(0, character);
    const afterCursor = line.substring(character);

    // Find word boundaries
    const beforeMatch = beforeCursor.match(/[\w]+$/);
    const afterMatch = afterCursor.match(/^[\w]+/);

    if (!beforeMatch && !afterMatch) {
      return null;
    }

    const before = beforeMatch ? beforeMatch[0] : "";
    const after = afterMatch ? afterMatch[0] : "";

    return before + after || null;
  }

  private createTypeHover(type: {
    name: string;
    description: string;
    sqlType: string;
    hasLength?: boolean;
    hasPrecision?: boolean;
  }): Hover {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**jade.${type.name}()**`,
        "",
        type.description,
        "",
        `SQL: \`${type.sqlType}\``,
        "",
        "Modifiers:",
        "- `!` = unique + notNull",
        "- `?` = nullable",
        "- `:default(value)` = default value",
        "- `:foreignKey(table, column)` = foreign key"
      ].join("\n")
    };

    return { contents: content };
  }

  private createModifierHover(modifier: {
    name: string;
    description: string;
    hasParams: boolean;
    paramNames?: string[];
  }): Hover {
    const params = modifier.hasParams && modifier.paramNames
      ? `(${modifier.paramNames.join(", ")})`
      : "()";

    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**:${modifier.name}${params}**`,
        "",
        modifier.description
      ].join("\n")
    };

    return { contents: content };
  }

  private createShorthandHover(shorthand: {
    symbol: string;
    description: string;
    expandsTo: string[];
  }): Hover {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**${shorthand.symbol}**`,
        "",
        shorthand.description,
        "",
        "Expands to:",
        ...shorthand.expandsTo.map(e => `- \`${e}\``)
      ].join("\n")
    };

    return { contents: content };
  }

  private createModelHover(model: {
    name: string;
    table?: string;
    fields: Array<{ name: string; type: string }>;
    relations: Array<{ type: string; model: string }>;
  }): Hover {
    const fields = model.fields
      .map(f => `- \`${f.name}\`: ${f.type}`)
      .join("\n");

    const relations = model.relations
      .map(r => `- ${r.type} → ${r.model}`)
      .join("\n");

    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**Model ${model.name}**`,
        "",
        model.table ? `Table: \`${model.table}\`` : "",
        "",
        "Fields:",
        fields || "- (none)",
        "",
        "Relations:",
        relations || "- (none)"
      ].join("\n")
    };

    return { contents: content };
  }

  private createRelationTypeHover(name: string, description: string): Hover {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**${name}**`,
        "",
        description
      ].join("\n")
    };

    return { contents: content };
  }

  private createNestedKeywordHover(keyword: string, description: string, example: string): Hover {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**${keyword}**`,
        "",
        description,
        "",
        "Example:",
        "```lua",
        example,
        "```",
      ].join("\n"),
    };
    return { contents: content };
  }

  private createFKHover(fieldName: string, targetModel: string): Hover {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        `**${fieldName}** (ForeignKey)`,
        "",
        `Infers: \`belongsTo\` → **${targetModel}**`,
        "",
        `Add \`jade.Entity("${targetModel.toLowerCase()}s", ...)\` to define the target entity.`
      ].join("\n")
    };

    return { contents: content };
  }
}
