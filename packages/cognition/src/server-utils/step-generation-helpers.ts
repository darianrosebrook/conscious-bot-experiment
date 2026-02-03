/**
 * Step generation helpers: LLM-based task step generation with
 * intelligent fallback by task type.
 */

import { ReActArbiter } from '../react-arbiter/ReActArbiter';

export async function generateTaskSteps(
  reactArbiter: ReActArbiter,
  task: any,
  _context?: any
): Promise<any[]> {
  try {
    // Use the ReAct Arbiter's new method for step generation
    const responseText = await reactArbiter.generateTaskSteps(task);

    // Parse the numbered list response
    const steps = parseNumberedListResponse(responseText, task);

    // If parsing failed, use intelligent fallback based on task type
    if (steps.length === 0) {
      return generateIntelligentFallbackSteps(task);
    }

    return steps;
  } catch (error) {
    console.warn('LLM step generation failed, using fallback:', error);
    return generateIntelligentFallbackSteps(task);
  }
}

export function parseNumberedListResponse(text: string, _task: any): any[] {
  const steps: any[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Look for numbered list items
    const match = trimmedLine.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const stepContent = match[2].trim();

      // Estimate duration based on step content
      let estimatedDuration = 3000; // Default 3 seconds
      if (
        stepContent.toLowerCase().includes('move') ||
        stepContent.toLowerCase().includes('navigate')
      ) {
        estimatedDuration = 5000;
      } else if (
        stepContent.toLowerCase().includes('gather') ||
        stepContent.toLowerCase().includes('collect')
      ) {
        estimatedDuration = 4000;
      } else if (
        stepContent.toLowerCase().includes('craft') ||
        stepContent.toLowerCase().includes('build')
      ) {
        estimatedDuration = 6000;
      } else if (
        stepContent.toLowerCase().includes('analyze') ||
        stepContent.toLowerCase().includes('plan')
      ) {
        estimatedDuration = 2000;
      }

      steps.push({
        label: stepContent,
        estimatedDuration,
      });
    }
  }

  return steps;
}

export function generateIntelligentFallbackSteps(task: any): any[] {
  const taskType = task.type || 'general';
  const title = task.title.toLowerCase();

  switch (taskType) {
    case 'crafting':
      if (title.includes('pickaxe')) {
        return [
          { label: 'Check if crafting table is available', estimatedDuration: 2000 },
          { label: 'Place crafting table if needed', estimatedDuration: 3000 },
          { label: 'Gather required materials (sticks, planks)', estimatedDuration: 4000 },
          { label: 'Craft wooden pickaxe at crafting table', estimatedDuration: 5000 },
          { label: 'Verify pickaxe was created successfully', estimatedDuration: 2000 },
        ];
      } else if (title.includes('crafting table')) {
        return [
          { label: 'Gather oak logs from nearby trees', estimatedDuration: 4000 },
          { label: 'Convert logs to oak planks', estimatedDuration: 3000 },
          { label: 'Craft crafting table from planks', estimatedDuration: 3000 },
          { label: 'Place crafting table in suitable location', estimatedDuration: 3000 },
        ];
      }
      return [
        { label: 'Gather required materials', estimatedDuration: 4000 },
        { label: 'Set up crafting area', estimatedDuration: 3000 },
        { label: 'Craft the requested item', estimatedDuration: 5000 },
        { label: 'Verify crafting success', estimatedDuration: 2000 },
      ];

    case 'gathering':
      if (title.includes('wood') || title.includes('log')) {
        return [
          { label: 'Locate nearby trees', estimatedDuration: 3000 },
          { label: 'Move to tree location', estimatedDuration: 4000 },
          { label: 'Break tree blocks to collect logs', estimatedDuration: 5000 },
          { label: 'Collect dropped items', estimatedDuration: 2000 },
        ];
      }
      return [
        { label: 'Search for target resources', estimatedDuration: 3000 },
        { label: 'Navigate to resource location', estimatedDuration: 4000 },
        { label: 'Extract or collect resources', estimatedDuration: 5000 },
        { label: 'Verify collection success', estimatedDuration: 2000 },
      ];

    case 'mining':
      return [
        { label: 'Find suitable mining location', estimatedDuration: 3000 },
        { label: 'Ensure proper tools are available', estimatedDuration: 2000 },
        { label: 'Begin mining operation', estimatedDuration: 6000 },
        { label: 'Collect mined resources', estimatedDuration: 3000 },
      ];

    case 'building':
    case 'placement':
      return [
        { label: 'Select suitable building location', estimatedDuration: 3000 },
        { label: 'Gather required building materials', estimatedDuration: 4000 },
        { label: 'Place blocks in desired pattern', estimatedDuration: 5000 },
        { label: 'Verify structure completion', estimatedDuration: 2000 },
      ];

    case 'exploration':
      return [
        { label: 'Choose exploration direction', estimatedDuration: 2000 },
        { label: 'Navigate to new area', estimatedDuration: 5000 },
        { label: 'Survey surroundings for resources', estimatedDuration: 4000 },
        { label: 'Document findings', estimatedDuration: 2000 },
      ];

    default:
      return [
        { label: 'Analyze task requirements', estimatedDuration: 2000 },
        { label: 'Plan execution approach', estimatedDuration: 3000 },
        { label: 'Execute task', estimatedDuration: 5000 },
        { label: 'Verify completion', estimatedDuration: 2000 },
      ];
  }
}
