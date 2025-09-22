"use strict";
/**
 * Ollama LLM Client
 *
 * Minimal client for local Ollama server. Supports /api/generate and
 * OpenAI-compatible /v1/chat/completions when OLLAMA_OPENAI=truish.
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
exports.OllamaClient = void 0;
var OllamaClient = /** @class */ (function () {
    function OllamaClient(cfg) {
        if (cfg === void 0) { cfg = {}; }
        var _a, _b, _c;
        this.baseUrl = cfg.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.model = cfg.model || process.env.OLLAMA_MODEL || 'llama3.1';
        var flag = (process.env.OLLAMA_OPENAI || '').toLowerCase();
        this.useOpenAI = (_a = cfg.useOpenAICompat) !== null && _a !== void 0 ? _a : (flag === '1' || flag === 'true');
        this.apiKey = cfg.apiKey || process.env.OLLAMA_API_KEY;
        this.temperature = (_b = cfg.defaultTemperature) !== null && _b !== void 0 ? _b : 0.2;
        this.timeoutMs = (_c = cfg.timeoutMs) !== null && _c !== void 0 ? _c : 20000;
    }
    OllamaClient.prototype.generate = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.useOpenAI
                        ? this.generateOpenAI(options)
                        : this.generateOllama(options)];
            });
        });
    };
    OllamaClient.prototype.generateOllama = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var controller, t, body, res, txt, json;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        controller = new AbortController();
                        t = setTimeout(function () { return controller.abort(); }, this.timeoutMs);
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, , 6, 7]);
                        body = {
                            model: this.model,
                            prompt: options.system ? "".concat(options.system, "\n\n").concat(options.prompt) : options.prompt,
                            stream: false,
                            options: {
                                temperature: (_a = options.temperature) !== null && _a !== void 0 ? _a : this.temperature,
                                num_predict: (_b = options.maxTokens) !== null && _b !== void 0 ? _b : undefined,
                                stop: options.stop,
                            },
                        };
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/api/generate"), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body),
                                signal: controller.signal,
                            })];
                    case 2:
                        res = _d.sent();
                        if (!!res.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, res.text().catch(function () { return ''; })];
                    case 3:
                        txt = _d.sent();
                        throw new Error("Ollama /api/generate HTTP ".concat(res.status, ": ").concat(txt));
                    case 4: return [4 /*yield*/, res.json()];
                    case 5:
                        json = (_d.sent());
                        if (typeof (json === null || json === void 0 ? void 0 : json.response) === 'string')
                            return [2 /*return*/, json.response];
                        if (Array.isArray(json) && typeof ((_c = json[0]) === null || _c === void 0 ? void 0 : _c.response) === 'string')
                            return [2 /*return*/, json[0].response];
                        return [2 /*return*/, JSON.stringify(json)];
                    case 6:
                        clearTimeout(t);
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    OllamaClient.prototype.generateOpenAI = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var controller, t, body, headers, res, txt, json, msg;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        controller = new AbortController();
                        t = setTimeout(function () { return controller.abort(); }, this.timeoutMs);
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, , 6, 7]);
                        body = {
                            model: this.model,
                            messages: [
                                options.system ? { role: 'system', content: options.system } : null,
                                { role: 'user', content: options.prompt },
                            ].filter(Boolean),
                            temperature: (_a = options.temperature) !== null && _a !== void 0 ? _a : this.temperature,
                            stop: options.stop,
                            max_tokens: options.maxTokens,
                            stream: false,
                        };
                        headers = { 'Content-Type': 'application/json' };
                        if (this.apiKey)
                            headers['Authorization'] = "Bearer ".concat(this.apiKey);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/v1/chat/completions"), {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify(body),
                                signal: controller.signal,
                            })];
                    case 2:
                        res = _e.sent();
                        if (!!res.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, res.text().catch(function () { return ''; })];
                    case 3:
                        txt = _e.sent();
                        throw new Error("Ollama /v1/chat/completions HTTP ".concat(res.status, ": ").concat(txt));
                    case 4: return [4 /*yield*/, res.json()];
                    case 5:
                        json = (_e.sent());
                        msg = (_d = (_c = (_b = json === null || json === void 0 ? void 0 : json.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content;
                        if (typeof msg === 'string')
                            return [2 /*return*/, msg];
                        return [2 /*return*/, JSON.stringify(json)];
                    case 6:
                        clearTimeout(t);
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    return OllamaClient;
}());
exports.OllamaClient = OllamaClient;
