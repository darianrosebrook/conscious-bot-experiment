"use strict";
/**
 * Planning and goal management system for conscious bot
 *
 * This package provides:
 * - Goal formulation and homeostasis monitoring
 * - Hierarchical task planning (HTN)
 * - Goal-oriented action planning (GOAP)
 * - Reactive execution and plan repair
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
exports.createIntegratedPlanningCoordinator = exports.IntegratedPlanningCoordinator = exports.quickPlan = exports.createIntegratedPlanningSystem = exports.IntegratedPlanningSystem = exports.createHRMPlanner = exports.HRMInspiredPlanner = exports.routeTask = exports.createCognitiveRouter = exports.CognitiveTaskRouter = void 0;
// Goal Formulation
__exportStar(require("./goal-formulation/homeostasis-monitor"), exports);
__exportStar(require("./goal-formulation/need-generator"), exports);
__exportStar(require("./goal-formulation/goal-manager"), exports);
__exportStar(require("./goal-formulation/utility-calculator"), exports);
// Hierarchical Planning (Legacy)
__exportStar(require("./hierarchical-planner/hierarchical-planner"), exports);
__exportStar(require("./hierarchical-planner/task-network"), exports);
__exportStar(require("./hierarchical-planner/plan-decomposer"), exports);
// HRM-Inspired Planning (M3) - Selective exports to avoid conflicts
var cognitive_router_1 = require("./hierarchical-planner/cognitive-router");
Object.defineProperty(exports, "CognitiveTaskRouter", { enumerable: true, get: function () { return cognitive_router_1.CognitiveTaskRouter; } });
Object.defineProperty(exports, "createCognitiveRouter", { enumerable: true, get: function () { return cognitive_router_1.createCognitiveRouter; } });
Object.defineProperty(exports, "routeTask", { enumerable: true, get: function () { return cognitive_router_1.routeTask; } });
var hrm_inspired_planner_1 = require("./hierarchical-planner/hrm-inspired-planner");
Object.defineProperty(exports, "HRMInspiredPlanner", { enumerable: true, get: function () { return hrm_inspired_planner_1.HRMInspiredPlanner; } });
Object.defineProperty(exports, "createHRMPlanner", { enumerable: true, get: function () { return hrm_inspired_planner_1.createHRMPlanner; } });
var hierarchical_planner_1 = require("./hierarchical-planner");
Object.defineProperty(exports, "IntegratedPlanningSystem", { enumerable: true, get: function () { return hierarchical_planner_1.IntegratedPlanningSystem; } });
Object.defineProperty(exports, "createIntegratedPlanningSystem", { enumerable: true, get: function () { return hierarchical_planner_1.createIntegratedPlanningSystem; } });
Object.defineProperty(exports, "quickPlan", { enumerable: true, get: function () { return hierarchical_planner_1.plan; } });
// Reactive Execution
__exportStar(require("./reactive-executor/reactive-executor"), exports);
__exportStar(require("./reactive-executor/goap-planner"), exports);
__exportStar(require("./reactive-executor/plan-repair"), exports);
// Integrated Planning Coordinator (M3 - Full Integration)
var integrated_planning_coordinator_1 = require("./integrated-planning-coordinator");
Object.defineProperty(exports, "IntegratedPlanningCoordinator", { enumerable: true, get: function () { return integrated_planning_coordinator_1.IntegratedPlanningCoordinator; } });
Object.defineProperty(exports, "createIntegratedPlanningCoordinator", { enumerable: true, get: function () { return integrated_planning_coordinator_1.createIntegratedPlanningCoordinator; } });
// Types
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map