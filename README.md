# Jade Linter — VS Code Extension

Linter, IDE support, and auto-relation detection for [Jade ORM](https://github.com/AlehandroSV/jade) schema files.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Syntax Highlighting** — Jade types and modifiers in `.lua` files (injection; coexists with sumneko.lua) and native `.jade` language registration
- **Auto-Completion** — Suggestions for types (`jade.`), modifiers (`:primaryKey()`, `:foreignKey()`), table names, and model names
- **Linting** — Real-time error detection for invalid types, missing modifiers, and broken references
- **Auto-Relation Detection** — Infers `belongsTo` relations from `:foreignKey()` modifiers and `_id` naming conventions
- **Hover** — Documentation on hover for types, modifiers, relations, and FK fields
- **Cross-File Validation** — Validates references across all schema files in the workspace
- **Snippets** — Common code templates (`jade-entity`, `jade-field`, `jade-relation`)
- **Formatting** — Auto-format schema files

## Installation

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for "Jade Linter"
4. Click **Install**

## Usage

Open any `.lua` file containing Jade schema code:

```lua
local jade = require("jade")

local User = jade.Entity("users", {
    id = jade.Integer():primaryKey(),
    name = jade.String(120):notNull(),
    email = jade.String(255):unique():notNull(),
})

local Post = jade.Entity("posts", {
    id = jade.Integer():primaryKey(),
    title = jade.String(255):notNull(),
    user_id = jade.Integer():foreignKey("users", "id"),
    content = jade.Text(),
})
```

## Auto-Relation Detection

The linter automatically detects relationships between entities in two ways:

### Explicit `:foreignKey()` modifier

When a field has `:foreignKey("table", "column")`, the linter infers a `belongsTo` relation:

```lua
Post = jade.Entity("posts", {
    user_id = jade.Integer():foreignKey("users", "id"),
    -- Linter: "Relação 'belongsTo' inferida via 'user_id' → User"
})
```

### `_id` naming convention

When a field ends with `_id` and the target table exists in the schema, the linter infers `belongsTo` automatically:

```lua
User = jade.Entity("users", { ... })

Post = jade.Entity("posts", {
    user_id = jade.Integer():notNull(),
    -- Linter: "Relação 'belongsTo' inferida via 'user_id' → User"
    -- (works because "users" table exists in the schema)
})
```

Supported FK types: `Integer`, `BigInt`, `UUID`, `CUID`, `NanoID`.

### Hover on FK fields

Hovering over a `*_id` field shows the inferred relation:

```
**user_id** (ForeignKey)
Infers: belongsTo → User
```

## Diagnostics

The linter reports three levels of diagnostics:

| Severity | Example |
|----------|---------|
| **Error** | Invalid type (`jade.Foo()`), unknown modifier (`:bar()`), missing model reference |
| **Warning** | `String` without length, `created_at` without `defaultNow()` |
| **Information** | Auto primary key on `id`, inferred `belongsTo` relation |

## Snippets

| Prefix | Description |
|--------|-------------|
| `jade-entity` | Entity definition with primary key |
| `jade-field` | Field definition with type |
| `jade-relation` | Relation definition |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `jade.schema.path` | `schema/init.lua` | Path to schema file |
| `jade.linting.enabled` | `true` | Enable linting |
| `jade.completion.enabled` | `true` | Enable auto-completion |
| `jade.formatting.enabled` | `true` | Enable formatting |
| `jade.formatting.formatOnSave` | `false` | Format on save |

## Commands

| Command | Description |
|---------|-------------|
| `Jade: Restart LSP Server` | Restart the language server |

## License

MIT
