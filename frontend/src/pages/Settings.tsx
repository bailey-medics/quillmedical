import { Button, Card, Group, Stack, Switch, Text, Title } from "@mantine/core";
import { useState } from "react";

export default function Settings() {
  const [useTotp, setUseTotp] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Stack style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <Title order={2}>Settings</Title>

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
          <Switch checked={useTotp} onChange={(e) => setUseTotp(e.currentTarget.checked)} />
        </div>
        <div style={{ height: 12 }} />
        <Group>
          <Button disabled={!useTotp} variant="outline" component="a" href="/settings/totp">
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

      <Card shadow="sm">
        <Title order={4}>Account</Title>
        <Text size="sm" color="dimmed">
          Email: you@example.com
        </Text>
        <div style={{ height: 12 }} />
        <Button variant="outline">Change password</Button>
      </Card>
    </Stack>
  );
}
