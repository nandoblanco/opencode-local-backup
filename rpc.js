"use strict";

export const BackupRpc = {
  id: "opencode-local-backup",
  methods: {
    list: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          rootDir: { type: "string" },
          includeSubprojects: { type: "boolean" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          scanRoot: { type: "string" },
          workspaceDir: { type: "string" },
          settings: {
            type: "object",
            properties: {
              retentionDays: { type: "number" },
              debounceMs: { type: "number" },
              rootDir: { type: "string" },
              dialogWidth: { type: "string" },
            },
            required: ["retentionDays", "debounceMs", "rootDir", "dialogWidth"],
          },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                snapshotId: { type: "string" },
                root: { type: "string" },
                slug: { type: "string" },
                tool: { type: "string" },
                timeMs: { type: "number" },
                relativePath: { type: "string" },
                fileName: { type: "string" },
                backupPath: { type: "string" },
                originalPath: { type: "string" },
                size: { type: "number" },
              },
              required: [
                "id",
                "snapshotId",
                "root",
                "slug",
                "tool",
                "timeMs",
                "relativePath",
                "fileName",
                "backupPath",
                "originalPath",
                "size",
              ],
            },
          },
        },
        required: ["scanRoot", "workspaceDir", "settings", "entries"],
      },
    },
    diff: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          backupPath: { type: "string" },
          originalPath: { type: "string" },
          maxLines: { type: "number" },
        },
        required: ["backupPath", "originalPath"],
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          status: { type: "string" },
          summary: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
              },
              required: ["type", "text"],
            },
          },
        },
        required: ["status", "summary", "lines"],
      },
    },
    restore: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          entry: {
            type: "object",
            properties: {
              id: { type: "string" },
              snapshotId: { type: "string" },
              root: { type: "string" },
              slug: { type: "string" },
              tool: { type: "string" },
              timeMs: { type: "number" },
              relativePath: { type: "string" },
              fileName: { type: "string" },
              backupPath: { type: "string" },
              originalPath: { type: "string" },
              size: { type: "number" },
            },
            required: ["root", "backupPath", "originalPath"],
          },
        },
        required: ["entry"],
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          restoredPath: { type: "string" },
          fromSnapshot: { type: "string" },
          safetySnapshot: { type: ["string", "null"] },
        },
        required: ["restoredPath", "fromSnapshot"],
      },
    },
    openFile: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          filePath: { type: "string" },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          openedPath: { type: "string" },
          launcher: { type: "string" },
        },
        required: ["openedPath", "launcher"],
      },
    },
    openDiff: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          backupPath: { type: "string" },
          originalPath: { type: "string" },
        },
        required: ["backupPath", "originalPath"],
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          backupPath: { type: "string" },
          currentPath: { type: "string" },
          launcher: { type: "string" },
        },
        required: ["backupPath", "currentPath", "launcher"],
      },
    },
    prune: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          rootDir: { type: "string" },
          retentionDays: { type: "number" },
        },
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          removed: { type: "number" },
          disabled: { type: "boolean" },
          retentionDays: { type: "number" },
        },
        required: ["removed", "disabled", "retentionDays"],
      },
    },
    updateSettings: {
      input: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          retentionDays: { type: "number" },
          debounceMs: { type: "number" },
          rootDir: { type: "string" },
          dialogWidth: { type: "string" },
        },
        additionalProperties: false,
      },
      output: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          filePath: { type: "string" },
          settings: {
            type: "object",
            properties: {
              retentionDays: { type: "number" },
              debounceMs: { type: "number" },
              rootDir: { type: "string" },
              dialogWidth: { type: "string" },
            },
            required: ["retentionDays", "debounceMs", "rootDir", "dialogWidth"],
          },
        },
        required: ["filePath", "settings"],
      },
    },
  },
  events: {},
};

export default BackupRpc;
