/**
 * TeachingDashboard Page
 *
 * Landing page for the teaching feature. Lists available question banks
 * as picture cards, allows starting new assessments, and shows recent
 * assessment history.
 */

import { Box, Center, SimpleGrid, Skeleton, Stack } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import PageHeader from "@components/typography/PageHeader";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import PictureActionCard from "@/components/picture-action-card/PictureActionCard";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import { AssessmentHistoryTable } from "@/components/teaching/assessment-history-table/AssessmentHistoryTable";
import { Heading, BodyText } from "@/components/typography";
import type {
  AssessmentHistory,
  QuestionBank,
} from "@/features/teaching/types";

export default function TeachingDashboard() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [history, setHistory] = useState<AssessmentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [banksData, historyData] = await Promise.all([
          api.get<QuestionBank[]>("/teaching/question-banks"),
          api.get<AssessmentHistory[]>("/teaching/assessments/history"),
        ]);
        setBanks(banksData);
        setHistory(historyData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Built before the loading check, and passed to every branch below.
  // It depends on auth, which has already resolved by the time this
  // page renders, and not on the banks being fetched — so withholding
  // it until they arrive left the sidebar genuinely absent for two
  // round trips, which read as the whole page flashing on the way in.
  const sidebarNav = <TeachingMainNav />;

  if (loading) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <Stack gap="lg">
          {/* The real heading, not a skeleton of one. It is a constant
              and never waited on the fetch, so standing in for it made
              the title appear to flash as the grey bar was swapped for
              the words it was always going to say. Skeletons below,
              where the content genuinely is unknown. */}
          <PageHeader title="Teaching modules" />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Skeleton height={120} />
            <Skeleton height={120} />
          </SimpleGrid>
          <Skeleton height={24} width={150} />
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </Stack>
      </TeachingLayout>
    );
  }

  if (error) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <Stack gap="lg">
          {/* Kept here too, so a failed load still says which page the
              reader is on rather than presenting a bare error. */}
          <PageHeader title="Teaching modules" />
          <StateMessage
            icon={<IconAlertCircle />}
            title="Error loading data"
            description={error}
            colour="alert"
          />
        </Stack>
      </TeachingLayout>
    );
  }

  const liveBanks = banks.filter((bank) => bank.is_live);

  return (
    <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
      <Stack gap="lg">
        <PageHeader title="Teaching modules" />

        {liveBanks.length === 0 ? (
          <Center p="xl">
            <BodyText>No assessments are currently open</BodyText>
          </Center>
        ) : (
          <SimpleGrid
            cols={{ base: 1, sm: liveBanks.length === 1 ? 1 : 2 }}
            spacing="md"
          >
            {liveBanks.map((bank) => (
              <PictureActionCard
                key={bank.id}
                title={bank.title}
                description={bank.description}
                imageSrc={bank.cover_image_url}
                imageAlt={bank.title}
                imageFocus={bank.cover_image_focus}
                buttonLabel="View module"
                buttonUrl={`/teaching/${bank.question_bank_id}`}
              />
            ))}
          </SimpleGrid>
        )}

        <Box mt="md">
          <Heading>My history</Heading>
        </Box>
        <AssessmentHistoryTable
          assessments={history}
          onSelect={(id) => navigate(`/teaching/assessment/${id}/result`)}
        />
      </Stack>
    </TeachingLayout>
  );
}
