import { Button, Paper, Stack, TextInput, Title } from "@mantine/core";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export default function TotpSetup() {
  const [provisionUri, setProvisionUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchUri() {
      try {
        const out = await api.post<{ provision_uri: string }>(
          "/auth/totp/setup"
        );
        setProvisionUri(out.provision_uri);
      } catch (e) {
        setError("Failed to get provisioning URI");
      }
    }
    void fetchUri();
  }, []);

  useEffect(() => {
    if (!provisionUri || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, provisionUri, { width: 240 });
  }, [provisionUri]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/auth/totp/verify", { code });
      setSuccess("Two-factor enabled");
    } catch (err: unknown) {
      setError("Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper maw={480} mx="auto" p="lg" mt="xl" radius="md" withBorder>
      <Stack>
        <Title order={3}>Set up Two-Factor Authentication</Title>
        <div>
          <p>
            Scan the QR code below with your authenticator app (or copy the
            provided URL into your app).
          </p>
          <canvas ref={canvasRef} />
          {provisionUri && (
            <p style={{ wordBreak: "break-all" }}>{provisionUri}</p>
          )}
        </div>

        <form onSubmit={onVerify}>
          <Stack>
            <TextInput
              label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              placeholder="123456"
              required
            />
            {error && <div style={{ color: "crimson" }}>{error}</div>}
            {success && <div style={{ color: "green" }}>{success}</div>}
            <Button type="submit" loading={loading} disabled={!code}>
              Verify and enable
            </Button>
          </Stack>
        </form>
      </Stack>
    </Paper>
  );
}
