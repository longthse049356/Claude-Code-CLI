import type { ToolDefinition } from "../types.ts";

export const TOOL_SCHEMAS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Returns the full text content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "bash",
    description: "Run a shell command and return its output. Timeout: 30 seconds.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern. Returns newline-separated list of matching paths relative to workspace.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.js')" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents for a regex pattern. Returns matching lines with file path and line number.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "File or directory to search in (default: workspace root)" },
      },
      required: ["pattern"],
    },
  },
];
