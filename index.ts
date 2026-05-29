import { main } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import DataframeStore from "./src/extensions/dataframe-store.js";
import ImageRenderer from "./src/extensions/image-renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPromptPath = resolve(__dirname, "src/prompts/system.md");

function dataframeStoreExtension(pi: ExtensionAPI): void {
  const store = new DataframeStore();

  pi.on("session_start", () => {
    // Phase 2: restore persisted store state from Parquet + metadata.json
    void store;
  });
}

function imageRendererExtension(pi: ExtensionAPI): void {
  const renderer = new ImageRenderer();

  pi.on("session_start", () => {
    // Phase 5: detect terminal capabilities and register image rendering hook
    void renderer;
  });
}

await main(
  ["--system-prompt", systemPromptPath, ...process.argv.slice(2)],
  { extensionFactories: [dataframeStoreExtension, imageRendererExtension] },
);
