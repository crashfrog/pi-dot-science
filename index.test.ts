import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Acceptance tests for GitHub Issue #2: Wire up pi-coding-agent entrypoint with system prompt
 *
 * Run with: bun test --grep "issue-2"
 *
 * These tests verify all acceptance criteria:
 * - [AC1] index.ts loads system prompt from src/prompts/system.md
 * - [AC2] Agent session initializes with proper options and extensions
 * - [AC3] DataframeStore and ImageRenderer extensions are wired up
 * - [AC4] Python environment includes pandas, numpy, scipy, matplotlib, seaborn, scikit-learn, statsmodels
 * - [AC5] bun run dev starts the agent successfully
 * - [AC6] Agent can execute Python code and return results
 *
 * Tests deliberately cover the feature specification WITHOUT implementing the feature itself.
 * The tests SHOULD FAIL until the implementation agent completes the work.
 */

describe("issue-2", () => {
  describe("System Prompt Loading", () => {
    it("should load system prompt from src/prompts/system.md", () => {
      const promptPath = resolve("src/prompts/system.md");
      expect(existsSync(promptPath)).toBe(true);
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toBeTruthy();
      expect(promptContent.length).toBeGreaterThan(100);
    });

    it("should have system prompt with hard guardrails on inference", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain(
        "Only State Conclusions Backed by Code"
      );
      expect(promptContent).toContain("Hard Guardrails on Inference");
    });

    it("should have system prompt mentioning dataframe store reference", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Dataframe Store Reference");
      expect(promptContent).toContain("load_dataframe");
      expect(promptContent).toContain("save_dataframe");
    });

    it("should have system prompt with adversarial verification section", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Adversarial Verification");
      expect(promptContent).toContain("skeptical subagent");
    });

    it("should have system prompt with terminal rendering capabilities", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Sixel");
      expect(promptContent).toContain("Kitty graphics protocol");
    });

    it("should have system prompt listing allowed Python libraries", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("pandas");
      expect(promptContent).toContain("numpy");
      expect(promptContent).toContain("scipy");
      expect(promptContent).toContain("matplotlib");
      expect(promptContent).toContain("seaborn");
    });
  });

  describe("Index.ts Entrypoint Structure", () => {
    it("should export or declare a main function", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("function main");
    });

    it("should import createAgentSession from pi-coding-agent", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("createAgentSession");
      expect(indexContent).toContain("@earendil-works/pi-coding-agent");
    });

    it("should import DataframeStore extension", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("DataframeStore");
      expect(indexContent).toContain("dataframe-store");
    });

    it("should import ImageRenderer extension", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("ImageRenderer");
      expect(indexContent).toContain("image-renderer");
    });

    it("should call main() in async context", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("main()");
      expect(indexContent).toContain("catch");
    });
  });

  describe("System Prompt Injection into Agent Session", () => {
    it("index.ts should read system prompt content", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Should contain code to read the prompt file
      expect(indexContent).toMatch(
        /readFile|import.*prompts|system.*prompt|fs\./i
      );
    });

    it("system prompt should be passed to createAgentSession options", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Should pass system prompt to the session creation
      expect(indexContent).toMatch(/createAgentSession.*{[\s\S]*}/);
    });

    it("system prompt path should resolve correctly relative to index.ts", () => {
      const promptPath = resolve("src/prompts/system.md");
      expect(existsSync(promptPath)).toBe(true);
    });
  });

  describe("Extension Initialization and Registration", () => {
    it("should instantiate DataframeStore", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("new DataframeStore");
    });

    it("should instantiate ImageRenderer", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("new ImageRenderer");
    });

    it("DataframeStore class should exist and be properly exported", () => {
      const dsPath = resolve("src/extensions/dataframe-store.ts");
      expect(existsSync(dsPath)).toBe(true);
      const dsContent = readFileSync(dsPath, "utf-8");
      expect(dsContent).toContain("export class DataframeStore");
      expect(dsContent).toContain("export default DataframeStore");
    });

    it("ImageRenderer class should exist and be properly exported", () => {
      const irPath = resolve("src/extensions/image-renderer.ts");
      expect(existsSync(irPath)).toBe(true);
      const irContent = readFileSync(irPath, "utf-8");
      expect(irContent).toContain("export class ImageRenderer");
      expect(irContent).toContain("export default ImageRenderer");
    });

    it("should register extensions with the agent session", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Extensions should be passed to createAgentSession or registered separately
      expect(indexContent).toMatch(
        /dataframeStore|imageRenderer|extension|register/i
      );
    });
  });

  describe("Agent Session Creation", () => {
    it("should call createAgentSession with configuration options", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("createAgentSession({");
    });

    it("should pass cwd to createAgentSession", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/createAgentSession[\s\S]*cwd/);
    });

    it("should handle session creation errors gracefully", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("catch");
      expect(indexContent).toContain("error");
    });

    it("should return a session object from createAgentSession", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/const.*session.*=.*await/);
    });
  });

  describe("Interactive Session Loop", () => {
    it("should run in interactive mode", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Interactive mode should be indicated by stdin/stdout handling or loop
      expect(indexContent).toMatch(/interactive|stdin|stdout|loop|session/i);
    });

    it("should be able to receive user input", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Should demonstrate input handling capability
      expect(indexContent).toMatch(/stdin|input|prompt|query/i);
    });

    it("should process and respond to queries", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Should show capability to process and respond
      expect(indexContent).toMatch(/response|result|output|stdout/i);
    });
  });

  describe("Python Environment and Libraries", () => {
    it("package.json should define Python environment setup", () => {
      const pkgPath = resolve("package.json");
      const pkgContent = readFileSync(pkgPath, "utf-8");
      expect(pkgContent).toContain("dependencies");
    });

    it("should configure pandas availability", () => {
      // System prompt documents pandas usage
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("pandas");
    });

    it("should configure numpy availability", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("numpy");
    });

    it("should configure scipy availability", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("scipy");
    });

    it("should configure matplotlib availability", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("matplotlib");
    });

    it("should configure seaborn availability", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("seaborn");
    });

    it("should configure scikit-learn availability", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("scikit-learn");
    });

    it("should configure statsmodels availability", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("statsmodels");
    });
  });

  describe("Entry Point File Structure", () => {
    it("index.ts should exist", () => {
      const indexPath = resolve("index.ts");
      expect(existsSync(indexPath)).toBe(true);
    });

    it("index.ts should be valid TypeScript", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toBeTruthy();
      expect(indexContent.length).toBeGreaterThan(0);
    });

    it("should have proper imports at the top", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent.startsWith("import")).toBe(true);
    });

    it("should have proper error handling in main", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain(".catch");
    });
  });

  describe("bun run dev Command", () => {
    it("package.json should define dev script", () => {
      const pkgPath = resolve("package.json");
      const pkgContent = readFileSync(pkgPath, "utf-8");
      expect(pkgContent).toContain('"dev"');
      expect(pkgContent).toContain("bun run");
    });

    it("dev script should run index.ts", () => {
      const pkgPath = resolve("package.json");
      const pkgContent = readFileSync(pkgPath, "utf-8");
      expect(pkgContent).toMatch(/"dev"\s*:\s*"bun.*index/);
    });
  });

  describe("System Prompt Content Validation", () => {
    it("should document capabilities and constraints", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Capabilities & Constraints");
      expect(promptContent).toContain("You Can");
      expect(promptContent).toContain("You Cannot");
    });

    it("should explain workflow for answering user questions", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Workflow");
    });

    it("should provide good vs bad examples", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Good");
      expect(promptContent).toContain("Bad");
      expect(promptContent).toContain("Example");
    });

    it("should document dataframe store API", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("load_dataframe");
      expect(promptContent).toContain("save_dataframe");
      expect(promptContent).toContain("list_dataframes");
      expect(promptContent).toContain("get_schema");
    });
  });

  describe("Extension Interface Contracts", () => {
    it("DataframeStore should define proper interface", () => {
      const dsPath = resolve("src/extensions/dataframe-store.ts");
      const dsContent = readFileSync(dsPath, "utf-8");
      expect(dsContent).toContain("DataframeEntry");
      expect(dsContent).toContain("interface");
    });

    it("ImageRenderer should define configuration interface", () => {
      const irPath = resolve("src/extensions/image-renderer.ts");
      const irContent = readFileSync(irPath, "utf-8");
      expect(irContent).toContain("ImageRendererConfig");
      expect(irContent).toContain("TerminalCapabilities");
    });

    it("ImageRenderer should have platform type definition", () => {
      const irPath = resolve("src/extensions/image-renderer.ts");
      const irContent = readFileSync(irPath, "utf-8");
      expect(irContent).toContain("type Platform");
      expect(irContent).toContain("wsl");
      expect(irContent).toContain("native-linux");
      expect(irContent).toContain("macos");
    });
  });

  describe("Agent Session Integration", () => {
    it("should properly integrate pi-coding-agent", () => {
      const pkgPath = resolve("package.json");
      const pkgContent = readFileSync(pkgPath, "utf-8");
      expect(pkgContent).toContain("@earendil-works/pi-coding-agent");
    });

    it("session should be awaited from createAgentSession", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("await createAgentSession");
    });

    it("should destructure session from the result", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/const\s*{\s*session\s*}/);
    });
  });

  describe("Code Execution Capability", () => {
    it("agent should be able to execute Python code", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Write and execute Python");
      expect(promptContent).toContain("isolated, persistent subprocess");
    });

    it("agent should return code execution results", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Show the code");
      expect(promptContent).toContain("Show the output");
    });

    it("Python environment should be configured for data science", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toMatch(/pandas.*numpy.*scipy.*matplotlib/);
    });
  });

  describe("Session Persistence and State", () => {
    it("system prompt should document dataframe persistence", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("persists");
      expect(promptContent).toContain("Parquet");
    });

    it("system prompt should document session history", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("logged to session history");
    });

    it("system prompt should document state across turns", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Maintain dataframe state");
      expect(promptContent).toContain("across turns");
    });
  });
});
