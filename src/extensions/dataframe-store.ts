import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface DataframeEntry {
  name: string;
  shape: [number, number]; // [rows, cols]
  columns: string[];
  dtypes: Record<string, string>;
  sampleRow?: Record<string, unknown>;
}

export class DataframeStore {
  private store: Map<string, DataframeEntry> = new Map();

  registerDataframe(name: string, entry: DataframeEntry): void {
    this.store.set(name, entry);
  }

  getDataframe(name: string): DataframeEntry | undefined {
    return this.store.get(name);
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
