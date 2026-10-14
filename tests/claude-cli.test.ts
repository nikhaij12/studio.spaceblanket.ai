import { describe, expect, it } from "vitest";
import { checkClaudeReady, supportsForwardSubagentText } from "@/lib/claude-cli";

describe("Claude Code readiness", () => {
  it("only enables the optional flag from version 2.1.211", () => {
    expect(supportsForwardSubagentText("2.1.201 (Claude Code)")).toBe(false);
    expect(supportsForwardSubagentText("2.1.210 (Claude Code)")).toBe(false);
    expect(supportsForwardSubagentText("2.1.211 (Claude Code)")).toBe(true);
    expect(supportsForwardSubagentText("2.2.0 (Claude Code)")).toBe(true);
    expect(supportsForwardSubagentText("unknown")).toBe(false);
  });

  it("explains missing sign-in before starting a run", async () => {
    const result = await checkClaudeReady(async (args) => {
      if (args[0] === "--version") return "2.1.201 (Claude Code)";
      throw Object.assign(new Error("Command failed: claude auth status --text"), {
        stdout: "Not logged in. Run claude auth login to authenticate.",
      });
    });
    expect(result).toEqual({
      ready: false,
      error: "Claude Code is not signed in. Run `claude auth login` in a terminal, complete sign-in, then try again.",
    });
  });

  it("allows an authenticated older CLI without the unsupported flag", async () => {
    const result = await checkClaudeReady(async (args) =>
      args[0] === "--version" ? "2.1.201 (Claude Code)" : "Logged in",
    );
    expect(result).toEqual({ ready: true, forwardSubagentText: false });
  });

  it("preserves subagent streaming for an authenticated newer CLI", async () => {
    const result = await checkClaudeReady(async (args) =>
      args[0] === "--version" ? "2.1.211 (Claude Code)" : "Logged in",
    );
    expect(result).toEqual({ ready: true, forwardSubagentText: true });
  });
});
