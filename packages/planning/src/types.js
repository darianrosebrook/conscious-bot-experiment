"use strict";
/**
 * Core types for planning and goal management system
 *
 * Author: @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanSchema = exports.NeedSchema = exports.HomeostasisStateSchema = exports.GoalSchema = exports.ResourceType = exports.ActionType = exports.PlanStepStatus = exports.PlanStatus = exports.SignalType = exports.NeedType = exports.EffectType = exports.PreconditionType = exports.GoalStatus = exports.GoalType = void 0;
const zod_1 = require("zod");
var GoalType;
(function (GoalType) {
    GoalType["SURVIVAL"] = "survival";
    GoalType["SAFETY"] = "safety";
    GoalType["EXPLORATION"] = "exploration";
    GoalType["SOCIAL"] = "social";
    GoalType["ACHIEVEMENT"] = "achievement";
    GoalType["CREATIVITY"] = "creativity";
    GoalType["CURIOSITY"] = "curiosity";
    GoalType["REACH_LOCATION"] = "reach_location";
    GoalType["ACQUIRE_ITEM"] = "acquire_item";
    GoalType["SURVIVE_THREAT"] = "survive_threat";
})(GoalType || (exports.GoalType = GoalType = {}));
var GoalStatus;
(function (GoalStatus) {
    GoalStatus["PENDING"] = "pending";
    GoalStatus["ACTIVE"] = "active";
    GoalStatus["COMPLETED"] = "completed";
    GoalStatus["FAILED"] = "failed";
    GoalStatus["SUSPENDED"] = "suspended";
})(GoalStatus || (exports.GoalStatus = GoalStatus = {}));
var PreconditionType;
(function (PreconditionType) {
    PreconditionType["LOCATION"] = "location";
    PreconditionType["INVENTORY"] = "inventory";
    PreconditionType["HEALTH"] = "health";
    PreconditionType["SKILL"] = "skill";
    PreconditionType["TIME"] = "time";
    PreconditionType["WEATHER"] = "weather";
})(PreconditionType || (exports.PreconditionType = PreconditionType = {}));
var EffectType;
(function (EffectType) {
    EffectType["HEALTH_CHANGE"] = "health_change";
    EffectType["HUNGER_CHANGE"] = "hunger_change";
    EffectType["ENERGY_CHANGE"] = "energy_change";
    EffectType["INVENTORY_CHANGE"] = "inventory_change";
    EffectType["KNOWLEDGE_GAIN"] = "knowledge_gain";
    EffectType["RELATIONSHIP_CHANGE"] = "relationship_change";
})(EffectType || (exports.EffectType = EffectType = {}));
var NeedType;
(function (NeedType) {
    NeedType["SURVIVAL"] = "survival";
    NeedType["SAFETY"] = "safety";
    NeedType["EXPLORATION"] = "exploration";
    NeedType["SOCIAL"] = "social";
    NeedType["ACHIEVEMENT"] = "achievement";
    NeedType["CREATIVITY"] = "creativity";
    NeedType["CURIOSITY"] = "curiosity";
})(NeedType || (exports.NeedType = NeedType = {}));
var SignalType;
(function (SignalType) {
    SignalType["HUNGER"] = "hunger";
    SignalType["SAFETY_THREAT"] = "safety_threat";
    SignalType["SOCIAL_ISOLATION"] = "social_isolation";
    SignalType["CURIOSITY"] = "curiosity";
    SignalType["EXPLORATION"] = "exploration";
    SignalType["INTRUSION"] = "intrusion";
    SignalType["ENERGY_DEPLETION"] = "energy_depletion";
    SignalType["HEALTH_DECLINE"] = "health_decline";
    SignalType["ACHIEVEMENT_OPPORTUNITY"] = "achievement_opportunity";
    SignalType["CREATIVITY_DRIVE"] = "creativity_drive";
})(SignalType || (exports.SignalType = SignalType = {}));
var PlanStatus;
(function (PlanStatus) {
    PlanStatus["PENDING"] = "pending";
    PlanStatus["EXECUTING"] = "executing";
    PlanStatus["COMPLETED"] = "completed";
    PlanStatus["FAILED"] = "failed";
    PlanStatus["SUSPENDED"] = "suspended";
})(PlanStatus || (exports.PlanStatus = PlanStatus = {}));
var PlanStepStatus;
(function (PlanStepStatus) {
    PlanStepStatus["PENDING"] = "pending";
    PlanStepStatus["EXECUTING"] = "executing";
    PlanStepStatus["COMPLETED"] = "completed";
    PlanStepStatus["FAILED"] = "failed";
    PlanStepStatus["SKIPPED"] = "skipped";
})(PlanStepStatus || (exports.PlanStepStatus = PlanStepStatus = {}));
var ActionType;
(function (ActionType) {
    ActionType["MOVEMENT"] = "movement";
    ActionType["INTERACTION"] = "interaction";
    ActionType["CRAFTING"] = "crafting";
    ActionType["COMBAT"] = "combat";
    ActionType["SOCIAL"] = "social";
    ActionType["EXPLORATION"] = "exploration";
})(ActionType || (exports.ActionType = ActionType = {}));
var ResourceType;
(function (ResourceType) {
    ResourceType["HEALTH"] = "health";
    ResourceType["HUNGER"] = "hunger";
    ResourceType["ENERGY"] = "energy";
    ResourceType["INVENTORY_ITEM"] = "inventory_item";
    ResourceType["TIME"] = "time";
    ResourceType["KNOWLEDGE"] = "knowledge";
    ResourceType["RELATIONSHIP"] = "relationship";
})(ResourceType || (exports.ResourceType = ResourceType = {}));
// =========================================================================
// Zod Schemas
// =========================================================================
exports.GoalSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.nativeEnum(GoalType),
    priority: zod_1.z.number().min(0).max(1),
    urgency: zod_1.z.number().min(0).max(1),
    utility: zod_1.z.number().min(0).max(1),
    description: zod_1.z.string(),
    preconditions: zod_1.z.array(zod_1.z.any()),
    effects: zod_1.z.array(zod_1.z.any()),
    status: zod_1.z.nativeEnum(GoalStatus),
    createdAt: zod_1.z.number(),
    updatedAt: zod_1.z.number(),
    deadline: zod_1.z.number().optional(),
    parentGoalId: zod_1.z.string().optional(),
    subGoals: zod_1.z.array(zod_1.z.string()),
});
exports.HomeostasisStateSchema = zod_1.z.object({
    health: zod_1.z.number().min(0).max(1),
    hunger: zod_1.z.number().min(0).max(1),
    energy: zod_1.z.number().min(0).max(1),
    safety: zod_1.z.number().min(0).max(1),
    curiosity: zod_1.z.number().min(0).max(1),
    social: zod_1.z.number().min(0).max(1),
    achievement: zod_1.z.number().min(0).max(1),
    creativity: zod_1.z.number().min(0).max(1),
    timestamp: zod_1.z.number(),
});
exports.NeedSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.nativeEnum(NeedType),
    intensity: zod_1.z.number().min(0).max(1),
    urgency: zod_1.z.number().min(0).max(1),
    satisfaction: zod_1.z.number().min(0).max(1),
    description: zod_1.z.string(),
    createdAt: zod_1.z.number(),
    updatedAt: zod_1.z.number(),
});
exports.PlanSchema = zod_1.z.object({
    id: zod_1.z.string(),
    goalId: zod_1.z.string(),
    steps: zod_1.z.array(zod_1.z.any()),
    status: zod_1.z.nativeEnum(PlanStatus),
    priority: zod_1.z.number(),
    estimatedDuration: zod_1.z.number(),
    actualDuration: zod_1.z.number().optional(),
    createdAt: zod_1.z.number(),
    updatedAt: zod_1.z.number(),
    successProbability: zod_1.z.number().min(0).max(1),
});
//# sourceMappingURL=types.js.map