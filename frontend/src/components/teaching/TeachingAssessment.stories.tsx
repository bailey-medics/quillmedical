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
      url: "/storybook/white-light-polyp.png",
    },
    {
      key: "image_2",
      label: "Narrow band imaging (NBI)",
      url: "/storybook/nbi-polyp.png",
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

const chestXrayItem: CandidateItem = {
  answer_id: 1,
  display_order: 1,
  question_type: "single",
  text: "A 28-year-old man presents to A&E with sudden onset right-sided pleuritic chest pain and breathlessness. He is tall and thin. Observations: RR 24, SpO₂ 94% on air, HR 110, BP 120/78. His PA chest X-ray is shown.",
  images: [
    {
      key: "image_1",
      label: "PA chest X-ray",
      url: "/storybook/chest-xray-pneumothorax.png",
    },
  ],
  options: [
    { id: "pneumothorax", label: "Right-sided pneumothorax" },
    { id: "pleural_effusion", label: "Right-sided pleural effusion" },
    { id: "pneumonia", label: "Right lower lobe pneumonia" },
    { id: "normal", label: "Normal chest X-ray" },
  ],
};

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
export const ColonoscopyPolyps: Story = {
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

/** Chest X-ray question — single large image with clinical scenario (variable format). */
export const ChestXray: Story = {
  tags: ["!test"],
  render: () => {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <TeachingLayout footerText="Logged in: dr.jones">
        <QuestionView
          item={chestXrayItem}
          selectedOption={selected}
          onSelectOption={setSelected}
          currentQuestion={1}
          totalQuestions={4}
          onNext={() => {}}
          isLastQuestion={false}
          timeLimitMinutes={10}
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
  ...ChestXray,
  globals: { colorScheme: "dark" },
};
