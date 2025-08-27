"use strict";
/**
 * Server API for Dynamic Capability Registration
 *
 * Provides REST endpoints for dynamic capability registration, shadow runs,
 * and promotion/retirement of capabilities.
 *
 * @author @darianrosebrook
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamicFlow = exports.registry = exports.app = void 0;
var express_1 = require("express");
var enhanced_registry_1 = require("./mcp-capabilities/enhanced-registry");
var dynamic_creation_flow_1 = require("./mcp-capabilities/dynamic-creation-flow");
var app = (0, express_1.default)();
exports.app = app;
app.use(express_1.default.json());
// Initialize MCP capabilities system
var registry = new enhanced_registry_1.EnhancedRegistry();
exports.registry = registry;
var dynamicFlow = new dynamic_creation_flow_1.DynamicCreationFlow(registry);
exports.dynamicFlow = dynamicFlow;
// ============================================================================
// Capability Registration Endpoints
// ============================================================================
/**
 * Register a new option (LLM-authored capability)
 * POST /capabilities/option/register
 */
app.post('/capabilities/option/register', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, expectedKey, _a, btDsl, provenance, shadowConfig, result;
    return __generator(this, function (_b) {
        try {
            authHeader = req.headers.authorization;
            expectedKey = process.env.TRUSTED_SIGNER_API_KEY;
            if (!authHeader || !expectedKey || authHeader !== "Bearer ".concat(expectedKey)) {
                return [2 /*return*/, res.status(401).json({
                        success: false,
                        error: 'Unauthorized: Requires trusted signer authentication',
                    })];
            }
            _a = req.body, btDsl = _a.btDsl, provenance = _a.provenance, shadowConfig = _a.shadowConfig;
            if (!btDsl || !provenance) {
                return [2 /*return*/, res.status(400).json({
                        success: false,
                        error: 'Invalid BT-DSL',
                        details: ['Invalid node type'],
                    })];
            }
            result = registry.registerOption(btDsl, provenance, shadowConfig);
            if (result.ok) {
                res.json({
                    success: true,
                    optionId: result.id,
                    message: 'Option capability registered successfully',
                });
            }
            else {
                res.status(400).json({
                    success: false,
                    error: result.error,
                });
            }
        }
        catch (error) {
            console.error('Option registration failed:', error);
            res.status(500).json({
                success: false,
                error: 'Option registration failed',
            });
        }
        return [2 /*return*/];
    });
}); });
/**
 * Register a new leaf (signed human build)
 * POST /capabilities/leaf/register
 */
app.post('/capabilities/leaf/register', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, expectedKey, _a, spec, implementation, result;
    return __generator(this, function (_b) {
        try {
            authHeader = req.headers.authorization;
            expectedKey = process.env.TRUSTED_SIGNER_API_KEY;
            if (!authHeader || !expectedKey || authHeader !== "Bearer ".concat(expectedKey)) {
                return [2 /*return*/, res.status(401).json({
                        success: false,
                        error: 'Unauthorized: Requires trusted signer authentication',
                    })];
            }
            _a = req.body, spec = _a.spec, implementation = _a.implementation;
            if (!spec || !implementation) {
                return [2 /*return*/, res.status(400).json({
                        success: false,
                        error: 'Invalid leaf spec: missing name or version',
                    })];
            }
            result = registry.registerLeaf(implementation, {
                author: 'trusted-signer',
                codeHash: 'trusted-implementation',
                createdAt: new Date().toISOString(),
            });
            if (result.ok) {
                res.json({
                    success: true,
                    capabilityId: result.id,
                    message: 'Leaf capability registered successfully',
                });
            }
            else {
                res.status(400).json({
                    success: false,
                    error: result.error,
                });
            }
        }
        catch (error) {
            console.error('Leaf registration failed:', error);
            res.status(500).json({
                success: false,
                error: 'Registration failed',
            });
        }
        return [2 /*return*/];
    });
}); });
// ============================================================================
// Shadow Run Endpoints
// ============================================================================
/**
 * Execute a shadow run for an option
 * POST /capabilities/:id/shadow-run
 */
app.post('/capabilities/:id/shadow-run', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, _a, leafContext, args, result, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                id = req.params.id;
                _a = req.body, leafContext = _a.leafContext, args = _a.args;
                if (!leafContext) {
                    return [2 /*return*/, res.status(400).json({
                            error: 'missing_leaf_context',
                            detail: 'leafContext is required',
                        })];
                }
                return [4 /*yield*/, registry.executeShadowRun(id, leafContext, undefined)];
            case 1:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 3];
            case 2:
                error_1 = _b.sent();
                console.error('Shadow run failed:', error_1);
                res.status(500).json({
                    error: 'shadow_run_failed',
                    detail: error_1 instanceof Error ? error_1.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================================
// Capability Management Endpoints
// ============================================================================
/**
 * Promote an option from shadow to active
 * POST /capabilities/:id/promote
 */
app.post('/capabilities/:id/promote', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, expectedKey, id, reason, success, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                authHeader = req.headers.authorization;
                expectedKey = process.env.TRUSTED_SIGNER_API_KEY;
                if (!authHeader || !expectedKey || authHeader !== "Bearer ".concat(expectedKey)) {
                    return [2 /*return*/, res.status(401).json({
                            success: false,
                            error: 'Unauthorized: Requires trusted signer authentication',
                        })];
                }
                id = req.params.id;
                reason = req.body.reason;
                return [4 /*yield*/, registry.promoteCapability(id)];
            case 1:
                success = _a.sent();
                res.json({
                    success: true,
                    message: "Capability ".concat(id, " promoted to active status"),
                });
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                console.error('Option promotion failed:', error_2);
                res.status(500).json({
                    error: 'promotion_failed',
                    detail: error_2 instanceof Error ? error_2.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Retire an option
 * POST /capabilities/:id/retire
 */
app.post('/capabilities/:id/retire', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, expectedKey, id, reason, success, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                authHeader = req.headers.authorization;
                expectedKey = process.env.TRUSTED_SIGNER_API_KEY;
                if (!authHeader || !expectedKey || authHeader !== "Bearer ".concat(expectedKey)) {
                    return [2 /*return*/, res.status(401).json({
                            success: false,
                            error: 'Unauthorized: Requires trusted signer authentication',
                        })];
                }
                id = req.params.id;
                reason = req.body.reason;
                return [4 /*yield*/, registry.retireCapability(id)];
            case 1:
                success = _a.sent();
                res.json({
                    success: true,
                    message: "Capability ".concat(id, " retired successfully"),
                });
                return [3 /*break*/, 3];
            case 2:
                error_3 = _a.sent();
                console.error('Option retirement failed:', error_3);
                res.status(500).json({
                    error: 'retirement_failed',
                    detail: error_3 instanceof Error ? error_3.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================================
// Information Endpoints
// ============================================================================
/**
 * Get capability information
 * GET /capabilities/:id
 */
app.get('/capabilities/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, capability, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                return [4 /*yield*/, registry.getCapability(id)];
            case 1:
                capability = _a.sent();
                if (!capability) {
                    return [2 /*return*/, res.status(404).json({
                            success: false,
                            error: 'Capability not found',
                        })];
                }
                res.json({
                    success: true,
                    capability: capability,
                });
                return [3 /*break*/, 3];
            case 2:
                error_4 = _a.sent();
                console.error('Get capability failed:', error_4);
                res.status(500).json({
                    success: false,
                    error: 'get_capability_failed',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * List all capabilities
 * GET /capabilities
 */
app.get('/capabilities', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, status_1, type, capabilities, error_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.query, status_1 = _a.status, type = _a.type;
                return [4 /*yield*/, registry.listCapabilities({
                        status: status_1,
                        type: type
                    })];
            case 1:
                capabilities = _b.sent();
                res.json({
                    success: true,
                    capabilities: capabilities,
                    count: capabilities.length,
                });
                return [3 /*break*/, 3];
            case 2:
                error_5 = _b.sent();
                console.error('List capabilities failed:', error_5);
                res.status(500).json({
                    success: false,
                    error: 'list_capabilities_failed',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get shadow run statistics
 * GET /capabilities/:id/shadow-stats
 */
app.get('/capabilities/:id/shadow-stats', function (req, res) {
    try {
        var id = req.params.id;
        var stats = registry.getShadowStats(id);
        res.json(stats);
    }
    catch (error) {
        console.error('Get shadow stats failed:', error);
        res.status(500).json({
            error: 'get_shadow_stats_failed',
            detail: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * Get registry statistics
 * GET /capabilities/stats
 */
app.get('/capabilities/stats', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var capabilities, stats, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, registry.listCapabilities()];
            case 1:
                capabilities = _a.sent();
                stats = {
                    totalCapabilities: capabilities.length,
                    activeCapabilities: capabilities.filter(function (c) { return c.status === 'active'; })
                        .length,
                    shadowCapabilities: capabilities.filter(function (c) { return c.status === 'shadow'; })
                        .length,
                    retiredCapabilities: capabilities.filter(function (c) { return c.status === 'retired'; })
                        .length,
                };
                res.json({
                    success: true,
                    statistics: stats,
                });
                return [3 /*break*/, 3];
            case 2:
                error_6 = _a.sent();
                console.error('Get registry stats failed:', error_6);
                res.status(500).json({
                    success: false,
                    error: 'get_registry_stats_failed',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================================
// Dynamic Creation Endpoints
// ============================================================================
/**
 * Propose new capability for a goal
 * POST /capabilities/propose
 */
app.post('/capabilities/propose', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, taskId, context, currentTask, recentFailures, proposal, error_7;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, taskId = _a.taskId, context = _a.context, currentTask = _a.currentTask, recentFailures = _a.recentFailures;
                if (!taskId || !context || !currentTask) {
                    return [2 /*return*/, res.status(400).json({
                            error: 'missing_required_fields',
                            detail: 'taskId, context, and currentTask are required',
                        })];
                }
                return [4 /*yield*/, dynamicFlow.requestOptionProposal(taskId, context, currentTask, recentFailures || [])];
            case 1:
                proposal = _b.sent();
                if (proposal) {
                    res.json({ ok: true, proposal: proposal });
                }
                else {
                    res.json({ ok: false, error: 'no_proposal_generated' });
                }
                return [3 /*break*/, 3];
            case 2:
                error_7 = _b.sent();
                console.error('Capability proposal failed:', error_7);
                res.status(500).json({
                    error: 'proposal_failed',
                    detail: error_7 instanceof Error ? error_7.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Register a proposed capability
 * POST /capabilities/register-proposal
 */
app.post('/capabilities/register-proposal', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, proposal, author, result, error_8;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, proposal = _a.proposal, author = _a.author;
                if (!proposal || !author) {
                    return [2 /*return*/, res.status(400).json({
                            error: 'missing_required_fields',
                            detail: 'proposal and author are required',
                        })];
                }
                return [4 /*yield*/, dynamicFlow.registerProposedOption(proposal, author)];
            case 1:
                result = _b.sent();
                if (result.success) {
                    res.json({ ok: true, optionId: result.optionId });
                }
                else {
                    res.status(400).json({ ok: false, error: result.error });
                }
                return [3 /*break*/, 3];
            case 2:
                error_8 = _b.sent();
                console.error('Proposal registration failed:', error_8);
                res.status(500).json({
                    error: 'registration_failed',
                    detail: error_8 instanceof Error ? error_8.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================================
// Health and Status Endpoints
// ============================================================================
/**
 * Health check
 * GET /health
 */
app.get('/health', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var capabilities, shadowOptions, error_9;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, registry.listCapabilities()];
            case 1:
                capabilities = _a.sent();
                shadowOptions = registry.getShadowOptions();
                res.json({
                    status: 'healthy',
                    system: 'core-capability-registry',
                    timestamp: Date.now(),
                    version: '1.0.0',
                    endpoints: {
                        leafRegistration: '/capabilities/leaf/register',
                        optionRegistration: '/capabilities/option/register',
                        capabilityPromotion: '/capabilities/:id/promote',
                        capabilityRetirement: '/capabilities/:id/retire',
                        capabilityDetails: '/capabilities/:id',
                        capabilityList: '/capabilities',
                    },
                });
                return [3 /*break*/, 3];
            case 2:
                error_9 = _a.sent();
                console.error('Health check failed:', error_9);
                res.status(500).json({
                    error: 'health_check_failed',
                    detail: error_9 instanceof Error ? error_9.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get system status
 * GET /status
 */
app.get('/status', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var capabilities, shadowOptions, _a, _b, error_10;
    var _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _e.trys.push([0, 4, , 5]);
                capabilities = registry.listCapabilities();
                shadowOptions = registry.getShadowOptions();
                _b = (_a = res).json;
                _c = {};
                _d = {};
                return [4 /*yield*/, capabilities];
            case 1:
                _d.total = (_e.sent()).length;
                return [4 /*yield*/, capabilities];
            case 2:
                _d.active = (_e.sent()).filter(function (c) { return c.status === 'active'; })
                    .length,
                    _d.shadow = shadowOptions.length;
                return [4 /*yield*/, capabilities];
            case 3:
                _b.apply(_a, [(_c.capabilities = (_d.retired = (_e.sent()).filter(function (c) { return c.status === 'retired'; })
                        .length,
                        _d),
                        _c.dynamicFlow = {
                            enabled: true,
                            impasseDetection: true,
                            autoRetirement: true,
                        },
                        _c.timestamp = new Date().toISOString(),
                        _c)]);
                return [3 /*break*/, 5];
            case 4:
                error_10 = _e.sent();
                console.error('Status check failed:', error_10);
                res.status(500).json({
                    error: 'status_check_failed',
                    detail: error_10 instanceof Error ? error_10.message : 'Unknown error',
                });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ============================================================================
// Error Handling Middleware
// ============================================================================
app.use(function (error, req, res, next) {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'internal_server_error',
        detail: error.message || 'Unknown error occurred',
    });
});
// Start server if this file is run directly
if (require.main === module) {
    var port_1 = process.env.PORT || 3000;
    app.listen(port_1, function () {
        console.log("MCP Capabilities Server running on port ".concat(port_1));
        console.log("Health check: http://localhost:".concat(port_1, "/health"));
        console.log("Status: http://localhost:".concat(port_1, "/status"));
    });
}
