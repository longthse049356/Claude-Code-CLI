import { validateBashCommand, getWorkspace } from "../sandbox.ts";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 100_000;

export async function bash(input: Record<string, unknown>): Promise<string> {
  const command = input.command as string;
  validateBashCommand(command);

  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: getWorkspace(),
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, TIMEOUT_MS);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  clearTimeout(timer);

  if (timedOut) {
    return "command timed out after 30s";
  }

  const exitCode = proc.exitCode;

  if (exitCode !== 0) {
    const output = `exit code ${exitCode}\nstderr: ${stderr}\nstdout: ${stdout}`;
    return output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) + "\n[truncated]" : output;
  }

  const result = stdout.trim();
  return result.length > MAX_OUTPUT ? result.slice(0, MAX_OUTPUT) + "\n[truncated]" : result;
}
