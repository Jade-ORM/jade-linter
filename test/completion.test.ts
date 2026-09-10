import { describe, it, expect } from "vitest";
import { CompletionProvider } from "../src/server/completion";
import { SchemaAnalyzer } from "../src/server/analyzer";
import { SchemaIndex } from "../src/server/schema-index";

describe("CompletionProvider", () => {
  const index = new SchemaIndex();

  function getCompletions(line: string, char?: number) {
    const analyzer = new SchemaAnalyzer(`
User = {
  id = jade.Integer():primaryKey()
  name = jade.String(120)
}
`, index);
    const provider = new CompletionProvider(analyzer, index);
    return provider.getCompletions(line, char ?? line.length);
  }

  describe("Type completions after jade.", () => {
    it("returns all types after jade.", () => {
      const items = getCompletions("jade.");
      const labels = items.map(i => i.label);
      expect(labels).toContain("Integer");
      expect(labels).toContain("String");
      expect(labels).toContain("Boolean");
      expect(labels).toContain("Text");
      expect(labels).toContain("Timestamp");
      expect(labels).toContain("Date");
      expect(labels).toContain("UUID");
      expect(labels).toContain("Float");
      expect(labels).toContain("Decimal");
      expect(labels).toContain("BigInt");
      expect(labels).toContain("JSON");
      expect(labels).toContain("Enum");
      expect(labels).toContain("CUID");
      expect(labels).toContain("NanoID");
    });
  });

  describe("Modifier completions after jade.Type().", () => {
    it("returns modifiers after jade.String().", () => {
      const items = getCompletions("jade.String().");
      const labels = items.map(i => i.label);
      expect(labels).toContain(":primaryKey");
      expect(labels).toContain(":notNull");
      expect(labels).toContain(":unique");
      expect(labels).toContain(":default");
      expect(labels).toContain(":defaultNow");
      expect(labels).toContain(":encrypted");
      expect(labels).toContain("!");
      expect(labels).toContain("?");
    });
  });

  describe("Relation type completions", () => {
    it("returns relation types after type =", () => {
      const items = getCompletions('  type = "');
      const labels = items.map(i => i.label);
      expect(labels).toContain("belongsTo");
      expect(labels).toContain("hasMany");
      expect(labels).toContain("hasOne");
      expect(labels).toContain("hasAndBelongsToMany");
      expect(labels).toContain("hasManyThrough");
    });
  });

  describe("General completions", () => {
    it("returns jade keyword", () => {
      const items = getCompletions("");
      const labels = items.map(i => i.label);
      expect(labels).toContain("jade");
    });

    it("returns Jade modules", () => {
      const items = getCompletions("");
      const labels = items.map(i => i.label);
      expect(labels).toContain("SoftDelete");
      expect(labels).toContain("Audit");
      expect(labels).toContain("Encryption");
      expect(labels).toContain("Events");
      expect(labels).toContain("cache");
      expect(labels).toContain("database");
    });

    it("does not suggest non-public jade.test", () => {
      const items = getCompletions("");
      const labels = items.map(i => i.label);
      expect(labels).not.toContain("test");
    });

    it("does not suggest non-public jade.Seed", () => {
      const items = getCompletions("");
      const labels = items.map(i => i.label);
      expect(labels).not.toContain("Seed");
    });

    it("returns Schema snippet", () => {
      const items = getCompletions("");
      const labels = items.map(i => i.label);
      expect(labels).toContain("Schema");
    });

    it("returns Entity snippet", () => {
      const items = getCompletions("");
      const labels = items.map(i => i.label);
      expect(labels).toContain("Entity");
    });
  });
});
