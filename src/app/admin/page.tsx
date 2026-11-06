import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/AdminApp";

export const metadata: Metadata = {
  title: "Admin · Eboclean",
  robots: { index: false, follow: false },
};

// Owner dashboard: growth, money, subscriptions, AI costs, users, emails and alerts.
// Only accounts listed in ADMIN_EMAILS can load any of its data.
export default function AdminPage() {
  return <AdminApp />;
}
