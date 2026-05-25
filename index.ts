import { createAgentSession } from "@earendil-works/pi-coding-agent";
import DataframeStore from "./src/extensions/dataframe-store.js";
import ImageRenderer from "./src/extensions/image-renderer.js";

async function main() {
  // Initialize extensions
  const dataframeStore = new DataframeStore();
  const imageRenderer = new ImageRenderer();

  // TODO: Register dataframe-store extension with the agent session
  // TODO: Register image-renderer extension with the agent session
  // TODO: Inject dataframeStore state into system prompt context
  // TODO: Configure Python environment for data science libraries

  // Create the agent session with pi.science customizations
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    // Extensions will be auto-discovered from .claude/extensions/ or registered explicitly above
  });

  // The agent session runs in interactive mode (stdin/stdout)
  // Sessions are managed by the SessionManager and persisted automatically
}

main().catch(console.error);
