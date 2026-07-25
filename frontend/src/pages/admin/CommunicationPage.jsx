import { useState } from "react";
import { Headphones, MessageSquare } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { SmsPage } from "./SmsPage";
import { SupportPage } from "../shared/SupportPage";

const TABS = [
  { id: "sms", label: "SMS", icon: MessageSquare },
  { id: "support", label: "Support", icon: Headphones }
];

export function CommunicationPage() {
  const [tab, setTab] = useState("sms");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Communication"
        subtitle="Send SMS messages and handle customer support complaints in one place."
      />

      <div className="inline-flex rounded-xl border border-outline-variant bg-surface-container-low p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-primary-container text-white shadow-sm"
                  : "text-on-surface-variant hover:text-primary-container"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "sms" ? <SmsPage embedded /> : <SupportPage embedded />}
    </div>
  );
}
