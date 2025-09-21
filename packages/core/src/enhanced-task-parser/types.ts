/**
 * Enhanced Task Parser Types
 *
 * Type definitions for the enhanced task parser system
 *
 * @author @darianrosebrook
 */

export interface TaskParserConfig {
  enable_validation: boolean;
  enable_feasibility_check: boolean;
  enable_progress_persistence: boolean;
  enable_chat_processing: boolean;
  max_task_history: number;
  validation_timeout: number;
  feasibility_timeout: number;
  chat_processing_timeout: number;
  debug_mode: boolean;
}

export interface TaskParsingResult {
  type: string;
  parameters: Record<string, any>;
  confidence: number;
  validation_errors: string[];
  feasibility_score: number;
  processing_time: number;
  metadata: Record<string, any>;
}

export interface TaskParser {
  parseLLMOutput(output: string): TaskParsingResult;
  validateResult(result: TaskParsingResult): boolean;
  checkFeasibility(result: TaskParsingResult): number;
}
