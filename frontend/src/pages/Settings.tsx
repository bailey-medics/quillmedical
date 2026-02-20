import {
  Button,
  Card,
  Container,
  Group,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconUser } from "@tabler/icons-react";
import { useState } from "react";
import ActionCard from "@/components/action-card";
import Icon from "@/components/icons";
import EnableNotificationsButton from "@/components/notifications";
import PageHeader from "@/components/page-header";

/**
 * Settings page component.
 *
 * Provides account settings such as enabling
 * time-based one-time password (TOTP) two-factor
 * authentication and changing the user password.
 *
 * @returns A JSX element containing the settings UI.
 */
export default function Settings() {
  /**
   * Whether the user has opted to enable
   * TOTP-based two-factor authentication.
   */
  const [useTotp, setUseTotp] = useState(false);
  /**
   * Tracks whether the settings are currently being saved.
   * Used to show a loading state on the Save button.
   */
  const [saving, setSaving] = useState(false);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Settings" size="lg" mb={0} />
        <Card shadow="sm">
          <EnableNotificationsButton />
        </Card>
        <Card shadow="sm">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <Text fw={700}>Two-factor authentication (TOTP)</Text>
              <Text size="sm" color="dimmed">
                Use an authenticator app to add a second factor to your account.
              </Text>
            </div>
            <Switch
              checked={useTotp}
              onChange={(e) => setUseTotp(e.currentTarget.checked)}
            />
          </div>
          <div style={{ height: 12 }} />
          <Group>
            <Button
              disabled={!useTotp}
              variant="outline"
              component="a"
              href="/settings/totp"
            >
              Configure TOTP
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                setSaving(true);
                setTimeout(() => setSaving(false), 600);
              }}
            >
              Save
            </Button>
          </Group>
        </Card>

        <ActionCard
          icon={<Icon icon={<IconUser />} size="lg" />}
          title="Account"
          subtitle="Email: you@example.com"
          buttonLabel="Change password"
          buttonUrl="/settings/password"
        />
      </Stack>
    </Container>
  );
}
