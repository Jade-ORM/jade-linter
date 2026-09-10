import * as fs from "fs";
import * as path from "path";
import { SchemaParser, SchemaModel } from "./parser";

export interface SchemaInfo {
  models: SchemaModel[];
  filePath: string;
  lastModified: number;
}

function isSchemaFile(name: string): boolean {
  return name.endsWith(".lua") || name.endsWith(".jade");
}

export class SchemaIndex {
  private schemas: Map<string, SchemaInfo> = new Map();
  private watchPaths: string[] = [];
  private fileWatcher: fs.FSWatcher | null = null;

  constructor() {
    this.watchPaths = [
      "schema",
      "schema/**/*.lua",
      "schema/**/*.jade",
      "schemas",
      "schemas/**/*.lua",
      "schemas/**/*.jade",
    ];
  }

  async buildIndex(workspacePath: string): Promise<void> {
    this.schemas.clear();

    const files = this.findSchemaFiles(workspacePath);

    for (const filePath of files) {
      await this.indexFile(filePath);
    }

    this.startWatching(workspacePath);
  }

  private findSchemaFiles(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          files.push(...this.findSchemaFiles(fullPath));
        } else if (entry.isFile() && isSchemaFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }

    return files;
  }

  async indexFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parser = new SchemaParser(content);
      const result = parser.parse();

      if (result.models.length > 0) {
        this.schemas.set(filePath, {
          models: result.models,
          filePath,
          lastModified: Date.now(),
        });
      }
    } catch {
      // Ignore parse errors
    }
  }

  private startWatching(workspacePath: string): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    try {
      this.fileWatcher = fs.watch(
        workspacePath,
        { recursive: true },
        (eventType, filename) => {
          if (filename && isSchemaFile(filename)) {
            const filePath = path.join(workspacePath, filename);
            if (eventType === "change" || eventType === "rename") {
              this.indexFile(filePath);
            }
          }
        }
      );
    } catch {
      // Ignore watch errors
    }
  }

  getAllModels(): SchemaModel[] {
    const models: SchemaModel[] = [];
    for (const info of this.schemas.values()) {
      models.push(...info.models);
    }
    return models;
  }

  getModelByName(name: string): SchemaModel | undefined {
    for (const info of this.schemas.values()) {
      const model = info.models.find((m) => m.name === name);
      if (model) {
        return model;
      }
    }
    return undefined;
  }

  getModelByTable(table: string): SchemaModel | undefined {
    for (const info of this.schemas.values()) {
      const model = info.models.find((m) => m.table === table);
      if (model) {
        return model;
      }
    }
    return undefined;
  }

  getModelNames(): string[] {
    return this.getAllModels().map((m) => m.name);
  }

  getTableNames(): string[] {
    return this.getAllModels()
      .map((m) => m.table || m.name.toLowerCase() + "s")
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    this.schemas.clear();
  }
}
