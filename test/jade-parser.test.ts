import { describe, it, expect } from "vitest";
import { SchemaParser, detectSchemaFormat } from "../src/server/parser";

const JADE_SAMPLE = `
model User {
    table = "users"
    name = String(120)!
    email = String(255)!
    bio = Text()?
    role = String(50)!default("user")
    posts = hasMany(Post)
}

model Post {
    title = String(255)!
    content = Text()
    user_id = Integer!
    author = belongsTo(User)
}
`;

describe("detectSchemaFormat", () => {
  it("detects jade declarative from model blocks", () => {
    expect(detectSchemaFormat(JADE_SAMPLE)).toBe("jade");
  });

  it("detects lua Entity style", () => {
    expect(
      detectSchemaFormat(`
local jade = require("jade")
User = jade.Entity("users", {
  id = jade.Integer():primaryKey()
})
`)
    ).toBe("lua");
  });

  it("defaults to lua for empty content", () => {
    expect(detectSchemaFormat("")).toBe("lua");
  });
});

describe("SchemaParser .jade declarative", () => {
  const result = new SchemaParser(JADE_SAMPLE).parse();

  it("reports jade format", () => {
    expect(result.format).toBe("jade");
    expect(result.isJadeFile).toBe(true);
  });

  it("parses model names", () => {
    expect(result.models.map((m) => m.name)).toEqual(["User", "Post"]);
  });

  it("parses table override and convention default", () => {
    const user = result.models.find((m) => m.name === "User")!;
    const post = result.models.find((m) => m.name === "Post")!;
    expect(user.table).toBe("users");
    expect(post.table).toBe("posts");
  });

  it("parses field types, lengths, and modifiers", () => {
    const user = result.models.find((m) => m.name === "User")!;
    const name = user.fields.find((f) => f.name === "name")!;
    expect(name.type).toBe("String");
    expect(name.length).toBe(120);
    expect(name.modifiers).toContain("notNull");

    const bio = user.fields.find((f) => f.name === "bio")!;
    expect(bio.type).toBe("Text");
    expect(bio.modifiers).toContain("nullable");

    const role = user.fields.find((f) => f.name === "role")!;
    expect(role.type).toBe("String");
    expect(role.length).toBe(50);
    expect(role.modifiers).toContain("notNull");
    expect(role.modifiers).toContain("default");
  });

  it("parses relations", () => {
    const user = result.models.find((m) => m.name === "User")!;
    const post = result.models.find((m) => m.name === "Post")!;

    expect(user.relations.some((r) => r.type === "hasMany" && r.model === "Post")).toBe(true);
    expect(post.relations.some((r) => r.type === "belongsTo" && r.model === "User")).toBe(true);
  });

  it("infers belongsTo from *_id Integer fields", () => {
    const post = result.models.find((m) => m.name === "Post")!;
    const inferred = post.relations.find(
      (r) => r.inferred && r.foreignKey === "user_id" && r.model === "User"
    );
    expect(inferred).toBeTruthy();
  });

  it("tracks line numbers for diagnostics", () => {
    const user = result.models.find((m) => m.name === "User")!;
    expect(user.fields.length).toBeGreaterThan(0);
    expect(user.fields[0].line).toBeGreaterThan(0);
  });

  it("accepts case-insensitive types (core alignment)", () => {
    const parsed = new SchemaParser(`
model Item {
    qty = integer()
    label = string(40)
}
`).parse();
    const item = parsed.models[0];
    expect(item.fields.find((f) => f.name === "qty")!.type).toBe("Integer");
    expect(item.fields.find((f) => f.name === "label")!.type).toBe("String");
    expect(item.fields.find((f) => f.name === "label")!.length).toBe(40);
  });

  it("reports unclosed model blocks", () => {
    const parsed = new SchemaParser(`
model Broken {
    name = String(10)
`).parse();
    expect(parsed.errors.some((e) => /Unclosed model/i.test(e.message))).toBe(true);
  });

  it("does not treat lua Entity content as jade", () => {
    const parsed = new SchemaParser(`
local jade = require("jade")
User = jade.Entity("users", {
  id = jade.Integer():primaryKey(),
})
`).parse();
    expect(parsed.format).toBe("lua");
    expect(parsed.models[0].name).toBe("User");
  });
});
