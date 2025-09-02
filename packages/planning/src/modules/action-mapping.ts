import { logOptimizer } from './logging';

export function extractItemFromTask(task: any): string {
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();
  const text = `${title} ${description}`;

  if (text.includes('pickaxe')) return 'wooden_pickaxe';
  if (text.includes('axe')) return 'wooden_axe';
  if (text.includes('sword')) return 'wooden_sword';
  if (text.includes('shovel')) return 'wooden_shovel';
  if (text.includes('hoe')) return 'wooden_hoe';
  if (text.includes('stick')) return 'stick';
  if (text.includes('plank')) return 'oak_planks';
  if (text.includes('crafting table')) return 'crafting_table';
  if (text.includes('torch')) return 'torch';
  if (text.includes('door')) return 'oak_door';
  if (text.includes('fence')) return 'oak_fence';
  if (text.includes('chest')) return 'chest';
  if (text.includes('furnace')) return 'furnace';
  if (text.includes('tool')) return 'wooden_pickaxe';
  if (text.includes('item')) return 'oak_planks';
  return 'oak_planks';
}

export function mapTaskTypeToMinecraftAction(task: any) {
  switch (task.type) {
    case 'social': {
      const message =
        task.parameters?.message ||
        (task.description || task.title || 'Hello').slice(0, 256);
      return {
        type: 'chat',
        parameters: { message },
        timeout: 5000,
      };
    }
    case 'general': {
      const title = (task.title || '').toLowerCase();
      const desc = (task.description || '').toLowerCase();
      const text = `${title} ${desc}`;
      // Heuristic mapping so we don't stall on unknown types
      if (text.includes('craft') || text.includes('plank')) {
        return {
          type: 'craft',
          parameters: {
            item: extractItemFromTask(task) || 'oak_planks',
            quantity: 1,
          },
          timeout: 15000,
        };
      }
      if (
        text.includes('wood') ||
        text.includes('log') ||
        text.includes('tree') ||
        text.includes('gather') ||
        text.includes('collect')
      ) {
        return {
          type: 'gather',
          parameters: { resource: 'wood', amount: 3, target: 'tree' },
          timeout: 15000,
        };
      }
      // Default to exploration to emulate a flood-fill reposition
      return {
        type: 'navigate',
        parameters: {
          target: task.parameters?.target || 'exploration_target',
          distance: task.parameters?.distance || 10,
        },
        timeout: 15000,
      };
    }
    case 'movement':
      return {
        type: 'move_to',
        parameters: {
          pos: task.parameters?.pos || task.parameters?.target || undefined,
          // Fallback small step if no target provided
          distance: task.parameters?.distance || 1,
        },
        timeout: 15000,
      };
    case 'gathering':
      return {
        type: 'gather',
        parameters: {
          resource: task.title.toLowerCase().includes('wood')
            ? 'wood'
            : 'resource',
          amount: 3,
          target: task.title.toLowerCase().includes('wood')
            ? 'tree'
            : 'resource',
        },
        timeout: 15000,
      };
    case 'gather':
      return {
        type: 'gather',
        parameters: {
          resource:
            task.parameters?.resource ||
            (task.title.toLowerCase().includes('wood') ? 'wood' : 'resource'),
          amount: task.parameters?.amount || 3,
          target: task.parameters?.target || 'tree',
        },
        timeout: 15000,
      };
    case 'crafting':
      return {
        type: 'craft',
        parameters: { item: extractItemFromTask(task), quantity: 1 },
        timeout: 15000,
      };
    case 'mining':
      return {
        type: 'mine_block',
        parameters: {
          blockType: task.title.toLowerCase().includes('iron')
            ? 'iron_ore'
            : 'stone',
          position: { x: 0, y: 0, z: 0 },
        },
        timeout: 15000,
      };
    case 'exploration':
    case 'explore':
      return {
        type: 'navigate',
        parameters: {
          target: task.parameters?.target || 'exploration_target',
          distance: task.parameters?.distance || 10,
        },
        timeout: 15000,
      };
    case 'placement':
      return {
        type: 'place_block',
        parameters: {
          block_type: task.parameters?.itemType || 'crafting_table',
          count: task.parameters?.quantity || 1,
          placement: 'around_player',
        },
        timeout: 15000,
      };
    case 'building':
      return {
        type: 'place_block',
        parameters: {
          block_type: extractItemFromTask(task),
          count: task.parameters?.quantity || 1,
          placement: 'around_player',
        },
        timeout: 15000,
      };
    default:
      logOptimizer.warn(
        `⚠️ No action mapping for task type: ${task.type}`,
        `no-action-mapping-${task.type}`
      );
      return null;
  }
}

export function mapBTActionToMinecraft(
  tool: string,
  args: Record<string, any>
) {
  // Strip "minecraft." prefix if present to normalize the action name
  const normalizedTool = tool.replace(/^minecraft\./, '');

  const debugInfo = { originalAction: tool, normalizedTool, args: args };

  switch (normalizedTool) {
    case 'scan_for_trees':
      return {
        type: 'scan_environment',
        parameters: {
          radius: args.radius || 10,
          targetBlock: args.blockType || 'oak_log',
          action: 'find_nearest_block',
        },
      };
    case 'pathfind':
      return {
        type: 'move_forward',
        parameters: { distance: args.distance || 1 },
      };
    case 'scan_tree_structure':
      return { type: 'wait', parameters: { duration: 1000 } };
    case 'dig_blocks':
    case 'dig_block':
      return {
        type: 'dig_block',
        parameters: {
          pos: args.position || args.pos || 'current',
          tool: args.tool || 'axe',
          blockType: args.blockType,
        },
      };
    case 'collect_items':
      return { type: 'pickup_item', parameters: { radius: args.radius || 3 } };
    case 'clear_3x3_area':
      return {
        type: 'mine_block',
        parameters: {
          position: args.position || 'current',
          tool: args.tool || 'pickaxe',
          area: { x: 3, y: 2, z: 3 },
        },
        debug: debugInfo,
      };
    case 'place_blocks': {
      const pattern = args.pattern || 'single';
      const blockType = args.block || 'stone';
      if (pattern === '3x3_floor') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_floor',
          },
        };
      } else if (pattern === '3x3_walls_2_high') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 12,
            placement: 'pattern_3x3_walls',
          },
        };
      } else if (pattern === '3x3_roof') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_roof',
          },
        };
      } else {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 1,
            placement: 'around_player',
          },
        };
      }
    }
    case 'place_block':
      return {
        type: 'place_block',
        parameters: {
          block_type: args.blockType || args.block_type || 'stone',
          count: args.count || 1,
          placement: args.placement || 'around_player',
          position: args.position || args.pos,
        },
      };
    case 'move_to':
      return {
        type: 'move_to',
        parameters: {
          target: args.target || args.pos || 'exploration_target',
          distance: args.distance || 10,
        },
      };
    case 'craft_recipe':
      return {
        type: 'craft',
        parameters: {
          item: args.recipe || args.item,
          quantity: args.qty || args.quantity || 1,
        },
      };
    case 'place_door':
      return {
        type: 'place_block',
        parameters: {
          block_type: 'oak_door',
          count: 1,
          placement: 'specific_position',
          position: args.position || 'front_center',
        },
      };
    case 'place_torch':
      return {
        type: 'place_block',
        parameters: {
          block_type: 'torch',
          count: 1,
          placement:
            args.position === 'center_wall'
              ? 'specific_position'
              : 'around_player',
          position: args.position || 'around_player',
        },
      };
    case 'wait':
      return { type: 'wait', parameters: { duration: args.duration || 2000 } };
    default:
      return { type: tool, parameters: args, debug: debugInfo };
  }
}
