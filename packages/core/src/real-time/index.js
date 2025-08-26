"use strict";
/**
 * @conscious-bot/core/real-time - Real-time performance monitoring
 *
 * Exports all real-time performance monitoring components for maintaining
 * responsive, predictable behavior under strict timing constraints.
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
exports.REALTIME_VERSION = exports.AlertingSystem = exports.DegradationManager = exports.BudgetEnforcer = exports.PerformanceTracker = void 0;
// Main classes
var performance_tracker_1 = require("./performance-tracker");
Object.defineProperty(exports, "PerformanceTracker", { enumerable: true, get: function () { return performance_tracker_1.PerformanceTracker; } });
var budget_enforcer_1 = require("./budget-enforcer");
Object.defineProperty(exports, "BudgetEnforcer", { enumerable: true, get: function () { return budget_enforcer_1.BudgetEnforcer; } });
var degradation_manager_1 = require("./degradation-manager");
Object.defineProperty(exports, "DegradationManager", { enumerable: true, get: function () { return degradation_manager_1.DegradationManager; } });
var alerting_system_1 = require("./alerting-system");
Object.defineProperty(exports, "AlertingSystem", { enumerable: true, get: function () { return alerting_system_1.AlertingSystem; } });
// Types and interfaces
__exportStar(require("./types"), exports);
// Version info
exports.REALTIME_VERSION = '0.1.0';
//# sourceMappingURL=index.js.map