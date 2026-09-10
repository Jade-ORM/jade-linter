import { describe, it, expect } from "vitest";
import { CompletionProvider } from "../src/server/completion";
import { SchemaAnalyzer } from "../src/server/analyzer";
import { SchemaIndex } from "../src/server/schema-index";

const JADE_CONTENT = `
model User {
    name = String(120)!
    posts = hasMany(Post)
}

model Post {
    title = String(255)!
}
`;

describe("CompletionProvider .jade mode", () => {
  const index = new SchemaIndex();

  function getCompletions(line: string, char?: number) {
    const analyzer = new SchemaAnalyzer(JADE_CONTENT, index);
    const provider = new CompletionProvider(analyzer, index);
    return provider.getCompletions(line, char ?? line.length);
  }

  it("suggests types after field assignment", () => {
    const items = getCompletions("    email = ");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("String");
    expect(labels).toContain("Integer");
    expect(labels).toContain("Text");
    expect(labels).toContain("UUID");
  });

  it("suggests modifiers after a complete type", () => {
    const items = getCompletions("    name = String(120)");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("!");
    expect(labels).toContain("?");
  });

  it("suggests relation constructors", () => {
    const items = getCompletions("    posts = hasMany(");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("hasMany");
    expect(labels).toContain("belongsTo");
    expect(labels).toContain("hasOne");
  });

  it("suggests model keyword and known models at top level", () => {
    const items = getCompletions("");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("model");
    expect(labels).toContain("User");
    expect(labels).toContain("Post");
  });

  it("suggests table/timestamps options", () => {
    const items = getCompletions("    ");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("table");
    expect(labels).toContain("timestamps");
  });

  it("does not suggest jade. module style in jade format", () => {
    const items = getCompletions("");
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain("SoftDelete");
    expect(labels).not.toContain("Entity");
  });
});
