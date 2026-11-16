import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  path.resolve(process.cwd(), '.github/workflows/codex-pr-review.yml'),
  'utf8'
);
const prompt = readFileSync(
  path.resolve(process.cwd(), '.github/prompts/codex-pr-review.md'),
  'utf8'
);
const deepSeekRunner = readFileSync(
  path.resolve(process.cwd(), '.github/scripts/deepseek-pr-review.mjs'),
  'utf8'
);

describe('Codex PR review context safety', () => {
  it('does not let an older matching review hide a newer stale review after rollback', () => {
    expect(workflow).toContain('latestBotReview?.commit_id === currentHeadSha');
    expect(workflow).not.toContain('botReviews.some(\n              (review) => review.commit_id');
  });

  it('reuses prior review context only for a verified linear update', () => {
    expect(workflow).toContain('comparison.data.status === "ahead"');
    expect(workflow).toContain('comparison.data.behind_by === 0');
    expect(workflow).toContain('mergeBaseSha === previousHeadSha');
    expect(workflow).toContain('hasCompleteCommitList');
    expect(workflow).toContain('!hasMergeCommit');
    expect(workflow).toContain('prior_context_discarded');

    expect(deepSeekRunner).toContain('isLinearReviewUpdate(comparison, latestBotReviewCommit)');
    expect(deepSeekRunner).toContain('!priorContextDiscarded');
    expect(deepSeekRunner).toContain('full review after prior context reset');
  });

  it('loads review tooling from the default branch after checking out the PR base', () => {
    const baseCheckout = workflow.indexOf('ref: ${{ github.event.pull_request.base.ref }}');
    const tooling = workflow.indexOf('github.event.repository.default_branch');
    const deepseekRun = workflow.indexOf('run: node .github/scripts/deepseek-pr-review.mjs');
    const codexPrompt = workflow.indexOf('prompt-file: .github/prompts/codex-pr-review.md');

    expect(baseCheckout).toBeGreaterThan(-1);
    expect(tooling).toBeGreaterThan(baseCheckout);
    expect(deepseekRun).toBeGreaterThan(tooling);
    expect(codexPrompt).toBeGreaterThan(tooling);
    expect(workflow).toContain('.github/scripts/deepseek-common.mjs');
    expect(workflow).toContain('.github/prompts/codex-pr-review.md');
    expect(workflow).toContain('never take these files from the PR head');
  });

  it('treats the current PR diff as authoritative and documents advisory semantics', () => {
    expect(prompt).toContain('Authoritative scope');
    expect(prompt).toContain('After prior context is reset, do not load, repeat, or cite');
    expect(prompt).toContain('Review policy: advisory');
    expect(prompt).toContain('Keep `event: "COMMENT"`');

    expect(deepSeekRunner).toContain('AUTHORITATIVE CURRENT PR CHANGED PATHS');
    expect(deepSeekRunner).toContain('FINAL SCOPE GUARD');
  });
});
