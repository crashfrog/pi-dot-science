// Dataframe store extension for pi.science
// Maintains state across turns via a lightweight registry of named dataframes with schema summaries
// Each entry tracks: name, shape, columns, dtypes, and a sample row for context

export interface DataframeEntry {
  name: string;
  shape: [number, number]; // [rows, cols]
  columns: string[];
  dtypes: Record<string, string>;
  sampleRow?: Record<string, unknown>;
}

export class DataframeStore {
  private store: Map<string, DataframeEntry> = new Map();

  // TODO: Implement registerDataframe(name, entry): Register a dataframe
  // TODO: Implement getDataframe(name): Retrieve schema without loading full data
  // TODO: Implement listDataframes(): Show all registered dataframes
  // TODO: Implement clearDataframe(name): Remove a dataframe from store
  // TODO: Implement exportState(): Serialize store for context injection
  // TODO: Implement importState(json): Restore store from serialized state
}

export default DataframeStore;
