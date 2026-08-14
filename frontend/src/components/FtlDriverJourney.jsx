import { Package, Route, Wallet } from "lucide-react";

export const FTL_DRIVER_ACTIONS = [
  {
    to: "/driver/jobs",
    icon: Route,
    title: "Assigned Jobs",
    text: "Trips admin assigned to you.",
    tone: "bg-primary-fixed text-on-primary-fixed"
  },
  {
    to: "/driver/earnings",
    icon: Wallet,
    title: "Earnings",
    text: "Paid after customer pays 100% (Delivered).",
    tone: "bg-tertiary-fixed text-on-tertiary-fixed"
  },
  {
    to: "/driver/truck",
    icon: Package,
    title: "Truck Profile",
    text: "Your truck ID, documents, and status.",
    tone: "bg-primary-fixed text-on-primary-fixed"
  }
];
