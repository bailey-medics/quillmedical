import {
  Container,
  Group,
  SimpleGrid,
  Stack,
  useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconBell, IconMoon, IconUser } from "@/components/icons/appIcons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import ActionCard from "@/components/action-card";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import SolidSwitch from "@/components/form/SolidSwitch";
import { BodyText, Heading } from "@/components/typography";
import { api } from "@/lib/api";
import { appFeatureFlags } from "@/lib/featureFlags";
import { layoutTokens } from "@/theme";
import classes from "./Settings.module.css";

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
  const [useTotp, setUseTotp] = useState(false);
  const navigate = useNavigate();
  const { state } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const useTwoColumnActionCards = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );
  const [notificationState, setNotificationState] = useState<
    "idle" | "busy" | "ok" | "denied" | "err"
  >("idle");

  async function enableNotifications() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNotificationState("denied");
        return;
      }

      setNotificationState("busy");
      const reg = await navigator.serviceWorker.ready;
      const vapid = import.meta.env.VITE_VAPID_PUBLIC;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8Array(vapid),
      });

      await api.post<unknown>("/push/subscribe", sub.toJSON());
      setNotificationState("ok");
    } catch (error) {
      console.error(error);
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
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title="Settings" />

        <SimpleGrid cols={useTwoColumnActionCards ? 2 : 1}>
          {appFeatureFlags.settingsNotificationsCardEnabled && (
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
          )}

          <ActionCard
            icon={<IconUser />}
            title="Account"
            subtitle="Email: you@example.com"
            buttonLabel="Change password"
            buttonUrl="/settings/password"
          />

          {state.status === "authenticated" &&
            !state.user.clinical_services_enabled && (
              <ActionCard
                icon={<IconMoon />}
                title="Dark mode"
                subtitle="Switch between light and dark colour schemes."
                action={
                  <SolidSwitch
                    checked={colorScheme === "dark"}
                    onChange={() =>
                      setColorScheme(colorScheme === "dark" ? "light" : "dark")
                    }
                  />
                }
              />
            )}

          <BaseCard className={classes.totpCard}>
            <Stack gap="md">
              <Stack gap="md" className={classes.breakLongWords}>
                <Stack gap={4}>
                  <Heading>Two-factor authentication (TOTP)</Heading>
                  <BodyText>
                    Use an authenticator app to add a second factor to your
                    account.
                  </BodyText>
                </Stack>
                <SolidSwitch
                  checked={useTotp}
                  onChange={(e) => setUseTotp(e.currentTarget.checked)}
                />
              </Stack>
              <Group justify="flex-end">
                <IconTextButton
                  icon="settings"
                  label="Configure TOTP"
                  variant="filled"
                  fullWidth
                  disabled={!useTotp}
                  onClick={() => navigate("/settings/totp")}
                />
              </Group>
            </Stack>
          </BaseCard>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
