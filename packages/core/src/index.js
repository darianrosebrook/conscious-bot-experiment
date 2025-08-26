"use strict";
/**
 * @conscious-bot/core - Foundational signal-driven control architecture
 *
 * Exports all core components for building cognitive agents with
 * real-time constraints and signal-driven behavior.
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
exports.VERSION = exports.DEFAULT_PERFORMANCE_CONFIG = exports.DEFAULT_SIGNAL_CONFIG = exports.DEFAULT_ARBITER_CONFIG = exports.AlertingSystem = exports.DegradationManager = exports.BudgetEnforcer = exports.PerformanceTracker = exports.LeafFactory = exports.createLeafContext = exports.CapabilityRateLimiter = exports.ConstitutionalFilter = exports.CapabilityRegistry = exports.PriorityRanker = exports.AdvancedSignalProcessor = exports.GoalTemplateManager = exports.AdvancedNeedGenerator = exports.HybridHRMArbiter = exports.PerformanceMonitor = exports.SignalProcessor = exports.ReflexModule = exports.Arbiter = void 0;
// Main classes
var arbiter_1 = require("./arbiter");
Object.defineProperty(exports, "Arbiter", { enumerable: true, get: function () { return arbiter_1.Arbiter; } });
Object.defineProperty(exports, "ReflexModule", { enumerable: true, get: function () { return arbiter_1.ReflexModule; } });
var signal_processor_1 = require("./signal-processor");
Object.defineProperty(exports, "SignalProcessor", { enumerable: true, get: function () { return signal_processor_1.SignalProcessor; } });
var performance_monitor_1 = require("./performance-monitor");
Object.defineProperty(exports, "PerformanceMonitor", { enumerable: true, get: function () { return performance_monitor_1.PerformanceMonitor; } });
// Hybrid HRM Integration
var hybrid_hrm_arbiter_1 = require("./hybrid-hrm-arbiter");
Object.defineProperty(exports, "HybridHRMArbiter", { enumerable: true, get: function () { return hybrid_hrm_arbiter_1.HybridHRMArbiter; } });
// Advanced Components
var advanced_need_generator_1 = require("./advanced-need-generator");
Object.defineProperty(exports, "AdvancedNeedGenerator", { enumerable: true, get: function () { return advanced_need_generator_1.AdvancedNeedGenerator; } });
var goal_template_manager_1 = require("./goal-template-manager");
Object.defineProperty(exports, "GoalTemplateManager", { enumerable: true, get: function () { return goal_template_manager_1.GoalTemplateManager; } });
var advanced_signal_processor_1 = require("./advanced-signal-processor");
Object.defineProperty(exports, "AdvancedSignalProcessor", { enumerable: true, get: function () { return advanced_signal_processor_1.AdvancedSignalProcessor; } });
var priority_ranker_1 = require("./priority-ranker");
Object.defineProperty(exports, "PriorityRanker", { enumerable: true, get: function () { return priority_ranker_1.PriorityRanker; } });
// MCP Capabilities
var mcp_capabilities_1 = require("./mcp-capabilities");
Object.defineProperty(exports, "CapabilityRegistry", { enumerable: true, get: function () { return mcp_capabilities_1.CapabilityRegistry; } });
Object.defineProperty(exports, "ConstitutionalFilter", { enumerable: true, get: function () { return mcp_capabilities_1.ConstitutionalFilter; } });
var rate_limiter_1 = require("./mcp-capabilities/rate-limiter");
Object.defineProperty(exports, "CapabilityRateLimiter", { enumerable: true, get: function () { return rate_limiter_1.CapabilityRateLimiter; } });
var leaf_contracts_1 = require("./mcp-capabilities/leaf-contracts");
Object.defineProperty(exports, "createLeafContext", { enumerable: true, get: function () { return leaf_contracts_1.createLeafContext; } });
var leaf_factory_1 = require("./mcp-capabilities/leaf-factory");
Object.defineProperty(exports, "LeafFactory", { enumerable: true, get: function () { return leaf_factory_1.LeafFactory; } });
// Real-Time Performance Monitoring
var real_time_1 = require("./real-time");
Object.defineProperty(exports, "PerformanceTracker", { enumerable: true, get: function () { return real_time_1.PerformanceTracker; } });
Object.defineProperty(exports, "BudgetEnforcer", { enumerable: true, get: function () { return real_time_1.BudgetEnforcer; } });
Object.defineProperty(exports, "DegradationManager", { enumerable: true, get: function () { return real_time_1.DegradationManager; } });
Object.defineProperty(exports, "AlertingSystem", { enumerable: true, get: function () { return real_time_1.AlertingSystem; } });
// Types and interfaces
__exportStar(require("./types"), exports);
__exportStar(require("./mcp-capabilities/types"), exports);
// Configuration defaults
var arbiter_2 = require("./arbiter");
Object.defineProperty(exports, "DEFAULT_ARBITER_CONFIG", { enumerable: true, get: function () { return arbiter_2.DEFAULT_ARBITER_CONFIG; } });
var signal_processor_2 = require("./signal-processor");
Object.defineProperty(exports, "DEFAULT_SIGNAL_CONFIG", { enumerable: true, get: function () { return signal_processor_2.DEFAULT_SIGNAL_CONFIG; } });
var performance_monitor_2 = require("./performance-monitor");
Object.defineProperty(exports, "DEFAULT_PERFORMANCE_CONFIG", { enumerable: true, get: function () { return performance_monitor_2.DEFAULT_PERFORMANCE_CONFIG; } });
// Version info
exports.VERSION = '0.1.0';
//# sourceMappingURL=index.js.map