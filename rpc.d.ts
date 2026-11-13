import type { Rpc } from "@opencode/plugin/rpc";
import type { JsonSchema } from "effect";

type Schema<T> = JsonSchema.JsonSchema & { readonly __type?: T };

export interface BackupEntryDto {
  id: string;
  snapshotId: string;
  root: string;
  slug: string;
  tool: string;
  timeMs: number;
  relativePath: string;
  fileName: string;
  backupPath: string;
  originalPath: string;
  size: number;
}

export interface BackupSettingsDto {
  retentionDays: number;
  debounceMs: number;
  rootDir: string;
  dialogWidth: string;
}

export interface BackupListInput {
  rootDir?: string;
  includeSubprojects?: boolean;
  limit?: number;
}

export interface BackupListOutput {
  scanRoot: string;
  workspaceDir: string;
  settings: BackupSettingsDto;
  entries: BackupEntryDto[];
}

export interface BackupDiffLineDto {
  type: string;
  text: string;
}

export interface BackupDiffInput {
  backupPath: string;
  originalPath: string;
  maxLines?: number;
}

export interface BackupDiffOutput {
  status: string;
  summary: string;
  lines: BackupDiffLineDto[];
}

export interface BackupRestoreInput {
  entry: BackupEntryDto;
}

export interface BackupRestoreOutput {
  restoredPath: string;
  fromSnapshot: string;
  safetySnapshot: string | null;
}

export interface BackupOpenFileInput {
  filePath: string;
}

export interface BackupOpenFileOutput {
  openedPath: string;
  launcher: string;
}

export interface BackupOpenDiffInput {
  backupPath: string;
  originalPath: string;
}

export interface BackupOpenDiffOutput {
  backupPath: string;
  currentPath: string;
  launcher: string;
}

export interface BackupPruneInput {
  rootDir?: string;
  retentionDays?: number;
}

export interface BackupPruneOutput {
  removed: number;
  disabled: boolean;
  retentionDays: number;
}

export interface BackupUpdateSettingsInput {
  retentionDays?: number;
  debounceMs?: number;
  rootDir?: string;
  dialogWidth?: string;
}

export interface BackupUpdateSettingsOutput {
  filePath: string;
  settings: BackupSettingsDto;
}

export declare const BackupRpc: Rpc.Definition<
  "opencode-local-backup",
  {
    list: {
      input: Schema<BackupListInput>;
      output: Schema<BackupListOutput>;
    };
    diff: {
      input: Schema<BackupDiffInput>;
      output: Schema<BackupDiffOutput>;
    };
    restore: {
      input: Schema<BackupRestoreInput>;
      output: Schema<BackupRestoreOutput>;
    };
    openFile: {
      input: Schema<BackupOpenFileInput>;
      output: Schema<BackupOpenFileOutput>;
    };
    openDiff: {
      input: Schema<BackupOpenDiffInput>;
      output: Schema<BackupOpenDiffOutput>;
    };
    prune: {
      input: Schema<BackupPruneInput>;
      output: Schema<BackupPruneOutput>;
    };
    updateSettings: {
      input: Schema<BackupUpdateSettingsInput>;
      output: Schema<BackupUpdateSettingsOutput>;
    };
  },
  Record<never, never>
>;

export default BackupRpc;
