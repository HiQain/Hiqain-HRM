import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "./api";

export type AttendanceExtensionStatus = {
  eligible?: boolean;
  link: {
    connected: boolean;
    status: "pending" | "connected" | "revoked";
    deviceName: string | null;
    lastState: "active" | "idle" | "locked" | "offline" | null;
    lastHeartbeatAt: string | null;
    lastActiveAt: string | null;
    lastWarningAt: string | null;
    idleForMinutes: number;
    heartbeatStaleMinutes: number;
    browserAlive: boolean | null;
    networkOnline: boolean | null;
    extensionVersion: string | null;
    warningActive: boolean;
    warningCountdownMinutes: number | null;
    pendingCode: string | null;
    codeExpiresAt: string | null;
    connectedAt: string | null;
  } | null;
  thresholds: {
    pauseMinutes: number;
    warningMinutes: number;
    checkoutMinutes: number;
  };
};

export type AdminAttendanceExtensionStatus = {
  employeeId: number;
  employeeName: string;
  employeeCode: string | null;
  department: string | null;
  position: string | null;
  attendanceState: "none" | "active" | "paused" | "checked_out";
  extension: AttendanceExtensionStatus["link"];
};

export const attendanceExtensionStatusQueryKey = ["attendance-extension-status"] as const;

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

export function useAttendanceExtensionStatus() {
  return useQuery({
    queryKey: attendanceExtensionStatusQueryKey,
    queryFn: () =>
      apiRequest<AttendanceExtensionStatus>("/api/attendance/extension/status"),
    refetchInterval: 30_000,
  });
}

export function useAdminAttendanceExtensionStatuses(enabled = true) {
  return useQuery({
    queryKey: ["admin-attendance-extension-status"],
    queryFn: () =>
      apiRequest<AdminAttendanceExtensionStatus[]>(
        "/api/attendance/extension/admin-status",
      ),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useGenerateAttendanceExtensionCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiRequest<AttendanceExtensionStatus>("/api/attendance/extension/link", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attendanceExtensionStatusQueryKey });
      toast.success("New browser extension code generated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not generate code");
    },
  });
}

export function usePrepareAttendanceExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiRequest<AttendanceExtensionStatus>("/api/attendance/extension/prepare", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attendanceExtensionStatusQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not prepare extension");
    },
  });
}

export function useDisconnectAttendanceExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiRequest<AttendanceExtensionStatus>("/api/attendance/extension/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attendanceExtensionStatusQueryKey });
      toast.success("Browser extension disconnected");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not disconnect extension");
    },
  });
}
