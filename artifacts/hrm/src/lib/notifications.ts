import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "./api";

export type AppNotification = {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  isRead: boolean;
  createdAt: string;
};

export const notificationsQueryKey = ["notifications"] as const;

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Request failed");
  }
  return (await res.json()) as T;
}

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [...notificationsQueryKey, unreadOnly ? "unread" : "all"],
    queryFn: () =>
      apiRequest<AppNotification[]>(
        unreadOnly ? "/api/notifications?unread=1" : "/api/notifications",
      ),
    refetchInterval: 20_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      apiRequest<{ success: true }>(`/api/notifications/${id}/read`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update notification");
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiRequest<{ success: true }>("/api/notifications/read-all", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update notifications");
    },
  });
}
