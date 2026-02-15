/**
 * Admin Component Stories
 *
 * Demonstrates the administrative interface for managing users, patients,
 * and system permissions. Shows different permission levels.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import Admin from "./Admin";

const meta = {
  title: "Admin/Admin",
  component: Admin,
  parameters: {
    layout: "padded",
  },
  args: {
    onLinkUserPatient: () => console.log("User-patient link created"),
    onUpdatePermissions: () => console.log("Permissions updated"),
  },
} satisfies Meta<typeof Admin>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample data for stories
const sampleUsers = [
  { id: "1", username: "johndoe", email: "john.doe@hospital.com" },
  { id: "2", username: "janedoe", email: "jane.doe@hospital.com" },
  { id: "3", username: "drsmith", email: "dr.smith@hospital.com" },
  { id: "4", username: "nursejones", email: "nurse.jones@hospital.com" },
  { id: "5", username: "adminuser", email: "admin.user@hospital.com" },
];

const samplePatients = [
  { id: "p1", name: "Alice Johnson" },
  { id: "p2", name: "Bob Williams" },
  { id: "p3", name: "Carol Davis" },
  { id: "p4", name: "David Martinez" },
  { id: "p5", name: "Eva Rodriguez" },
];

/**
 * Super Admin View
 *
 * Shows the admin interface with full superadmin permissions.
 * Superadmins can see and access the "Change System Permissions" section.
 * Displays statistics for 5 users and 5 patients.
 */
export const SuperAdminView: Story = {
  args: {
    userPermissions: "superadmin",
    existingUsers: sampleUsers,
    existingPatients: samplePatients,
  },
};

/**
 * Admin View
 *
 * Shows the admin interface with admin-level permissions.
 * Admins cannot see the "Change System Permissions" section.
 * Displays statistics for 5 users and 5 patients.
 */
export const AdminView: Story = {
  args: {
    userPermissions: "admin",
    existingUsers: sampleUsers,
    existingPatients: samplePatients,
  },
};

/**
 * Loading State
 *
 * Shows the admin interface while statistics are loading.
 * The Total Users and Total Patients counts show skeleton loaders.
 */
export const LoadingState: Story = {
  args: {
    userPermissions: "superadmin",
    loading: true,
    existingUsers: sampleUsers,
    existingPatients: samplePatients,
  },
};
