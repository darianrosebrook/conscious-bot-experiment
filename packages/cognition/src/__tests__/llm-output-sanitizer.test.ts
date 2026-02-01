import { describe, it, expect } from 'vitest';
import {
  sanitizeLLMOutput,
  stripCodeFences,
  stripSystemPromptLeaks,
  extractGoalTag,
  truncateDegeneration,
  stripTrailingGarbage,
  normalizeWhitespace,
  isUsableContent,
  hasCodeLikeDensity,
  CANONICAL_ACTIONS,
} from '../llm-output-sanitizer';

/**
 * Tests for llm-output-sanitizer, covering each pipeline step
 * and combined real-world scenarios from production logs.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// stripCodeFences
// ============================================================================

describe('stripCodeFences', () => {
  it('removes standalone triple backticks wrapping content', () => {
    expect(stripCodeFences('``` I should find shelter. ```')).toBe(
      'I should find shelter. '
    );
  });

  it('removes language-tagged opening fence', () => {
    expect(stripCodeFences('```text I need food.\n```')).toBe(
      'I need food.\n'
    );
  });

  it('removes multiline fenced block', () => {
    const input = '```\nI should craft a pickaxe to mine stone.\n```';
    const result = stripCodeFences(input);
    expect(result).toBe('I should craft a pickaxe to mine stone.\n');
  });

  it('preserves single backticks for item names', () => {
    const input = 'I need to craft a `wooden_pickaxe` to mine stone.';
    expect(stripCodeFences(input)).toBe(input);
  });

  it('preserves double backticks', () => {
    const input = 'The item ``oak_log`` is useful.';
    expect(stripCodeFences(input)).toBe(input);
  });

  it('handles multiple fenced blocks', () => {
    const input = '```text\nFirst.\n```\nMiddle.\n```\nSecond.\n```';
    const result = stripCodeFences(input);
    expect(result).not.toContain('```');
    expect(result).toContain('First.');
    expect(result).toContain('Second.');
  });
});

// ============================================================================
// stripSystemPromptLeaks
// ============================================================================

describe('stripSystemPromptLeaks', () => {
  it('removes "You are my private inner thought" prefix', () => {
    const input =
      'You are my private inner thought... I should find shelter.';
    const result = stripSystemPromptLeaks(input);
    expect(result).toBe('I should find shelter.');
  });

  it('removes "You are an agent" prefix', () => {
    const input =
      "You are an agent, and your inner thoughts must be... I need shelter.";
    const result = stripSystemPromptLeaks(input);
    expect(result).toBe('I need shelter.');
  });

  it('removes "Write exactly one or two short sentences" prefix', () => {
    const input =
      'Write exactly one or two short sentences. I see a cave ahead.';
    const result = stripSystemPromptLeaks(input);
    expect(result).toBe('I see a cave ahead.');
  });

  it('removes "Say what I notice" prefix', () => {
    const input = 'Say what I notice and do next. The forest is dark.';
    const result = stripSystemPromptLeaks(input);
    expect(result).toBe('The forest is dark.');
  });

  it('preserves text that does not start with a known prefix', () => {
    const input = 'I should find shelter before nightfall.';
    expect(stripSystemPromptLeaks(input)).toBe(input);
  });

  it('is case-insensitive for prefix matching', () => {
    const input =
      'you are my private inner thought. I need food.';
    const result = stripSystemPromptLeaks(input);
    expect(result).toBe('I need food.');
  });
});

// ============================================================================
// extractGoalTag
// ============================================================================

describe('extractGoalTag', () => {
  it('extracts well-formed goal with amount', () => {
    const input = 'I should mine stone. [GOAL: mine stone 16]';
    const result = extractGoalTag(input);
    expect(result.text).toBe('I should mine stone.');
    expect(result.goal).toEqual({
      action: 'mine',
      target: 'stone',
      amount: 16,
    });
  });

  it('extracts goal without amount', () => {
    const input = 'Time to craft a pickaxe. [GOAL: craft wooden_pickaxe]';
    const result = extractGoalTag(input);
    expect(result.text).toBe('Time to craft a pickaxe.');
    expect(result.goal).toEqual({
      action: 'craft',
      target: 'wooden_pickaxe',
      amount: null,
    });
  });

  it('handles multi-word target', () => {
    const input = 'Need resources. [GOAL: collect oak log 5]';
    const result = extractGoalTag(input);
    expect(result.goal).toEqual({
      action: 'collect',
      target: 'oak log',
      amount: 5,
    });
  });

  it('accepts non-standard action verbs', () => {
    const input = 'Looking around. [GOAL: find shelter]';
    const result = extractGoalTag(input);
    expect(result.goal).toEqual({
      action: 'find',
      target: 'shelter',
      amount: null,
    });
  });

  it('handles malformed goal with missing closing bracket', () => {
    const input = 'I need to build. [GOAL: build shelter 1';
    const result = extractGoalTag(input);
    expect(result.goal).not.toBeNull();
    expect(result.goal!.action).toBe('build');
    expect(result.goal!.target).toBe('shelter');
    expect(result.goal!.amount).toBe(1);
  });

  it('fail-closed on split goal with no target inside brackets: [GOAL: find] text', () => {
    // The bounded-scan parser requires target tokens inside the brackets.
    // `[GOAL: find]` has action only — fail-closed (no goal).
    // rawGoalTag preserved for debugging.
    const input = '[GOAL: find] shelter';
    const result = extractGoalTag(input);
    expect(result.goal).toBeNull();
    expect(result.rawGoalTag).toBe('[GOAL: find]');
  });

  it('parses goal with target inside brackets', () => {
    const input = '[GOAL: find shelter]';
    const result = extractGoalTag(input);
    expect(result.goal).not.toBeNull();
    expect(result.goal!.action).toBe('find');
    expect(result.goal!.target).toBe('shelter');
  });

  it('returns null goal when no goal tag present', () => {
    const input = 'Just exploring around.';
    const result = extractGoalTag(input);
    expect(result.text).toBe(input);
    expect(result.goal).toBeNull();
  });
});

// ============================================================================
// truncateDegeneration
// ============================================================================

describe('truncateDegeneration', () => {
  it('truncates when a trigram repeats 3+ times', () => {
    const input =
      "I'm trying to find a way to create a way to create a way to create something.";
    const result = truncateDegeneration(input);
    expect(result.hadDegeneration).toBe(true);
    expect(result.text).toContain('...');
    expect(result.text.length).toBeLessThan(input.length);
  });

  it('truncates 4+ consecutive identical words', () => {
    const input = 'I should find find find find shelter.';
    const result = truncateDegeneration(input);
    expect(result.hadDegeneration).toBe(true);
    expect(result.text).toContain('...');
  });

  it('does not truncate normal text', () => {
    const input = 'I should gather wood and build a shelter before night.';
    const result = truncateDegeneration(input);
    expect(result.hadDegeneration).toBe(false);
    expect(result.text).toBe(input);
  });

  it('allows up to 2 trigram repetitions without truncation', () => {
    // "I need to" appears twice — acceptable
    const input = 'I need to eat. I need to sleep.';
    const result = truncateDegeneration(input);
    expect(result.hadDegeneration).toBe(false);
    expect(result.text).toBe(input);
  });
});

// ============================================================================
// stripTrailingGarbage
// ============================================================================

describe('stripTrailingGarbage', () => {
  it('removes trailing standalone number', () => {
    const input = 'I should explore the cave. 42';
    const result = stripTrailingGarbage(input);
    expect(result.text).toBe('I should explore the cave.');
    expect(result.hadTrailingGarbage).toBe(true);
  });

  it('removes trailing incomplete fragment', () => {
    const input = 'I should mine stone. The cave is very';
    const result = stripTrailingGarbage(input);
    expect(result.text).toBe('I should mine stone.');
    expect(result.hadTrailingGarbage).toBe(true);
  });

  it('preserves complete sentences', () => {
    const input = 'I should mine stone. The cave is dark.';
    const result = stripTrailingGarbage(input);
    expect(result.text).toBe(input);
    expect(result.hadTrailingGarbage).toBe(false);
  });

  it('preserves single sentence without trailing garbage', () => {
    const input = 'I should find shelter.';
    const result = stripTrailingGarbage(input);
    expect(result.text).toBe(input);
    expect(result.hadTrailingGarbage).toBe(false);
  });
});

// ============================================================================
// normalizeWhitespace
// ============================================================================

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeWhitespace('I   should   explore.')).toBe(
      'I should explore.'
    );
  });

  it('collapses newlines and tabs', () => {
    expect(normalizeWhitespace('I\n\nshould\texplore.')).toBe(
      'I should explore.'
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  I should explore.  ')).toBe(
      'I should explore.'
    );
  });
});

// ============================================================================
// isUsableContent
// ============================================================================

describe('isUsableContent', () => {
  it('returns false for empty string', () => {
    expect(isUsableContent('')).toBe(false);
  });

  it('returns false for very short text', () => {
    expect(isUsableContent('Hi')).toBe(false);
  });

  it('returns false for generic filler', () => {
    expect(isUsableContent('Maintaining awareness of surroundings.')).toBe(
      false
    );
  });

  it('returns false for "Observing surroundings."', () => {
    expect(isUsableContent('Observing surroundings.')).toBe(false);
  });

  it('returns true for meaningful content', () => {
    expect(isUsableContent('I should gather wood before nightfall.')).toBe(
      true
    );
  });

  it('returns true for content with keywords', () => {
    expect(
      isUsableContent('I need to craft a pickaxe to mine stone.')
    ).toBe(true);
  });
});

// ============================================================================
// sanitizeLLMOutput (full pipeline)
// ============================================================================

describe('sanitizeLLMOutput', () => {
  it('cleans code-fenced content', () => {
    const result = sanitizeLLMOutput('``` I should find shelter. ```');
    expect(result.text).toBe('I should find shelter.');
    expect(result.flags.hadCodeFences).toBe(true);
  });

  it('cleans language-tagged fence', () => {
    const result = sanitizeLLMOutput('```text I need food.\n```');
    expect(result.text).toBe('I need food.');
    expect(result.flags.hadCodeFences).toBe(true);
  });

  it('cleans system prompt leak', () => {
    const result = sanitizeLLMOutput(
      'You are my private inner thought... I should find shelter.'
    );
    expect(result.text).toBe('I should find shelter.');
    expect(result.flags.hadSystemPromptLeak).toBe(true);
  });

  it('extracts well-formed goal and removes tag', () => {
    const result = sanitizeLLMOutput(
      'I should mine stone. [GOAL: mine stone 16]'
    );
    expect(result.text).toBe('I should mine stone.');
    expect(result.goalTag).toEqual({
      action: 'mine',
      target: 'stone',
      amount: 16,
    });
  });

  it('extracts goal without amount', () => {
    const result = sanitizeLLMOutput(
      'Time to craft a pickaxe. [GOAL: craft wooden_pickaxe]'
    );
    expect(result.text).toBe('Time to craft a pickaxe.');
    expect(result.goalTag).not.toBeNull();
    expect(result.goalTag!.action).toBe('craft');
    expect(result.goalTag!.target).toBe('wooden_pickaxe');
    expect(result.goalTag!.amount).toBeNull();
  });

  it('removes trailing number', () => {
    const result = sanitizeLLMOutput('I should explore the cave. 42');
    expect(result.text).toBe('I should explore the cave.');
    expect(result.flags.hadTrailingGarbage).toBe(true);
  });

  it('removes trailing incomplete fragment', () => {
    const result = sanitizeLLMOutput(
      'I should mine stone. The cave is very'
    );
    expect(result.text).toBe('I should mine stone.');
    expect(result.flags.hadTrailingGarbage).toBe(true);
  });

  it('preserves keywords through code fence removal', () => {
    const result = sanitizeLLMOutput(
      '```\nI should craft a pickaxe to mine stone.\n```'
    );
    expect(result.text).toContain('craft');
    expect(result.text).toContain('mine');
    expect(result.text).toContain('stone');
  });

  it('handles combined issues: fences + leak + degeneration + goal + trailing number', () => {
    const input =
      '```text\nYou are my private inner thought. I should find find find find shelter. [GOAL: build shelter 1] 37\n```';
    const result = sanitizeLLMOutput(input);

    // Goal should be extracted
    expect(result.goalTag).not.toBeNull();
    expect(result.goalTag!.action).toBe('build');
    expect(result.goalTag!.target).toBe('shelter');
    expect(result.goalTag!.amount).toBe(1);

    // Flags
    expect(result.flags.hadCodeFences).toBe(true);
    expect(result.flags.hadSystemPromptLeak).toBe(true);

    // Text should not contain fences, leaked prompt, or trailing garbage
    expect(result.text).not.toContain('```');
    expect(result.text).not.toContain('You are my private');
    expect(result.text).not.toContain('37');
  });

  it('tracks original and cleaned lengths', () => {
    const input = '```text\nHello world.\n```';
    const result = sanitizeLLMOutput(input);
    expect(result.flags.originalLength).toBe(input.length);
    expect(result.flags.cleanedLength).toBe(result.text.length);
    expect(result.flags.cleanedLength).toBeLessThan(result.flags.originalLength);
  });

  it('handles already-clean text without false flags', () => {
    const input = 'I should gather wood before nightfall.';
    const result = sanitizeLLMOutput(input);
    expect(result.text).toBe(input);
    expect(result.goalTag).toBeNull();
    expect(result.flags.hadCodeFences).toBe(false);
    expect(result.flags.hadSystemPromptLeak).toBe(false);
    expect(result.flags.hadDegeneration).toBe(false);
    expect(result.flags.hadTrailingGarbage).toBe(false);
  });

  it('handles empty input', () => {
    const result = sanitizeLLMOutput('');
    expect(result.text).toBe('');
    expect(result.goalTag).toBeNull();
    expect(result.flags.originalLength).toBe(0);
  });

  it('handles whitespace-only input', () => {
    const result = sanitizeLLMOutput('   \n\t  ');
    expect(result.text).toBe('');
  });

  it('populates goalTagV1 with version and raw fields', () => {
    const result = sanitizeLLMOutput('I should mine stone. [GOAL: mine stone 16]');
    expect(result.goalTagV1).not.toBeNull();
    expect(result.goalTagV1!.version).toBe(1);
    expect(result.goalTagV1!.action).toBe('mine');
    expect(result.goalTagV1!.target).toBe('stone');
    expect(result.goalTagV1!.amount).toBe(16);
    expect(result.goalTagV1!.raw).toBe('[GOAL: mine stone 16]');
  });

  it('sets hadCodeContent flag for code-like output', () => {
    const codeOutput = `import os\nfrom collections import defaultdict\ndef main():\n    data = {}\n    for item in items:\n        process(item)`;
    const result = sanitizeLLMOutput(codeOutput);
    expect(result.flags.hadCodeContent).toBe(true);
  });

  it('sets rawGoalTag when action is unknown (fail-closed)', () => {
    const result = sanitizeLLMOutput('Something [GOAL: teleport spawn]');
    expect(result.goalTag).toBeNull();
    expect(result.flags.rawGoalTag).toBe('[GOAL: teleport spawn]');
  });

  it('handles trailing amount after closing bracket', () => {
    const result = sanitizeLLMOutput('Time to mine. [GOAL: craft oak_planks] 20');
    expect(result.goalTag).not.toBeNull();
    expect(result.goalTag!.action).toBe('craft');
    expect(result.goalTag!.target).toBe('oak_planks');
    expect(result.goalTag!.amount).toBe(20);
  });
});

// ============================================================================
// hasCodeLikeDensity
// ============================================================================

describe('hasCodeLikeDensity', () => {
  it('returns true for Python code blocks', () => {
    const code = `import os\nfrom sys import argv\ndef main():\n    data = {}\n    for x in items:\n        print(x)`;
    expect(hasCodeLikeDensity(code)).toBe(true);
  });

  it('returns false for short text (fewer than 3 lines)', () => {
    expect(hasCodeLikeDensity('import os\nprint("hi")')).toBe(false);
  });

  it('returns false for English prose mentioning "import"', () => {
    const prose = 'I should import wood from the nearby forest.\nThe logs are plentiful.\nI need shelter before nightfall.';
    expect(hasCodeLikeDensity(prose)).toBe(false);
  });

  it('returns true for JavaScript code', () => {
    const code = `const x = 5;\nlet y = [];\nfunction test() {\n  return x + y;\n}\nif (x > 0) {\n  console.log("done");\n}`;
    expect(hasCodeLikeDensity(code)).toBe(true);
  });
});

// ============================================================================
// CANONICAL_ACTIONS
// ============================================================================

describe('CANONICAL_ACTIONS', () => {
  it('contains expected routable actions', () => {
    expect(CANONICAL_ACTIONS.has('collect')).toBe(true);
    expect(CANONICAL_ACTIONS.has('mine')).toBe(true);
    expect(CANONICAL_ACTIONS.has('craft')).toBe(true);
    expect(CANONICAL_ACTIONS.has('build')).toBe(true);
  });

  it('contains expected unroutable actions', () => {
    expect(CANONICAL_ACTIONS.has('find')).toBe(true);
    expect(CANONICAL_ACTIONS.has('explore')).toBe(true);
    expect(CANONICAL_ACTIONS.has('navigate')).toBe(true);
    expect(CANONICAL_ACTIONS.has('check')).toBe(true);
    expect(CANONICAL_ACTIONS.has('continue')).toBe(true);
  });

  it('does not contain unknown actions', () => {
    expect(CANONICAL_ACTIONS.has('teleport')).toBe(false);
    expect(CANONICAL_ACTIONS.has('fly')).toBe(false);
    expect(CANONICAL_ACTIONS.has('destroy')).toBe(false);
  });
});

// ============================================================================
// extractGoalTag — bounded-scan parser edge cases
// ============================================================================

describe('extractGoalTag (bounded-scan edge cases)', () => {
  it('normalizes synonym actions via ACTION_NORMALIZE_MAP', () => {
    const result = extractGoalTag('I need to. [GOAL: dig stone 5]');
    expect(result.goal).not.toBeNull();
    expect(result.goal!.action).toBe('mine'); // dig → mine
    expect(result.goal!.target).toBe('stone');
    expect(result.goal!.amount).toBe(5);
  });

  it('rejects unknown actions (fail-closed)', () => {
    const result = extractGoalTag('Something [GOAL: teleport home]');
    expect(result.goal).toBeNull();
    expect(result.rawGoalTag).toBe('[GOAL: teleport home]');
  });

  it('handles case-insensitive [GOAL: tag', () => {
    const result = extractGoalTag('Thought [goal: mine iron_ore 3]');
    expect(result.goal).not.toBeNull();
    expect(result.goal!.action).toBe('mine');
    expect(result.goal!.target).toBe('iron_ore');
    expect(result.goal!.amount).toBe(3);
  });

  it('handles malformed tag without closing bracket', () => {
    const result = extractGoalTag('I should [GOAL: build shelter');
    expect(result.goal).not.toBeNull();
    expect(result.goal!.action).toBe('build');
    expect(result.goal!.target).toBe('shelter');
  });

  it('inner amount takes priority over trailing amount', () => {
    const result = extractGoalTag('Text [GOAL: build shelter 1] 37');
    expect(result.goal!.amount).toBe(1);
  });

  it('trailing amount used when no inner amount', () => {
    const result = extractGoalTag('Text [GOAL: craft oak_planks] 20');
    expect(result.goal!.amount).toBe(20);
  });

  it('handles multi-word targets', () => {
    const result = extractGoalTag('[GOAL: collect oak log 5]');
    expect(result.goal!.target).toBe('oak log');
    expect(result.goal!.amount).toBe(5);
  });
});
