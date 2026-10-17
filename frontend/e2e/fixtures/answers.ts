/**
 * The answers to the pinned teaching module's assessment.
 *
 * The module comes from respiratory-teaching, fetched into
 * `.e2e-teaching/` by `.github/scripts/ci/fetch-e2e-teaching.sh`. Each
 * question's `question.yaml` names its right answer in
 * `correct_option_id`, so a test reads the answers rather than guessing,
 * and can pass or fail on purpose. A new pin is picked up with no change
 * here.
 */

import fs from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

/** The pinned module's id, as the app's addresses name it. */
export const MODULE_ID = "chest-xray-interpretation-test";

/** Where the pinned module sits, from the `frontend` folder tests run in. */
const ASSESSMENT = path.join(
  "..",
  ".e2e-teaching",
  "respiratory-teaching",
  "modules",
  MODULE_ID,
  "assessment",
);

/** One question, as a test needs it. */
export interface KnownQuestion {
  /** The scenario, with its whitespace run together. */
  text: string;
  /** The label of the right option. */
  right: string;
  /** The label of an option that is wrong. */
  wrong: string;
}

interface QuestionFile {
  text: string;
  options: { id: string; label: string }[];
  correct_option_id: string;
}

function isQuestionFile(value: unknown): value is QuestionFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const file = value as Record<string, unknown>;

  return (
    typeof file.text === "string" &&
    Array.isArray(file.options) &&
    typeof file.correct_option_id === "string"
  );
}

/** Whitespace run together, so YAML's folding cannot stop a match. */
export function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Every question in the pinned module's pool. */
export function knownQuestions(): KnownQuestion[] {
  return fs
    .readdirSync(ASSESSMENT)
    .filter((name) => name.startsWith("question_"))
    .sort()
    .map((folder) => {
      const parsed = load(
        fs.readFileSync(path.join(ASSESSMENT, folder, "question.yaml"), "utf8"),
      );

      if (!isQuestionFile(parsed)) {
        throw new Error(`${folder}/question.yaml is not a question`);
      }

      const right = parsed.options.find(
        (option) => option.id === parsed.correct_option_id,
      );
      const wrong = parsed.options.find(
        (option) => option.id !== parsed.correct_option_id,
      );

      if (right === undefined || wrong === undefined) {
        throw new Error(
          `${folder}/question.yaml has no right and wrong option`,
        );
      }

      return {
        text: squash(parsed.text),
        right: right.label,
        wrong: wrong.label,
      };
    });
}

/** The question whose scenario is in *pageText*. */
export function questionShown(pageText: string): KnownQuestion {
  const shown = squash(pageText);
  const question = knownQuestions().find((candidate) =>
    shown.includes(candidate.text),
  );

  if (question === undefined) {
    throw new Error("The question on screen is not one the module holds");
  }

  return question;
}
