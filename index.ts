import { main } from "@earendil-works/pi-coding-agent";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doltStoreExtension } from "./src/extensions/dolt-store-extension.js";
import { imageRendererExtension, ImageRenderer } from "./src/extensions/image-renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPromptPath = resolve(__dirname, "src/prompts/system.md");

await main(
  ["--system-prompt", systemPromptPath, ...process.argv.slice(2)],
  { extensionFactories: [doltStoreExtension, imageRendererExtension] },
);
