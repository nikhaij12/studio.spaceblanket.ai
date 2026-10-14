import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type RunClaude = (args: string[]) => Promise<string>;

async function runClaude(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("claude", args, {
    timeout: 15_000,
    maxBuffer: 16_384,
  });
  return stdout;
}

/** This optional streaming flag first appeared in Claude Code 2.1.211. */
export function supportsForwardSubagentText(version: string): boolean {
  const match = version.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 211)));
}

export type ClaudeReadiness =
  | { ready: true; forwardSubagentText: boolean }
  | { ready: false; error: string };

/** Check only what a headless Studio run needs, without starting a paid turn. */
export async function checkClaudeReady(run: RunClaude = runClaude): Promise<ClaudeReadiness> {
  let version: string;
  try {
    version = await run(["--version"]);
  } catch {
    return {
      ready: false,
      error: "Claude Code could not be started. Install its command-line app, then check `claude --version` in a terminal.",
    };
  }

  try {
    await run(["auth", "status", "--text"]);
  } catch (err) {
    // execFile puts the useful "Not logged in" line in stdout on some CLI
    // versions, not in Error.message.
    const output = err as { stdout?: string; stderr?: string };
    const message = [String(err), output.stdout, output.stderr].join("\n").toLowerCase();
    if (message.includes("not logged in") || message.includes("claude auth login")) {
      return {
        ready: false,
        error: "Claude Code is not signed in. Run `claude auth login` in a terminal, complete sign-in, then try again.",
      };
    }
    // Older CLIs may not have the read-only auth command. Don't turn that
    // optional check into a regression; their real run will report the error.
    if (message.includes("unknown command") || message.includes("unknown option")) {
      return { ready: true, forwardSubagentText: supportsForwardSubagentText(version) };
    }
    return {
      ready: false,
      error: "Claude Code sign-in could not be verified. Run `claude auth status --text` in a terminal and resolve its error, then try again.",
    };
  }

  return { ready: true, forwardSubagentText: supportsForwardSubagentText(version) };
}
