import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface DataframeEntry {
  name: string;
  shape: [number, number]; // [rows, cols]
  columns: string[];
  dtypes: Record<string, string>;
  sampleRow?: Record<string, unknown>;
  // Provenance fields
  source?: string;
  timestamp?: string;         // ISO 8601; auto-set on registerDataframe if absent
  immutable?: boolean;        // prevents overwrite when true
  transformations?: string[]; // executable code chain, stored verbatim
}

export interface ProvenanceRecord {
  source?: string;
  timestamp: string;
  immutable: boolean;
}

export class DataframeStore {
  private store: Map<string, DataframeEntry> = new Map();
  private readonly sessionId: string = crypto.randomUUID();
  private namespace: string | null = null;

  getSessionId(): string {
    return this.sessionId;
  }

  setSessionNamespace(namespace: string): void {
    this.namespace = namespace;
  }

  private resolveKey(name: string): string {
    if (name.includes("@")) return name;
    return this.namespace ? `${name}@${this.namespace}` : name;
  }

  registerDataframe(name: string, entry: DataframeEntry): void {
    const key = this.resolveKey(name);
    const existing = this.store.get(key);
    if (existing?.immutable) {
      throw new Error(`Dataframe "${name}" is immutable and cannot be overwritten`);
    }
    this.store.set(key, {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      immutable: entry.immutable ?? false,
    });
  }

  getDataframe(name: string): DataframeEntry | undefined {
    if (name.includes("@")) return this.store.get(name);
    if (this.namespace) {
      const sessionKey = `${name}@${this.namespace}`;
      if (this.store.has(sessionKey)) return this.store.get(sessionKey);
    }
    const mainKey = `${name}@main`;
    if (this.store.has(mainKey)) return this.store.get(mainKey);
    return this.store.get(name);
  }

  getProvenance(name: string): ProvenanceRecord | undefined {
    const entry = this.getDataframe(name);
    if (!entry) return undefined;
    return {
      source: entry.source,
      timestamp: entry.timestamp!,
      immutable: entry.immutable ?? false,
    };
  }

  replayTransformations(name: string): string[] {
    return this.getDataframe(name)?.transformations ?? [];
  }

  listDataframes(): DataframeEntry[] {
    return Array.from(this.store.values()).map(e => ({
      ...e,
      name: e.name.includes("@") ? e.name.split("@")[0] : e.name,
    }));
  }

  clearDataframe(name: string): void {
    const key = this.resolveKey(name);
    this.store.delete(key);
    if (key !== name) this.store.delete(name);
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

  private git(args: string[], cwd: string): void {
    Bun.spawnSync(["git", ...args], { cwd });
  }

  private ensureGitRepo(dir: string): void {
    if (!existsSync(join(dir, ".git"))) {
      this.git(["init"], dir);
      this.git(["config", "user.email", "pi-science@local"], dir);
      this.git(["config", "user.name", "pi.science"], dir);
    }
  }

  async saveToDisk(dir?: string): Promise<void> {
    const target = dir ?? this.defaultStoreDir();
    mkdirSync(target, { recursive: true });
    this.ensureGitRepo(target);
    await Bun.write(join(target, "metadata.json"), this.exportState());
    const names = this.listDataframes().map(e => e.name).join(", ") || "empty store";
    this.git(["add", "metadata.json"], target);
    this.git(["commit", "--allow-empty-message", "-m", `Update dataframe store: ${names}`], target);
  }

  async loadFromDisk(dir?: string): Promise<void> {
    const target = dir ?? this.defaultStoreDir();
    const json = await Bun.file(join(target, "metadata.json")).text();
    this.importState(json);
  }
}

export default DataframeStore;
