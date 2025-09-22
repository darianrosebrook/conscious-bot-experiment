"use strict";
/**
 * Advanced Signal Processor
 *
 * Implements complex signal fusion, intrusion detection, memory signal integration,
 * and social signal processing for sophisticated signal management in the conscious bot.
 *
 * @author @darianrosebrook
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedSignalProcessor = exports.CommunicationIntent = exports.SocialSignalType = exports.MemoryType = exports.ThreatType = exports.ThreatLevel = exports.FusionMethod = exports.SignalDirection = exports.SignalSource = exports.SignalType = void 0;
var events_1 = require("events");
var uuid_1 = require("uuid");
var SignalType;
(function (SignalType) {
    SignalType["HOMEOSTATIC"] = "homeostatic";
    SignalType["INTRUSION"] = "intrusion";
    SignalType["MEMORY"] = "memory";
    SignalType["SOCIAL"] = "social";
    SignalType["ENVIRONMENTAL"] = "environmental";
    SignalType["COGNITIVE"] = "cognitive";
    SignalType["EMOTIONAL"] = "emotional";
    SignalType["PHYSICAL"] = "physical";
})(SignalType || (exports.SignalType = SignalType = {}));
var SignalSource;
(function (SignalSource) {
    SignalSource["INTERNAL"] = "internal";
    SignalSource["EXTERNAL"] = "external";
    SignalSource["SOCIAL"] = "social";
    SignalSource["ENVIRONMENTAL"] = "environmental";
    SignalSource["COGNITIVE"] = "cognitive";
    SignalSource["MEMORY"] = "memory";
})(SignalSource || (exports.SignalSource = SignalSource = {}));
var SignalDirection;
(function (SignalDirection) {
    SignalDirection["INCOMING"] = "incoming";
    SignalDirection["OUTGOING"] = "outgoing";
    SignalDirection["BIDIRECTIONAL"] = "bidirectional";
    SignalDirection["INTERNAL"] = "internal";
})(SignalDirection || (exports.SignalDirection = SignalDirection = {}));
var FusionMethod;
(function (FusionMethod) {
    FusionMethod["WEIGHTED_AVERAGE"] = "weighted_average";
    FusionMethod["BAYESIAN"] = "bayesian";
    FusionMethod["DEMPSTER_SHAFER"] = "dempster_shafer";
    FusionMethod["FUZZY_LOGIC"] = "fuzzy_logic";
    FusionMethod["NEURAL_NETWORK"] = "neural_network";
    FusionMethod["CORRELATION"] = "correlation";
    FusionMethod["TEMPORAL"] = "temporal";
    FusionMethod["SPATIAL"] = "spatial";
})(FusionMethod || (exports.FusionMethod = FusionMethod = {}));
var ThreatLevel;
(function (ThreatLevel) {
    ThreatLevel["NONE"] = "none";
    ThreatLevel["LOW"] = "low";
    ThreatLevel["MEDIUM"] = "medium";
    ThreatLevel["HIGH"] = "high";
    ThreatLevel["CRITICAL"] = "critical";
})(ThreatLevel || (exports.ThreatLevel = ThreatLevel = {}));
var ThreatType;
(function (ThreatType) {
    ThreatType["PHYSICAL"] = "physical";
    ThreatType["SOCIAL"] = "social";
    ThreatType["COGNITIVE"] = "cognitive";
    ThreatType["ENVIRONMENTAL"] = "environmental";
    ThreatType["RESOURCE"] = "resource";
    ThreatType["INFORMATION"] = "information";
})(ThreatType || (exports.ThreatType = ThreatType = {}));
var MemoryType;
(function (MemoryType) {
    MemoryType["EXPERIENCE"] = "experience";
    MemoryType["KNOWLEDGE"] = "knowledge";
    MemoryType["EMOTIONAL"] = "emotional";
    MemoryType["PROCEDURAL"] = "procedural";
    MemoryType["EPISODIC"] = "episodic";
    MemoryType["SEMANTIC"] = "semantic";
})(MemoryType || (exports.MemoryType = MemoryType = {}));
var SocialSignalType;
(function (SocialSignalType) {
    SocialSignalType["COMMUNICATION"] = "communication";
    SocialSignalType["GESTURE"] = "gesture";
    SocialSignalType["EMOTION"] = "emotion";
    SocialSignalType["INTENTION"] = "intention";
    SocialSignalType["THREAT"] = "threat";
    SocialSignalType["COOPERATION"] = "cooperation";
    SocialSignalType["COMPETITION"] = "competition";
})(SocialSignalType || (exports.SocialSignalType = SocialSignalType = {}));
var CommunicationIntent;
(function (CommunicationIntent) {
    CommunicationIntent["FRIENDLY"] = "friendly";
    CommunicationIntent["HOSTILE"] = "hostile";
    CommunicationIntent["NEUTRAL"] = "neutral";
    CommunicationIntent["COOPERATIVE"] = "cooperative";
    CommunicationIntent["COMPETITIVE"] = "competitive";
    CommunicationIntent["INFORMATIVE"] = "informative";
    CommunicationIntent["PERSUASIVE"] = "persuasive";
})(CommunicationIntent || (exports.CommunicationIntent = CommunicationIntent = {}));
var DEFAULT_CONFIG = {
    maxSignals: 1000,
    fusionThreshold: 0.6,
    threatThreshold: 0.5,
    memoryDecayRate: 0.95,
    socialTrustThreshold: 0.3,
    enableAdvancedFusion: true,
    enableIntrusionDetection: true,
    enableMemoryIntegration: true,
    enableSocialProcessing: true,
    enablePatternRecognition: true,
};
// ============================================================================
// Advanced Signal Processor Implementation
// ============================================================================
var AdvancedSignalProcessor = /** @class */ (function (_super) {
    __extends(AdvancedSignalProcessor, _super);
    function AdvancedSignalProcessor(config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this) || this;
        _this.signals = new Map();
        _this.fusedSignals = new Map();
        _this.signalPatterns = new Map();
        _this.threatSignals = new Map();
        _this.memorySignals = new Map();
        _this.socialSignals = new Map();
        _this.fusionHistory = [];
        _this.config = __assign(__assign({}, DEFAULT_CONFIG), config);
        _this.patternRecognizer = new PatternRecognizer();
        _this.threatDetector = new ThreatDetector();
        _this.memoryIntegrator = new MemoryIntegrator();
        _this.socialProcessor = new SocialProcessor();
        return _this;
    }
    /**
     * Process incoming signals with advanced fusion and analysis
     */
    AdvancedSignalProcessor.prototype.processSignals = function (signals) {
        return __awaiter(this, void 0, void 0, function () {
            var processedSignals, newFusedSignals, threatAssessments, _i, signals_1, signal, _a, intrusionSignal, memorySignal, socialSignal, fusionResults, threats;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        processedSignals = [];
                        newFusedSignals = [];
                        threatAssessments = [];
                        _i = 0, signals_1 = signals;
                        _b.label = 1;
                    case 1:
                        if (!(_i < signals_1.length)) return [3 /*break*/, 10];
                        signal = signals_1[_i];
                        // Add signal to storage
                        this.signals.set(signal.id, signal);
                        _a = signal.type;
                        switch (_a) {
                            case SignalType.INTRUSION: return [3 /*break*/, 2];
                            case SignalType.MEMORY: return [3 /*break*/, 4];
                            case SignalType.SOCIAL: return [3 /*break*/, 6];
                        }
                        return [3 /*break*/, 8];
                    case 2: return [4 /*yield*/, this.processIntrusionSignal(signal)];
                    case 3:
                        intrusionSignal = _b.sent();
                        if (intrusionSignal) {
                            this.threatSignals.set(signal.id, intrusionSignal);
                            processedSignals.push(intrusionSignal);
                        }
                        return [3 /*break*/, 9];
                    case 4: return [4 /*yield*/, this.processMemorySignal(signal)];
                    case 5:
                        memorySignal = _b.sent();
                        if (memorySignal) {
                            this.memorySignals.set(signal.id, memorySignal);
                            processedSignals.push(memorySignal);
                        }
                        return [3 /*break*/, 9];
                    case 6: return [4 /*yield*/, this.processSocialSignal(signal)];
                    case 7:
                        socialSignal = _b.sent();
                        if (socialSignal) {
                            this.socialSignals.set(signal.id, socialSignal);
                            processedSignals.push(socialSignal);
                        }
                        return [3 /*break*/, 9];
                    case 8:
                        processedSignals.push(signal);
                        return [3 /*break*/, 9];
                    case 9:
                        _i++;
                        return [3 /*break*/, 1];
                    case 10:
                        if (!this.config.enableAdvancedFusion) return [3 /*break*/, 12];
                        return [4 /*yield*/, this.performSignalFusion(processedSignals)];
                    case 11:
                        fusionResults = _b.sent();
                        newFusedSignals.push.apply(newFusedSignals, fusionResults);
                        _b.label = 12;
                    case 12:
                        if (!this.config.enablePatternRecognition) return [3 /*break*/, 14];
                        return [4 /*yield*/, this.detectPatterns(processedSignals)];
                    case 13:
                        _b.sent();
                        _b.label = 14;
                    case 14:
                        if (!this.config.enableIntrusionDetection) return [3 /*break*/, 16];
                        return [4 /*yield*/, this.assessThreats()];
                    case 15:
                        threats = _b.sent();
                        threatAssessments.push.apply(threatAssessments, threats);
                        _b.label = 16;
                    case 16:
                        // Clean up old signals
                        this.cleanupOldSignals();
                        return [2 /*return*/, {
                                processedSignals: processedSignals,
                                fusedSignals: newFusedSignals,
                                threatAssessments: threatAssessments,
                                patterns: Array.from(this.signalPatterns.values()),
                            }];
                }
            });
        });
    };
    /**
     * Perform advanced signal fusion
     */
    AdvancedSignalProcessor.prototype.performSignalFusion = function (signals) {
        return __awaiter(this, void 0, void 0, function () {
            var fusedSignals, signalGroups, _i, signalGroups_1, group, fusionMethod, fusedSignal, fusion;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fusedSignals = [];
                        signalGroups = this.groupSignalsForFusion(signals);
                        _i = 0, signalGroups_1 = signalGroups;
                        _a.label = 1;
                    case 1:
                        if (!(_i < signalGroups_1.length)) return [3 /*break*/, 4];
                        group = signalGroups_1[_i];
                        if (group.length < 2)
                            return [3 /*break*/, 3];
                        fusionMethod = this.selectFusionMethod(group);
                        return [4 /*yield*/, this.fuseSignalGroup(group, fusionMethod)];
                    case 2:
                        fusedSignal = _a.sent();
                        if (fusedSignal) {
                            this.fusedSignals.set(fusedSignal.id, fusedSignal);
                            fusedSignals.push(fusedSignal);
                            fusion = {
                                id: (0, uuid_1.v4)(),
                                method: fusionMethod,
                                signals: group.map(function (s) { return s.id; }),
                                result: fusedSignal,
                                confidence: fusedSignal.fusionConfidence,
                                timestamp: Date.now(),
                                metadata: this.calculateFusionMetadata(group, fusedSignal),
                            };
                            this.fusionHistory.push(fusion);
                        }
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, fusedSignals];
                }
            });
        });
    };
    /**
     * Group signals for fusion based on correlation
     */
    AdvancedSignalProcessor.prototype.groupSignalsForFusion = function (signals) {
        var groups = [];
        var processed = new Set();
        for (var _i = 0, signals_2 = signals; _i < signals_2.length; _i++) {
            var signal = signals_2[_i];
            if (processed.has(signal.id))
                continue;
            var group = [signal];
            processed.add(signal.id);
            // Find correlated signals
            for (var _a = 0, signals_3 = signals; _a < signals_3.length; _a++) {
                var otherSignal = signals_3[_a];
                if (processed.has(otherSignal.id))
                    continue;
                var correlation = this.calculateCorrelation(signal, otherSignal);
                if (correlation >= this.config.fusionThreshold) {
                    group.push(otherSignal);
                    processed.add(otherSignal.id);
                }
            }
            if (group.length > 1) {
                groups.push(group);
            }
        }
        return groups;
    };
    /**
     * Calculate correlation between two signals
     */
    AdvancedSignalProcessor.prototype.calculateCorrelation = function (signal1, signal2) {
        // Temporal correlation
        var timeDiff = Math.abs(signal1.timestamp - signal2.timestamp);
        var temporalCorrelation = Math.max(0, 1 - timeDiff / 60000); // 1 minute window
        // Spatial correlation
        var spatialCorrelation = signal1.metadata.location === signal2.metadata.location ? 1 : 0;
        // Type correlation
        var typeCorrelation = signal1.type === signal2.type ? 1 : 0.5;
        // Content correlation (simplified)
        var contentCorrelation = this.calculateContentSimilarity(signal1.data, signal2.data);
        // Weighted average
        return (temporalCorrelation * 0.3 +
            spatialCorrelation * 0.2 +
            typeCorrelation * 0.2 +
            contentCorrelation * 0.3);
    };
    /**
     * Calculate content similarity between signal data
     */
    AdvancedSignalProcessor.prototype.calculateContentSimilarity = function (data1, data2) {
        // Simple similarity based on intensity and direction
        var intensityDiff = Math.abs(data1.intensity - data2.intensity);
        var directionMatch = data1.direction === data2.direction ? 1 : 0;
        return (1 - intensityDiff) * 0.7 + directionMatch * 0.3;
    };
    /**
     * Select appropriate fusion method for signal group
     */
    AdvancedSignalProcessor.prototype.selectFusionMethod = function (signals) {
        var types = new Set(signals.map(function (s) { return s.type; }));
        var sources = new Set(signals.map(function (s) { return s.source; }));
        if (types.size === 1 && sources.size === 1) {
            return FusionMethod.WEIGHTED_AVERAGE;
        }
        else if (signals.length > 5) {
            return FusionMethod.NEURAL_NETWORK;
        }
        else if (types.has(SignalType.INTRUSION)) {
            return FusionMethod.BAYESIAN;
        }
        else {
            return FusionMethod.CORRELATION;
        }
    };
    /**
     * Fuse a group of signals using specified method
     */
    AdvancedSignalProcessor.prototype.fuseSignalGroup = function (signals, method) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (method) {
                    case FusionMethod.WEIGHTED_AVERAGE:
                        return [2 /*return*/, this.weightedAverageFusion(signals)];
                    case FusionMethod.BAYESIAN:
                        return [2 /*return*/, this.bayesianFusion(signals)];
                    case FusionMethod.CORRELATION:
                        return [2 /*return*/, this.correlationFusion(signals)];
                    default:
                        return [2 /*return*/, this.weightedAverageFusion(signals)];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Weighted average fusion method
     */
    AdvancedSignalProcessor.prototype.weightedAverageFusion = function (signals) {
        var totalWeight = signals.reduce(function (sum, s) { return sum + s.confidence; }, 0);
        var fusedData = {
            content: signals.map(function (s) { return s.data.content; }).join('; '),
            intensity: signals.reduce(function (sum, s) { return sum + s.data.intensity * s.confidence; }, 0) /
                totalWeight,
            direction: this.mostCommonDirection(signals),
            duration: Math.max.apply(Math, signals.map(function (s) { return s.data.duration; })),
            frequency: signals.reduce(function (sum, s) { return sum + s.data.frequency * s.confidence; }, 0) /
                totalWeight,
            amplitude: signals.reduce(function (sum, s) { return sum + s.data.amplitude * s.confidence; }, 0) /
                totalWeight,
        };
        var fusedMetadata = {
            location: this.mostCommonLocation(signals),
            environment: this.mostCommonEnvironment(signals),
            socialContext: this.mostCommonSocialContext(signals),
            emotionalValence: signals.reduce(function (sum, s) { return sum + s.metadata.emotionalValence * s.confidence; }, 0) / totalWeight,
            novelty: Math.max.apply(Math, signals.map(function (s) { return s.metadata.novelty; })),
            relevance: signals.reduce(function (sum, s) { return sum + s.metadata.relevance * s.confidence; }, 0) / totalWeight,
            reliability: signals.reduce(function (sum, s) { return sum + s.metadata.reliability * s.confidence; }, 0) / totalWeight,
            tags: this.mergeTags(signals),
        };
        var fusionConfidence = signals.reduce(function (sum, s) { return sum + s.confidence; }, 0) / signals.length;
        var correlationStrength = this.calculateGroupCorrelation(signals);
        return {
            id: (0, uuid_1.v4)(),
            type: this.determineFusedType(signals),
            source: this.determineFusedSource(signals),
            priority: Math.max.apply(Math, signals.map(function (s) { return s.priority; })),
            urgency: Math.max.apply(Math, signals.map(function (s) { return s.urgency; })),
            confidence: fusionConfidence,
            timestamp: Date.now(),
            data: fusedData,
            metadata: fusedMetadata,
            processed: true,
            fused: true,
            componentSignals: signals.map(function (s) { return s.id; }),
            fusionMethod: FusionMethod.WEIGHTED_AVERAGE,
            fusionConfidence: fusionConfidence,
            correlationStrength: correlationStrength,
            redundancyScore: this.calculateRedundancyScore(signals),
        };
    };
    /**
     * Bayesian fusion method
     */
    AdvancedSignalProcessor.prototype.bayesianFusion = function (signals) {
        // Simplified Bayesian fusion
        var prior = 0.5;
        var posterior = prior;
        for (var _i = 0, signals_4 = signals; _i < signals_4.length; _i++) {
            var signal = signals_4[_i];
            var likelihood = signal.confidence;
            posterior =
                (likelihood * prior) /
                    (likelihood * prior + (1 - likelihood) * (1 - prior));
        }
        var baseFused = this.weightedAverageFusion(signals);
        return __assign(__assign({}, baseFused), { fusionMethod: FusionMethod.BAYESIAN, fusionConfidence: posterior });
    };
    /**
     * Correlation-based fusion method
     */
    AdvancedSignalProcessor.prototype.correlationFusion = function (signals) {
        var correlations = [];
        for (var i = 0; i < signals.length; i++) {
            for (var j = i + 1; j < signals.length; j++) {
                correlations.push(this.calculateCorrelation(signals[i], signals[j]));
            }
        }
        var avgCorrelation = correlations.reduce(function (sum, c) { return sum + c; }, 0) / correlations.length;
        var baseFused = this.weightedAverageFusion(signals);
        return __assign(__assign({}, baseFused), { fusionMethod: FusionMethod.CORRELATION, fusionConfidence: avgCorrelation, correlationStrength: avgCorrelation });
    };
    /**
     * Process intrusion signals
     */
    AdvancedSignalProcessor.prototype.processIntrusionSignal = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var processedSignal;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.config.enableIntrusionDetection) {
                            return [2 /*return*/, signal];
                        }
                        return [4 /*yield*/, this.threatDetector.process(signal)];
                    case 1:
                        processedSignal = _a.sent();
                        if (processedSignal.threatLevel >= ThreatLevel.MEDIUM) {
                            this.emit('threatDetected', processedSignal);
                        }
                        return [2 /*return*/, processedSignal];
                }
            });
        });
    };
    /**
     * Process memory signals
     */
    AdvancedSignalProcessor.prototype.processMemorySignal = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.config.enableMemoryIntegration) {
                            return [2 /*return*/, signal];
                        }
                        return [4 /*yield*/, this.memoryIntegrator.process(signal)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Process social signals
     */
    AdvancedSignalProcessor.prototype.processSocialSignal = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.config.enableSocialProcessing) {
                            return [2 /*return*/, signal];
                        }
                        return [4 /*yield*/, this.socialProcessor.process(signal)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Detect patterns in signals
     */
    AdvancedSignalProcessor.prototype.detectPatterns = function (signals) {
        return __awaiter(this, void 0, void 0, function () {
            var patterns, _i, patterns_1, pattern;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.patternRecognizer.detectPatterns(signals)];
                    case 1:
                        patterns = _a.sent();
                        for (_i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
                            pattern = patterns_1[_i];
                            this.signalPatterns.set(pattern.id, pattern);
                            this.emit('patternDetected', pattern);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Assess threats from intrusion signals
     */
    AdvancedSignalProcessor.prototype.assessThreats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var assessments, threatGroups, _i, _a, _b, threatType, signals, assessment;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        assessments = [];
                        threatGroups = this.groupThreatsByType();
                        _i = 0, _a = Array.from(threatGroups.entries());
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        _b = _a[_i], threatType = _b[0], signals = _b[1];
                        return [4 /*yield*/, this.threatDetector.assessThreats(signals)];
                    case 2:
                        assessment = _c.sent();
                        assessments.push(assessment);
                        _c.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, assessments];
                }
            });
        });
    };
    /**
     * Group threats by type
     */
    AdvancedSignalProcessor.prototype.groupThreatsByType = function () {
        var groups = new Map();
        for (var _i = 0, _a = Array.from(this.threatSignals.values()); _i < _a.length; _i++) {
            var signal = _a[_i];
            var type = signal.threatType;
            if (!groups.has(type)) {
                groups.set(type, []);
            }
            groups.get(type).push(signal);
        }
        return groups;
    };
    /**
     * Clean up old signals
     */
    AdvancedSignalProcessor.prototype.cleanupOldSignals = function () {
        var cutoffTime = Date.now() - 3600000; // 1 hour ago
        // Clean up regular signals
        for (var _i = 0, _a = Array.from(this.signals.entries()); _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], signal = _b[1];
            if (signal.timestamp < cutoffTime) {
                this.signals.delete(id);
            }
        }
        // Clean up memory signals with decay
        for (var _c = 0, _d = Array.from(this.memorySignals.entries()); _c < _d.length; _c++) {
            var _e = _d[_c], id = _e[0], signal = _e[1];
            var age = Date.now() - signal.timestamp;
            var decayFactor = Math.pow(this.config.memoryDecayRate, age / 60000); // 1 minute intervals
            if (decayFactor < 0.1) {
                this.memorySignals.delete(id);
            }
        }
    };
    // ============================================================================
    // Helper Methods
    // ============================================================================
    AdvancedSignalProcessor.prototype.mostCommonDirection = function (signals) {
        var counts = new Map();
        for (var _i = 0, signals_5 = signals; _i < signals_5.length; _i++) {
            var signal = signals_5[_i];
            counts.set(signal.data.direction, (counts.get(signal.data.direction) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce(function (a, b) {
            return a[1] > b[1] ? a : b;
        })[0];
    };
    AdvancedSignalProcessor.prototype.mostCommonLocation = function (signals) {
        var counts = new Map();
        for (var _i = 0, signals_6 = signals; _i < signals_6.length; _i++) {
            var signal = signals_6[_i];
            counts.set(signal.metadata.location, (counts.get(signal.metadata.location) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce(function (a, b) {
            return a[1] > b[1] ? a : b;
        })[0];
    };
    AdvancedSignalProcessor.prototype.mostCommonEnvironment = function (signals) {
        var counts = new Map();
        for (var _i = 0, signals_7 = signals; _i < signals_7.length; _i++) {
            var signal = signals_7[_i];
            counts.set(signal.metadata.environment, (counts.get(signal.metadata.environment) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce(function (a, b) {
            return a[1] > b[1] ? a : b;
        })[0];
    };
    AdvancedSignalProcessor.prototype.mostCommonSocialContext = function (signals) {
        var counts = new Map();
        for (var _i = 0, signals_8 = signals; _i < signals_8.length; _i++) {
            var signal = signals_8[_i];
            counts.set(signal.metadata.socialContext, (counts.get(signal.metadata.socialContext) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce(function (a, b) {
            return a[1] > b[1] ? a : b;
        })[0];
    };
    AdvancedSignalProcessor.prototype.mergeTags = function (signals) {
        var tagCounts = new Map();
        for (var _i = 0, signals_9 = signals; _i < signals_9.length; _i++) {
            var signal = signals_9[_i];
            for (var _a = 0, _b = signal.metadata.tags; _a < _b.length; _a++) {
                var tag = _b[_a];
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }
        return Array.from(tagCounts.entries())
            .filter(function (_a) {
            var _ = _a[0], count = _a[1];
            return count > signals.length / 2;
        })
            .map(function (_a) {
            var tag = _a[0], _ = _a[1];
            return tag;
        });
    };
    AdvancedSignalProcessor.prototype.calculateGroupCorrelation = function (signals) {
        if (signals.length < 2)
            return 1;
        var totalCorrelation = 0;
        var correlationCount = 0;
        for (var i = 0; i < signals.length; i++) {
            for (var j = i + 1; j < signals.length; j++) {
                totalCorrelation += this.calculateCorrelation(signals[i], signals[j]);
                correlationCount++;
            }
        }
        return totalCorrelation / correlationCount;
    };
    AdvancedSignalProcessor.prototype.calculateRedundancyScore = function (signals) {
        if (signals.length < 2)
            return 0;
        var redundancy = 0;
        for (var i = 0; i < signals.length; i++) {
            for (var j = i + 1; j < signals.length; j++) {
                var similarity = this.calculateContentSimilarity(signals[i].data, signals[j].data);
                redundancy += similarity;
            }
        }
        return redundancy / ((signals.length * (signals.length - 1)) / 2);
    };
    AdvancedSignalProcessor.prototype.determineFusedType = function (signals) {
        var typeCounts = new Map();
        for (var _i = 0, signals_10 = signals; _i < signals_10.length; _i++) {
            var signal = signals_10[_i];
            typeCounts.set(signal.type, (typeCounts.get(signal.type) || 0) + 1);
        }
        return Array.from(typeCounts.entries()).reduce(function (a, b) {
            return a[1] > b[1] ? a : b;
        })[0];
    };
    AdvancedSignalProcessor.prototype.determineFusedSource = function (signals) {
        var sourceCounts = new Map();
        for (var _i = 0, signals_11 = signals; _i < signals_11.length; _i++) {
            var signal = signals_11[_i];
            sourceCounts.set(signal.source, (sourceCounts.get(signal.source) || 0) + 1);
        }
        return Array.from(sourceCounts.entries()).reduce(function (a, b) {
            return a[1] > b[1] ? a : b;
        })[0];
    };
    AdvancedSignalProcessor.prototype.calculateFusionMetadata = function (signals, fusedSignal) {
        var correlationMatrix = [];
        for (var i = 0; i < signals.length; i++) {
            var row = [];
            for (var j = 0; j < signals.length; j++) {
                row.push(this.calculateCorrelation(signals[i], signals[j]));
            }
            correlationMatrix.push(row);
        }
        var redundancyAnalysis = {
            redundantSignals: signals
                .filter(function (s) { return s.metadata.relevance < 0.3; })
                .map(function (s) { return s.id; }),
            redundancyScore: fusedSignal.redundancyScore,
            informationGain: 1 - fusedSignal.redundancyScore,
            noiseReduction: Math.min(1, signals.length * 0.1),
        };
        var confidenceFactors = [
            {
                factor: 'signal_quality',
                weight: 0.4,
                value: fusedSignal.confidence,
                contribution: fusedSignal.confidence * 0.4,
            },
            {
                factor: 'correlation_strength',
                weight: 0.3,
                value: fusedSignal.correlationStrength,
                contribution: fusedSignal.correlationStrength * 0.3,
            },
            {
                factor: 'redundancy',
                weight: 0.2,
                value: 1 - fusedSignal.redundancyScore,
                contribution: (1 - fusedSignal.redundancyScore) * 0.2,
            },
            {
                factor: 'method_confidence',
                weight: 0.1,
                value: 0.8,
                contribution: 0.08,
            },
        ];
        return {
            correlationMatrix: correlationMatrix,
            redundancyAnalysis: redundancyAnalysis,
            confidenceFactors: confidenceFactors,
            fusionQuality: confidenceFactors.reduce(function (sum, f) { return sum + f.contribution; }, 0),
        };
    };
    // ============================================================================
    // Public Interface
    // ============================================================================
    AdvancedSignalProcessor.prototype.getSignals = function () {
        return Array.from(this.signals.values());
    };
    AdvancedSignalProcessor.prototype.getFusedSignals = function () {
        return Array.from(this.fusedSignals.values());
    };
    AdvancedSignalProcessor.prototype.getThreatSignals = function () {
        return Array.from(this.threatSignals.values());
    };
    AdvancedSignalProcessor.prototype.getMemorySignals = function () {
        return Array.from(this.memorySignals.values());
    };
    AdvancedSignalProcessor.prototype.getSocialSignals = function () {
        return Array.from(this.socialSignals.values());
    };
    AdvancedSignalProcessor.prototype.getSignalPatterns = function () {
        return Array.from(this.signalPatterns.values());
    };
    AdvancedSignalProcessor.prototype.getFusionHistory = function () {
        return __spreadArray([], this.fusionHistory, true);
    };
    AdvancedSignalProcessor.prototype.getStats = function () {
        return {
            totalSignals: this.signals.size,
            fusedSignals: this.fusedSignals.size,
            threatSignals: this.threatSignals.size,
            memorySignals: this.memorySignals.size,
            socialSignals: this.socialSignals.size,
            patterns: this.signalPatterns.size,
            fusionHistory: this.fusionHistory.length,
        };
    };
    return AdvancedSignalProcessor;
}(events_1.EventEmitter));
exports.AdvancedSignalProcessor = AdvancedSignalProcessor;
// ============================================================================
// Helper Classes
// ============================================================================
var PatternRecognizer = /** @class */ (function () {
    function PatternRecognizer() {
    }
    PatternRecognizer.prototype.detectPatterns = function (signals) {
        return __awaiter(this, void 0, void 0, function () {
            var patterns, signalGroups, _i, _a, _b, type, typeSignals, frequency;
            return __generator(this, function (_c) {
                patterns = [];
                signalGroups = this.groupSignalsByType(signals);
                for (_i = 0, _a = Array.from(signalGroups.entries()); _i < _a.length; _i++) {
                    _b = _a[_i], type = _b[0], typeSignals = _b[1];
                    frequency = this.calculateFrequency(typeSignals);
                    if (frequency > 0.1) {
                        // More than 1 signal per 10 minutes
                        patterns.push({
                            id: (0, uuid_1.v4)(),
                            name: "".concat(type, "_pattern"),
                            description: "Frequent ".concat(type, " signals"),
                            signals: typeSignals.map(function (s) { return s.id; }),
                            frequency: frequency,
                            confidence: 0.7,
                            significance: frequency * 0.8,
                            lastSeen: Math.max.apply(Math, typeSignals.map(function (s) { return s.timestamp; })),
                            firstSeen: Math.min.apply(Math, typeSignals.map(function (s) { return s.timestamp; })),
                            duration: this.calculateAverageDuration(typeSignals),
                        });
                    }
                }
                return [2 /*return*/, patterns];
            });
        });
    };
    PatternRecognizer.prototype.groupSignalsByType = function (signals) {
        var groups = new Map();
        for (var _i = 0, signals_12 = signals; _i < signals_12.length; _i++) {
            var signal = signals_12[_i];
            if (!groups.has(signal.type)) {
                groups.set(signal.type, []);
            }
            groups.get(signal.type).push(signal);
        }
        return groups;
    };
    PatternRecognizer.prototype.calculateFrequency = function (signals) {
        if (signals.length < 2)
            return 0;
        var timeSpan = Math.max.apply(Math, signals.map(function (s) { return s.timestamp; })) - Math.min.apply(Math, signals.map(function (s) { return s.timestamp; }));
        return signals.length / (timeSpan / 60000); // signals per minute
    };
    PatternRecognizer.prototype.calculateAverageDuration = function (signals) {
        return (signals.reduce(function (sum, s) { return sum + s.data.duration; }, 0) / signals.length);
    };
    return PatternRecognizer;
}());
var ThreatDetector = /** @class */ (function () {
    function ThreatDetector() {
    }
    ThreatDetector.prototype.process = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var enhancedSignal;
            return __generator(this, function (_a) {
                enhancedSignal = __assign({}, signal);
                // Adjust threat level based on signal characteristics
                if (signal.data.intensity > 0.8) {
                    enhancedSignal.threatLevel = ThreatLevel.HIGH;
                }
                else if (signal.data.intensity > 0.5) {
                    enhancedSignal.threatLevel = ThreatLevel.MEDIUM;
                }
                // Set response urgency based on threat level and urgency
                enhancedSignal.responseUrgency =
                    (signal.threatLevel === ThreatLevel.CRITICAL ? 1 : 0.5) * signal.urgency;
                return [2 /*return*/, enhancedSignal];
            });
        });
    };
    ThreatDetector.prototype.assessThreats = function (signals) {
        return __awaiter(this, void 0, void 0, function () {
            var overallThreat, responsePriority;
            return __generator(this, function (_a) {
                overallThreat = signals.reduce(function (sum, s) { return sum + s.data.intensity; }, 0) / signals.length;
                responsePriority = Math.max.apply(Math, signals.map(function (s) { return s.responseUrgency; }));
                return [2 /*return*/, {
                        overallThreat: overallThreat,
                        threatSignals: signals,
                        threatPatterns: [],
                        mitigationStrategies: this.generateMitigationStrategies(signals),
                        responsePriority: responsePriority,
                        confidence: signals.reduce(function (sum, s) { return sum + s.confidence; }, 0) / signals.length,
                    }];
            });
        });
    };
    ThreatDetector.prototype.generateMitigationStrategies = function (signals) {
        var strategies = [];
        for (var _i = 0, signals_13 = signals; _i < signals_13.length; _i++) {
            var signal = signals_13[_i];
            strategies.push({
                id: (0, uuid_1.v4)(),
                name: "Mitigate ".concat(signal.threatType),
                description: "Mitigation strategy for ".concat(signal.threatType, " threat"),
                threatTypes: [signal.threatType],
                effectiveness: 0.8,
                cost: 0.3,
                timeRequired: 5000, // 5 seconds
                prerequisites: [],
                sideEffects: ['Temporary performance impact'],
            });
        }
        return strategies;
    };
    return ThreatDetector;
}());
var MemoryIntegrator = /** @class */ (function () {
    function MemoryIntegrator() {
    }
    MemoryIntegrator.prototype.process = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var age, decayFactor;
            return __generator(this, function (_a) {
                age = Date.now() - signal.timestamp;
                decayFactor = Math.pow(0.95, age / 60000);
                return [2 /*return*/, __assign(__assign({}, signal), { recallStrength: signal.recallStrength * decayFactor, emotionalImpact: signal.emotionalImpact * decayFactor })];
            });
        });
    };
    return MemoryIntegrator;
}());
var SocialProcessor = /** @class */ (function () {
    function SocialProcessor() {
    }
    SocialProcessor.prototype.process = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var enhancedSignal;
            return __generator(this, function (_a) {
                enhancedSignal = __assign({}, signal);
                // Adjust trust level based on communication intent
                if (signal.communicationIntent === CommunicationIntent.FRIENDLY) {
                    enhancedSignal.trustLevel = Math.min(1, signal.trustLevel + 0.1);
                }
                else if (signal.communicationIntent === CommunicationIntent.HOSTILE) {
                    enhancedSignal.trustLevel = Math.max(0, signal.trustLevel - 0.2);
                }
                return [2 /*return*/, enhancedSignal];
            });
        });
    };
    return SocialProcessor;
}());
