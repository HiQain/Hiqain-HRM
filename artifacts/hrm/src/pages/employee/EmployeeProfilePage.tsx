import { useState } from "react";
import {
  useGetMe,
  useGetEmployee,
  useGetEmployeeJourney,
  useUpdateEmployee,
  getGetEmployeeQueryKey,
  getGetEmployeeJourneyQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  Briefcase,
  Calendar,
  ShieldCheck,
  Upload,
  FileText,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { JourneyTimeline } from "@/components/JourneyTimeline";
import { FilePreview } from "@/components/FilePreview";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/lib/api";
import { formatCurrency, formatDate, formatHMRange12 } from "@/lib/utils";

export function EmployeeProfilePage() {
  const { data: me } = useGetMe();
  const id = me?.employeeId ?? 0;

  const { data: employee, isLoading } = useGetEmployee(id, {
    query: { enabled: !!id, queryKey: getGetEmployeeQueryKey(id) },
  });
  const { data: journey } = useGetEmployeeJourney(id, {
    query: { enabled: !!id, queryKey: getGetEmployeeJourneyQueryKey(id) },
  });

  if (!id) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Profile not available.
      </div>
    );
  }

  if (isLoading || !employee) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const probationActive = new Date(employee.probationEndDate) > new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your personal record at HRM." />

      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <SelfAvatarUploader
          employeeId={employee.id}
          currentName={employee.name}
          currentUrl={employee.avatarUrl ?? null}
        />
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">{employee.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {employee.position ?? "Team member"}
            {employee.department && ` · ${employee.department}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Pill icon={Briefcase}>Joined {formatDate(employee.joiningDate)}</Pill>
            <Pill icon={Calendar}>
              {Math.floor(employee.workDurationMonths / 12)}y {employee.workDurationMonths % 12}m
            </Pill>
            <Pill icon={ShieldCheck} tone={probationActive ? "warning" : "success"}>
              {probationActive
                ? `Probation until ${formatDate(employee.probationEndDate)}`
                : "Permanent"}
            </Pill>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contact
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" /> {employee.email}
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {employee.phone ?? "—"}
            </li>
            <li className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              {employee.address ?? "—"}
            </li>
            {(employee as any).lastQualification && (
              <li className="flex items-start gap-3">
                <GraduationCap className="h-4 w-4 mt-0.5 text-muted-foreground" />
                {(employee as any).lastQualification}
              </li>
            )}
            {!(employee as any).lastQualification && (
              <li className="flex items-start gap-3">
                <GraduationCap className="h-4 w-4 mt-0.5 text-muted-foreground" />
                {employee.education ?? "—"}
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Compensation
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Basic salary</span>
              <span className="font-semibold">{formatCurrency(employee.basicSalary)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Allowances</span>
              <span className="font-semibold">{formatCurrency(employee.allowances)}</span>
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Schedule
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Office hours</span>
              <span className="font-medium">
                {formatHMRange12(employee.officeStartTime, employee.officeEndTime)}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Grace period</span>
              <span className="font-medium">{employee.gracePeriodMinutes} min</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Employment contract
        </p>
        {employee.employmentContractUrl ? (
          <div className="mt-3">
            <FilePreview
              url={employee.employmentContractUrl}
              name={employee.employmentContractName}
              label="Employment contract"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Your employment contract will appear here once HR uploads it. Contact
            HR if you don't see it.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          CNIC document
        </p>
        {employee.cnicDocumentUrl ||
        employee.cnicFrontDocumentUrl ||
        employee.cnicBackDocumentUrl ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {employee.cnicDocumentUrl ? (
              <FilePreview
                url={employee.cnicDocumentUrl}
                name={employee.cnicDocumentName}
                label="CNIC document"
              />
            ) : null}
            {employee.cnicFrontDocumentUrl ? (
              <FilePreview
                url={employee.cnicFrontDocumentUrl}
                name={employee.cnicFrontDocumentName}
                label="Front CNIC"
              />
            ) : null}
            {employee.cnicBackDocumentUrl ? (
              <FilePreview
                url={employee.cnicBackDocumentUrl}
                name={employee.cnicBackDocumentName}
                label="Back CNIC"
              />
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Your CNIC document will appear here once HR uploads it.
          </p>
        )}
      </div>

      <SelfAdditionalDetailsCard employee={employee} />

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="mb-5 text-sm font-semibold">Your journey</p>
        <JourneyTimeline events={journey?.events ?? []} />
      </div>
    </div>
  );
}

function selfUpload(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return fetch(getApiUrl("/api/uploads"), {
    method: "POST",
    body: fd,
    credentials: "include",
  }).then(async (r) => {
    if (!r.ok) throw new Error("Upload failed");
    return r.json() as Promise<{ url: string; name: string }>;
  });
}

function SelfAvatarUploader({
  employeeId,
  currentName,
  currentUrl,
}: {
  employeeId: number;
  currentName: string;
  currentUrl: string | null;
}) {
  const qc = useQueryClient();
  const update = useUpdateEmployee();
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const { url } = await selfUpload(file);
      update.mutate(
        { id: employeeId, data: { avatarUrl: url } },
        {
          onSuccess: () => {
            qc.invalidateQueries({
              queryKey: getGetEmployeeQueryKey(employeeId),
            });
            toast.success("Profile photo updated");
          },
        },
      );
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <EmployeeAvatar name={currentName} url={currentUrl} size="xl" />
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] hover:bg-muted">
        <Upload className="h-3 w-3" />
        {busy ? "Uploading..." : currentUrl ? "Replace photo" : "Upload photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPick(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function SelfAdditionalDetailsCard({ employee }: { employee: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Additional details
        </p>
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          HR / Admin managed
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        You can update only your profile photo from this side. All other profile
        details are maintained by Admin or HR.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="Phone" value={employee.phone} />
        <Detail label="Address" value={employee.address} />
        <Detail label="CNIC" value={employee.cnic} />
        <Detail label="Emergency contact" value={employee.emergencyContact} />
        <Detail
          label="Last qualification"
          value={employee.lastQualification ?? employee.education}
        />
        <Detail
          label="Date of birth"
          value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : null}
        />
        <div className="sm:col-span-2">
          <Detail label="Family members" value={employee.immediateFamily} />
        </div>
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || "—"}</dd>
    </div>
  );
}

function Pill({
  icon: Icon,
  children,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const tones = {
    default: "bg-muted text-foreground",
    warning: "bg-amber-50 text-amber-700",
    success: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tones[tone]}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}
