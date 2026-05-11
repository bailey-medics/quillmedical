/**
 * TOTP Setup Page Module
 *
 * Two-factor authentication setup page allowing users to configure TOTP
 * (Time-based One-Time Password) authentication. Generates QR code for
 * scanning with authenticator apps (Google Authenticator, Authy, etc.).
 */

import { Container, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import TextField from "@/components/form/TextField";
import { BodyText, Heading } from "@/components/typography";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface TotpVerifyFormValues {
  code: string;
}

function TotpVerifyFields() {
  const navigate = useNavigate();
  const { methods, formState } = useFormContext();

  useEffect(() => {
    if (formState === "success") {
      methods.reset({ code: "" });
    }
  }, [formState, methods]);

  return (
    <Stack>
      <TextField
        label="6-digit code"
        placeholder="123456"
        {...methods.register("code", {
          required: "Please enter the 6-digit code",
        })}
        error={methods.formState.errors.code?.message as string}
        withAsterisk
      />
      <FormStatus />
      <SubmitButton onCancel={() => navigate("/settings")} />
    </Stack>
  );
}

/**
 * TOTP Setup Page
 *
 * Fetches TOTP provision URI from backend, renders as QR code, and provides
 * verification input for confirming setup. Users scan QR code with their
 * authenticator app and enter the 6-digit code to enable two-factor auth.
 *
 * @returns TOTP setup page with QR code and verification form
 */
export default function TotpSetup() {
  const [provisionUri, setProvisionUri] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    async function fetchUri() {
      try {
        const out = await api.post<{ provision_uri: string }>(
          "/auth/totp/setup",
        );
        setProvisionUri(out.provision_uri);
      } catch {
        setSetupError("Failed to get provisioning URI");
      }
    }
    void fetchUri();
  }, []);

  useEffect(() => {
    if (!provisionUri || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, provisionUri, { width: 240 });
  }, [provisionUri]);

  async function handleSubmit(
    data: TotpVerifyFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.post("/auth/totp/verify", { code: data.code });
      return {
        state: "success",
        message: { title: "Two-factor enabled" },
      };
    } catch {
      return {
        state: "error",
        message: { title: "Verification failed" },
      };
    }
  }

  return (
    <Container size="lg" py="xl">
      <BaseCard maw={480} mx="auto">
        <Stack>
          <Heading>Set up two-factor authentication</Heading>
          <div>
            <BodyText>
              Scan the QR code below with your authenticator app (or copy the
              provided URL into your app).
            </BodyText>
            <canvas
              ref={canvasRef}
              style={{ display: "block", margin: "0 auto" }}
            />
            {provisionUri && (
              <div style={{ wordBreak: "break-all" }}>
                <BodyText>{provisionUri}</BodyText>
              </div>
            )}
            {setupError && <BodyText c="red">{setupError}</BodyText>}
          </div>

          <Form<TotpVerifyFormValues>
            defaultValues={{ code: "" }}
            onSubmit={handleSubmit}
            submitLabel="Verify and enable"
            submittingLabel="Verifying…"
          >
            <TotpVerifyFields />
          </Form>
        </Stack>
      </BaseCard>
    </Container>
  );
}
