/**
 * BT-DSL Schema - Small-surface DSL for Behavior Tree composition
 *
 * Defines a constrained DSL for composing leaves into behavior trees,
 * with only essential node types and named sensor predicates.
 *
 * @author @darianrosebrook
 */

import { JSONSchema7 } from './leaf-contracts';

// ============================================================================
// Core Node Types (S2.1 - Keep DSL deliberately small)
// ============================================================================

/**
 * Allowed node types in the BT-DSL
 * Only essential types allowed; no user-defined conditionals/functions
 */
export type NodeType =
  | 'Sequence'
  | 'Selector'
  | 'Repeat.Until'
  | 'Decorator.Timeout'
  | 'Decorator.FailOnTrue'
  | 'Leaf';

/**
 * Base interface for all BT-DSL nodes
 */
export interface BTNode {
  type: NodeType;
  name?: string;
  description?: string;
}

// ============================================================================
// Control Flow Nodes
// ============================================================================

/**
 * Sequence node - executes all children in order, fails on first failure
 */
export interface SequenceNode extends BTNode {
  type: 'Sequence';
  children: BTNode[];
}

/**
 * Selector node - executes children until one succeeds
 */
export interface SelectorNode extends BTNode {
  type: 'Selector';
  children: BTNode[];
}

/**
 * Repeat node - repeats child until condition is met
 */
export interface RepeatUntilNode extends BTNode {
  type: 'Repeat.Until';
  child: BTNode;
  condition: SensorPredicate;
  maxIterations?: number; // Prevent infinite loops
}

// ============================================================================
// Decorator Nodes
// ============================================================================

/**
 * Timeout decorator - adds timeout to child execution
 */
export interface TimeoutDecoratorNode extends BTNode {
  type: 'Decorator.Timeout';
  child: BTNode;
  timeoutMs: number;
}

/**
 * FailOnTrue decorator - fails if condition is true
 */
export interface FailOnTrueDecoratorNode extends BTNode {
  type: 'Decorator.FailOnTrue';
  child: BTNode;
  condition: SensorPredicate;
}

// ============================================================================
// Leaf Node
// ============================================================================

/**
 * Leaf node - executes a registered leaf
 */
export interface LeafNode extends BTNode {
  type: 'Leaf';
  leafName: string;
  leafVersion?: string;
  args?: Record<string, any>;
}

// ============================================================================
// Named Sensor Predicates (S2.1 - No inline logic)
// ============================================================================

/**
 * Named sensor predicates that the runner knows
 * No inline JS allowed; must use predefined predicates
 */
export type NamedSensorPredicate =
  | 'distance_to'
  | 'hostiles_present'
  | 'light_level_safe'
  | 'inventory_has_item'
  | 'position_reached'
  | 'time_elapsed'
  | 'health_low'
  | 'hunger_low'
  | 'weather_bad'
  | 'biome_safe';

/**
 * Sensor predicate with parameters
 */
export interface SensorPredicate {
  name: NamedSensorPredicate;
  parameters?: Record<string, any>;
}

// ============================================================================
// BT-DSL Schema (JSON Schema 7)
// ============================================================================

/**
 * JSON Schema for BT-DSL validation
 */
export const BT_DSL_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    description: { type: 'string' },
    root: { $ref: '#/definitions/BTNode' },
    metadata: {
      type: 'object',
      properties: {
        author: { type: 'string' },
        createdAt: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        permissions: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['name', 'version', 'root'],
  definitions: {
    BTNode: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['type'],
      oneOf: [
        { $ref: '#/definitions/SequenceNode' },
        { $ref: '#/definitions/SelectorNode' },
        { $ref: '#/definitions/RepeatUntilNode' },
        { $ref: '#/definitions/TimeoutDecoratorNode' },
        { $ref: '#/definitions/FailOnTrueDecoratorNode' },
        { $ref: '#/definitions/LeafNode' },
      ],
    },
    SequenceNode: {
      type: 'object',
      properties: {
        type: { const: 'Sequence' },
        name: { type: 'string' },
        description: { type: 'string' },
        children: {
          type: 'array',
          items: { $ref: '#/definitions/BTNode' },
          minItems: 1,
        },
      },
      required: ['type', 'children'],
    },
    SelectorNode: {
      type: 'object',
      properties: {
        type: { const: 'Selector' },
        name: { type: 'string' },
        description: { type: 'string' },
        children: {
          type: 'array',
          items: { $ref: '#/definitions/BTNode' },
          minItems: 1,
        },
      },
      required: ['type', 'children'],
    },
    RepeatUntilNode: {
      type: 'object',
      properties: {
        type: { const: 'Repeat.Until' },
        name: { type: 'string' },
        description: { type: 'string' },
        child: { $ref: '#/definitions/BTNode' },
        condition: { $ref: '#/definitions/SensorPredicate' },
        maxIterations: { type: 'number', minimum: 1, maximum: 1000 },
      },
      required: ['type', 'child', 'condition'],
    },
    TimeoutDecoratorNode: {
      type: 'object',
      properties: {
        type: { const: 'Decorator.Timeout' },
        name: { type: 'string' },
        description: { type: 'string' },
        child: { $ref: '#/definitions/BTNode' },
        timeoutMs: { type: 'number', minimum: 1, maximum: 300000 },
      },
      required: ['type', 'child', 'timeoutMs'],
    },
    FailOnTrueDecoratorNode: {
      type: 'object',
      properties: {
        type: { const: 'Decorator.FailOnTrue' },
        name: { type: 'string' },
        description: { type: 'string' },
        child: { $ref: '#/definitions/BTNode' },
        condition: { $ref: '#/definitions/SensorPredicate' },
      },
      required: ['type', 'child', 'condition'],
    },
    LeafNode: {
      type: 'object',
      properties: {
        type: { const: 'Leaf' },
        name: { type: 'string' },
        description: { type: 'string' },
        leafName: { type: 'string' },
        leafVersion: { type: 'string' },
        args: { type: 'object' },
      },
      required: ['type', 'leafName'],
    },
    SensorPredicate: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: [
            'distance_to',
            'hostiles_present',
            'light_level_safe',
            'inventory_has_item',
            'position_reached',
            'time_elapsed',
            'health_low',
            'hunger_low',
            'weather_bad',
            'biome_safe',
          ],
        },
        parameters: { type: 'object' },
      },
      required: ['name'],
    },
  },
};

// ============================================================================
// Type Guards and Validation
// ============================================================================

/**
 * Type guard for BTNode
 */
export function isBTNode(node: any): node is BTNode {
  return node && typeof node.type === 'string';
}

/**
 * Type guard for SequenceNode
 */
export function isSequenceNode(node: any): node is SequenceNode {
  return node?.type === 'Sequence' && Array.isArray(node.children);
}

/**
 * Type guard for SelectorNode
 */
export function isSelectorNode(node: any): node is SelectorNode {
  return node?.type === 'Selector' && Array.isArray(node.children);
}

/**
 * Type guard for RepeatUntilNode
 */
export function isRepeatUntilNode(node: any): node is RepeatUntilNode {
  return node?.type === 'Repeat.Until' && node.child && node.condition;
}

/**
 * Type guard for TimeoutDecoratorNode
 */
export function isTimeoutDecoratorNode(
  node: any
): node is TimeoutDecoratorNode {
  return (
    node?.type === 'Decorator.Timeout' &&
    node.child &&
    typeof node.timeoutMs === 'number'
  );
}

/**
 * Type guard for FailOnTrueDecoratorNode
 */
export function isFailOnTrueDecoratorNode(
  node: any
): node is FailOnTrueDecoratorNode {
  return node?.type === 'Decorator.FailOnTrue' && node.child && node.condition;
}

/**
 * Type guard for LeafNode
 */
export function isLeafNode(node: any): node is LeafNode {
  return node?.type === 'Leaf' && typeof node.leafName === 'string';
}

/**
 * Type guard for SensorPredicate
 */
export function isSensorPredicate(
  predicate: any
): predicate is SensorPredicate {
  return predicate && typeof predicate.name === 'string';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all leaf names used in a BT-DSL tree
 */
export function getLeafNames(node: BTNode): string[] {
  const names: string[] = [];

  if (isLeafNode(node)) {
    names.push(node.leafName);
  } else if (isSequenceNode(node) || isSelectorNode(node)) {
    node.children.forEach((child) => names.push(...getLeafNames(child)));
  } else if (isRepeatUntilNode(node)) {
    names.push(...getLeafNames(node.child));
  } else if (isTimeoutDecoratorNode(node) || isFailOnTrueDecoratorNode(node)) {
    names.push(...getLeafNames(node.child));
  }

  return names;
}

/**
 * Get all sensor predicates used in a BT-DSL tree
 */
export function getSensorPredicates(node: BTNode): SensorPredicate[] {
  const predicates: SensorPredicate[] = [];

  if (isRepeatUntilNode(node)) {
    predicates.push(node.condition);
    predicates.push(...getSensorPredicates(node.child));
  } else if (isFailOnTrueDecoratorNode(node)) {
    predicates.push(node.condition);
    predicates.push(...getSensorPredicates(node.child));
  } else if (isSequenceNode(node) || isSelectorNode(node)) {
    node.children.forEach((child) =>
      predicates.push(...getSensorPredicates(child))
    );
  } else if (isTimeoutDecoratorNode(node)) {
    predicates.push(...getSensorPredicates(node.child));
  }

  return predicates;
}

/**
 * Validate that a BT-DSL tree only uses allowed node types
 */
export function validateBTDSL(node: BTNode): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  function validateNode(n: BTNode, path: string = 'root') {
    if (!isBTNode(n)) {
      errors.push(`${path}: Invalid node structure`);
      return;
    }

    // Check for allowed node types
    const allowedTypes: NodeType[] = [
      'Sequence',
      'Selector',
      'Repeat.Until',
      'Decorator.Timeout',
      'Decorator.FailOnTrue',
      'Leaf',
    ];
    if (!allowedTypes.includes(n.type as NodeType)) {
      errors.push(`${path}: Disallowed node type '${n.type}'`);
      return;
    }

    // Validate specific node types
    if (isSequenceNode(n) || isSelectorNode(n)) {
      if (!n.children || n.children.length === 0) {
        errors.push(`${path}: ${n.type} must have at least one child`);
      } else {
        n.children.forEach((child, index) =>
          validateNode(child, `${path}.children[${index}]`)
        );
      }
    } else if (isRepeatUntilNode(n)) {
      validateNode(n.child, `${path}.child`);
      if (!isSensorPredicate(n.condition)) {
        errors.push(`${path}.condition: Invalid sensor predicate`);
      }
    } else if (isTimeoutDecoratorNode(n)) {
      validateNode(n.child, `${path}.child`);
      if (n.timeoutMs <= 0) {
        errors.push(`${path}.timeoutMs: Must be positive`);
      }
    } else if (isFailOnTrueDecoratorNode(n)) {
      validateNode(n.child, `${path}.child`);
      if (!isSensorPredicate(n.condition)) {
        errors.push(`${path}.condition: Invalid sensor predicate`);
      }
    } else if (isLeafNode(n)) {
      if (!n.leafName || n.leafName.trim() === '') {
        errors.push(`${path}.leafName: Must be non-empty`);
      }
    }
  }

  validateNode(node);
  return { valid: errors.length === 0, errors };
}
