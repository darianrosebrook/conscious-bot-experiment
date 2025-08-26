/**
 * BT-DSL Schema - Small-surface DSL for Behavior Tree composition
 *
 * Defines a constrained DSL for composing leaves into behavior trees,
 * with only essential node types and named sensor predicates.
 *
 * @author @darianrosebrook
 */
import { JSONSchema7 } from './leaf-contracts';
/**
 * Allowed node types in the BT-DSL
 * Only essential types allowed; no user-defined conditionals/functions
 */
export type NodeType = 'Sequence' | 'Selector' | 'Repeat.Until' | 'Decorator.Timeout' | 'Decorator.FailOnTrue' | 'Leaf';
/**
 * Base interface for all BT-DSL nodes
 */
export interface BTNode {
    type: NodeType;
    name?: string;
    description?: string;
}
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
    maxIterations?: number;
}
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
/**
 * Leaf node - executes a registered leaf
 */
export interface LeafNode extends BTNode {
    type: 'Leaf';
    leafName: string;
    leafVersion?: string;
    args?: Record<string, any>;
}
/**
 * Named sensor predicates that the runner knows
 * No inline JS allowed; must use predefined predicates
 */
export type NamedSensorPredicate = 'distance_to' | 'hostiles_present' | 'light_level_safe' | 'inventory_has_item' | 'position_reached' | 'time_elapsed' | 'health_low' | 'hunger_low' | 'weather_bad' | 'biome_safe';
/**
 * Sensor predicate with parameters
 */
export interface SensorPredicate {
    name: NamedSensorPredicate;
    parameters?: Record<string, any>;
}
/**
 * JSON Schema for BT-DSL validation
 */
export declare const BT_DSL_SCHEMA: JSONSchema7;
/**
 * Type guard for BTNode
 */
export declare function isBTNode(node: any): node is BTNode;
/**
 * Type guard for SequenceNode
 */
export declare function isSequenceNode(node: any): node is SequenceNode;
/**
 * Type guard for SelectorNode
 */
export declare function isSelectorNode(node: any): node is SelectorNode;
/**
 * Type guard for RepeatUntilNode
 */
export declare function isRepeatUntilNode(node: any): node is RepeatUntilNode;
/**
 * Type guard for TimeoutDecoratorNode
 */
export declare function isTimeoutDecoratorNode(node: any): node is TimeoutDecoratorNode;
/**
 * Type guard for FailOnTrueDecoratorNode
 */
export declare function isFailOnTrueDecoratorNode(node: any): node is FailOnTrueDecoratorNode;
/**
 * Type guard for LeafNode
 */
export declare function isLeafNode(node: any): node is LeafNode;
/**
 * Type guard for SensorPredicate
 */
export declare function isSensorPredicate(predicate: any): predicate is SensorPredicate;
/**
 * Get all leaf names used in a BT-DSL tree
 */
export declare function getLeafNames(node: BTNode): string[];
/**
 * Get all sensor predicates used in a BT-DSL tree
 */
export declare function getSensorPredicates(node: BTNode): SensorPredicate[];
/**
 * Validate that a BT-DSL tree only uses allowed node types
 */
export declare function validateBTDSL(node: BTNode): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=bt-dsl-schema.d.ts.map