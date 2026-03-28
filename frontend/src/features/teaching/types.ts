/**
 * Frontend types for the teaching feature API.
 *
 * These mirror the Pydantic schemas in
 * backend/app/features/teaching/schemas.py.
 */

// ------------------------------------------------------------------
// Question banks
// ------------------------------------------------------------------

export interface QuestionBank {
  id: number;
  question_bank_id: string;
  version: number;
  title: string;
  description: string;
  type: "uniform" | "variable";
  synced_at: string;
}

export interface AssessmentPageConfig {
  title?: string;
  body?: string;
}

export interface AssessmentConfigYaml {
  items_per_attempt?: number;
  time_limit_minutes?: number;
  min_pool_size?: number;
  randomise_selection?: boolean;
  randomise_order?: boolean;
  allow_immediate_retry?: boolean;
  intro_page?: AssessmentPageConfig;
  closing_page?: AssessmentPageConfig;
}

export interface QuestionBankConfigYaml {
  assessment?: AssessmentConfigYaml;
  results?: { certificate_download?: boolean };
  [key: string]: unknown;
}

export interface QuestionBankDetail extends QuestionBank {
  config_yaml: QuestionBankConfigYaml;
}

// ------------------------------------------------------------------
// Items
// ------------------------------------------------------------------

export interface QuestionBankItem {
  id: number;
  question_bank_id: string;
  bank_version: number;
  images: Array<Record<string, unknown>>;
  text: string | null;
  options: Array<Record<string, unknown>> | null;
  correct_option_id: string | null;
  metadata_json: Record<string, unknown>;
  status: "draft" | "published";
  created_at: string;
}

export interface ItemImage {
  key: string;
  label?: string;
  url: string;
}

export interface CandidateItem {
  answer_id: number;
  display_order: number;
  question_type: "single" | "multiple";
  images: ItemImage[];
  text?: string;
  options: Array<{ id: string; label: string; tags?: string[] }>;
  selected_option?: string | null;
}

// ------------------------------------------------------------------
// Assessments
// ------------------------------------------------------------------

export interface Assessment {
  id: number;
  question_bank_id: string;
  bank_version: number;
  started_at: string;
  completed_at: string | null;
  time_limit_minutes: number;
  total_items: number;
  is_passed: boolean | null;
  score_breakdown: Record<string, unknown> | null;
}

export interface AssessmentWithFirstItem {
  assessment: Assessment;
  first_item: CandidateItem | null;
}

// ------------------------------------------------------------------
// Answers
// ------------------------------------------------------------------

export interface AnswerResult {
  answered: boolean;
  next_item: CandidateItem | null;
  all_answered: boolean;
}

// ------------------------------------------------------------------
// Completion / results
// ------------------------------------------------------------------

export interface CriterionResult {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
}

export interface CompletionResult {
  is_passed: boolean;
  criteria: CriterionResult[];
  score_breakdown: Record<string, unknown>;
}

export interface AssessmentHistory {
  id: number;
  question_bank_id: string;
  bank_title: string;
  bank_version: number;
  started_at: string;
  completed_at: string | null;
  is_passed: boolean | null;
  score_breakdown: Record<string, unknown> | null;
  total_items: number;
}

// ------------------------------------------------------------------
// Sync / validation
// ------------------------------------------------------------------

export interface ValidationMessage {
  path: string;
  message: string;
}

export interface ValidationResult {
  bank_id: string;
  version: number;
  is_valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  item_count: number;
  summary: string;
}

export interface SyncResult {
  id: number;
  question_bank_id: string;
  version: number;
  status: string;
  items_created: number;
  items_updated: number;
  errors: Array<Record<string, unknown>>;
  warnings: Array<Record<string, unknown>>;
  started_at: string;
  completed_at: string | null;
}

export interface SyncHistory {
  id: number;
  question_bank_id: string;
  version: number;
  status: string;
  items_created: number;
  items_updated: number;
  started_at: string;
  completed_at: string | null;
}

// ------------------------------------------------------------------
// Teaching org settings
// ------------------------------------------------------------------

export interface TeachingOrgSettings {
  id: number;
  organisation_id: number;
  coordinator_email: string;
  institution_name: string;
}

export interface TeachingOrgSettingsInput {
  coordinator_email: string;
  institution_name: string;
}

// ------------------------------------------------------------------
// Results (educator view)
// ------------------------------------------------------------------

export interface EducatorResult {
  id: number;
  user_id: number;
  question_bank_id: string;
  bank_version: number;
  started_at: string;
  completed_at: string | null;
  is_passed: boolean | null;
  score_breakdown: Record<string, unknown> | null;
  total_items: number;
}

// ------------------------------------------------------------------
// Admin — teaching modules overview
// ------------------------------------------------------------------

export interface AdminBank {
  bank_id: string;
  title: string | null;
  version: number | null;
  type: string | null;
  synced_at: string | null;
  in_gcs: boolean;
  in_db: boolean;
  item_count: number;
}

export interface SyncAllResult {
  synced: SyncResult[];
  errors: Array<{ bank_id: string; error: string }>;
}
