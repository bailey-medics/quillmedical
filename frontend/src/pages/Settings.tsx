import { Container, Group, SimpleGrid, Stack } from "@mantine/core";
import { IconBell, IconUser } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionCard from "@/components/action-card";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import SolidSwitch from "@/components/form/SolidSwitch";
import { BodyText, HeaderText } from "@/components/typography";

// Convert URL-safe Base64 VAPID key to Uint8Array for subscribe()
function b64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

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
  const navigate = useNavigate();
  /**
   * Tracks the state of push notification enabling
   */
  const [notificationState, setNotificationState] = useState<
    "idle" | "busy" | "ok" | "denied" | "err"
  >("idle");

  async function enableNotifications() {
    try {
      // 1) Ask the user
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNotificationState("denied");
        return;
      }

      setNotificationState("busy");

      // 2) Wait for the service worker
      const reg = await navigator.serviceWorker.ready;

      // 3) Subscribe with your public VAPID key
      const vapid = import.meta.env.VITE_VAPID_PUBLIC as string;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8Array(vapid),
      });

      // 4) Send subscription to your backend for storage
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("Subscribe API failed");

      setNotificationState("ok");
    } catch (e) {
      console.error(e);
      setNotificationState("err");
    }
  }

  const getNotificationButtonLabel = () => {
    switch (notificationState) {
      case "ok":
        return "Notifications enabled";
      case "busy":
        return "Enabling…";
      case "denied":
        return "Permission denied";
      case "err":
        return "Error — try again";
      default:
        return "Enable notifications";
    }
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Settings" />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ActionCard
            icon={<IconBell />}
            title="Notifications"
            subtitle="Enable push notifications to stay updated"
            buttonLabel={getNotificationButtonLabel()}
            onClick={enableNotifications}
            disabled={
              notificationState === "busy" || notificationState === "ok"
            }
          />

          <ActionCard
            icon={<IconUser />}
            title="Account"
            subtitle="Email: you@example.com"
            buttonLabel="Change password"
            buttonUrl="/settings/password"
          />
        </SimpleGrid>

        <BaseCard>
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={4}>
                <HeaderText>Two-factor authentication (TOTP)</HeaderText>
                <BodyText>
                  Use an authenticator app to add a second factor to your
                  account.
                </BodyText>
              </Stack>
              <SolidSwitch
                checked={useTotp}
                onChange={(e) => setUseTotp(e.currentTarget.checked)}
              />
            </Group>
            <Group justify="flex-end">
              <IconTextButton
                icon="settings"
                label="Configure TOTP"
                variant="filled"
                disabled={!useTotp}
                onClick={() => navigate("/settings/totp")}
              />
            </Group>
          </Stack>
        </BaseCard>
      </Stack>
    </Container>
  );
}
