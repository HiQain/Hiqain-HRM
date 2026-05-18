import { BellRing, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/notifications";
import { formatDate } from "@/lib/utils";

export function NotificationsPage() {
  const { data, isLoading } = useNotifications(false);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [, setLocation] = useLocation();

  const requestBrowserPermission = async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") return;
    await Notification.requestPermission();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="In-app alerts, popup toasts, and browser notifications all land here."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void requestBrowserPermission()}>
              Enable browser alerts
            </Button>
            <Button
              variant="outline"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="gap-2"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Loading notifications...
          </div>
        ) : !data?.length ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-muted/40"
                onClick={() => {
                  if (!item.isRead) markRead.mutate(item.id);
                  if (item.href) setLocation(item.href);
                }}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-primary" />
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    {!item.isRead && <StatusBadge status="pending" className="ml-1" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                </div>
                {item.href ? (
                  <span className="shrink-0 text-xs font-medium text-primary">
                    Open
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
