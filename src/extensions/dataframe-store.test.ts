import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DataframeStore, DataframeEntry } from "./dataframe-store";
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
    expect(store.getDataframe("users")).toEqual(entry);
  });

  it("returns undefined for an unregistered name", () => {
    expect(store.getDataframe("nonexistent")).toBeUndefined();
  });

  it("exports state to a JSON string and imports it back", () => {
    store.registerDataframe("users", entry);
    const json = store.exportState();
    const other = new DataframeStore();
    other.importState(json);
    expect(other.getDataframe("users")).toEqual(entry);
  });

  it("importState merges with existing entries rather than replacing them", () => {
    const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
    store.registerDataframe("users", entry);
    const json = store.exportState();

    const other = new DataframeStore();
    other.registerDataframe("events", events);
    other.importState(json);

    expect(other.getDataframe("users")).toEqual(entry);
    expect(other.getDataframe("events")).toEqual(events);
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
    expect(store.getDataframe("users")).toEqual(updated);
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
      expect(parsed["users"]).toEqual(entry);
    });

    it("loadFromDisk restores entries from metadata.json", async () => {
      store.registerDataframe("users", entry);
      await store.saveToDisk(tmpDir);

      const other = new DataframeStore();
      await other.loadFromDisk(tmpDir);
      expect(other.getDataframe("users")).toEqual(entry);
    });

    it("round-trip preserves all entries across store instances", async () => {
      const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
      store.registerDataframe("users", entry);
      store.registerDataframe("events", events);
      await store.saveToDisk(tmpDir);

      const other = new DataframeStore();
      await other.loadFromDisk(tmpDir);
      expect(other.listDataframes()).toHaveLength(2);
      expect(other.getDataframe("users")).toEqual(entry);
      expect(other.getDataframe("events")).toEqual(events);
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

      expect(other.getDataframe("users")).toEqual(entry);
      expect(other.getDataframe("events")).toEqual(events);
      expect(other.listDataframes()).toHaveLength(2);
    });
  });

  it("lists all registered dataframes", () => {
    const events: DataframeEntry = { ...entry, name: "events", shape: [500, 3], columns: ["id", "type", "ts"], dtypes: { id: "int64", type: "string", ts: "datetime" } };
    store.registerDataframe("users", entry);
    store.registerDataframe("events", events);
    const listed = store.listDataframes();
    expect(listed).toHaveLength(2);
    expect(listed).toContainEqual(entry);
    expect(listed).toContainEqual(events);
  });
});
