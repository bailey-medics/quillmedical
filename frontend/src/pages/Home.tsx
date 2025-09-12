import { Button, Stack, Title } from "@mantine/core";

export default function Home() {
  return (
    <Stack align="center" justify="center" style={{ minHeight: "70vh" }}>
      <Title order={1}>Quill Medical</Title>
      <Button size="md">Get started</Button>
    </Stack>
  );
}
