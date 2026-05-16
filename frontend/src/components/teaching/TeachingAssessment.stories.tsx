/**
 * Teaching Layout-Assessment Stories
 *
 * Full-page compositions showing assessment components within the
 * TeachingLayout (no sidebar — assessments use full-width content
 * for exam focus).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import { AssessmentIntro } from "./assessment-intro/AssessmentIntro";
import { QuestionView } from "./question-view/QuestionView";
import { AssessmentResult } from "./assessment-result/AssessmentResult";
import type { CandidateItem } from "@/features/teaching/types";

const meta: Meta = {
  title: "Teaching/Layouts/Assessment complete",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/*  Demo data                                                         */
/* ------------------------------------------------------------------ */

const introBody = `You will be shown 120 polyp images, each displayed as a pair:
white light (WLI) and narrow band imaging (NBI).

For each image pair, select the single best answer from the four options.

**Time limit**: 75 minutes. The timer starts when you click "Begin".

**Marking criteria**:
- ≥70% of your answers must be **high confidence**
- ≥85% of your high-confidence answers must be **correct**

You must meet **both** criteria to pass.`;

const demoItem: CandidateItem = {
  answer_id: 1,
  display_order: 1,
  question_type: "single",
  images: [
    {
      key: "image_1",
      label: "White light (WLI)",
      url: "https://placehold.co/400x300?text=WLI",
    },
    {
      key: "image_2",
      label: "Narrow band imaging (NBI)",
      url: "https://placehold.co/400x300?text=NBI",
    },
  ],
  options: [
    { id: "high_confidence_adenoma", label: "High confidence adenoma" },
    { id: "low_confidence_adenoma", label: "Low confidence adenoma" },
    {
      id: "high_confidence_serrated",
      label: "High confidence serrated polyp",
    },
    {
      id: "low_confidence_serrated",
      label: "Low confidence serrated polyp",
    },
  ],
};

const passCriteria = [
  { name: "High confidence rate", value: 0.78, threshold: 0.7, passed: true },
  {
    name: "Accuracy of high-confidence answers",
    value: 0.91,
    threshold: 0.85,
    passed: true,
  },
];

const failCriteria = [
  {
    name: "High confidence rate",
    value: 0.65,
    threshold: 0.7,
    passed: false,
  },
  {
    name: "Accuracy of high-confidence answers",
    value: 0.91,
    threshold: 0.85,
    passed: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

/** Intro screen shown before the assessment begins. */
export const Intro: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout footerText="Logged in: dr.jones">
      <AssessmentIntro
        title="Before you begin"
        body={introBody}
        onBegin={() => {}}
      />
    </TeachingLayout>
  ),
};

/** A question during the assessment with image pair and options. */
export const Question: Story = {
  tags: ["!test"],
  render: () => {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <TeachingLayout footerText="Logged in: dr.jones">
        <QuestionView
          item={demoItem}
          selectedOption={selected}
          onSelectOption={setSelected}
          currentQuestion={3}
          totalQuestions={120}
          onPrevious={() => {}}
          onNext={() => {}}
          isLastQuestion={false}
          timeLimitMinutes={75}
          startedAt={new Date().toISOString()}
          onExpire={() => {}}
          onCloseExam={() => {}}
        />
      </TeachingLayout>
    );
  },
};

/** Result screen after passing the assessment. */
export const ResultPassed: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout footerText="Logged in: dr.jones">
      <AssessmentResult
        isPassed
        bankTitle="Optical diagnosis of diminutive colorectal polyps"
        criteria={passCriteria}
        assessmentId={42}
        showCertificate
        showBackToDashboard
        onBackToDashboard={() => {}}
      />
    </TeachingLayout>
  ),
};

/** Result screen after failing the assessment. */
export const ResultFailed: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout footerText="Logged in: dr.jones">
      <AssessmentResult
        isPassed={false}
        bankTitle="Optical diagnosis of diminutive colorectal polyps"
        criteria={failCriteria}
        showTryAgain
        showBackToDashboard
        onTryAgain={() => {}}
        onBackToDashboard={() => {}}
      />
    </TeachingLayout>
  ),
};

export const DarkModeQuestion: Story = {
  ...Question,
  globals: { colorScheme: "dark" },
};
