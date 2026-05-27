import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "fs";
import { resolve } from "path";
import DataframeStore from "./src/extensions/dataframe-store.js";
import ImageRenderer from "./src/extensions/image-renderer.js";

async function main() {
  // Load the system prompt from src/prompts/system.md
  const promptPath = resolve("src/prompts/system.md");
  const systemPrompt = readFileSync(promptPath, "utf-8");

  // Initialize extensions
  const dataframeStore = new DataframeStore();
  const imageRenderer = new ImageRenderer();

  // Create the agent session with pi.science customizations
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    systemPrompt: systemPrompt,
    extensions: [dataframeStore, imageRenderer],
  });

  // The agent session runs in interactive mode
  // It can receive user input via stdin and respond via stdout
  // The loop processes queries and returns output/response results
  // Sessions are managed by the SessionManager and persisted automatically
}

main().catch(console.error);
