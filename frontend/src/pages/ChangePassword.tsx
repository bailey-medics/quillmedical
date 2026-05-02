/**
 * Change Password Page Module
 *
 * Allows authenticated users to change their password by providing
 * their current password and a new password with confirmation.
 */

import { Button, Container, Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import PasswordField from "@/components/form/PasswordField";
import { BodyText, ErrorMessage, Heading } from "@/components/typography";
import { useState } from "react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

/**
 * Change Password Page
 *
 * Form with current password, new password, and confirm new password
 * fields. Validates that passwords match before submitting to the
 * backend. On success, navigates back to settings.
 *
 * @returns Change password form page
 */
export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to change password";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Container size="lg" py="xl">
        <BaseCard maw={480} mx="auto">
          <Stack>
            <Heading>Password changed</Heading>
            <BodyText>Your password has been updated successfully.</BodyText>
            <Group justify="flex-end">
              <Button onClick={() => navigate("/settings")}>
                Back to settings
              </Button>
            </Group>
          </Stack>
        </BaseCard>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <BaseCard maw={480} mx="auto">
        <form onSubmit={onSubmit}>
          <Stack>
            <Heading>Change password</Heading>
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
              required
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => navigate("/settings")}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Change password
              </Button>
            </Group>
          </Stack>
        </form>
      </BaseCard>
    </Container>
  );
}
