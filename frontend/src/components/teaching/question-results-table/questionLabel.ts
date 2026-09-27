import type { AssessmentQuestionResult } from "@/features/teaching/types";

/** "Question 7", or the directory name when it carries no number. */
export function questionLabel(q: AssessmentQuestionResult): string {
  return q.question_number === null
    ? q.question_ref
    : `Question ${q.question_number}`;
}
