/**
 * Intention Check Prompt — Non-Injective Template
 *
 * This prompt is designed to allow (but not compel) goal emission.
 *
 * Key distinctions (LF-1):
 * - "Suggesting options" = proposing candidate actions (FORBIDDEN)
 * - "Declaring intent" = stating an intention you already have (ALLOWED)
 * - "No goal" = the DEFAULT success path
 *
 * IMPORTANT: The prompt is FACTUAL-ONLY. It presents the situation
 * without suggesting any actions. The model may choose to:
 * 1. Simply acknowledge the situation (default, expected)
 * 2. Express a genuine intention via [GOAL: ...] tag
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * Standard intention check prompt template.
 *
 * Placeholders:
 * - {situationFrame}: The rendered situation frame (factual-only)
 *
 * IMPORTANT: Goal tag format must match the parser in llm-output-sanitizer.ts:
 * - Format: [GOAL: <action> <target> <amount>?]
 * - Action must be from CANONICAL_ACTIONS (mine, craft, collect, find, build, explore, etc.)
 * - Target is space-separated words
 * - Amount is optional, can be trailing or amount=N
 *
 * NOTE: The prompt intentionally avoids concrete action examples to maintain
 * the non-injective property (see tests). The format is shown with placeholders.
 */
export const INTENTION_CHECK_TEMPLATE = `
You are observing the current situation. Based ONLY on the facts provided:

{situationFrame}

Instructions:
- If you have no current intention, simply acknowledge the situation. This is the expected default.
- If you genuinely have an intention given these facts (not suggested by this prompt), express it using:
  [GOAL: <action> <target> <amount>]
  where action is a verb, target is what you intend to act on, and amount is optional.

Important:
- Do NOT propose options or candidate actions. Only state an intention you already have.
- Observation without action is valid and expected in most situations.
- Never fabricate facts not present in the situation frame.
`.trim();

/**
 * Minimal variant for lower token usage.
 */
export const INTENTION_CHECK_MINIMAL = `
Situation: {situationFrame}

Observe or, if you have a genuine intention, express: [GOAL: <action> <target>]
`.trim();

/**
 * Reflective variant for introspection-focused contexts.
 */
export const INTENTION_CHECK_REFLECTIVE = `
You are taking a moment to observe your current situation.

{situationFrame}

Reflect on what you notice. If you have a clear intention that arises naturally from these facts, you may express it as:
[GOAL: <action> <target> <amount>]

Most often, simple observation is sufficient. There is no requirement to act.
`.trim();

// ============================================================================
// Prompt Variants
// ============================================================================

/**
 * Available prompt variants.
 */
export const INTENTION_CHECK_VARIANTS = {
  standard: INTENTION_CHECK_TEMPLATE,
  minimal: INTENTION_CHECK_MINIMAL,
  reflective: INTENTION_CHECK_REFLECTIVE,
} as const;

export type IntentionCheckVariant = keyof typeof INTENTION_CHECK_VARIANTS;

// ============================================================================
// Prompt Rendering
// ============================================================================

/**
 * Render an intention check prompt with the given situation frame.
 *
 * @param situationFrame - The rendered situation frame text
 * @param variant - Prompt variant to use (default: 'standard')
 * @returns Rendered prompt string
 */
export function renderIntentionCheckPrompt(
  situationFrame: string,
  variant: IntentionCheckVariant = 'standard'
): string {
  const template = INTENTION_CHECK_VARIANTS[variant];
  return template.replace('{situationFrame}', situationFrame);
}

/**
 * Get all available prompt variants.
 */
export function getIntentionCheckVariants(): IntentionCheckVariant[] {
  return Object.keys(INTENTION_CHECK_VARIANTS) as IntentionCheckVariant[];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that a prompt template doesn't contain goal suggestions.
 *
 * This is a development-time check to ensure prompt templates
 * maintain the non-injective property.
 *
 * @param template - Prompt template to validate
 * @returns True if the template is valid (no goal suggestions)
 */
export function validateNonInjectivePrompt(template: string): boolean {
  // Patterns that would indicate goal suggestion (forbidden)
  const forbiddenPatterns = [
    /you should/i,
    /you could/i,
    /consider (doing|gathering|crafting|building)/i,
    /might want to/i,
    /try to/i,
    /why not/i,
    /perhaps you/i,
    /maybe you/i,
    /it would be good to/i,
    /a good idea would be/i,
    /options include/i,
    /you can choose to/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(template)) {
      return false;
    }
  }

  return true;
}

// Validate built-in templates at module load time
for (const [variant, template] of Object.entries(INTENTION_CHECK_VARIANTS)) {
  if (!validateNonInjectivePrompt(template)) {
    console.error(`[IntentionCheckPrompt] WARNING: ${variant} template may contain goal suggestions`);
  }
}
