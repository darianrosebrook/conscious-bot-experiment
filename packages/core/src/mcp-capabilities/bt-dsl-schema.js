"use strict";
/**
 * BT-DSL Schema - Small-surface DSL for Behavior Tree composition
 *
 * Defines a constrained DSL for composing leaves into behavior trees,
 * with only essential node types and named sensor predicates.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BT_DSL_SCHEMA = void 0;
exports.isBTNode = isBTNode;
exports.isSequenceNode = isSequenceNode;
exports.isSelectorNode = isSelectorNode;
exports.isRepeatUntilNode = isRepeatUntilNode;
exports.isTimeoutDecoratorNode = isTimeoutDecoratorNode;
exports.isFailOnTrueDecoratorNode = isFailOnTrueDecoratorNode;
exports.isLeafNode = isLeafNode;
exports.isSensorPredicate = isSensorPredicate;
exports.getLeafNames = getLeafNames;
exports.getSensorPredicates = getSensorPredicates;
exports.validateBTDSL = validateBTDSL;
// ============================================================================
// BT-DSL Schema (JSON Schema 7)
// ============================================================================
/**
 * JSON Schema for BT-DSL validation
 */
exports.BT_DSL_SCHEMA = {
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
function isBTNode(node) {
    return node && typeof node.type === 'string';
}
/**
 * Type guard for SequenceNode
 */
function isSequenceNode(node) {
    return node?.type === 'Sequence' && Array.isArray(node.children);
}
/**
 * Type guard for SelectorNode
 */
function isSelectorNode(node) {
    return node?.type === 'Selector' && Array.isArray(node.children);
}
/**
 * Type guard for RepeatUntilNode
 */
function isRepeatUntilNode(node) {
    return node?.type === 'Repeat.Until' && node.child && node.condition;
}
/**
 * Type guard for TimeoutDecoratorNode
 */
function isTimeoutDecoratorNode(node) {
    return (node?.type === 'Decorator.Timeout' &&
        node.child &&
        typeof node.timeoutMs === 'number');
}
/**
 * Type guard for FailOnTrueDecoratorNode
 */
function isFailOnTrueDecoratorNode(node) {
    return node?.type === 'Decorator.FailOnTrue' && node.child && node.condition;
}
/**
 * Type guard for LeafNode
 */
function isLeafNode(node) {
    return node?.type === 'Leaf' && typeof node.leafName === 'string';
}
/**
 * Type guard for SensorPredicate
 */
function isSensorPredicate(predicate) {
    return predicate && typeof predicate.name === 'string';
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Get all leaf names used in a BT-DSL tree
 */
function getLeafNames(node) {
    const names = [];
    if (isLeafNode(node)) {
        names.push(node.leafName);
    }
    else if (isSequenceNode(node) || isSelectorNode(node)) {
        node.children.forEach((child) => names.push(...getLeafNames(child)));
    }
    else if (isRepeatUntilNode(node)) {
        names.push(...getLeafNames(node.child));
    }
    else if (isTimeoutDecoratorNode(node) || isFailOnTrueDecoratorNode(node)) {
        names.push(...getLeafNames(node.child));
    }
    return names;
}
/**
 * Get all sensor predicates used in a BT-DSL tree
 */
function getSensorPredicates(node) {
    const predicates = [];
    if (isRepeatUntilNode(node)) {
        predicates.push(node.condition);
        predicates.push(...getSensorPredicates(node.child));
    }
    else if (isFailOnTrueDecoratorNode(node)) {
        predicates.push(node.condition);
        predicates.push(...getSensorPredicates(node.child));
    }
    else if (isSequenceNode(node) || isSelectorNode(node)) {
        node.children.forEach((child) => predicates.push(...getSensorPredicates(child)));
    }
    else if (isTimeoutDecoratorNode(node)) {
        predicates.push(...getSensorPredicates(node.child));
    }
    return predicates;
}
/**
 * Validate that a BT-DSL tree only uses allowed node types
 */
function validateBTDSL(node) {
    const errors = [];
    function validateNode(n, path = 'root') {
        if (!isBTNode(n)) {
            errors.push(`${path}: Invalid node structure`);
            return;
        }
        // Check for allowed node types
        const allowedTypes = [
            'Sequence',
            'Selector',
            'Repeat.Until',
            'Decorator.Timeout',
            'Decorator.FailOnTrue',
            'Leaf',
        ];
        if (!allowedTypes.includes(n.type)) {
            errors.push(`${path}: Disallowed node type '${n.type}'`);
            return;
        }
        // Validate specific node types
        if (isSequenceNode(n) || isSelectorNode(n)) {
            if (!n.children || n.children.length === 0) {
                errors.push(`${path}: ${n.type} must have at least one child`);
            }
            else {
                n.children.forEach((child, index) => validateNode(child, `${path}.children[${index}]`));
            }
        }
        else if (isRepeatUntilNode(n)) {
            validateNode(n.child, `${path}.child`);
            if (!isSensorPredicate(n.condition)) {
                errors.push(`${path}.condition: Invalid sensor predicate`);
            }
        }
        else if (isTimeoutDecoratorNode(n)) {
            validateNode(n.child, `${path}.child`);
            if (n.timeoutMs <= 0) {
                errors.push(`${path}.timeoutMs: Must be positive`);
            }
        }
        else if (isFailOnTrueDecoratorNode(n)) {
            validateNode(n.child, `${path}.child`);
            if (!isSensorPredicate(n.condition)) {
                errors.push(`${path}.condition: Invalid sensor predicate`);
            }
        }
        else if (isLeafNode(n)) {
            if (!n.leafName || n.leafName.trim() === '') {
                errors.push(`${path}.leafName: Must be non-empty`);
            }
        }
    }
    validateNode(node);
    return { valid: errors.length === 0, errors };
}
//# sourceMappingURL=bt-dsl-schema.js.map