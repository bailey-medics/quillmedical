import QuillName from "@components/images/QuillName";
import {
  Anchor,
  Box,
  Container,
  Group,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import type { ReactNode } from "react";

interface PublicLayoutProps {
  /** Page content */
  children: ReactNode;
  /** URL for the "Sign in" link (default: "/login") */
  signInUrl?: string;
  /** Footer text (default: copyright notice) */
  footerText?: string;
}

export default function PublicLayout({
  children,
  signInUrl = "/login",
  footerText = `© ${new Date().getFullYear()} Quill Medical`,
}: PublicLayoutProps) {
  const theme = useMantineTheme();

  return (
    <Stack gap={0} style={{ minHeight: "100dvh" }}>
      <Box
        component="header"
        py="sm"
        style={{ borderBottom: `1px solid ${theme.colors.gray[2]}` }}
      >
        <Container size="lg">
          <Group justify="space-between" align="center">
            <Anchor href="/" underline="never">
              <QuillName height={1.5} />
            </Anchor>
            <Anchor href={signInUrl} size="sm">
              Sign in
            </Anchor>
          </Group>
        </Container>
      </Box>

      <Box component="main" style={{ flex: 1 }}>
        {children}
      </Box>

      <Box
        component="footer"
        py="sm"
        style={{ borderTop: `1px solid ${theme.colors.gray[2]}` }}
      >
        <Container size="lg">
          <Text size="sm" c="dimmed" ta="center">
            {footerText}
          </Text>
        </Container>
      </Box>
    </Stack>
  );
}
