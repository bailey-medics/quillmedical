import Messaging, { type Message } from "@/components/messaging/Messaging";
import PatientDemographics from "@/components/patients/PatientDemographics";
import demoMessages from "@/demo-data/messaging/demoMessages";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import MainLayout from "./MainLayout";

import { demoPatientFull } from "@/demo-data/patients/demoPatients";

const meta: Meta<typeof MainLayout> = {
  title: "Layout-Complete",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof MainLayout>;

export const WithPatientDemographics: Story = {
  args: { patient: demoPatientFull, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <div style={{ padding: 16 }}>
        <PatientDemographics patient={demoPatientFull} />
      </div>
    </MainLayout>
  ),
};

export const WithMessaging: Story = {
  args: { patient: demoPatientFull, isLoading: false },
  render: (args) => {
    function MessagingContent() {
      const [messages, setMessages] = useState<Message[]>(
        demoMessages as Message[]
      );

      return (
        <div style={{ height: 480 }}>
          <Messaging
            messages={messages}
            currentUserId="me"
            onSend={(text: string) =>
              setMessages((m) => [
                ...m,
                {
                  id: String(m.length + 1),
                  senderId: "me",
                  text,
                  timestamp: new Date().toISOString(),
                },
              ])
            }
          />
        </div>
      );
    }

    return (
      <MainLayout {...args}>
        <MessagingContent />
      </MainLayout>
    );
  },
};
