import {
  Box,
  Center,
  Container,
  SimpleGrid,
  Skeleton,
  Stack,
} from "@mantine/core";
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

/** Static cover images for each question bank module. */
const MODULE_IMAGES: Record<string, { src: string; alt: string }> = {
  "colonoscopy-optical-diagnosis-test": {
    src: "/teaching/colonoscopy-optical-diagnosis-test.png",
    alt: "Colonoscopy image showing a colorectal polyp",
  },
  "chest-xray-interpretation-test": {
    src: "/teaching/chest-xray-interpretation-test.png",
    alt: "Chest X-ray showing a left-sided pneumothorax",
  },
};

/** Display order for modules on the teaching dashboard. */
const MODULE_ORDER: string[] = [
  "colonoscopy-optical-diagnosis-test",
  "chest-xray-interpretation-test",
];

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

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={36} width={200} />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Skeleton height={120} />
            <Skeleton height={120} />
          </SimpleGrid>
          <Skeleton height={24} width={150} />
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error}
          colour="alert"
        />
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Teaching" />

        {banks.filter((bank) => bank.is_live).length === 0 ? (
          <Center p="xl">
            <BodyText>No assessments are currently open</BodyText>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {banks
              .filter((bank) => bank.is_live)
              .sort(
                (a, b) =>
                  (MODULE_ORDER.indexOf(a.question_bank_id) >>> 0) -
                  (MODULE_ORDER.indexOf(b.question_bank_id) >>> 0),
              )
              .map((bank) => {
                const image = MODULE_IMAGES[bank.question_bank_id];
                return (
                  <PictureActionCard
                    key={bank.id}
                    title={bank.title}
                    description={bank.description}
                    imageSrc={image?.src}
                    imageAlt={image?.alt}
                    buttonLabel="View module"
                    buttonUrl={`/teaching/${bank.question_bank_id}`}
                  />
                );
              })}
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
    </Container>
  );
}
