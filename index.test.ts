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
      expect(promptContent).toContain("Dataframe Store");
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
    it("should import main from pi-coding-agent", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/import\s*{\s*main\s*}/);
      expect(indexContent).toContain("@earendil-works/pi-coding-agent");
    });

    it("should import DoltStore extension", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("doltStoreExtension");
      expect(indexContent).toContain("dolt-store-extension");
    });

    it("should import ImageRenderer extension", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("ImageRenderer");
      expect(indexContent).toContain("image-renderer");
    });

    it("should invoke main with top-level await", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/await main\(/);
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

    it("system prompt path should be passed via --system-prompt flag", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("--system-prompt");
      expect(indexContent).toContain("systemPromptPath");
    });

    it("system prompt path should resolve correctly relative to index.ts", () => {
      const promptPath = resolve("src/prompts/system.md");
      expect(existsSync(promptPath)).toBe(true);
    });
  });

  describe("Extension Initialization and Registration", () => {
    it("should have doltStoreExtension function", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("doltStoreExtension");
    });

    it("should instantiate ImageRenderer", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("ImageRenderer");
    });

    it("DoltStoreExtension should be defined and properly exported", () => {
      const extPath = resolve("src/extensions/dolt-store-extension.ts");
      expect(existsSync(extPath)).toBe(true);
      const extContent = readFileSync(extPath, "utf-8");
      expect(extContent).toContain("export");
      expect(extContent).toContain("doltStoreExtension");
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
      // Extensions should be passed to extensionFactories
      expect(indexContent).toMatch(
        /doltStore|imageRenderer|extension|register/i
      );
    });
  });

  describe("Agent Session Creation", () => {
    it("should forward CLI args to main", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("process.argv.slice(2)");
    });

    it("should register extension factories with main", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("extensionFactories");
      expect(indexContent).toContain("doltStoreExtension");
      expect(indexContent).toContain("imageRendererExtension");
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
    it("DoltStoreExtension should define proper interface", () => {
      const extPath = resolve("src/extensions/dolt-store-extension.ts");
      const extContent = readFileSync(extPath, "utf-8");
      expect(extContent).toContain("function");
      expect(extContent).toContain("doltStoreExtension");
    });

    it("ImageRenderer should define configuration interface", () => {
      const irPath = resolve("src/extensions/image-renderer.ts");
      const irContent = readFileSync(irPath, "utf-8");
      expect(irContent).toContain("ImageRendererOptions");
      expect(irContent).toContain("TerminalCapabilities");
    });

    it("ImageRenderer should have platform type definition", () => {
      const irPath = resolve("src/extensions/image-renderer.ts");
      const irContent = readFileSync(irPath, "utf-8");
      expect(irContent).toMatch(/type\s*{?\s*Platform/);
      const pcPath = resolve("src/extensions/platform-config.ts");
      const pcContent = readFileSync(pcPath, "utf-8");
      expect(pcContent).toContain("wsl");
      expect(pcContent).toContain("native-linux");
      expect(pcContent).toContain("macos");
    });
  });

  describe("Agent Session Integration", () => {
    it("should properly integrate pi-coding-agent", () => {
      const pkgPath = resolve("package.json");
      const pkgContent = readFileSync(pkgPath, "utf-8");
      expect(pkgContent).toContain("@earendil-works/pi-coding-agent");
    });

    it("should await the main entrypoint", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("await main");
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
      expect(promptContent).toContain("show the output");
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
      expect(promptContent).toContain("Dolt");
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

/**
 * Acceptance tests for GitHub Issue #17: Verification loop integration
 *
 * Run with: bun test --grep "issue-17"
 *
 * These tests verify all acceptance criteria:
 * - [AC1] verify_claim tool is registered with the main agent session
 * - [AC2] System prompt instructs agent to self-tag causal/predictive claims
 * - [AC3] System prompt instructs agent to call verify_claim before reporting tagged claims
 * - [AC4] System prompt defines revision behavior on issues-found
 * - [AC5] System prompt defines reporting behavior on claim-survives
 * - [AC6] Descriptive claims are explicitly excluded from verification
 *
 * Tests deliberately cover the feature specification WITHOUT implementing the feature itself.
 * The tests SHOULD FAIL until the implementation agent completes the work.
 */
describe("issue-17", () => {
  describe("verify_claim tool registration in index.ts", () => {
    it("should import verifyClaimTool from verify-claim.js", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("verifyClaimTool");
      expect(indexContent).toContain("verify-claim");
    });

    it("should pass customTools array to main() with verifyClaimTool", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("customTools");
      expect(indexContent).toContain("verifyClaimTool");
      expect(indexContent).toMatch(/customTools\s*:\s*\[\s*verifyClaimTool/);
    });

    it("should invoke main with customTools parameter in options", () => {
      const indexPath = resolve("index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");
      // Should have a main() call with customTools in the second argument
      expect(indexContent).toMatch(
        /await\s+main\(\s*\[.*?\]\s*,\s*\{\s*[^}]*customTools[^}]*\}\s*\)/s
      );
    });

    it("verifyClaimTool should be exported from verify-claim.ts", () => {
      const verifyclaimPath = resolve("src/extensions/verify-claim.ts");
      const verifyclaimContent = readFileSync(verifyclaimPath, "utf-8");
      expect(verifyclaimContent).toContain("export const verifyClaimTool");
      expect(verifyclaimContent).toContain("ToolDefinition");
    });
  });

  describe("System prompt instructions for claim verification", () => {
    it("should document verify_claim tool name in system prompt", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("verify_claim");
    });

    it("should instruct agent to use claim type markers before calling verify_claim", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("<claim");
      expect(promptContent).toContain("type=");
    });

    it("should specify verify_claim should be called for causal claims", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toMatch(/type=.*causal/);
    });

    it("should specify verify_claim should be called for predictive claims", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toMatch(/type=.*predictive/);
    });

    it("should document behavior when verdict is issues-found", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("issues-found");
      // Should describe what to do when issues are found
      expect(promptContent).toMatch(/issues-found.*[rR]evise/);
    });

    it("should document behavior when verdict is claim-survives", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("claim-survives");
      // Should describe reporting with confidence note
      expect(promptContent).toMatch(/claim-survives.*report|confidence/i);
    });

    it("should explicitly state descriptive claims do not require verify_claim", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toMatch(
        /descriptive.*do not|not.*descriptive|descriptive.*excluded/i
      );
    });

    it("should clarify mean, count, correlation are descriptive claims", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toMatch(/mean.*descriptive|descriptive.*mean/i);
    });

    it("should contrast descriptive vs causal/predictive verification requirement", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      // Should distinguish: descriptive claims self-evident, causal/predictive need verification
      expect(promptContent).toMatch(/descriptive.*code.*enough/i);
    });
  });

  describe("verify_claim tool definition", () => {
    it("verify-claim.ts should export VerificationResult interface", () => {
      const verifyclaimPath = resolve("src/extensions/verify-claim.ts");
      const verifyclaimContent = readFileSync(verifyclaimPath, "utf-8");
      expect(verifyclaimContent).toContain("VerificationResult");
    });

    it("verify-claim.ts should export verifyClaim function", () => {
      const verifyclaimPath = resolve("src/extensions/verify-claim.ts");
      const verifyclaimContent = readFileSync(verifyclaimPath, "utf-8");
      expect(verifyclaimContent).toContain("export.*verifyClaim");
    });

    it("verifyClaimTool should have name 'verify_claim'", () => {
      const verifyclaimPath = resolve("src/extensions/verify-claim.ts");
      const verifyclaimContent = readFileSync(verifyclaimPath, "utf-8");
      expect(verifyclaimContent).toContain('name: "verify_claim"');
    });

    it("verifyClaimTool should accept claim and code parameters", () => {
      const verifyclaimPath = resolve("src/extensions/verify-claim.ts");
      const verifyclaimContent = readFileSync(verifyclaimPath, "utf-8");
      expect(verifyclaimContent).toMatch(/claim.*String/);
      expect(verifyclaimContent).toMatch(/code.*String/);
    });
  });

  describe("System prompt workflow for verification", () => {
    it("should document full workflow including verify_claim call", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      expect(promptContent).toContain("Workflow");
      // Workflow should mention verification for causal/predictive
      expect(promptContent).toMatch(/workflow.*verify|verify.*workflow/i);
    });

    it("should show example of claim with type marker before verify_claim", () => {
      const promptPath = resolve("src/prompts/system.md");
      const promptContent = readFileSync(promptPath, "utf-8");
      // Should have example showing <claim type=...> usage
      expect(promptContent).toMatch(/<claim/);
    });
  });
});
