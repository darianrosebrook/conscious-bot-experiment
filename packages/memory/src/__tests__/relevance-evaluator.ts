/**
 * Memory System Relevance Evaluator
 *
 * Evaluates the quality and relevance of search results from the memory system.
 * Provides precision, recall, F1 scores, and other quality metrics to assess
 * system performance.
 *
 * @author @darianrosebrook
 */

import { HybridSearchResult } from '../hybrid-search-service';
import { TestDataset } from './test-data-generator';

export interface RelevanceJudgment {
  queryId: string;
  resultId: string;
  relevance:
    | 'highly_relevant'
    | 'relevant'
    | 'partially_relevant'
    | 'not_relevant';
  confidence: number; // 0.0-1.0 confidence in this judgment
  reasoning: string;
}

export interface RelevanceMetrics {
  precision: number; // Precision@K
  recall: number; // Recall@K
  f1Score: number; // F1@K
  ndcg: number; // Normalized Discounted Cumulative Gain
  mrr: number; // Mean Reciprocal Rank
  map: number; // Mean Average Precision
  diversity: number; // Result diversity score (0.0-1.0)
  topicalCoverage: number; // Coverage of expected topics (0.0-1.0)
}

export interface RelevanceEvaluation {
  query: string;
  expectedRelevantIds: string[];
  actualResults: HybridSearchResult[];
  judgments: RelevanceJudgment[];
  metrics: RelevanceMetrics;
  evaluationTime: number;
  evaluator: string;
}

export interface ComprehensiveEvaluation {
  overallMetrics: RelevanceMetrics;
  queryEvaluations: RelevanceEvaluation[];
  summary: {
    totalQueries: number;
    averagePrecision: number;
    averageRecall: number;
    averageF1Score: number;
    bestQuery: string;
    worstQuery: string;
    mostImprovedQuery?: string;
    mostDegradedQuery?: string;
  };
  recommendations: string[];
}

/**
 * Relevance Evaluation Framework
 */
export class RelevanceEvaluator {
  private judgments: Map<string, RelevanceJudgment[]> = new Map();

  /**
   * Evaluate search results for a single query
   */
  async evaluateQuery(
    query: string,
    results: HybridSearchResult[],
    expectedRelevantIds: string[],
    options: {
      k?: number; // Evaluate at top-K results
      includeSemanticAnalysis?: boolean;
      includeDiversityAnalysis?: boolean;
      evaluator?: string;
    } = {}
  ): Promise<RelevanceEvaluation> {
    const startTime = Date.now();
    const k = options.k || results.length;

    console.log(`🔍 Evaluating query: "${query}" (top-${k} results)`);

    // Get or create judgments for this query
    const queryKey = `${query}-${k}`;
    let queryJudgments = this.judgments.get(queryKey);

    if (!queryJudgments) {
      queryJudgments = await this.generateJudgments(
        query,
        results,
        expectedRelevantIds,
        k
      );
      this.judgments.set(queryKey, queryJudgments);
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(
      results.slice(0, k),
      queryJudgments,
      expectedRelevantIds
    );

    // Perform additional analyses
    if (options.includeSemanticAnalysis) {
      await this.performSemanticAnalysis(query, results, queryJudgments);
    }

    if (options.includeDiversityAnalysis) {
      this.analyzeResultDiversity(results, queryJudgments);
    }

    const evaluation: RelevanceEvaluation = {
      query,
      expectedRelevantIds,
      actualResults: results.slice(0, k),
      judgments: queryJudgments,
      metrics,
      evaluationTime: Date.now() - startTime,
      evaluator: options.evaluator || 'automated',
    };

    console.log(
      `✅ Query evaluation completed in ${evaluation.evaluationTime}ms`
    );
    console.log(`   Precision: ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`   Recall: ${(metrics.recall * 100).toFixed(1)}%`);
    console.log(`   F1: ${(metrics.f1Score * 100).toFixed(1)}%`);

    return evaluation;
  }

  /**
   * Evaluate multiple queries and provide comprehensive analysis
   */
  async evaluateQueries(
    testDataset: TestDataset,
    searchResults: Map<string, HybridSearchResult[]>,
    options: {
      k?: number;
      includeSemanticAnalysis?: boolean;
      includeDiversityAnalysis?: boolean;
      evaluator?: string;
    } = {}
  ): Promise<ComprehensiveEvaluation> {
    console.log(
      `📊 Starting comprehensive evaluation of ${testDataset.queries.length} queries...`
    );

    const queryEvaluations: RelevanceEvaluation[] = [];
    const startTime = Date.now();

    // Evaluate each query
    for (const testQuery of testDataset.queries) {
      const results = searchResults.get(testQuery.query) || [];

      const evaluation = await this.evaluateQuery(
        testQuery.query,
        results,
        testQuery.expectedRelevantIds,
        options
      );

      queryEvaluations.push(evaluation);
    }

    // Calculate overall metrics
    const overallMetrics = this.calculateOverallMetrics(queryEvaluations);

    // Generate summary
    const summary = this.generateEvaluationSummary(queryEvaluations);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      queryEvaluations,
      overallMetrics
    );

    const comprehensiveEvaluation: ComprehensiveEvaluation = {
      overallMetrics,
      queryEvaluations,
      summary,
      recommendations,
    };

    console.log(
      `✅ Comprehensive evaluation completed in ${(Date.now() - startTime) / 1000}s`
    );
    console.log(
      `   Overall Precision: ${(overallMetrics.precision * 100).toFixed(1)}%`
    );
    console.log(
      `   Overall Recall: ${(overallMetrics.recall * 100).toFixed(1)}%`
    );
    console.log(`   Overall F1: ${(overallMetrics.f1Score * 100).toFixed(1)}%`);

    return comprehensiveEvaluation;
  }

  /**
   * Compare two sets of results (A/B testing)
   */
  async compareResults(
    baselineResults: Map<string, HybridSearchResult[]>,
    enhancedResults: Map<string, HybridSearchResult[]>,
    testDataset: TestDataset,
    options: {
      k?: number;
      significanceLevel?: number;
    } = {}
  ): Promise<{
    baselineEvaluation: ComprehensiveEvaluation;
    enhancedEvaluation: ComprehensiveEvaluation;
    improvement: {
      precision: number;
      recall: number;
      f1Score: number;
      ndcg: number;
      statisticalSignificance: {
        precision: 'significant' | 'marginal' | 'insignificant';
        recall: 'significant' | 'marginal' | 'insignificant';
        f1Score: 'significant' | 'marginal' | 'insignificant';
      };
    };
    detailedComparison: Array<{
      query: string;
      baselineMetrics: RelevanceMetrics;
      enhancedMetrics: RelevanceMetrics;
      improvement: number; // F1 score improvement
    }>;
  }> {
    console.log(`⚖️ Comparing baseline vs enhanced results...`);

    // Evaluate both systems
    const baselineEvaluation = await this.evaluateQueries(
      testDataset,
      baselineResults,
      options
    );

    const enhancedEvaluation = await this.evaluateQueries(
      testDataset,
      enhancedResults,
      options
    );

    // Calculate improvements
    const improvement = {
      precision:
        enhancedEvaluation.overallMetrics.precision -
        baselineEvaluation.overallMetrics.precision,
      recall:
        enhancedEvaluation.overallMetrics.recall -
        baselineEvaluation.overallMetrics.recall,
      f1Score:
        enhancedEvaluation.overallMetrics.f1Score -
        baselineEvaluation.overallMetrics.f1Score,
      ndcg:
        enhancedEvaluation.overallMetrics.ndcg -
        baselineEvaluation.overallMetrics.ndcg,
      statisticalSignificance: this.calculateStatisticalSignificance(
        baselineEvaluation.overallMetrics.f1Score,
        enhancedEvaluation.overallMetrics.f1Score,
        options.significanceLevel || 0.05
      ),
    };

    // Detailed comparison per query
    const detailedComparison = this.generateDetailedComparison(
      baselineEvaluation.queryEvaluations,
      enhancedEvaluation.queryEvaluations
    );

    console.log(`✅ Comparison completed`);
    console.log(
      `   F1 Score: ${baselineEvaluation.overallMetrics.f1Score.toFixed(3)} → ${enhancedEvaluation.overallMetrics.f1Score.toFixed(3)}`
    );
    console.log(`   Improvement: ${(improvement.f1Score * 100).toFixed(1)}%`);
    console.log(
      `   Significance: ${improvement.statisticalSignificance.f1Score}`
    );

    return {
      baselineEvaluation,
      enhancedEvaluation,
      improvement,
      detailedComparison,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async generateJudgments(
    query: string,
    results: HybridSearchResult[],
    expectedRelevantIds: string[],
    k: number
  ): Promise<RelevanceJudgment[]> {
    const judgments: RelevanceJudgment[] = [];

    for (const result of results.slice(0, k)) {
      const judgment = await this.judgeRelevance(
        query,
        result,
        expectedRelevantIds.includes(result.id)
      );

      judgments.push(judgment);
    }

    return judgments;
  }

  private async judgeRelevance(
    query: string,
    result: HybridSearchResult,
    isExpectedRelevant: boolean
  ): Promise<RelevanceJudgment> {
    // Simple rule-based judgment for now
    // In production, this could use ML models or human annotations

    let relevance: RelevanceJudgment['relevance'] = 'not_relevant';
    let confidence = 0.5;
    let reasoning = '';

    // Check if result ID is in expected relevant set
    if (isExpectedRelevant) {
      relevance = 'highly_relevant';
      confidence = 0.9;
      reasoning = 'Result ID matches expected relevant document';
    } else {
      // Analyze content similarity
      const queryTerms = query.toLowerCase().split(/\s+/);
      const resultTerms = result.content.toLowerCase().split(/\s+/);

      const commonTerms = queryTerms.filter(
        (term) =>
          resultTerms.includes(term) || result.metadata.entities?.includes(term)
      );

      const termOverlap = commonTerms.length / queryTerms.length;

      if (termOverlap > 0.6) {
        relevance = 'highly_relevant';
        confidence = 0.8;
        reasoning = `High term overlap (${(termOverlap * 100).toFixed(1)}%) with query`;
      } else if (termOverlap > 0.3) {
        relevance = 'relevant';
        confidence = 0.6;
        reasoning = `Moderate term overlap (${(termOverlap * 100).toFixed(1)}%) with query`;
      } else if (
        termOverlap > 0.1 ||
        result.metadata.topics?.some((topic) =>
          query.toLowerCase().includes(topic.toLowerCase())
        )
      ) {
        relevance = 'partially_relevant';
        confidence = 0.4;
        reasoning = `Low term overlap but topical similarity`;
      } else {
        relevance = 'not_relevant';
        confidence = 0.7;
        reasoning = `No significant similarity to query`;
      }
    }

    return {
      queryId: query,
      resultId: result.id,
      relevance,
      confidence,
      reasoning,
    };
  }

  private calculateMetrics(
    results: HybridSearchResult[],
    judgments: RelevanceJudgment[],
    expectedRelevantIds: string[]
  ): RelevanceMetrics {
    const k = results.length;

    // Calculate precision and recall
    const relevantResults = judgments.filter(
      (j) => j.relevance === 'highly_relevant' || j.relevance === 'relevant'
    );
    const truePositives = relevantResults.filter((j) =>
      expectedRelevantIds.includes(j.resultId)
    ).length;
    const falsePositives = relevantResults.filter(
      (j) => !expectedRelevantIds.includes(j.resultId)
    ).length;
    const falseNegatives = expectedRelevantIds.filter(
      (id) => !judgments.some((j) => j.resultId === id)
    ).length;

    const precision =
      relevantResults.length > 0 ? truePositives / relevantResults.length : 0;
    const recall =
      expectedRelevantIds.length > 0
        ? truePositives / expectedRelevantIds.length
        : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Calculate NDCG (Normalized Discounted Cumulative Gain)
    const ndcg = this.calculateNDCG(judgments, expectedRelevantIds);

    // Calculate MRR (Mean Reciprocal Rank)
    const mrr = this.calculateMRR(results, expectedRelevantIds);

    // Calculate MAP (Mean Average Precision)
    const map = this.calculateMAP(results, expectedRelevantIds);

    // Calculate diversity (based on result types and sources)
    const diversity = this.calculateDiversity(results);

    // Calculate topical coverage
    const topicalCoverage = this.calculateTopicalCoverage(
      results,
      expectedRelevantIds
    );

    return {
      precision,
      recall,
      f1Score,
      ndcg,
      mrr,
      map,
      diversity,
      topicalCoverage,
    };
  }

  private calculateNDCG(
    judgments: RelevanceJudgment[],
    expectedRelevantIds: string[]
  ): number {
    // Simplified NDCG calculation
    const idealDCG = expectedRelevantIds.length * (1 / Math.log2(2)); // First position
    const actualDCG = judgments.reduce((sum, judgment, index) => {
      const gain = this.getGainValue(judgment.relevance);
      const discount = 1 / Math.log2(index + 2); // Position starts at 1
      return sum + gain * discount;
    }, 0);

    return idealDCG > 0 ? actualDCG / idealDCG : 0;
  }

  private getGainValue(relevance: RelevanceJudgment['relevance']): number {
    switch (relevance) {
      case 'highly_relevant':
        return 3;
      case 'relevant':
        return 2;
      case 'partially_relevant':
        return 1;
      case 'not_relevant':
        return 0;
      default:
        return 0;
    }
  }

  private calculateMRR(
    results: HybridSearchResult[],
    expectedRelevantIds: string[]
  ): number {
    const firstRelevantPosition = results.findIndex((result) =>
      expectedRelevantIds.includes(result.id)
    );

    return firstRelevantPosition >= 0 ? 1 / (firstRelevantPosition + 1) : 0;
  }

  private calculateMAP(
    results: HybridSearchResult[],
    expectedRelevantIds: string[]
  ): number {
    let sumPrecision = 0;
    let relevantCount = 0;

    for (let i = 0; i < results.length; i++) {
      if (expectedRelevantIds.includes(results[i].id)) {
        relevantCount++;
        const precisionAtI = relevantCount / (i + 1);
        sumPrecision += precisionAtI;
      }
    }

    return expectedRelevantIds.length > 0
      ? sumPrecision / expectedRelevantIds.length
      : 0;
  }

  private calculateDiversity(results: HybridSearchResult[]): number {
    const types = new Set(results.map((r) => r.metadata.type));
    const sources = new Set(results.map((r) => r.metadata.source));

    const typeDiversity = types.size / Math.max(results.length, 1);
    const sourceDiversity = sources.size / Math.max(results.length, 1);

    return (typeDiversity + sourceDiversity) / 2;
  }

  private calculateTopicalCoverage(
    results: HybridSearchResult[],
    expectedRelevantIds: string[]
  ): number {
    // This is a simplified implementation
    // In practice, would analyze topical coverage more deeply
    const resultTopics = results.flatMap((r) => r.metadata.topics || []);
    const uniqueTopics = new Set(resultTopics);

    return uniqueTopics.size > 0 ? Math.min(1.0, uniqueTopics.size / 5) : 0; // Normalize to 0-1
  }

  private calculateOverallMetrics(
    evaluations: RelevanceEvaluation[]
  ): RelevanceMetrics {
    if (evaluations.length === 0) {
      return {
        precision: 0,
        recall: 0,
        f1Score: 0,
        ndcg: 0,
        mrr: 0,
        map: 0,
        diversity: 0,
        topicalCoverage: 0,
      };
    }

    const precisions = evaluations.map((e) => e.metrics.precision);
    const recalls = evaluations.map((e) => e.metrics.recall);
    const f1Scores = evaluations.map((e) => e.metrics.f1Score);
    const ndcgs = evaluations.map((e) => e.metrics.ndcg);
    const mrrs = evaluations.map((e) => e.metrics.mrr);
    const maps = evaluations.map((e) => e.metrics.map);
    const diversities = evaluations.map((e) => e.metrics.diversity);
    const topicalCoverages = evaluations.map((e) => e.metrics.topicalCoverage);

    return {
      precision: precisions.reduce((a, b) => a + b, 0) / precisions.length,
      recall: recalls.reduce((a, b) => a + b, 0) / recalls.length,
      f1Score: f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length,
      ndcg: ndcgs.reduce((a, b) => a + b, 0) / ndcgs.length,
      mrr: mrrs.reduce((a, b) => a + b, 0) / mrrs.length,
      map: maps.reduce((a, b) => a + b, 0) / maps.length,
      diversity: diversities.reduce((a, b) => a + b, 0) / diversities.length,
      topicalCoverage:
        topicalCoverages.reduce((a, b) => a + b, 0) / topicalCoverages.length,
    };
  }

  private generateEvaluationSummary(evaluations: RelevanceEvaluation[]) {
    const f1Scores = evaluations.map((e) => e.metrics.f1Score);
    const bestQuery = evaluations.reduce((best, current) =>
      current.metrics.f1Score > best.metrics.f1Score ? current : best
    );
    const worstQuery = evaluations.reduce((worst, current) =>
      current.metrics.f1Score < worst.metrics.f1Score ? current : worst
    );

    return {
      totalQueries: evaluations.length,
      averagePrecision:
        evaluations.reduce((sum, e) => sum + e.metrics.precision, 0) /
        evaluations.length,
      averageRecall:
        evaluations.reduce((sum, e) => sum + e.metrics.recall, 0) /
        evaluations.length,
      averageF1Score:
        evaluations.reduce((sum, e) => sum + e.metrics.f1Score, 0) /
        evaluations.length,
      bestQuery: bestQuery.query,
      worstQuery: worstQuery.query,
      mostImprovedQuery: undefined, // Would need historical data
      mostDegradedQuery: undefined, // Would need historical data
    };
  }

  private generateRecommendations(
    evaluations: RelevanceEvaluation[],
    overallMetrics: RelevanceMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Precision recommendations
    if (overallMetrics.precision < 0.7) {
      recommendations.push(
        'Consider improving query understanding and result ranking'
      );
      recommendations.push(
        'Review relevance thresholds and similarity scoring'
      );
    }

    // Recall recommendations
    if (overallMetrics.recall < 0.7) {
      recommendations.push(
        'Consider expanding query processing and recall enhancement'
      );
      recommendations.push('Review indexing coverage and search strategies');
    }

    // Diversity recommendations
    if (overallMetrics.diversity < 0.5) {
      recommendations.push(
        'Consider implementing result diversification strategies'
      );
      recommendations.push('Review ranking to ensure variety in result types');
    }

    // F1 Score recommendations
    if (overallMetrics.f1Score < 0.7) {
      recommendations.push('Focus on balancing precision and recall');
      recommendations.push('Consider hybrid search strategies');
    }

    // Query-specific analysis
    const lowPerformingQueries = evaluations.filter(
      (e) => e.metrics.f1Score < 0.5
    );
    if (lowPerformingQueries.length > 0) {
      recommendations.push(
        `${lowPerformingQueries.length} queries have low F1 scores - consider targeted improvements`
      );
    }

    return recommendations;
  }

  private calculateStatisticalSignificance(
    baselineScore: number,
    enhancedScore: number,
    significanceLevel: number
  ): {
    precision: 'significant' | 'marginal' | 'insignificant';
    recall: 'significant' | 'marginal' | 'insignificant';
    f1Score: 'significant' | 'marginal' | 'insignificant';
  } {
    const improvements = {
      precision: enhancedScore - baselineScore,
      recall: enhancedScore - baselineScore,
      f1Score: enhancedScore - baselineScore,
    };

    const isSignificant = (improvement: number) => Math.abs(improvement) > 0.1; // 10% improvement
    const isMarginal = (improvement: number) => Math.abs(improvement) > 0.05; // 5% improvement

    return {
      precision: isSignificant(improvements.precision)
        ? 'significant'
        : isMarginal(improvements.precision)
          ? 'marginal'
          : 'insignificant',
      recall: isSignificant(improvements.recall)
        ? 'significant'
        : isMarginal(improvements.recall)
          ? 'marginal'
          : 'insignificant',
      f1Score: isSignificant(improvements.f1Score)
        ? 'significant'
        : isMarginal(improvements.f1Score)
          ? 'marginal'
          : 'insignificant',
    };
  }

  private generateDetailedComparison(
    baselineEvaluations: RelevanceEvaluation[],
    enhancedEvaluations: RelevanceEvaluation[]
  ) {
    const comparison: Array<{
      query: string;
      baselineMetrics: RelevanceMetrics;
      enhancedMetrics: RelevanceMetrics;
      improvement: number;
    }> = [];

    for (let i = 0; i < baselineEvaluations.length; i++) {
      const baseline = baselineEvaluations[i];
      const enhanced = enhancedEvaluations[i];

      if (baseline && enhanced && baseline.query === enhanced.query) {
        const improvement = enhanced.metrics.f1Score - baseline.metrics.f1Score;

        comparison.push({
          query: baseline.query,
          baselineMetrics: baseline.metrics,
          enhancedMetrics: enhanced.metrics,
          improvement,
        });
      }
    }

    return comparison.sort((a, b) => b.improvement - a.improvement);
  }

  private async performSemanticAnalysis(
    query: string,
    results: HybridSearchResult[],
    judgments: RelevanceJudgment[]
  ): Promise<void> {
    // Placeholder for semantic analysis
    // In production, this could use NLP models to analyze:
    // - Query intent understanding
    // - Result content analysis
    // - Semantic similarity beyond keywords
    console.log(`🔬 Semantic analysis for query: "${query}" (placeholder)`);
  }

  private analyzeResultDiversity(
    results: HybridSearchResult[],
    judgments: RelevanceJudgment[]
  ): void {
    // Analyze diversity in result types, sources, and topics
    const types = results.map((r) => r.metadata.type);
    const sources = results.map((r) => r.metadata.source);
    const topics = results.flatMap((r) => r.metadata.topics || []);

    const uniqueTypes = new Set(types).size;
    const uniqueSources = new Set(sources).size;
    const uniqueTopics = new Set(topics).size;

    console.log(
      `📊 Diversity analysis: ${uniqueTypes} types, ${uniqueSources} sources, ${uniqueTopics} topics`
    );
  }
}
