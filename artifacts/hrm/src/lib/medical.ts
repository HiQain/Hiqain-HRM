import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "./api";

export type MedicalDependent = {
  relation: "self" | "spouse" | "child";
  name: string;
};

export type MedicalSummary = {
  employee: {
    id: number;
    name: string;
    medicalEnabled: boolean;
    medicalDailyLimit: number;
    medicalOverallLimit: number;
    medicalOpdLimit: number;
    medicalIpdLimit: number;
  };
  userId: number;
  email: string;
  role: "admin" | "hr" | "employee";
  dependents: MedicalDependent[];
  medicalEnabled: boolean;
  limits: {
    daily: number;
    overall: number;
    opd: number;
    ipd: number;
  };
  used: {
    overall: number;
    opd: number;
    ipd: number;
    dailyByDate: Record<string, number>;
  };
  remaining: {
    overall: number;
    opd: number;
    ipd: number;
  };
};

export type MedicalClaim = {
  id: number;
  employeeId: number;
  employeeName: string;
  dependentRelation: "self" | "spouse" | "child";
  dependentName?: string | null;
  treatmentType: "opd" | "ipd";
  claimDate: string;
  hospitalName?: string | null;
  doctorName?: string | null;
  amount: number;
  approvedAmount?: number | null;
  notes?: string | null;
  reviewNote?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedByUserId?: number | null;
  reviewedAt?: string | null;
  createdByUserId: number;
  createdAt: string;
};

export const medicalClaimsQueryKey = ["medical-claims"] as const;
export const medicalSummaryQueryKey = ["medical-summary"] as const;

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

export function useMedicalClaims(params?: {
  employeeId?: number | null;
  status?: "pending" | "approved" | "rejected" | "all";
}) {
  const query = new URLSearchParams();
  if (params?.employeeId) query.set("employeeId", String(params.employeeId));
  if (params?.status && params.status !== "all") query.set("status", params.status);
  const suffix = query.toString();

  return useQuery({
    queryKey: [...medicalClaimsQueryKey, params?.employeeId ?? "self", params?.status ?? "all"],
    queryFn: () =>
      apiRequest<MedicalClaim[]>(
        `/api/medical/claims${suffix ? `?${suffix}` : ""}`,
      ),
  });
}

export function useMedicalSummary(employeeId?: number | null) {
  const suffix = employeeId ? `?employeeId=${employeeId}` : "";
  return useQuery({
    queryKey: [...medicalSummaryQueryKey, employeeId ?? "self"],
    queryFn: () => apiRequest<MedicalSummary>(`/api/medical/summary${suffix}`),
    enabled: employeeId !== 0,
  });
}

export function useCreateMedicalClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      apiRequest<MedicalClaim>("/api/medical/claims", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: medicalClaimsQueryKey });
      qc.invalidateQueries({ queryKey: medicalSummaryQueryKey });
      if (typeof vars.employeeId === "number") {
        qc.invalidateQueries({ queryKey: [...medicalSummaryQueryKey, vars.employeeId] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save medical claim");
    },
  });
}

export function useUpdateMedicalClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Record<string, unknown>;
    }) =>
      apiRequest<MedicalClaim>(`/api/medical/claims/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: medicalClaimsQueryKey });
      qc.invalidateQueries({ queryKey: medicalSummaryQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update medical claim");
    },
  });
}
