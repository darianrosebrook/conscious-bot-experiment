"use strict";
/**
 * @conscious-bot/core/mcp-capabilities - Embodied action interface
 *
 * Exports all MCP Capabilities components for safe, structured Minecraft interactions
 * with constitutional oversight and performance monitoring.
 *
 * @author @darianrosebrook
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_VERSION = exports.CAPABILITY_VALIDATORS = exports.CAPABILITY_EXECUTORS = exports.SOCIAL_CAPABILITIES = exports.INVENTORY_CAPABILITIES = exports.BLOCK_CAPABILITIES = exports.MOVEMENT_CAPABILITIES = exports.ALL_CAPABILITIES = exports.createLeafContext = exports.HybridHRMRouter = exports.ConstitutionalFilter = exports.CapabilityRegistry = void 0;
// Main classes
var capability_registry_1 = require("./capability-registry");
Object.defineProperty(exports, "CapabilityRegistry", { enumerable: true, get: function () { return capability_registry_1.CapabilityRegistry; } });
var constitutional_filter_1 = require("./constitutional-filter");
Object.defineProperty(exports, "ConstitutionalFilter", { enumerable: true, get: function () { return constitutional_filter_1.ConstitutionalFilter; } });
// Hybrid HRM Integration
var hybrid_hrm_integration_1 = require("./hybrid-hrm-integration");
Object.defineProperty(exports, "HybridHRMRouter", { enumerable: true, get: function () { return hybrid_hrm_integration_1.HybridHRMRouter; } });
// Leaf Contract System
var leaf_contracts_1 = require("./leaf-contracts");
Object.defineProperty(exports, "createLeafContext", { enumerable: true, get: function () { return leaf_contracts_1.createLeafContext; } });
// Capability specifications
var capability_specs_1 = require("./capability-specs");
Object.defineProperty(exports, "ALL_CAPABILITIES", { enumerable: true, get: function () { return capability_specs_1.ALL_CAPABILITIES; } });
Object.defineProperty(exports, "MOVEMENT_CAPABILITIES", { enumerable: true, get: function () { return capability_specs_1.MOVEMENT_CAPABILITIES; } });
Object.defineProperty(exports, "BLOCK_CAPABILITIES", { enumerable: true, get: function () { return capability_specs_1.BLOCK_CAPABILITIES; } });
Object.defineProperty(exports, "INVENTORY_CAPABILITIES", { enumerable: true, get: function () { return capability_specs_1.INVENTORY_CAPABILITIES; } });
Object.defineProperty(exports, "SOCIAL_CAPABILITIES", { enumerable: true, get: function () { return capability_specs_1.SOCIAL_CAPABILITIES; } });
Object.defineProperty(exports, "CAPABILITY_EXECUTORS", { enumerable: true, get: function () { return capability_specs_1.CAPABILITY_EXECUTORS; } });
Object.defineProperty(exports, "CAPABILITY_VALIDATORS", { enumerable: true, get: function () { return capability_specs_1.CAPABILITY_VALIDATORS; } });
// Types and interfaces
__exportStar(require("./types"), exports);
// Version info
exports.MCP_VERSION = '0.1.0';
