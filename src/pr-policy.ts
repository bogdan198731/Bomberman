import { FIX_LIMITS, isBrowserSpec, isFixableModule, isStyleFile, isTestFile, type FixRecord } from './fix-policy.js';
import { sideEffectSummary } from './side-effects.js';
import type { TriagedReport } from './triage.js';

export const PR_LABELS = {
  report: { name: 'bug-report', color: 'd73a4a', description: 'Opened by the bug report pipeline' },
  tester: { name: 'trusted-tester', color: '0e8a16', description: 'Reported by a verified tester' },
  autoMerge: { name: 'auto-merge', color: '5319e7', description: 'Merges by itself once CI passes' },
} as const;

export const DEFAULT_DAILY_AUTO_MERGES = 3;

export interface AutoMergeInput {
  triaged: TriagedReport;
  fix: FixRecord;
  /** Files changed on the branch since its base, straight from git rather than the record. */
  changedFiles: readonly string[];
  diffLines: number;
  /** The reporting tester still holds a live code right now. */
  testerActive: boolean;
  /** index.html, if the branch changes it, differs only inside <style> blocks. */
  htmlStyleOnly: boolean;
  /** Added CSS lines that load something (url(), @import); see unsafeCssAdditions. */
  unsafeCss?: readonly string[];
}

/**
 * Every gate is listed, passing or not, so the PR can say exactly why it will
 * or will not merge by itself. GitHub still waits for CI before merging.
 */
export function autoMergeChecks(input: AutoMergeInput): { eligible: boolean; checks: { ok: boolean; label: string }[] } {
  const { triaged, fix, changedFiles, diffLines, testerActive, htmlStyleOnly } = input;
  const kind = fix.kind ?? 'unit';
  const isAnyTest = (file: string) => isTestFile(file) || isBrowserSpec(file);
  const { triage } = triaged;
  const code = changedFiles.filter(file => !isAnyTest(file));
  const tests = changedFiles.filter(isAnyTest);
  const checks = [
    { ok: triaged.trust === 'tester' && Boolean(triaged.tester), label: 'reported with a verified tester code' },
    { ok: testerActive, label: 'that tester\'s code is still active' },
    { ok: triage.verdict === 'bug' || triage.verdict === 'improvement', label: 'triaged as a bug or improvement' },
    { ok: triage.confidence === 'high', label: 'triage confidence is high' },
    { ok: triage.autoFixCandidate, label: 'triage marked it as an auto-fix candidate' },
    { ok: !triage.injectionSuspected, label: 'no prompt injection suspected' },
    { ok: !fix.forced, label: 'picked by triage, not forced by hand' },
    { ok: fix.outcome === 'fixed' && fix.commits.length === 2, label: 'a failing test came first, then the fix' },
    { ok: tests.length > 0 && code.length > 0, label: 'the branch changes both a test and code' },
    kind === 'browser'
      ? { ok: code.every(isStyleFile) && htmlStyleOnly && !input.unsafeCss?.length, label: 'only styles changed (CSS in <style> blocks or public/*.css)' }
      : { ok: code.every(isFixableModule), label: 'only unprotected game modules changed' },
    ...(kind === 'browser' ? [
      { ok: fix.review?.approved === true, label: 'a vision review approved the before/after screenshots' },
      { ok: Boolean(fix.sideEffects && fix.sideEffects.checked > 0 && !fix.sideEffects.others.length), label: 'no other game\'s screen or the hub changed' },
    ] : []),
    { ok: code.length <= FIX_LIMITS.files && diffLines <= FIX_LIMITS.lines, label: `within ${FIX_LIMITS.files} files and ${FIX_LIMITS.lines} lines` },
  ];
  return { eligible: checks.every(check => check.ok), checks };
}

export function withinDailyCap(mergeTimes: readonly string[], now: Date, cap: number): boolean {
  const dayAgo = now.getTime() - 86_400_000;
  return mergeTimes.filter(time => Date.parse(time) > dayAgo).length < cap;
}

/** Titles come from the model's summary of public input: keep them plain, short and ping-free. */
export function prTitle(title: string): string {
  const plain = title.replace(/[@`<>[\]()*_#|\\]/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return `fix: ${plain.slice(0, 90) || 'player-reported issue'}`;
}

/** A fenced block renders nothing: no mentions, links, images or HTML from the report. */
export function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(match => match[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}text\n${text}\n${ticks}`;
}

export interface ScreenshotPair { label: string; before?: string; after?: string }

/**
 * Matches before/after files by name (<size>-<test>-<step>.png, as the browser
 * helpers write them), phone first. A state with only one side still shows,
 * so a missing picture is visible rather than silently dropped.
 */
export function pairScreenshots(before: readonly string[], after: readonly string[]): ScreenshotPair[] {
  const names = [...new Set([...before, ...after])].filter(name => name.endsWith('.png'));
  const order = (name: string) => (name.startsWith('phone-') ? 0 : 1);
  return names
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'en', { numeric: true }))
    .map(name => {
      const match = name.match(/^([a-z]+)-(.+)-(\d+)\.png$/);
      return {
        label: match ? `${match[1]}, state ${match[3]}` : name,
        before: before.includes(name) ? name : undefined,
        after: after.includes(name) ? name : undefined,
      };
    });
}

/** Markdown table of before/after pictures; `url` turns a stage and file name into an image link. */
export function screenshotSection(pairs: readonly ScreenshotPair[], url: (stage: 'before' | 'after', file: string) => string): string {
  if (!pairs.length) return '';
  const cell = (stage: 'before' | 'after', file?: string) => (file ? `<img src="${url(stage, file)}" width="360">` : '_none_');
  return `**Screenshots** - each state the test measures, before and after the fix

| | Before | After |
|---|---|---|
${pairs.map(pair => `| ${pair.label} | ${cell('before', pair.before)} | ${cell('after', pair.after)} |`).join('\n')}

`;
}

function reviewSection(fix: FixRecord): string {
  if ((fix.kind ?? 'unit') !== 'browser') return '';
  const effects = `**Side effects** - ${sideEffectSummary(fix.sideEffects)}${fix.sideEffects?.own.length ? `; on this game: ${fix.sideEffects.own.map(change => `${change.name} (${change.where})`).join(', ')}` : ''}\n\n`;
  return effects + reviewText(fix);
}

function reviewText(fix: FixRecord): string {
  if (!fix.review) return '**Vision review** - none ran, so a person must check the screenshots.\n\n';
  const { review } = fix;
  const marks = [['problem gone', review.fixed], ['text readable', review.readable], ['fits the design', review.fitsDesign]] as const;
  return `**Vision review: ${review.approved ? 'approved' : 'rejected'}** - ${marks.map(([label, ok]) => `${ok ? '✅' : '❌'} ${label}`).join(' · ')}${review.regressions.length ? ` · ❌ ${review.regressions.length} regression(s)` : ''}
${fence([review.summary, ...review.regressions.map(item => `- ${item}`)].join('\n'))}

`;
}

export function prBody(input: AutoMergeInput, autoMerge: boolean, screenshots = ''): string {
  const { triaged, fix } = input;
  const { checks } = autoMergeChecks(input);
  return `Automated fix for a player report. The first commit adds a test that failed on \`${fix.base.slice(0, 7)}\`; the second makes it pass.

**Report** \`${triaged.id}\` · ${triaged.game} · ${triaged.report.kind} · ${triaged.trust === 'tester' ? `trusted tester \`${triaged.tester}\`` : 'public'}

Player's description (untrusted, shown verbatim):
${fence(triaged.report.description)}

**Triage** - ${triaged.triage.verdict}, ${triaged.triage.confidence} confidence, ${triaged.triage.severity} severity
${fence(triaged.triage.reasoning)}

**Reproducing test** - ${fence(`${fix.testName ?? ''} (${fix.testFile ?? ''})`)}

**Fix** - ${fix.diffLines ?? '?'} changed lines
${fence(fix.summary ?? '')}

${screenshots}${reviewSection(fix)}**Auto-merge: ${autoMerge ? 'enabled - merges once CI passes' : 'off - needs a human review'}**
${checks.map(check => `- [${check.ok ? 'x' : ' '}] ${check.label}`).join('\n')}

---
Generated by \`npm run fix\` and \`npm run prs\`. Review the test as carefully as the fix: a wrong test makes a wrong fix look right.`;
}

export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}
