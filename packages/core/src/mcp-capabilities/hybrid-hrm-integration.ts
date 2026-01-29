#!/usr/bin/env tsx

/**
 * Hybrid HRM Integration
 *
 * Implements the documented three-system architecture:
 * - LLM: Language/narrative/social reasoning
 * - Python HRM: Structured and quick logistical reasoning (27M parameters)
 * - GOAP: Quick reactive responses (combat, survival, emergencies)
 */

import { LeafContext } from './leaf-contracts';

const HOSTILE_ENTITY_NAMES = new Set<string>([
  'zombie',
  'husk',
  'drowned',
  'skeleton',
  'wither_skeleton',
  'creeper',
  'spider',
  'cave_spider',
  'witch',
  'enderman',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'phantom',
  'blaze',
  'ghast',
  'guardian',
  'elder_guardian',
  'piglin_brute',
  'hoglin',
  'zoglin',
  'warden',
]);

const HOSTILE_ALERT_DISTANCE = 12;
const HOSTILE_DANGER_DISTANCE = 6;
const HOSTILE_NORMALIZATION_DISTANCE = 16;
const NEARBY_PLAYER_DISTANCE = 8;
const LOW_HEALTH_THRESHOLD = 8;
const LOW_FOOD_THRESHOLD = 6;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHostileEntity(entity: any): boolean {
  if (!entity) {
    return false;
  }
  const kind = typeof entity.kind === 'string' ? entity.kind.toLowerCase() : '';
  if (kind.includes('hostile')) {
    return true;
  }
  const name = (entity.displayName || entity.name || '').toLowerCase();
  return HOSTILE_ENTITY_NAMES.has(name);
}

function distanceBetweenPositions(a: any, b: any): number | null {
  if (!a || !b) {
    return null;
  }
  if (typeof a.distanceTo === 'function') {
    const dist = a.distanceTo(b);
    return isFiniteNumber(dist) ? dist : null;
  }
  if (
    isFiniteNumber(a.x) &&
    isFiniteNumber(a.y) &&
    isFiniteNumber(a.z) &&
    isFiniteNumber(b.x) &&
    isFiniteNumber(b.y) &&
    isFiniteNumber(b.z)
  ) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return null;
}

// Python HRM interface types
export interface PythonHRMConfig {
  modelPath: string;
  device: 'cpu' | 'cuda' | 'mps';
  maxSteps: number;
  confidenceThreshold: number;
}

export interface PythonHRMInput {
  task: string;
  context: Record<string, any>;
  constraints?: Record<string, any>;
  objective?: string;
}

export interface PythonHRMOutput {
  solution: any;
  confidence: number;
  reasoningSteps: number;
  executionTime: number;
  error?: string;
}

export interface PythonHRMInterface {
  initialize(): Promise<boolean>;
  infer(input: PythonHRMInput): Promise<PythonHRMOutput>;
  isAvailable(): boolean;
}

// LLM interface for language/narrative reasoning
export interface LLMConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeout?: number; // Timeout in milliseconds
}

export interface LLMInput {
  prompt: string;
  context: Record<string, any>;
  systemMessage?: string;
}

export interface LLMOutput {
  response: string;
  confidence: number;
  executionTime: number;
  error?: string;
}

export interface LLMInterface {
  generate(input: LLMInput): Promise<LLMOutput>;
  isAvailable(): boolean;
}

// GOAP interface for reactive responses
export interface GOAPInput {
  goal: string;
  context: Record<string, any>;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
}

export interface GOAPOutput {
  actions: string[];
  confidence: number;
  executionTime: number;
  error?: string;
}

export interface GOAPInterface {
  plan(input: GOAPInput): Promise<GOAPOutput>;
  isAvailable(): boolean;
}

// Task classification for routing
export interface TaskSignature {
  structuredReasoning: number; // 0-1 score
  narrativeReasoning: number; // 0-1 score
  reactiveResponse: number; // 0-1 score
  complexity: number; // 0-1 score
  timeCritical: boolean;
  safetyCritical: boolean;
}

// Hybrid reasoning result
export interface HybridReasoningResult {
  primarySystem: 'python-hrm' | 'llm' | 'goap';
  result: any;
  confidence: number;
  reasoningTrace: string[];
  executionTime: number;
  fallbackUsed: boolean;
  collaboration?: {
    pythonHRM?: PythonHRMOutput;
    llm?: LLMOutput;
    goap?: GOAPOutput;
    consensus: 'agreement' | 'disagreement' | 'complementary';
  };
}

/**
 * Hybrid HRM Router
 *
 * Routes tasks to the most appropriate reasoning system according to our documented architecture:
 * - Python HRM: Structured and quick logistical reasoning (puzzles, optimization, pathfinding)
 * - LLM: Language/narrative/social reasoning (explanations, creative tasks, social interaction)
 * - GOAP: Quick reactive responses (combat, survival, emergency responses)
 */
export class HybridHRMRouter {
  private pythonHRM: PythonHRMInterface;
  private llm: LLMInterface;
  private goap: GOAPInterface;
  private isInitialized = false;

  constructor(
    pythonHRMConfig: PythonHRMConfig,
    llmConfig?: LLMConfig,
    goapConfig?: any
  ) {
    this.pythonHRM = this.createPythonHRMInterface(pythonHRMConfig);
    this.llm = this.createLLMInterface(llmConfig);
    this.goap = this.createGOAPInterface(goapConfig);
  }

  /**
   * Initialize all three reasoning systems
   */
  async initialize(): Promise<boolean> {
    console.log('🧠 Initializing Hybrid HRM System...');

    try {
      // Initialize Python HRM
      const pythonHRMAvailable = await this.pythonHRM.initialize();
      if (!pythonHRMAvailable) {
        console.warn(
          '⚠️ Python HRM not available, falling back to LLM-only mode'
        );
      }

      // Initialize LLM
      const llmAvailable = this.llm.isAvailable();
      if (!llmAvailable) {
        console.warn('⚠️ LLM not available, falling back to GOAP-only mode');
      }

      // Initialize GOAP
      const goapAvailable = this.goap.isAvailable();
      if (!goapAvailable) {
        console.warn('⚠️ GOAP not available, system may be limited');
      }

      this.isInitialized = true;
      console.log('✅ Hybrid HRM System initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Hybrid HRM System:', error);
      return false;
    }
  }

  /**
   * Route and execute reasoning task according to documented architecture
   */
  async reason(
    task: string,
    context: LeafContext,
    budget: { maxTimeMs: number; maxComplexity: number }
  ): Promise<HybridReasoningResult> {
    if (!this.isInitialized) {
      throw new Error('Hybrid HRM System not initialized');
    }

    const startTime = performance.now();
    const taskSignature = this.analyzeTaskSignature(task, context);

    // Debug logging
    console.log(`🔍 Task: "${task}"`);
    console.log(`📊 Signature:`, {
      structured: taskSignature.structuredReasoning.toFixed(2),
      narrative: taskSignature.narrativeReasoning.toFixed(2),
      reactive: taskSignature.reactiveResponse.toFixed(2),
      complexity: taskSignature.complexity.toFixed(2),
      timeCritical: taskSignature.timeCritical,
      safetyCritical: taskSignature.safetyCritical,
    });

    // Route to appropriate system based on documented architecture
    if (this.shouldUseGOAP(taskSignature)) {
      console.log(`⚡ Routing to GOAP (reactive response)`);
      return this.executeGOAP(task, context, budget);
    } else if (this.shouldUsePythonHRM(taskSignature)) {
      console.log(`🧠 Routing to Python HRM (structured reasoning)`);
      return this.executePythonHRM(task, context, budget);
    } else if (this.shouldUseLLM(taskSignature)) {
      console.log(`💬 Routing to LLM (language/narrative)`);
      return this.executeLLM(task, context);
    }
    console.log(`⚡ Routing to GOAP (fallback)`);
    return this.executeGOAP(task, context, budget);
  }

  /**
   * Analyze task to determine optimal routing
   */
  private analyzeTaskSignature(
    task: string,
    context: LeafContext
  ): TaskSignature {
    const bot = context?.bot;
    let reactiveFromContext = 0;
    let timeCriticalFromContext = false;
    let safetyCriticalFromContext = false;
    let playersNearby = false;

    if (bot) {
      const health = bot.health;
      if (isFiniteNumber(health) && health < LOW_HEALTH_THRESHOLD) {
        reactiveFromContext = Math.max(reactiveFromContext, 0.7);
        timeCriticalFromContext = true;
        safetyCriticalFromContext = true;
      }

      const food = bot.food;
      if (isFiniteNumber(food) && food < LOW_FOOD_THRESHOLD) {
        reactiveFromContext = Math.max(reactiveFromContext, 0.5);
        timeCriticalFromContext = true;
      }

      const selfEntity = bot.entity;
      const botPosition = selfEntity?.position;

      if (botPosition) {
        let nearestHostile = Number.POSITIVE_INFINITY;

        const entities = bot.entities ?? {};
        for (const entity of Object.values(entities)) {
          if (!entity || entity === selfEntity) {
            continue;
          }
          if (!isHostileEntity(entity)) {
            continue;
          }
          const distance = distanceBetweenPositions(
            entity.position,
            botPosition
          );
          if (distance === null) {
            continue;
          }
          if (distance < nearestHostile) {
            nearestHostile = distance;
          }
        }

        if (nearestHostile !== Number.POSITIVE_INFINITY) {
          const normalizedThreat = Math.min(
            1,
            Math.max(0, 1 - nearestHostile / HOSTILE_NORMALIZATION_DISTANCE)
          );
          reactiveFromContext = Math.max(reactiveFromContext, normalizedThreat);
          if (nearestHostile <= HOSTILE_ALERT_DISTANCE) {
            timeCriticalFromContext = true;
          }
          if (nearestHostile <= HOSTILE_DANGER_DISTANCE) {
            safetyCriticalFromContext = true;
          }
        }

        const players = bot.players ?? {};
        for (const player of Object.values(players)) {
          const entity = player?.entity;
          if (!entity || entity === selfEntity) {
            continue;
          }
          const distance = distanceBetweenPositions(
            entity.position,
            botPosition
          );
          if (distance !== null && distance <= NEARBY_PLAYER_DISTANCE) {
            playersNearby = true;
            break;
          }
        }
      }
    }

    const signature: TaskSignature = {
      structuredReasoning: 0,
      narrativeReasoning: 0,
      reactiveResponse: reactiveFromContext,
      complexity: 0,
      timeCritical: timeCriticalFromContext,
      safetyCritical: safetyCriticalFromContext,
    };

    const taskLower = task.toLowerCase();

    // Structured reasoning indicators (Python HRM domain)
    const structuredKeywords = [
      'puzzle',
      'solve',
      'optimize',
      'path',
      'route',
      'algorithm',
      'calculate',
      'compute',
      'find',
      'determine',
      'figure out',
      'sudoku',
      'maze',
      'logic',
      'constraint',
      'satisfaction',
      'planning',
      'strategy',
      'efficiency',
      'minimize',
      'maximize',
    ];

    const structuredMatches = structuredKeywords.filter((keyword) =>
      taskLower.includes(keyword)
    ).length;
    signature.structuredReasoning = Math.max(
      signature.structuredReasoning,
      Math.min(structuredMatches / 3, 1)
    );

    // Narrative reasoning indicators (LLM domain)
    const narrativeKeywords = [
      'explain',
      'describe',
      'story',
      'narrative',
      'creative',
      'imagine',
      'social',
      'interaction',
      'conversation',
      'dialogue',
      'interpret',
      'meaning',
      'context',
      'relationship',
      'emotion',
      'feeling',
      'opinion',
      'perspective',
      'analysis',
      'reflection',
    ];

    const narrativeMatches = narrativeKeywords.filter((keyword) =>
      taskLower.includes(keyword)
    ).length;
    signature.narrativeReasoning = Math.max(
      signature.narrativeReasoning,
      Math.min(narrativeMatches / 3, 1)
    );

    if (playersNearby) {
      signature.narrativeReasoning = Math.min(
        1,
        signature.narrativeReasoning + 0.3
      );
    }

    // Reactive response indicators (GOAP domain)
    const reactiveKeywords = [
      'attack',
      'defend',
      'escape',
      'flee',
      'survive',
      'eat',
      'drink',
      'heal',
      'block',
      'dodge',
      'evade',
      'protect',
      'guard',
      'alert',
      'danger',
      'threat',
      'emergency',
      'urgent',
      'immediate',
      'quick',
      'fast',
      'reflex',
      'reaction',
    ];

    const reactiveMatches = reactiveKeywords.filter((keyword) =>
      taskLower.includes(keyword)
    ).length;
    signature.reactiveResponse = Math.max(
      signature.reactiveResponse,
      Math.min(reactiveMatches / 3, 1)
    );

    // Complexity assessment
    const wordCount = task.split(' ').length;
    signature.complexity = Math.min(wordCount / 20, 1);

    // Time and safety criticality
    signature.timeCritical =
      signature.timeCritical ||
      taskLower.includes('urgent') ||
      taskLower.includes('emergency') ||
      taskLower.includes('immediate') ||
      taskLower.includes('quick') ||
      taskLower.includes('fast');

    signature.safetyCritical =
      signature.safetyCritical ||
      taskLower.includes('danger') ||
      taskLower.includes('threat') ||
      taskLower.includes('attack') ||
      taskLower.includes('survive') ||
      taskLower.includes('protect');

    return signature;
  }

  /**
   * Determine if task should use GOAP (reactive responses)
   */
  private shouldUseGOAP(signature: TaskSignature): boolean {
    return (
      signature.reactiveResponse > 0.4 ||
      signature.timeCritical ||
      signature.safetyCritical ||
      this.isSimpleSignal(signature)
    );
  }

  /**
   * Determine if task should use Python HRM (structured reasoning)
   */
  private shouldUsePythonHRM(signature: TaskSignature): boolean {
    return (
      signature.structuredReasoning > 0.3 &&
      signature.complexity > 0.1 &&
      !signature.timeCritical &&
      this.pythonHRM.isAvailable()
    );
  }

  /**
   * Determine if task should use LLM (language/narrative)
   */
  private shouldUseLLM(signature: TaskSignature): boolean {
    return (
      signature.narrativeReasoning > 0.3 ||
      (signature.structuredReasoning < 0.2 && signature.complexity > 0.1) ||
      this.llm.isAvailable()
    );
  }

  /**
   * Check if task is a simple signal that should go to GOAP
   */
  private isSimpleSignal(signature: TaskSignature): boolean {
    const simpleSignals = [
      'threatProximity',
      'health',
      'hunger',
      'fatigue',
      'playerNearby',
      'isolationTime',
      'toolDeficit',
      'questBacklog',
      'lightLevel',
      'weather',
      'timeOfDay',
      'biome',
      'position',
    ];

    return simpleSignals.some((signal) => {
      console.log(`TODO: Use ${signal} to analyse signal`);
      return signature.reactiveResponse > 0.2 || signature.timeCritical;
    });
  }

  /**
   * Execute task using GOAP (reactive responses)
   */
  private async executeGOAP(
    task: string,
    context: LeafContext,
    budget: { maxTimeMs: number; maxComplexity: number }
  ): Promise<HybridReasoningResult> {
    const startTime = performance.now();

    try {
      const result = await this.goap.plan({
        goal: task,
        context: {
          position: context.bot.entity?.position,
          health: context.bot.health,
          hunger: context.bot.food,
          inventory: await context.inventory(),
        },
        urgency: this.determineUrgency(task),
      });

      return {
        primarySystem: 'goap',
        result: result.actions,
        confidence: result.confidence,
        reasoningTrace: [`GOAP planned ${result.actions.length} actions`],
        executionTime: performance.now() - startTime,
        fallbackUsed: false,
      };
    } catch (error) {
      console.error('❌ GOAP execution failed:', error);
      return {
        primarySystem: 'goap',
        result: null,
        confidence: 0,
        reasoningTrace: [`GOAP failed: ${error}`],
        executionTime: performance.now() - startTime,
        fallbackUsed: true,
      };
    }
  }

  /**
   * Execute task using Python HRM (structured reasoning)
   */
  private async executePythonHRM(
    task: string,
    context: LeafContext,
    budget: { maxTimeMs: number; maxComplexity: number }
  ): Promise<HybridReasoningResult> {
    const startTime = performance.now();

    try {
      const result = await this.pythonHRM.infer({
        task,
        context: {
          position: context.bot.entity?.position,
          inventory: context.bot.inventory?.items?.() || [],
          worldState: {
            health: context.bot.health || 20,
            food: context.bot.food || 20,
            timeOfDay: context.bot.time?.timeOfDay || 6000,
            lightLevel: 15, // Default
          },
        },
        constraints: {
          maxTime: budget.maxTimeMs,
          maxComplexity: budget.maxComplexity,
        },
      });

      return {
        primarySystem: 'python-hrm',
        result: result.solution,
        confidence: result.confidence,
        reasoningTrace: [
          `Python HRM completed in ${result.reasoningSteps} steps`,
        ],
        executionTime: performance.now() - startTime,
        fallbackUsed: false,
      };
    } catch (error) {
      console.error('❌ Python HRM execution failed:', error);
      return {
        primarySystem: 'python-hrm',
        result: null,
        confidence: 0,
        reasoningTrace: [`Python HRM failed: ${error}`],
        executionTime: performance.now() - startTime,
        fallbackUsed: true,
      };
    }
  }

  /**
   * Execute LLM reasoning
   */
  private async executeLLM(
    task: string,
    context: LeafContext
  ): Promise<HybridReasoningResult> {
    const startTime = performance.now();

    try {
      // Safely extract context information with fallbacks
      const safeContext = {
        position: context.bot?.entity?.position || { x: 0, y: 64, z: 0 },
        inventory: context.bot?.inventory?.items?.() || [],
        worldState: {
          health: context.bot?.health || 20,
          food: context.bot?.food || 20,
          timeOfDay: context.bot?.time?.timeOfDay || 6000,
          lightLevel: 15, // Default
        },
      };

      const result = await this.llm.generate({
        prompt: task,
        context: safeContext,
        systemMessage:
          'Given the current environment state, provide clear and actionable guidance.',
      });

      return {
        primarySystem: 'llm',
        result: result.response,
        confidence: result.confidence,
        reasoningTrace: [`LLM generated response in ${result.executionTime}ms`],
        executionTime: performance.now() - startTime,
        fallbackUsed: false,
      };
    } catch (error) {
      console.error('❌ LLM execution failed:', error);
      return {
        primarySystem: 'llm',
        result: null,
        confidence: 0,
        reasoningTrace: [`LLM failed: ${error}`],
        executionTime: performance.now() - startTime,
        fallbackUsed: true,
      };
    }
  }

  /**
   * Determine urgency level for GOAP
   */
  private determineUrgency(
    task: string
  ): 'low' | 'medium' | 'high' | 'emergency' {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('emergency') || taskLower.includes('attack')) {
      return 'emergency';
    }
    if (taskLower.includes('urgent') || taskLower.includes('danger')) {
      return 'high';
    }
    if (taskLower.includes('quick') || taskLower.includes('fast')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Create Python HRM interface
   */
  private createPythonHRMInterface(
    config: PythonHRMConfig
  ): PythonHRMInterface {
    return {
      async initialize(): Promise<boolean> {
        try {
          // First check if the server is running
          const healthResponse = await fetch('http://localhost:5001/health');
          if (!healthResponse.ok) {
            console.warn(
              'Python HRM health check failed:',
              healthResponse.statusText
            );
            return false;
          }

          const health = (await healthResponse.json()) as {
            hrm_available: boolean;
            model_initialized: boolean;
          };

          // If the model is initialized, consider it available even if hrm_available is false
          if (health.model_initialized) {
            console.log('✅ Python HRM model is initialized and available');
            return true;
          }

          // Fallback: try a simple inference to test if it works
          try {
            const testResponse = await fetch('http://localhost:5001/infer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task: 'test',
                context: {},
              }),
            });

            if (testResponse.ok) {
              console.log('✅ Python HRM inference test successful');
              return true;
            }
          } catch (inferenceError) {
            console.warn('Python HRM inference test failed:', inferenceError);
          }

          return false;
        } catch (error) {
          console.warn('Python HRM bridge not available:', error);
          return false;
        }
      },

      async infer(input: PythonHRMInput): Promise<PythonHRMOutput> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        try {
          const response = await fetch('http://localhost:5001/infer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Python HRM inference failed: ${response.statusText}`
            );
          }

          return (await response.json()) as PythonHRMOutput;
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Python HRM request timed out');
          }
          throw error;
        }
      },

      isAvailable(): boolean {
        // This would need to be implemented with proper health checking
        return true;
      },
    };
  }

  /**
   * Create LLM interface
   */
  private createLLMInterface(config?: LLMConfig): LLMInterface {
    // Use real Ollama API based on benchmark results
    return {
      async generate(input: LLMInput): Promise<LLMOutput> {
        const startTime = performance.now();
        const timeout = config?.timeout || 5000; // 5 second timeout
        let timeoutId: NodeJS.Timeout | undefined;

        try {
          // Create AbortController for timeout
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(`${process.env.OLLAMA_HOST || 'http://localhost:5002'}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config?.model || 'gemma3n:e2b',
              prompt: `Minecraft: ${input.prompt}. Give a brief action plan in 1 sentence.`,
              stream: false,
              options: {
                temperature: config?.temperature || 0.3, // Lower temperature for more focused responses
                top_p: 0.9,
                max_tokens: config?.maxTokens || 50, // Much shorter responses
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          const executionTime = performance.now() - startTime;

          return {
            response: (result as any).response,
            confidence: 0.8, // Based on benchmark success rate
            executionTime,
          };
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          const executionTime = performance.now() - startTime;

          if (error instanceof Error && error.name === 'AbortError') {
            return {
              response: 'LLM request timed out',
              confidence: 0.0,
              executionTime,
              error: 'timeout',
            };
          }

          return {
            response: `Error: ${error instanceof Error ? error.message : String(error)}`,
            confidence: 0.0,
            executionTime,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },

      isAvailable(): boolean {
        // Check if Ollama is running
        return true; // We'll handle errors in generate()
      },
    };
  }

  /**
   * Create GOAP interface
   */
  private createGOAPInterface(config?: any): GOAPInterface {
    // This would integrate with our existing GOAP system
    return {
      async plan(input: GOAPInput): Promise<GOAPOutput> {
        // Placeholder - would integrate with actual GOAP
        return {
          actions: [`GOAP action for: ${input.goal}`],
          confidence: 0.9,
          executionTime: 10,
        };
      },

      isAvailable(): boolean {
        return true;
      },
    };
  }
}
