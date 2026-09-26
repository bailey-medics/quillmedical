/**
 * Settings Page
 *
 * User settings hub with profile management, appearance preferences,
 * and notification configuration. Uses action cards for navigation
 * to sub-settings.
 */

import { Group, SimpleGrid, Stack, useMantineColorScheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconBell,
  IconChartBar,
  IconMoon,
  IconUser,
} from "@/components/icons/appIcons";
import { useEffect, useState } from "react";
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
import { useHasFeature } from "@/lib/features";
import { useHasCompetency } from "@/lib/cbac/hooks";
import PassportSpecialtyCard from "@/components/passport/PassportSpecialtyCard";
import { fetchMyPassport, setPassportSpecialties } from "@lib/passport";
import { hasOptedOut, setOptedOut } from "@/lib/page-views/optOut";
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
  // Switched on unless the user has said otherwise: this is an opt-out, and
  // the switch reads positively ("help improve") rather than as a negative to
  // be un-ticked. Read once on mount — the preference only changes here.
  const [countPageViews, setCountPageViews] = useState(!hasOptedOut());
  const navigate = useNavigate();
  const { state } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const useTwoColumnActionCards = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );
  const [notificationState, setNotificationState] = useState<
    "idle" | "busy" | "ok" | "denied" | "err"
  >("idle");

  // The passport specialty card, for somebody who has a passport. Asked
  // only of those who could reach one, the same test the side navigation
  // uses; a 404 then means they have not created one, and there is no
  // card rather than an error.
  const passportEnabled = useHasFeature("passport");
  const canReachPassport = useHasCompetency("assess_clinician_passport");
  const [passport, setPassport] = useState<{
    id: string;
    specialties: string[];
    canWrite: boolean;
  } | null>(null);
  const [specialtyError, setSpecialtyError] = useState<string | undefined>();

  useEffect(() => {
    if (!passportEnabled || !canReachPassport) return;
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        setPassport({
          id: detail.passport.passport_id,
          specialties: detail.passport.specialties.map((s) => s.id),
          canWrite: detail.entitlement?.can_write !== false,
        });
      })
      .catch(() => {
        /* no passport, or none reachable: no card */
      });

    return () => {
      cancelled = true;
    };
  }, [passportEnabled, canReachPassport]);

  function saveSpecialties(next: string[]) {
    if (passport === null) return;
    const previous = passport.specialties;

    // Shown at once, and put back if the save fails, so the field never
    // claims a specialty the record does not hold.
    setPassport({ ...passport, specialties: next });
    setSpecialtyError(undefined);

    setPassportSpecialties(passport.id, next).catch(() => {
      setPassport((current) =>
        current ? { ...current, specialties: previous } : current,
      );
      setSpecialtyError("Your specialty could not be saved. Please try again.");
    });
  }

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
          subtitle="Update your profile and password"
          buttonLabel="Manage account"
          buttonUrl="/settings/account"
        />

        {passport && (
          <PassportSpecialtyCard
            value={passport.specialties}
            onChange={saveSpecialties}
            disabled={!passport.canWrite}
            error={specialtyError}
          />
        )}

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

        <ActionCard
          icon={<IconChartBar />}
          title="Help improve Quill"
          subtitle="Count which pages get used, so the parts people rely on can be improved. Patient pages are never counted, and nothing recorded identifies you."
          action={
            <SolidSwitch
              // The card's title is not associated with the switch, so
              // without this a screen reader announces an unlabelled control.
              aria-label="Help improve Quill"
              checked={countPageViews}
              onChange={(event) => {
                const on = event.currentTarget.checked;
                setCountPageViews(on);
                setOptedOut(!on);
              }}
            />
          }
        />

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
  );
}
