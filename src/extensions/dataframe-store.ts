import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface DataframeEntry {
  name: string;
  shape: [number, number]; // [rows, cols]
  columns: string[];
  dtypes: Record<string, string>;
  sampleRow?: Record<string, unknown>;
  // Provenance fields
  source?: string;
  timestamp?: string;       // ISO 8601; auto-set on registerDataframe if absent
  immutable?: boolean;      // prevents overwrite when true
  transformations?: string[]; // executable code chain, stored verbatim
}

export interface ProvenanceRecord {
  source?: string;
  timestamp: string;
  immutable: boolean;
}

export class DataframeStore {
  private store: Map<string, DataframeEntry> = new Map();

  registerDataframe(name: string, entry: DataframeEntry): void {
    const existing = this.store.get(name);
    if (existing?.immutable) {
      throw new Error(`Dataframe "${name}" is immutable and cannot be overwritten`);
    }
    this.store.set(name, {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      immutable: entry.immutable ?? false,
    });
  }

  getDataframe(name: string): DataframeEntry | undefined {
    return this.store.get(name);
  }

  getProvenance(name: string): ProvenanceRecord | undefined {
    const entry = this.store.get(name);
    if (!entry) return undefined;
    return {
      source: entry.source,
      timestamp: entry.timestamp!,
      immutable: entry.immutable ?? false,
    };
  }

  replayTransformations(name: string): string[] {
    return this.store.get(name)?.transformations ?? [];
  }

  listDataframes(): DataframeEntry[] {
    return Array.from(this.store.values());
  }

  clearDataframe(name: string): void {
    this.store.delete(name);
  }

  exportState(): string {
    return JSON.stringify(Object.fromEntries(this.store));
  }

  importState(json: string): void {
    const entries = JSON.parse(json) as Record<string, DataframeEntry>;
    for (const [name, entry] of Object.entries(entries)) {
      this.store.set(name, entry);
    }
  }

  private defaultStoreDir(): string {
    return join(process.cwd(), ".pi-science", "dataframe-store");
  }

  async saveToDisk(dir?: string): Promise<void> {
    const target = dir ?? this.defaultStoreDir();
    mkdirSync(target, { recursive: true });
    await Bun.write(join(target, "metadata.json"), this.exportState());
  }

  async loadFromDisk(dir?: string): Promise<void> {
    const target = dir ?? this.defaultStoreDir();
    const json = await Bun.file(join(target, "metadata.json")).text();
    this.importState(json);
  }
}

export default DataframeStore;
