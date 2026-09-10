import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  Hover,
  TextEdit,
  WorkspaceFolder
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SchemaAnalyzer } from "./analyzer";
import { CompletionProvider } from "./completion";
import { DiagnosticsProvider } from "./diagnostics";
import { HoverProvider } from "./hover";
import { FormattingProvider } from "./formatting";
import { SchemaIndex } from "./schema-index";

// Create connection
const connection = createConnection(ProposedFeatures.all);

// Create document manager
const documents = new TextDocuments(TextDocument);

// Schema index for cross-file references
const schemaIndex = new SchemaIndex();

// Providers
let analyzer: SchemaAnalyzer;
let completionProvider: CompletionProvider;
let diagnosticsProvider: DiagnosticsProvider;
let hoverProvider: HoverProvider;
let formattingProvider: FormattingProvider;

// Initialize
connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  connection.console.log("Jade LSP Server initializing...");

  // Build schema index from workspace
  if (params.workspaceFolders) {
    for (const folder of params.workspaceFolders) {
      const folderPath = folder.uri.replace("file:///", "").replace(/%20/g, " ");
      await schemaIndex.buildIndex(folderPath);
    }
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: [".", "(", "'", '"']
      },
      hoverProvider: true,
      documentFormattingProvider: true
    }
  };
});

connection.onInitialized(() => {
  connection.console.log("Jade LSP Server initialized");

  // Watch for schema file changes
  connection.onNotification("workspace/didChangeWatchedFiles", async (params) => {
    for (const change of params.changes) {
      if (change.uri.endsWith(".lua") || change.uri.endsWith(".jade")) {
        const filePath = change.uri.replace("file:///", "").replace(/%20/g, " ");
        await schemaIndex.indexFile(filePath);
      }
    }
  });
});

// Document events
documents.onDidChangeContent(change => {
  const document = change.document;
  analyzeDocument(document);
});

documents.onDidClose(change => {
  // Diagnostics are cleared automatically when document is closed
});

// Completion
connection.onCompletion((params): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const content = document.getText();
  const lines = content.split("\n");
  const line = lines[params.position.line] || "";

  analyzer = new SchemaAnalyzer(content, schemaIndex);
  completionProvider = new CompletionProvider(analyzer, schemaIndex);

  return completionProvider.getCompletions(line, params.position.character);
});

// Hover
connection.onHover((params): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const content = document.getText();
  const lines = content.split("\n");
  const line = lines[params.position.line] || "";

  analyzer = new SchemaAnalyzer(content, schemaIndex);
  hoverProvider = new HoverProvider(analyzer, schemaIndex);

  return hoverProvider.getHover(line, params.position.character);
});

// Formatting
connection.onDocumentFormatting((params): TextEdit[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const content = document.getText();
  formattingProvider = new FormattingProvider();

  return formattingProvider.format(content);
});

// Analyze document and send diagnostics
function analyzeDocument(document: TextDocument): void {
  const content = document.getText();
  diagnosticsProvider = new DiagnosticsProvider(schemaIndex);

  const diagnostics = diagnosticsProvider.getDiagnostics(content);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Listen
documents.listen(connection);
connection.listen();
