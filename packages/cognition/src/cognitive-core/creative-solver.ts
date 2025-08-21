/**
 * Creative problem solving system.
 *
 * Provides analogical reasoning, constraint relaxation, and innovative
 * solution generation capabilities for complex problem-solving.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from './llm-interface';
import {
  Problem,
  Solution,
  Constraint,
  Domain,
  AnalogicalSolution,
  RelaxedSolution,
  NoveltyScore,
  CreativeSolution,
  ReasoningChain,
  Alternative,
} from '../types';

/**
 * Configuration for creative problem solving
 */
export interface CreativeSolverConfig {
  maxAnalogies: number;
  maxAlternatives: number;
  noveltyThreshold: number;
  constraintRelaxationLevels: number;
  enableCrossDomainReasoning: boolean;
  enableConstraintRelaxation: boolean;
  enableNoveltyEvaluation: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CreativeSolverConfig = {
  maxAnalogies: 5,
  maxAlternatives: 10,
  noveltyThreshold: 0.7,
  constraintRelaxationLevels: 3,
  enableCrossDomainReasoning: true,
  enableConstraintRelaxation: true,
  enableNoveltyEvaluation: true,
};

/**
 * Creative problem solver with analogical reasoning
 */
export class CreativeProblemSolver {
  private llm: LLMInterface;
  private config: CreativeSolverConfig;
  private solutionHistory: Solution[] = [];
  private domainKnowledge: Map<string, Domain> = new Map();

  constructor(llm: LLMInterface, config: Partial<CreativeSolverConfig> = {}) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDomainKnowledge();
  }

  /**
   * Generate creative solutions using multiple approaches
   */
  async generateCreativeSolutions(
    problem: Problem,
    constraints: Constraint[] = []
  ): Promise<CreativeSolution[]> {
    const solutions: CreativeSolution[] = [];

    // Generate analogical solutions
    if (this.config.enableCrossDomainReasoning) {
      const analogicalSolutions = await this.generateAnalogicalSolutions(
        problem,
        constraints
      );
      solutions.push(...analogicalSolutions);
    }

    // Generate constraint-relaxed solutions
    if (this.config.enableConstraintRelaxation) {
      const relaxedSolutions = await this.exploreConstraintRelaxation(
        problem,
        constraints
      );
      solutions.push(...relaxedSolutions);
    }

    // Generate alternative approaches
    const alternativeSolutions = await this.generateAlternativeApproaches(
      problem,
      constraints
    );
    solutions.push(...alternativeSolutions);

    // Evaluate novelty and filter
    if (this.config.enableNoveltyEvaluation) {
      const evaluatedSolutions = await Promise.all(
        solutions.map(async (solution) => {
          const noveltyScore = await this.evaluateSolutionNovelty(
            solution,
            problem
          );
          return { ...solution, noveltyScore };
        })
      );

      // Filter by novelty threshold and sort by score
      return evaluatedSolutions
        .filter(
          (solution) =>
            solution.noveltyScore.score >= this.config.noveltyThreshold
        )
        .sort((a, b) => b.noveltyScore.score - a.noveltyScore.score)
        .slice(0, this.config.maxAlternatives);
    }

    return solutions.slice(0, this.config.maxAlternatives);
  }

  /**
   * Generate solutions using analogical reasoning from other domains
   */
  async generateAnalogicalSolutions(
    problem: Problem,
    constraints: Constraint[]
  ): Promise<AnalogicalSolution[]> {
    const analogies: AnalogicalSolution[] = [];
    const domains = Array.from(this.domainKnowledge.values());

    for (const domain of domains.slice(0, this.config.maxAnalogies)) {
      try {
        const analogy = await this.findDomainAnalogy(problem, domain);
        if (analogy) {
          analogies.push(analogy);
        }
      } catch (error) {
        console.error(
          `Error generating analogy for domain ${domain.name}:`,
          error
        );
      }
    }

    return analogies;
  }

  /**
   * Find analogical solution in a specific domain
   */
  private async findDomainAnalogy(
    problem: Problem,
    domain: Domain
  ): Promise<AnalogicalSolution | null> {
    const prompt = this.buildAnalogyPrompt(problem, domain);

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt: `You are an expert in creative problem solving using analogical reasoning. 
        Find relevant analogies from the specified domain that could help solve the given problem.
        Provide specific, actionable solutions based on the analogy.`,
        temperature: 0.8,
        maxTokens: 1024,
      });

      const analogy = this.parseAnalogyResponse(response.text, domain);
      return analogy;
    } catch (error) {
      console.error('Error finding domain analogy:', error);
      return null;
    }
  }

  /**
   * Build prompt for analogical reasoning
   */
  private buildAnalogyPrompt(problem: Problem, domain: Domain): string {
    return `Problem: ${problem.description}
Problem Type: ${problem.type}
Constraints: ${problem.constraints.join(', ')}

Domain: ${domain.name}
Domain Description: ${domain.description}
Domain Principles: ${domain.principles.join(', ')}
Domain Examples: ${domain.examples.join(', ')}

Find an analogy from ${domain.name} that could help solve this problem. 
Consider how principles, methods, or approaches from ${domain.name} could be applied.

Provide:
1. The specific analogy from ${domain.name}
2. How it relates to the problem
3. A concrete solution based on this analogy
4. Potential benefits and risks
5. Implementation steps`;
  }

  /**
   * Parse analogy response from LLM
   */
  private parseAnalogyResponse(
    response: string,
    domain: Domain
  ): AnalogicalSolution {
    // Simple parsing - in a real implementation, this would be more sophisticated
    const lines = response.split('\n');
    const analogy =
      lines.find(
        (line) => line.includes('analogy') || line.includes('similar')
      ) || '';
    const solution =
      lines.find(
        (line) => line.includes('solution') || line.includes('approach')
      ) || '';

    return {
      id: `analogy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceDomain: domain.name,
      analogy: analogy.trim(),
      solution: solution.trim(),
      confidence: 0.7,
      reasoning: response,
      timestamp: Date.now(),
    };
  }

  /**
   * Explore solutions by relaxing constraints
   */
  async exploreConstraintRelaxation(
    problem: Problem,
    constraints: Constraint[]
  ): Promise<RelaxedSolution[]> {
    const relaxedSolutions: RelaxedSolution[] = [];

    for (
      let level = 1;
      level <= this.config.constraintRelaxationLevels;
      level++
    ) {
      const relaxedConstraints = this.relaxConstraints(constraints, level);
      const solution = await this.generateRelaxedSolution(
        problem,
        relaxedConstraints,
        level
      );
      if (solution) {
        relaxedSolutions.push(solution);
      }
    }

    return relaxedSolutions;
  }

  /**
   * Relax constraints by specified level
   */
  private relaxConstraints(
    constraints: Constraint[],
    level: number
  ): Constraint[] {
    return constraints.map((constraint) => ({
      ...constraint,
      strength: Math.max(0, constraint.strength - level * 0.2),
      description: `${constraint.description} (relaxed level ${level})`,
    }));
  }

  /**
   * Generate solution with relaxed constraints
   */
  private async generateRelaxedSolution(
    problem: Problem,
    relaxedConstraints: Constraint[],
    relaxationLevel: number
  ): Promise<RelaxedSolution | null> {
    const prompt = `Problem: ${problem.description}
Relaxed Constraints (Level ${relaxationLevel}): ${relaxedConstraints.map((c) => c.description).join(', ')}

Generate a solution that works with these relaxed constraints.
Consider what becomes possible when these constraints are relaxed.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt: `You are solving a problem with relaxed constraints. 
        Consider what new possibilities open up when constraints are relaxed.
        Provide innovative solutions that take advantage of the relaxed constraints.`,
        temperature: 0.9,
        maxTokens: 512,
      });

      return {
        id: `relaxed-${relaxationLevel}-${Date.now()}`,
        relaxationLevel,
        originalConstraints: problem.constraints,
        relaxedConstraints: relaxedConstraints.map((c) => c.description),
        solution: response.text.trim(),
        confidence: 0.8 - relaxationLevel * 0.1,
        reasoning: `Generated with constraint relaxation level ${relaxationLevel}`,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(
        `Error generating relaxed solution level ${relaxationLevel}:`,
        error
      );
      return null;
    }
  }

  /**
   * Generate alternative approaches to the problem
   */
  async generateAlternativeApproaches(
    problem: Problem,
    constraints: Constraint[]
  ): Promise<Alternative[]> {
    const prompt = `Problem: ${problem.description}
Constraints: ${constraints.map((c) => c.description).join(', ')}

Generate ${this.config.maxAlternatives} alternative approaches to solving this problem.
Consider different perspectives, methodologies, and strategies.

For each alternative, provide:
1. A brief description of the approach
2. Key advantages
3. Potential challenges
4. Feasibility assessment`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt: `You are generating alternative approaches to problem solving.
        Think creatively and consider multiple perspectives and methodologies.
        Provide diverse, innovative approaches.`,
        temperature: 0.8,
        maxTokens: 1024,
      });

      return this.parseAlternativesResponse(response.text);
    } catch (error) {
      console.error('Error generating alternative approaches:', error);
      return [];
    }
  }

  /**
   * Parse alternatives from LLM response
   */
  private parseAlternativesResponse(response: string): Alternative[] {
    const alternatives: Alternative[] = [];
    const sections = response
      .split(/\d+\./)
      .filter((section) => section.trim());

    sections.forEach((section, index) => {
      const lines = section
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      if (lines.length >= 2) {
        const description = lines[0].trim();
        const pros = lines
          .filter((line) => line.includes('advantage') || line.includes('pro'))
          .slice(0, 3);
        const cons = lines
          .filter((line) => line.includes('challenge') || line.includes('con'))
          .slice(0, 2);

        alternatives.push({
          id: `alt-${index}-${Date.now()}`,
          description,
          pros: pros.map((p) => p.replace(/^[-*]\s*/, '').trim()),
          cons: cons.map((c) => c.replace(/^[-*]\s*/, '').trim()),
          confidence: 0.7,
          feasibility: 0.6,
        });
      }
    });

    return alternatives.slice(0, this.config.maxAlternatives);
  }

  /**
   * Evaluate the novelty of a solution
   */
  async evaluateSolutionNovelty(
    solution: Solution,
    originalProblem: Problem
  ): Promise<NoveltyScore> {
    const prompt = `Original Problem: ${originalProblem.description}
Solution: ${solution.description || solution.solution || solution.analogy}

Evaluate the novelty and creativity of this solution on a scale of 0.0 to 1.0.

Consider:
- How different is this from obvious or conventional approaches?
- Does it introduce new perspectives or methodologies?
- Is it innovative in its approach or implementation?
- How surprising or unexpected is the solution?

Provide a score and brief explanation.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt: `You are evaluating the novelty and creativity of problem solutions.
        Be objective and consider multiple dimensions of creativity.
        Provide scores between 0.0 and 1.0 with clear reasoning.`,
        temperature: 0.3,
        maxTokens: 256,
      });

      return this.parseNoveltyScore(response.text);
    } catch (error) {
      console.error('Error evaluating solution novelty:', error);
      return {
        score: 0.5,
        reasoning: 'Evaluation failed - defaulting to moderate novelty',
        dimensions: {
          originality: 0.5,
          usefulness: 0.5,
          surprise: 0.5,
        },
      };
    }
  }

  /**
   * Parse novelty score from LLM response
   */
  private parseNoveltyScore(response: string): NoveltyScore {
    const scoreMatch = response.match(/(\d+\.?\d*)/);
    const score = scoreMatch
      ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1])))
      : 0.5;

    return {
      score,
      reasoning: response.trim(),
      dimensions: {
        originality: score * 0.8 + 0.1,
        usefulness: score * 0.7 + 0.2,
        surprise: score * 0.9 + 0.05,
      },
    };
  }

  /**
   * Initialize domain knowledge for analogical reasoning
   */
  private initializeDomainKnowledge(): void {
    const domains: Domain[] = [
      {
        name: 'Biology',
        description: 'Natural systems and evolutionary processes',
        principles: [
          'adaptation',
          'emergence',
          'self-organization',
          'resilience',
        ],
        examples: ['ecosystem dynamics', 'neural networks', 'immune systems'],
      },
      {
        name: 'Physics',
        description: 'Fundamental laws and principles of nature',
        principles: ['conservation', 'symmetry', 'entropy', 'forces'],
        examples: ['energy conservation', 'wave-particle duality', 'gravity'],
      },
      {
        name: 'Engineering',
        description: 'Systematic problem solving and optimization',
        principles: ['modularity', 'redundancy', 'feedback', 'efficiency'],
        examples: [
          'control systems',
          'design patterns',
          'optimization algorithms',
        ],
      },
      {
        name: 'Psychology',
        description: 'Human behavior and cognitive processes',
        principles: [
          'learning',
          'motivation',
          'social dynamics',
          'cognitive biases',
        ],
        examples: [
          'behavioral conditioning',
          'group dynamics',
          'decision making',
        ],
      },
      {
        name: 'Economics',
        description: 'Resource allocation and decision making',
        principles: ['incentives', 'trade-offs', 'markets', 'efficiency'],
        examples: ['supply and demand', 'game theory', 'risk management'],
      },
    ];

    domains.forEach((domain) => {
      this.domainKnowledge.set(domain.name, domain);
    });
  }

  /**
   * Get solution history for learning and improvement
   */
  getSolutionHistory(): Solution[] {
    return [...this.solutionHistory];
  }

  /**
   * Add solution to history for learning
   */
  addToHistory(solution: Solution): void {
    this.solutionHistory.push(solution);

    // Limit history size
    if (this.solutionHistory.length > 100) {
      this.solutionHistory = this.solutionHistory.slice(-100);
    }
  }

  /**
   * Get statistics about creative problem solving performance
   */
  getStats() {
    return {
      totalSolutions: this.solutionHistory.length,
      averageNovelty:
        this.solutionHistory.length > 0
          ? this.solutionHistory.reduce(
              (sum, s) => sum + (s.noveltyScore?.score || 0.5),
              0
            ) / this.solutionHistory.length
          : 0,
      domainsUsed: Array.from(this.domainKnowledge.keys()),
      config: this.config,
    };
  }
}
