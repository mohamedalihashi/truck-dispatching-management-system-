import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useNotifications } from "../../hooks/useApi";
import { api } from "../../services/api";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../../components/ui/EmptyState";

function splitNotificationMessage(message) {
  const lines = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { title: "Ogeysiis", details: [] };
  return { title: lines[0], details: lines.slice(1) };
}

function humanizeType(type) {
  return String(type || "")
    .replaceAll(".", " · ")
    .replaceAll("_", " ");
}

export function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const qc = useQueryClient();

  async function markRead(id) {
    await api.markNotificationRead(id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markAllRead() {
    const unread = (data?.data || []).filter((item) => !item.read);
    await Promise.all(unread.map((item) => api.markNotificationRead(item.id)));
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        subtitle="Ogeysiis buuxa: magaca, jidka (pickup → destination), iyo xaaladda si aad ula socoto."
        actions={
          (data?.data || []).some((item) => !item.read) ? (
            <Button variant="secondary" onClick={markAllRead}>
              Mark all read
            </Button>
          ) : null
        }
      />
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Inbox — socodka safarka</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Macmiil, darawal, iyo cinwaanka jidka ayaa fariin kasta ku jira.
          </p>
        </div>
        <div className="space-y-0 divide-y divide-outline-variant">
          {isLoading && <p className="px-6 py-10 text-center text-sm text-on-surface-variant">Loading…</p>}
          {!isLoading && !(data?.data || []).length && (
            <div className="p-6">
              <EmptyState title="Inbox clear" text="No notifications yet. Management system events will appear here." />
            </div>
          )}
          {(data?.data || []).map((item) => {
            const { title, details } = splitNotificationMessage(item.message);
            return (
              <article
                key={item.id}
                className={`flex items-start justify-between gap-4 px-6 py-5 ${
                  item.read ? "bg-surface-container-lowest" : "bg-secondary-fixed/40"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-semibold text-primary-container">{title}</p>
                  {details.length > 0 && (
                    <div className="space-y-1 text-sm leading-relaxed text-on-surface whitespace-pre-wrap">
                      {details.map((line) => (
                        <p
                          key={`${item.id}-${line}`}
                          className={
                            line.startsWith("Macmiil:") ||
                            line.startsWith("Darawal:") ||
                            line.startsWith("Nooca gaariga:") ||
                            line.startsWith("Taargada:") ||
                            line.startsWith("Gaari:") ||
                            line.startsWith("Jidka:") ||
                            line.startsWith("Xaalad:")
                              ? "font-medium text-on-surface"
                              : "text-on-surface-variant"
                          }
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-on-surface-variant">
                    {humanizeType(item.type)}
                    {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ""}
                  </p>
                </div>
                {!item.read && (
                  <Button variant="secondary" onClick={() => markRead(item.id)}>
                    Mark read
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
