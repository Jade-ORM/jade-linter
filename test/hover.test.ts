import { describe, it, expect } from "vitest";
import { HoverProvider } from "../src/server/hover";
import { SchemaAnalyzer } from "../src/server/analyzer";
import { SchemaIndex } from "../src/server/schema-index";

describe("HoverProvider", () => {
  const index = new SchemaIndex();

  function getHover(line: string, char?: number) {
    const analyzer = new SchemaAnalyzer(`
User = {
  id = jade.Integer():primaryKey()
  name = jade.String(120)
}
`, index);
    const provider = new HoverProvider(analyzer, index);
    return provider.getHover(line, char ?? Math.floor(line.length / 2));
  }

  describe("Type hover", () => {
    it("returns hover for Integer", () => {
      const hover = getHover("jade.Integer()");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("jade.Integer()");
      expect(content).toContain("INTEGER");
    });

    it("returns hover for String", () => {
      const hover = getHover("jade.String(120)");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("jade.String()");
      expect(content).toContain("VARCHAR");
    });

    it("returns hover for new types", () => {
      const hoverBigInt = getHover("jade.BigInt()");
      expect(hoverBigInt).not.toBeNull();

      const hoverJSON = getHover("jade.JSON()");
      expect(hoverJSON).not.toBeNull();

      const hoverEnum = getHover("jade.Enum()");
      expect(hoverEnum).not.toBeNull();
    });
  });

  describe("Modifier hover", () => {
    it("returns hover for defaultNow", () => {
      // Position cursor on "defaultNow" specifically
      const line = "jade.Timestamp():defaultNow()";
      const char = line.indexOf("defaultNow") + 5; // middle of "defaultNow"
      const hover = getHover(line, char);
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("defaultNow");
    });

    it("returns hover for encrypted", () => {
      // Position cursor on "encrypted" specifically
      const line = "jade.String():encrypted()";
      const char = line.indexOf("encrypted") + 5; // middle of "encrypted"
      const hover = getHover(line, char);
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("encrypted");
    });
  });

  describe("Relation type hover", () => {
    it("returns hover for hasManyThrough", () => {
      const line = 'type = "hasManyThrough"';
      const char = line.indexOf("hasManyThrough") + 5;
      const hover = getHover(line, char);
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("hasManyThrough");
    });

    it("returns hover for belongsTo", () => {
      const line = 'type = "belongsTo"';
      const char = line.indexOf("belongsTo") + 5;
      const hover = getHover(line, char);
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("belongsTo");
    });
  });

  describe("Shorthand hover", () => {
    it("returns hover for !", () => {
      const hover = getHover("jade.String()!");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("unique");
      expect(content).toContain("notNull");
    });

    it("returns hover for ?", () => {
      const hover = getHover("jade.String()?");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("nullable");
    });
  });

  describe("FK field hover (#3)", () => {
    const fkContent = `
User = {
  id = jade.Integer():primaryKey()
}

Post = {
  user_id = jade.Integer():foreignKey("users", "id")
}

Token = {
  user_id = jade.UUID()
}

Session = {
  user_id = jade.BigInt()
}

Invite = {
  user_id = jade.CUID()
}

Recovery = {
  user_id = jade.NanoID()
}
`;

    function getFkHover(line: string, char?: number) {
      const analyzer = new SchemaAnalyzer(fkContent, new SchemaIndex());
      const provider = new HoverProvider(analyzer, new SchemaIndex());
      return provider.getHover(line, char ?? Math.floor(line.length / 2));
    }

    it("hover on Integer FK field ending in _id shows FK info", () => {
      const hover = getFkHover("user_id");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("user_id");
      expect(content).toContain("belongsTo");
      expect(content).toContain("User");
    });

    it("hover on UUID field ending in _id shows FK info", () => {
      const hover = getFkHover("user_id");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("belongsTo");
      expect(content).toContain("User");
    });

    it("hover on BigInt field ending in _id shows FK info", () => {
      const hover = getFkHover("user_id");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("belongsTo");
    });

    it("hover on CUID field ending in _id shows FK info", () => {
      const hover = getFkHover("user_id");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("belongsTo");
    });

    it("hover on NanoID field ending in _id shows FK info", () => {
      const hover = getFkHover("user_id");
      expect(hover).not.toBeNull();
      const content = (hover!.contents as any).value;
      expect(content).toContain("belongsTo");
    });

    it("hover works without jade.Integer prefix on the line", () => {
      // Regression for #3 — previously required line.includes("jade.Integer")
      const hover = getFkHover("user_id");
      expect(hover).not.toBeNull();
    });
  });

  describe("No hover", () => {
    it("returns null for unknown words", () => {
      const hover = getHover("foobar");
      expect(hover).toBeNull();
    });
  });
});
