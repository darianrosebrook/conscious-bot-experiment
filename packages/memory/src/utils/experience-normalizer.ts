import { ExperienceType } from '../types';

/**
 * Normalize incoming experience type strings to a supported ExperienceType.
 * Preserves the original value via return note so callers can record it.
 */
export function normalizeExperienceType(input: unknown): {
  type: ExperienceType;
  note?: string;
} {
  if (typeof input === 'string') {
    const raw = input;
    const value = raw.toLowerCase().trim();

    // Direct match to enum values
    if ((Object.values(ExperienceType) as string[]).includes(value)) {
      return { type: value as ExperienceType };
    }

    // Common synonyms → map to closest supported category
    const synonymMap: Record<string, ExperienceType> = {
      reflection: ExperienceType.LEARNING,
      self_reflection: ExperienceType.LEARNING,
      task_reflection: (ExperienceType as any).TASK_REFLECTION ?? ExperienceType.LEARNING,
      retrospective: ExperienceType.LEARNING,
      postmortem: ExperienceType.LEARNING,
      review: ExperienceType.LEARNING,
      analysis: ExperienceType.LEARNING,
      debug: ExperienceType.LEARNING,
      chatting: ExperienceType.SOCIAL_INTERACTION,
      conversation: ExperienceType.SOCIAL_INTERACTION,
      explore: ExperienceType.EXPLORATION,
      discovery: ExperienceType.EXPLORATION,
      craft: ExperienceType.CREATIVE_ACTIVITY,
      build: ExperienceType.CREATIVE_ACTIVITY,
      create: ExperienceType.CREATIVE_ACTIVITY,
      train: ExperienceType.SKILL_IMPROVEMENT,
      practice: ExperienceType.SKILL_IMPROVEMENT,
      threat: ExperienceType.DANGER_ENCOUNTER,
      danger: ExperienceType.DANGER_ENCOUNTER,
    };

    if (synonymMap[value]) {
      return { type: synonymMap[value], note: `normalized from '${raw}'` };
    }

    // Heuristics on substrings
    if (value.includes('reflect')) {
      return {
        type: ((ExperienceType as any).TASK_REFLECTION as ExperienceType) ?? ExperienceType.LEARNING,
        note: `heuristic-normalized from '${raw}'`,
      };
    }
    if (value.includes('goal') && (value.includes('fail') || value.includes('miss'))) {
      return { type: ExperienceType.GOAL_FAILURE, note: `heuristic-normalized from '${raw}'` };
    }
    if (value.includes('goal') && (value.includes('achiev') || value.includes('complet'))) {
      return { type: ExperienceType.GOAL_ACHIEVEMENT, note: `heuristic-normalized from '${raw}'` };
    }
    if (value.includes('social') || value.includes('chat') || value.includes('talk')) {
      return { type: ExperienceType.SOCIAL_INTERACTION, note: `heuristic-normalized from '${raw}'` };
    }
    if (value.includes('explor') || value.includes('discover')) {
      return { type: ExperienceType.EXPLORATION, note: `heuristic-normalized from '${raw}'` };
    }
    if (value.includes('skill') || value.includes('train') || value.includes('practice')) {
      return { type: ExperienceType.SKILL_IMPROVEMENT, note: `heuristic-normalized from '${raw}'` };
    }
    if (value.includes('craft') || value.includes('build') || value.includes('create')) {
      return { type: ExperienceType.CREATIVE_ACTIVITY, note: `heuristic-normalized from '${raw}'` };
    }
    if (value.includes('danger') || value.includes('threat')) {
      return { type: ExperienceType.DANGER_ENCOUNTER, note: `heuristic-normalized from '${raw}'` };
    }

    // Fallback
    return { type: ExperienceType.ROUTINE_ACTION, note: `defaulted from '${raw}'` };
  }

  // Non-string inputs default to routine
  return { type: ExperienceType.ROUTINE_ACTION, note: 'defaulted from non-string type' };
}

