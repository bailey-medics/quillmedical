import Messaging, { type Message } from "@/components/messaging/Messaging";
import demoMessages from "@/components/messaging/demoMessages";
import PatientDemographics from "@/components/patients/PatientDemographics";
import type { Patient } from "@domains/patient";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import MainLayout from "./MainLayout";

const demoPatientFull: Patient = {
  id: "p123",
  name: "Alice Example",
  dob: "01/01/1980",
  age: 44,
  sex: "F",
  nhsNumber: "123 456 7890",
  address: "Flat 2, 10 High Street, Exampletown, EX4 3PL",
  telephone: "020 7946 0000",
  mobile: "07700 900123",
  onQuill: true,
  nextOfKin: { name: "Bob Example", phone: "07700 900124" },
};

const meta: Meta<typeof MainLayout> = {
  title: "Complete",
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
