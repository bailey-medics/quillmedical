/**
 * TeachingModuleMain Page
 *
 * Intermediate page for a teaching module showing the
 * "Start assessment" action card, and optionally
 * "Learning materials" when content is available.
 * Mounted at /teaching/:bankId.
 */

import { SimpleGrid, Stack, Skeleton } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import PageHeader from "@components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { StateMessage } from "@/components/message-cards";
import { BodyText } from "@/components/typography";
import {
  IconAlertCircle,
  IconBook,
  IconChalkboardTeacher,
} from "@/components/icons/appIcons";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import type { QuestionBank } from "@/features/teaching/types";

/** Bank IDs that have learning materials available (Phase 1 stub). */
const BANKS_WITH_LEARNING = new Set(["colonoscopy-optical-diagnosis-test"]);

export default function TeachingModuleMain() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const banks = await api.get<QuestionBank[]>("/teaching/question-banks");
        const found = banks.find((b) => b.question_bank_id === bankId);
        if (found) {
          setBank(found);
        } else {
          setError("Module not found");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load module");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bankId]);

  if (loading) {
    return (
      <TeachingLayout>
        <Stack gap="lg">
          <Skeleton height={36} width={200} />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Skeleton height={160} />
            <Skeleton height={160} />
          </SimpleGrid>
        </Stack>
      </TeachingLayout>
    );
  }

  if (error || !bank) {
    return (
      <TeachingLayout>
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error"
          description={error ?? "Module not found"}
          colour="alert"
        />
      </TeachingLayout>
    );
  }

  const hasLearning = BANKS_WITH_LEARNING.has(bank.question_bank_id);

  const sidebarNav = (
    <TeachingMainNav
      moduleName={bank.title}
      moduleHref={`/teaching/${bankId}`}
    />
  );

  return (
    <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
      <Stack gap="lg">
        <PageHeader title={bank.title} />
        <BodyText>{bank.description}</BodyText>

        {hasLearning ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <ActionCard
              icon={<IconBook />}
              title="Learning materials"
              subtitle="Work through the learning content at your own pace before attempting the assessment."
              buttonLabel="Start learning"
              onClick={() =>
                navigate(`/teaching/learn/${bank.question_bank_id}/slide/0`)
              }
            />
            <ActionCard
              icon={<IconChalkboardTeacher />}
              title="Start assessment"
              subtitle="Test your knowledge with a timed multiple-choice assessment."
              buttonLabel="Start assessment"
              onClick={() =>
                navigate(
                  `/teaching/assessment/new?bank=${bank.question_bank_id}`,
                )
              }
            />
          </SimpleGrid>
        ) : (
          <ActionCard
            icon={<IconChalkboardTeacher />}
            title="Start assessment"
            subtitle="Test your knowledge with a timed multiple-choice assessment."
            buttonLabel="Start assessment"
            fullWidth
            onClick={() =>
              navigate(`/teaching/assessment/new?bank=${bank.question_bank_id}`)
            }
          />
        )}
      </Stack>
    </TeachingLayout>
  );
}
