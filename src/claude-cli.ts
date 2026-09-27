import { spawn } from 'node:child_process';

export const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

export interface ClaudeResult { output: unknown; costUsd: number; model: string }

/**
 * Flags every agent shares: none of the user's settings, hooks, plugins or MCP
 * servers, file tools confined to the working directory, and anything not
 * explicitly allowed is refused instead of prompting.
 */
export function baseClaudeArgs(options: { schema: object; systemPrompt: string; maxUsd: string; model?: string }): string[] {
  return [
    '-p',
    '--restricted',
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--no-session-persistence',
    '--max-budget-usd', options.maxUsd,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(options.schema),
    '--append-system-prompt', options.systemPrompt,
    ...(options.model ? ['--model', options.model] : []),
  ];
}

export function runClaude(options: { cwd: string; args: string[]; prompt: string; timeoutMs: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    // The prompt goes through stdin so report text is never parsed as arguments.
    const child = spawn(CLAUDE_BIN, options.args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude timed out.')); }, options.timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || stdout.trim()) resolve(stdout);
      else reject(new Error(`Claude exited with ${code}: ${stderr.trim().slice(0, 300)}`));
    });
    child.stdin.end(options.prompt);
  });
}

/** Extracts the structured answer from `claude -p --output-format json` output. */
export function parseClaudeResult(stdout: string): ClaudeResult {
  let data: Record<string, unknown>;
  try { data = JSON.parse(stdout) as Record<string, unknown>; }
  catch { throw new Error('Claude returned output that is not JSON.'); }
  if (data.type !== 'result' || data.is_error === true || data.subtype !== 'success') {
    throw new Error(`Claude run failed: ${String(data.subtype ?? 'unknown')}${data.result ? ` - ${String(data.result).slice(0, 300)}` : ''}`);
  }
  if (data.structured_output === undefined) throw new Error('Claude returned no structured output.');
  const models = data.modelUsage && typeof data.modelUsage === 'object' ? Object.keys(data.modelUsage) : [];
  return {
    output: data.structured_output,
    costUsd: typeof data.total_cost_usd === 'number' ? data.total_cost_usd : 0,
    model: models.join(', ') || 'unknown',
  };
}
