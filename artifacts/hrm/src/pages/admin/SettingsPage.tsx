import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Trash2,
  Upload,
  FileText,
  X,
  Type,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/RichTextEditor";
import { DateField } from "@/components/DateField";

type Country = "us" | "pk" | "other";

const WEEK_DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return fetch(`${import.meta.env.BASE_URL}api/uploads`, {
    method: "POST",
    body: fd,
    credentials: "include",
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(text || `Upload failed (${r.status})`);
    }
    return r.json();
  });
}

export function AdminSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const update = useUpdateSettings();

  const [form, setForm] = useState({
    companyName: "",
    defaultCasualLeaveQuota: 6,
    defaultSickLeaveQuota: 6,
    defaultAnnualLeaveQuota: 12,
    defaultGracePeriodMinutes: 15,
    defaultProbationMonths: 3,
    defaultOfficeStartTime: "09:00",
    defaultOfficeEndTime: "18:00",
    weeklyOffDays: [0, 6] as number[],
    proRatedQuotas: true,
    attendancePolicy: "",
    attendancePolicyFileUrl: "",
    attendancePolicyFileName: "",
    basicSalaryPercent: 50,
    allowancePercent: 50,
    defaultProvidentFundPercent: 5,
    companyPolicy: "",
    companyPolicyFileUrl: "",
    companyPolicyFileName: "",
    loanMinTenureMonths: 12,
    loanMaxSalaryMultiplier: 1,
    loanDefaultMonths: 6,
    lateGraceCount: 2,
    lateDeductionFraction: 0.5,
    lateAbsenceEvery: 3,
  });
  const [attendanceMode, setAttendanceMode] = useState<"text" | "file">("text");
  const [companyMode, setCompanyMode] = useState<"text" | "file">("text");
  const [uploadingAttendance, setUploadingAttendance] = useState(false);
  const [uploadingCompany, setUploadingCompany] = useState(false);
  const [holidays, setHolidays] = useState<
    { date: string; name: string; country: Country }[]
  >([]);
  const [holidayFilter, setHolidayFilter] = useState<"us" | "pk">("us");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayCountry, setNewHolidayCountry] = useState<"us" | "pk">("us");

  useEffect(() => {
    if (data) {
      setForm({
        companyName: data.companyName,
        defaultCasualLeaveQuota: data.defaultCasualLeaveQuota,
        defaultSickLeaveQuota: data.defaultSickLeaveQuota,
        defaultAnnualLeaveQuota: data.defaultAnnualLeaveQuota,
        defaultGracePeriodMinutes: data.defaultGracePeriodMinutes,
        defaultProbationMonths: data.defaultProbationMonths,
        defaultOfficeStartTime: data.defaultOfficeStartTime,
        defaultOfficeEndTime: data.defaultOfficeEndTime,
        weeklyOffDays: data.weeklyOffDays,
        proRatedQuotas: data.proRatedQuotas,
        attendancePolicy: data.attendancePolicy,
        attendancePolicyFileUrl: data.attendancePolicyFileUrl,
        attendancePolicyFileName: data.attendancePolicyFileName,
        basicSalaryPercent: data.basicSalaryPercent,
        allowancePercent: data.allowancePercent,
        defaultProvidentFundPercent: data.defaultProvidentFundPercent,
        companyPolicy: data.companyPolicy,
        companyPolicyFileUrl: data.companyPolicyFileUrl,
        companyPolicyFileName: data.companyPolicyFileName,
        loanMinTenureMonths: data.loanMinTenureMonths,
        loanMaxSalaryMultiplier: data.loanMaxSalaryMultiplier,
        loanDefaultMonths: data.loanDefaultMonths,
        lateGraceCount: data.lateGraceCount,
        lateDeductionFraction: data.lateDeductionFraction,
        lateAbsenceEvery: data.lateAbsenceEvery,
      });
      setHolidays(
        data.publicHolidays.map((h) => {
          const raw = (h.country as Country) ?? "other";
          let country: "us" | "pk";
          if (raw === "us" || raw === "pk") {
            country = raw;
          } else {
            country = /eid|muharram|ashura|ramadan|iqbal|jinnah|pakistan|kashmir/i.test(
              h.name,
            )
              ? "pk"
              : "us";
          }
          return {
            date: h.date as unknown as string,
            name: h.name,
            country,
          };
        }),
      );
      setAttendanceMode(data.attendancePolicyFileUrl ? "file" : "text");
      setCompanyMode(data.companyPolicyFileUrl ? "file" : "text");
    }
  }, [data]);

  const dailyHours = data?.dailyHours ?? 0;
  const weeklyHours = data?.weeklyHours ?? 0;
  const monthlyHours = data?.monthlyHours ?? 0;

  const toggleWeeklyOff = (day: number) => {
    setForm((f) => ({
      ...f,
      weeklyOffDays: f.weeklyOffDays.includes(day)
        ? f.weeklyOffDays.filter((d) => d !== day)
        : [...f.weeklyOffDays, day].sort((a, b) => a - b),
    }));
  };

  const filteredHolidays = useMemo(() => {
    return [...holidays]
      .filter((h) => h.country === holidayFilter)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, holidayFilter]);

  const counts = useMemo(
    () => ({
      us: holidays.filter((h) => h.country === "us").length,
      pk: holidays.filter((h) => h.country === "pk").length,
    }),
    [holidays],
  );

  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      toast.error("Provide both a date and a name");
      return;
    }
    setHolidays((h) =>
      [
        ...h,
        {
          date: newHolidayDate,
          name: newHolidayName.trim(),
          country: newHolidayCountry,
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setNewHolidayDate("");
    setNewHolidayName("");
  };

  const removeHoliday = (date: string, name: string) => {
    setHolidays((h) => h.filter((x) => !(x.date === date && x.name === name)));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      attendancePolicy:
        attendanceMode === "text" ? form.attendancePolicy : "",
      attendancePolicyFileUrl:
        attendanceMode === "file" ? form.attendancePolicyFileUrl : "",
      attendancePolicyFileName:
        attendanceMode === "file" ? form.attendancePolicyFileName : "",
      companyPolicy: companyMode === "text" ? form.companyPolicy : "",
      companyPolicyFileUrl:
        companyMode === "file" ? form.companyPolicyFileUrl : "",
      companyPolicyFileName:
        companyMode === "file" ? form.companyPolicyFileName : "",
      publicHolidays: holidays,
    };
    update.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast.success("Settings saved and applied to all employees");
          qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        },
        onError: () => toast.error("Could not save settings"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Settings"
        description="Defaults applied to new employees and company-wide rules. Changes take effect for everyone immediately on save."
      />

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Company */}
        <Section title="Company">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input
                value={form.companyName}
                onChange={(e) =>
                  setForm({ ...form, companyName: e.target.value })
                }
              />
            </Field>
          </div>
        </Section>

        {/* Leave defaults */}
        <Section title="Leave defaults (per year)">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Casual leave">
              <Input
                type="number"
                min={0}
                value={form.defaultCasualLeaveQuota}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultCasualLeaveQuota: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Sick leave">
              <Input
                type="number"
                min={0}
                value={form.defaultSickLeaveQuota}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultSickLeaveQuota: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Annual leave">
              <Input
                type="number"
                min={0}
                value={form.defaultAnnualLeaveQuota}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultAnnualLeaveQuota: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-medium">Pro-rated leave quotas</p>
              <p className="text-xs text-muted-foreground">
                When enabled, new joiners get leave based on the months remaining in the year.
              </p>
            </div>
            <Switch
              checked={form.proRatedQuotas}
              onCheckedChange={(v) =>
                setForm({ ...form, proRatedQuotas: v })
              }
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Changing leave quotas above automatically updates every existing employee on save.
          </p>
        </Section>

        {/* Attendance defaults */}
        <Section title="Attendance defaults">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Office start">
              <Input
                type="time"
                value={form.defaultOfficeStartTime}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultOfficeStartTime: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Office end">
              <Input
                type="time"
                value={form.defaultOfficeEndTime}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultOfficeEndTime: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Grace period (min)">
              <Input
                type="number"
                min={0}
                value={form.defaultGracePeriodMinutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultGracePeriodMinutes: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Probation (months)">
              <Input
                type="number"
                min={0}
                value={form.defaultProbationMonths}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultProbationMonths: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="mt-4 space-y-2">
            <Label className="text-xs">Weekly off days</Label>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map((d) => {
                const active = form.weeklyOffDays.includes(d.value);
                return (
                  <button
                    type="button"
                    key={d.value}
                    onClick={() => toggleWeeklyOff(d.value)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ComputedStat label="Per day" value={`${dailyHours} h`} />
            <ComputedStat label="Per week" value={`${weeklyHours} h`} />
            <ComputedStat label="This month" value={`${monthlyHours} h`} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Hours are auto-calculated from office start/end, weekly off days and public holidays. Save to refresh these.
          </p>

          <div className="mt-4 space-y-3">
            <Label className="text-xs">Attendance policy notes</Label>
            <PolicyModeToggle
              mode={attendanceMode}
              onChange={setAttendanceMode}
            />
            {attendanceMode === "text" ? (
              <RichTextEditor
                value={form.attendancePolicy}
                onChange={(html) =>
                  setForm({ ...form, attendancePolicy: html })
                }
                placeholder="Any policy notes shown to employees…"
                minRows={4}
              />
            ) : (
              <FileSlot
                idPrefix="attendance"
                fileUrl={form.attendancePolicyFileUrl}
                fileName={form.attendancePolicyFileName}
                uploading={uploadingAttendance}
                onPick={async (file) => {
                  setUploadingAttendance(true);
                  try {
                    const res = await uploadFile(file);
                    setForm((f) => ({
                      ...f,
                      attendancePolicyFileUrl: res.url,
                      attendancePolicyFileName: res.name,
                    }));
                    toast.success("Attendance policy uploaded — Save to apply");
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Upload failed",
                    );
                  } finally {
                    setUploadingAttendance(false);
                  }
                }}
                onClear={() =>
                  setForm({
                    ...form,
                    attendancePolicyFileUrl: "",
                    attendancePolicyFileName: "",
                  })
                }
              />
            )}
          </div>
        </Section>

        {/* Salary division */}
        <Section title="Salary division (defaults)">
          <p className="mb-3 text-xs text-muted-foreground">
            Default split between basic salary and allowances when adding a new
            employee. Should add up to 100%.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Basic salary %">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.basicSalaryPercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    basicSalaryPercent: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Allowance %">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.allowancePercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    allowancePercent: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </Section>

        {/* Provident Fund */}
        <Section title="Provident Fund">
          <p className="mb-3 text-xs text-muted-foreground">
            Set the default PF % (of basic salary). Saving with a non-zero value enables PF for payroll. Set to 0 to disable.
          </p>
          <div className="max-w-sm">
            <Field label="Default PF % (of basic salary)">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={form.defaultProvidentFundPercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultProvidentFundPercent: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </Section>

        {/* Loans */}
        <Section title="Loans">
          <p className="mb-3 text-xs text-muted-foreground">
            Eligibility & defaults for the loan request workflow. Approved loans
            are auto-deducted from payslips until paid off.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum tenure (months) to qualify">
              <Input
                type="number"
                min={0}
                step={1}
                value={form.loanMinTenureMonths}
                onChange={(e) =>
                  setForm({
                    ...form,
                    loanMinTenureMonths: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Max loan = monthly salary ×">
              <Input
                type="number"
                min={0}
                step={0.1}
                value={form.loanMaxSalaryMultiplier}
                onChange={(e) =>
                  setForm({
                    ...form,
                    loanMaxSalaryMultiplier: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Default installment months">
              <Input
                type="number"
                min={1}
                step={1}
                value={form.loanDefaultMonths}
                onChange={(e) =>
                  setForm({
                    ...form,
                    loanDefaultMonths: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </Section>

        {/* Late penalty */}
        <Section title="Late → absence policy">
          <p className="mb-3 text-xs text-muted-foreground">
            Converts repeated lates into absence days on the payslip.
            HR/admin can still override or forgive on each payslip, and on
            each employee's Salary tab.
            <br />
            Formula:{" "}
            <code>
              floor((lateCount − grace) ÷ everyN) = absence days
            </code>
            . Default: grace 2, every 3 → 5 lates becomes 1 absence; 8
            lates becomes 2 absences.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lates forgiven per month (grace)">
              <Input
                type="number"
                min={0}
                step={1}
                value={form.lateGraceCount}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lateGraceCount: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Mark 1 absence after every N extra lates">
              <Input
                type="number"
                min={1}
                step={1}
                value={form.lateAbsenceEvery}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lateAbsenceEvery: Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </Field>
          </div>
        </Section>

        {/* Company policy */}
        <Section title="Company policy">
          <PolicyModeToggle mode={companyMode} onChange={setCompanyMode} />
          <div className="mt-3">
            {companyMode === "text" ? (
              <RichTextEditor
                value={form.companyPolicy}
                onChange={(html) => setForm({ ...form, companyPolicy: html })}
                placeholder="Code of conduct, leave policy, dress code, communication norms, etc."
                minRows={6}
              />
            ) : (
              <FileSlot
                idPrefix="company"
                fileUrl={form.companyPolicyFileUrl}
                fileName={form.companyPolicyFileName}
                uploading={uploadingCompany}
                onPick={async (file) => {
                  setUploadingCompany(true);
                  try {
                    const res = await uploadFile(file);
                    setForm((f) => ({
                      ...f,
                      companyPolicyFileUrl: res.url,
                      companyPolicyFileName: res.name,
                    }));
                    toast.success("Company policy uploaded — Save to apply");
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Upload failed",
                    );
                  } finally {
                    setUploadingCompany(false);
                  }
                }}
                onClear={() =>
                  setForm({
                    ...form,
                    companyPolicyFileUrl: "",
                    companyPolicyFileName: "",
                  })
                }
              />
            )}
          </div>
        </Section>

        {/* Public holidays */}
        <Section title="Public holidays">
          <div className="space-y-3">
            <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
              <FilterTab
                active={holidayFilter === "us"}
                onClick={() => setHolidayFilter("us")}
                label={`US (${counts.us})`}
              />
              <FilterTab
                active={holidayFilter === "pk"}
                onClick={() => setHolidayFilter("pk")}
                label={`Pakistan (${counts.pk})`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[180px_1fr_140px_auto]">
              <DateField
                value={newHolidayDate}
                onChange={setNewHolidayDate}
              />
              <Input
                placeholder="Holiday name"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
              />
              <select
                value={newHolidayCountry}
                onChange={(e) =>
                  setNewHolidayCountry(e.target.value as "us" | "pk")
                }
                className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="us">US</option>
                <option value="pk">Pakistan</option>
              </select>
              <Button type="button" onClick={addHoliday} className="gap-2">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {filteredHolidays.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No holidays in this view.
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {filteredHolidays.map((h) => (
                  <li
                    key={`${h.date}-${h.name}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <CountryBadge country={h.country} />
                      <div>
                        <p className="font-medium">{h.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.date}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                      onClick={() => removeHoliday(h.date, h.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FilterTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs transition ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function CountryBadge({ country }: { country: Country }) {
  const cls =
    country === "us"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
      : country === "pk"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "bg-muted text-muted-foreground";
  const label =
    country === "us" ? "US" : country === "pk" ? "PK" : "Other";
  return (
    <span
      className={`inline-flex h-5 min-w-[2rem] items-center justify-center rounded-full px-2 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function PolicyModeToggle({
  mode,
  onChange,
}: {
  mode: "text" | "file";
  onChange: (m: "text" | "file") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("text")}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 ${
          mode === "text"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Type className="h-3.5 w-3.5" /> Write notes
      </button>
      <button
        type="button"
        onClick={() => onChange("file")}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 ${
          mode === "file"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Paperclip className="h-3.5 w-3.5" /> Upload file
      </button>
    </div>
  );
}

function FileSlot({
  idPrefix,
  fileUrl,
  fileName,
  uploading,
  onPick,
  onClear,
}: {
  idPrefix: string;
  fileUrl: string;
  fileName: string;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  if (fileUrl) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <FileText className="h-4 w-4" />
          {fileName || "Document"}
        </a>
        <div className="flex items-center gap-2">
          <input
            id={`${idPrefix}-file-replace`}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() =>
              document.getElementById(`${idPrefix}-file-replace`)?.click()
            }
            className="gap-1.5"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-rose-600"
            onClick={onClear}
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <input
        id={`${idPrefix}-file`}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={uploading}
        onClick={() => document.getElementById(`${idPrefix}-file`)?.click()}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? "Uploading..." : "Upload file"}
      </Button>
      <span className="text-xs text-muted-foreground">
        PDF or Word, up to 10 MB.
      </span>
    </div>
  );
}

function ComputedStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
