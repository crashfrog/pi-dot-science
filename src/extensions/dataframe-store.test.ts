import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DataframeStore, DataframeEntry, ProvenanceRecord } from "./dataframe-store";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const entry: DataframeEntry = {
  name: "users",
  shape: [1000, 5],
  columns: ["id", "name", "email", "age", "created_at"],
  dtypes: { id: "int64", name: "string", email: "string", age: "int64", created_at: "datetime" },
  sampleRow: { id: 1, name: "Alice", email: "alice@example.com", age: 30, created_at: "2024-01-01" },
};

describe("DataframeStore", () => {
  let store: DataframeStore;

  beforeEach(() => {
    store = new DataframeStore();
  });

  it("registers a dataframe and retrieves it by name", () => {
    store.registerDataframe("users", entry);
    expect(store.getDataframe("users")).toMatchObject(entry);
  });

  it("returns undefined for an unregistered name", () => {
    expect(store.getDataframe("nonexistent")).toBeUndefined();
  });

  it("exports state to a JSON string and imports it back", () => {
    store.registerDataframe("users", entry);
    const json = store.exportState();
    const other = new DataframeStore();
    other.importState(json);
    expect(other.getDataframe("users")).toMatchObject(entry);
  });

  it("importState merges with existing entries rather than replacing them", () => {
    const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
    store.registerDataframe("users", entry);
    const json = store.exportState();

    const other = new DataframeStore();
    other.registerDataframe("events", events);
    other.importState(json);

    expect(other.getDataframe("users")).toMatchObject(entry);
    expect(other.getDataframe("events")).toMatchObject(events);
    expect(other.listDataframes()).toHaveLength(2);
  });

  it("clears a registered dataframe by name", () => {
    store.registerDataframe("users", entry);
    store.clearDataframe("users");
    expect(store.getDataframe("users")).toBeUndefined();
  });

  it("clearing an unknown name is a no-op", () => {
    expect(() => store.clearDataframe("ghost")).not.toThrow();
  });

  it("re-registering a name overwrites the existing entry", () => {
    store.registerDataframe("users", entry);
    const updated: DataframeEntry = { ...entry, shape: [2000, 5] };
    store.registerDataframe("users", updated);
    expect(store.getDataframe("users")).toMatchObject(updated);
    expect(store.listDataframes()).toHaveLength(1);
  });

  describe("disk persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "pi-science-test-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saveToDisk creates the target directory if it does not exist", async () => {
      const storeDir = join(tmpDir, "new-subdir", "dataframe-store");
      await store.saveToDisk(storeDir);
      expect(existsSync(storeDir)).toBe(true);
    });

    it("saveToDisk writes metadata.json containing registered entries", async () => {
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);
      const written = await Bun.file(join(tmpDir, "metadata.json")).text();
      const parsed = JSON.parse(written);
      expect(parsed["users"]).toMatchObject(entry);
    });

    it("loadFromDisk restores entries from metadata.json", async () => {
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);

      const other = new DataframeStore();
      await other.loadFromDisk(tmpDir);
      expect(other.getDataframe("users")).toMatchObject(entry);
    });

    it("round-trip preserves all entries across store instances", async () => {
      const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
      store.registerDataframe("users", entry);
      store.registerDataframe("events", events);
      await store.saveToDisk(tmpDir);

      const other = new DataframeStore();
      await other.loadFromDisk(tmpDir);
      expect(other.listDataframes()).toHaveLength(2);
      expect(other.getDataframe("users")).toMatchObject(entry);
      expect(other.getDataframe("events")).toMatchObject(events);
    });

    it("saveToDisk uses .pi-science/dataframe-store relative to cwd when no dir given", async () => {
      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        store.registerDataframe("users", entry);
        await store.saveToDisk();
        expect(existsSync(join(tmpDir, ".pi-science", "dataframe-store", "metadata.json"))).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });

    it("loadFromDisk merges with existing entries", async () => {
      const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);

      const other = new DataframeStore();
      other.registerDataframe("events", events);
      await other.loadFromDisk(tmpDir);

      expect(other.getDataframe("users")).toMatchObject(entry);
      expect(other.getDataframe("events")).toMatchObject(events);
      expect(other.listDataframes()).toHaveLength(2);
    });
  });

  describe("reproducibility (#20)", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "pi-science-repro-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("provenance replay produces identical transformation chain after round-trip", async () => {
      const t1 = "df = pd.read_csv('users.csv')";
      const t2 = "df = df[df['age'] > 18]";
      const t3 = "df = df.reset_index(drop=True)";
      store.registerDataframe("users", { ...entry, transformations: [t1, t2, t3] });
      await store.saveToDisk(tmpDir);

      const restored = new DataframeStore();
      await restored.loadFromDisk(tmpDir);
      expect(restored.replayTransformations("users")).toEqual([t1, t2, t3]);
    });

    it("two stores writing to different dirs do not interfere", async () => {
      const dirA = join(tmpDir, "session-a");
      const dirB = join(tmpDir, "session-b");
      const storeA = new DataframeStore();
      const storeB = new DataframeStore();
      storeA.registerDataframe("alpha", entry);
      storeB.registerDataframe("beta", { ...entry, name: "beta" });
      await Promise.all([storeA.saveToDisk(dirA), storeB.saveToDisk(dirB)]);

      const checkA = new DataframeStore();
      await checkA.loadFromDisk(dirA);
      expect(checkA.getDataframe("alpha")).toBeDefined();
      expect(checkA.getDataframe("beta")).toBeUndefined();

      const checkB = new DataframeStore();
      await checkB.loadFromDisk(dirB);
      expect(checkB.getDataframe("beta")).toBeDefined();
      expect(checkB.getDataframe("alpha")).toBeUndefined();
    });

    it("git history is auditable after multiple saves", async () => {
      store.registerDataframe("users", { ...entry, source: "file://users.csv" });
      await store.saveToDisk(tmpDir);
      store.registerDataframe("events", { ...entry, name: "events", source: "file://events.csv" });
      await store.saveToDisk(tmpDir);
      store.clearDataframe("users");
      await store.saveToDisk(tmpDir);

      const { stdout } = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
      const commits = stdout.toString().trim().split("\n");
      expect(commits).toHaveLength(3);
    });

    it("session-namespaced dataframes are isolated across replay", async () => {
      const storeA = new DataframeStore();
      storeA.setSessionNamespace("session-A");
      storeA.registerDataframe("users", { ...entry, shape: [100, 5] });

      const storeB = new DataframeStore();
      storeB.setSessionNamespace("session-B");
      storeB.registerDataframe("users", { ...entry, shape: [200, 5] });

      await storeA.saveToDisk(tmpDir);
      // storeB saves to same dir — namespaced keys don't collide
      const dirB = join(tmpDir, "b");
      await storeB.saveToDisk(dirB);

      const checkA = new DataframeStore();
      checkA.setSessionNamespace("session-A");
      await checkA.loadFromDisk(tmpDir);
      expect(checkA.getDataframe("users")?.shape).toEqual([100, 5]);

      const checkB = new DataframeStore();
      checkB.setSessionNamespace("session-B");
      await checkB.loadFromDisk(dirB);
      expect(checkB.getDataframe("users")?.shape).toEqual([200, 5]);
    });
  });

  describe("git integration", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "pi-science-git-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saveToDisk initializes a git repo in the store dir if none exists", async () => {
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);
      expect(existsSync(join(tmpDir, ".git"))).toBe(true);
    });

    it("saveToDisk creates a git commit after saving", async () => {
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);
      const { stdout } = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
      const log = stdout.toString();
      expect(log.trim().length).toBeGreaterThan(0);
    });

    it("commit message includes dataframe names", async () => {
      store.registerDataframe("users", { ...entry, source: "https://example.com" });
      await store.saveToDisk(tmpDir);
      const { stdout } = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
      expect(stdout.toString()).toContain("users");
    });

    it("successive saves produce successive commits", async () => {
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);
      store.registerDataframe("events", { ...entry, name: "events" });
      await store.saveToDisk(tmpDir);
      const { stdout } = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
      expect(stdout.toString().trim().split("\n")).toHaveLength(2);
    });
  });

  describe("session namespacing", () => {
    it("getSessionId returns a stable ID for the store's lifetime", () => {
      const id = store.getSessionId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(store.getSessionId()).toBe(id);
    });

    it("setSessionNamespace changes the active namespace", () => {
      store.setSessionNamespace("session-A");
      store.registerDataframe("users", entry);
      // key in store should be namespaced
      expect(store.getDataframe("users@session-A")).toMatchObject(entry);
    });

    it("getDataframe with plain name resolves session namespace first", () => {
      store.setSessionNamespace("session-A");
      store.registerDataframe("users", entry);
      expect(store.getDataframe("users")).toMatchObject(entry);
    });

    it("getDataframe falls back to main namespace when session key absent", () => {
      // register in main (no namespace)
      store.registerDataframe("users@main", entry);
      store.setSessionNamespace("session-A");
      expect(store.getDataframe("users")).toMatchObject(entry);
    });

    it("getDataframe prefers session namespace over main", () => {
      const mainEntry: DataframeEntry = { ...entry, shape: [100, 5] };
      const sessionEntry: DataframeEntry = { ...entry, shape: [200, 5] };
      store.registerDataframe("users@main", mainEntry);
      store.setSessionNamespace("session-A");
      store.registerDataframe("users", sessionEntry);
      expect(store.getDataframe("users")?.shape).toEqual([200, 5]);
    });

    it("listDataframes includes both session and main dataframes", () => {
      store.registerDataframe("users@main", entry);
      store.setSessionNamespace("session-A");
      store.registerDataframe("events", { ...entry, name: "events" });
      const names = store.listDataframes().map(e => e.name);
      expect(names).toContain("users");
      expect(names).toContain("events");
    });
  });

  describe("transformation code", () => {
    it("registerDataframe stores transformation code verbatim", () => {
      const code = "df = df[df['age'] > 18]";
      store.registerDataframe("users", { ...entry, transformations: [code] });
      expect(store.getDataframe("users")?.transformations?.[0]).toBe(code);
    });

    it("replayTransformations returns transformation code in registration order", () => {
      const t1 = "df = pd.read_csv('data.csv')";
      const t2 = "df = df.dropna()";
      const t3 = "df = df[df['age'] > 18]";
      store.registerDataframe("users", { ...entry, transformations: [t1, t2, t3] });
      expect(store.replayTransformations("users")).toEqual([t1, t2, t3]);
    });

    it("replayTransformations returns empty array for dataframe with no transformations", () => {
      store.registerDataframe("users", entry);
      expect(store.replayTransformations("users")).toEqual([]);
    });

    it("replayTransformations returns empty array for unknown name", () => {
      expect(store.replayTransformations("ghost")).toEqual([]);
    });

    it("transformation code is preserved verbatim including whitespace and newlines", () => {
      const code = "df = (\n  df\n  .dropna()\n  .reset_index(drop=True)\n)";
      store.registerDataframe("users", { ...entry, transformations: [code] });
      expect(store.replayTransformations("users")[0]).toBe(code);
    });

    it("transformation code survives saveToDisk/loadFromDisk round-trip", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "pi-science-tx-"));
      try {
        const t1 = "df = pd.read_csv('data.csv')";
        const t2 = "df = df.dropna()";
        store.registerDataframe("users", { ...entry, transformations: [t1, t2] });
        await store.saveToDisk(tmpDir);
        const other = new DataframeStore();
        await other.loadFromDisk(tmpDir);
        expect(other.replayTransformations("users")).toEqual([t1, t2]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("provenance", () => {
    it("registerDataframe auto-stamps an ISO 8601 timestamp", () => {
      const before = new Date().toISOString();
      store.registerDataframe("users", entry);
      const after = new Date().toISOString();
      const prov = store.getProvenance("users");
      expect(prov?.timestamp).toBeDefined();
      expect(prov!.timestamp >= before && prov!.timestamp <= after).toBe(true);
    });

    it("getProvenance returns source, timestamp, and immutable flag", () => {
      store.registerDataframe("users", { ...entry, source: "https://example.com/data.csv" });
      const prov = store.getProvenance("users");
      expect(prov).toMatchObject<Partial<ProvenanceRecord>>({
        source: "https://example.com/data.csv",
        immutable: false,
      });
      expect(typeof prov?.timestamp).toBe("string");
    });

    it("getProvenance returns undefined for unknown name", () => {
      expect(store.getProvenance("ghost")).toBeUndefined();
    });

    it("provenance persists through saveToDisk/loadFromDisk", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "pi-science-prov-"));
      try {
        store.registerDataframe("users", { ...entry, source: "file://data.csv" });
        await store.saveToDisk(tmpDir);
        const other = new DataframeStore();
        await other.loadFromDisk(tmpDir);
        const prov = other.getProvenance("users");
        expect(prov?.source).toBe("file://data.csv");
        expect(typeof prov?.timestamp).toBe("string");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("registerDataframe with immutable:true prevents overwrite", () => {
      store.registerDataframe("users", { ...entry, immutable: true });
      expect(() => store.registerDataframe("users", entry)).toThrow();
    });

    it("registerDataframe uses caller-supplied timestamp when provided", () => {
      const ts = "2024-01-01T00:00:00.000Z";
      store.registerDataframe("users", { ...entry, timestamp: ts });
      expect(store.getProvenance("users")?.timestamp).toBe(ts);
    });
  });

  it("lists all registered dataframes", () => {
    const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
    store.registerDataframe("users", entry);
    store.registerDataframe("events", events);
    const listed = store.listDataframes();
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining(entry), expect.objectContaining(events)]));
  });
});
