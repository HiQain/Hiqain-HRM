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
  Upload,
  FileText,
  X,
  Type,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RichTextEditor } from "@/components/RichTextEditor";
import { getApiUrl } from "@/lib/api";
import {
  filterHolidays,
  filterHolidaysByYear,
  getCurrentHolidayYear,
  getHighlightedHoliday,
  getMonthLabel,
  normalizeHolidayCountry,
  sortHolidays,
  type HolidayFilter,
} from "@/lib/holidays";
import { formatDateCalendar } from "@/lib/utils";

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
  return fetch(getApiUrl("/api/uploads"), {
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
    publicHolidays: [] as Array<{ date: string; name: string; country: Country }>,
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
  const [holidayFilter, setHolidayFilter] = useState<HolidayFilter>("all");
  const [holidayDraft, setHolidayDraft] = useState<{
    date: string;
    name: string;
    country: Country;
    editingKey: string | null;
  }>({
    date: "",
    name: "",
    country: "other",
    editingKey: null,
  });
  const currentHolidayYear = getCurrentHolidayYear();

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
        publicHolidays: data.publicHolidays.map((h) => ({
          date: h.date as unknown as string,
          name: h.name,
          country: normalizeHolidayCountry(
            h.country as Country | undefined,
            h.name,
          ),
        })),
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
      setAttendanceMode(data.attendancePolicyFileUrl ? "file" : "text");
      setCompanyMode(data.companyPolicyFileUrl ? "file" : "text");
    }
  }, [data]);

  const holidays = useMemo(
    () => sortHolidays(form.publicHolidays),
    [form.publicHolidays],
  );

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
    return filterHolidays(
      filterHolidaysByYear(sortHolidays(holidays), currentHolidayYear),
      holidayFilter,
    );
  }, [currentHolidayYear, holidays, holidayFilter]);

  const counts = useMemo(
    () => ({
      all: filterHolidaysByYear(holidays, currentHolidayYear).length,
      us: filterHolidaysByYear(holidays, currentHolidayYear).filter(
        (h) => h.country === "us",
      ).length,
      pk: filterHolidaysByYear(holidays, currentHolidayYear).filter(
        (h) => h.country === "pk",
      ).length,
    }),
    [currentHolidayYear, holidays],
  );
  const highlightedHoliday = useMemo(
    () => getHighlightedHoliday(filteredHolidays),
    [filteredHolidays],
  );

  const resetHolidayDraft = () =>
    setHolidayDraft({ date: "", name: "", country: "other", editingKey: null });

  const saveHolidayDraft = () => {
    const date = holidayDraft.date.trim();
    const name = holidayDraft.name.trim();
    if (!date || !name) {
      toast.error("Holiday date and name are required");
      return;
    }

    const nextHoliday = {
      date,
      name,
      country: holidayDraft.country,
    };

    setForm((current) => {
      const remaining = current.publicHolidays.filter(
        (holiday) =>
          `${holiday.date}-${holiday.name}-${holiday.country}` !==
          holidayDraft.editingKey,
      );
      return {
        ...current,
        publicHolidays: sortHolidays([...remaining, nextHoliday]),
      };
    });
    resetHolidayDraft();
  };

  const editHoliday = (holiday: { date: string; name: string; country: Country }) => {
    setHolidayDraft({
      date: holiday.date,
      name: holiday.name,
      country: holiday.country,
      editingKey: `${holiday.date}-${holiday.name}-${holiday.country}`,
    });
  };

  const removeHoliday = (holiday: { date: string; name: string; country: Country }) => {
    setForm((current) => ({
      ...current,
      publicHolidays: current.publicHolidays.filter(
        (item) =>
          `${item.date}-${item.name}-${item.country}` !==
          `${holiday.date}-${holiday.name}-${holiday.country}`,
      ),
    }));
    if (
      holidayDraft.editingKey ===
      `${holiday.date}-${holiday.name}-${holiday.country}`
    ) {
      resetHolidayDraft();
    }
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
      publicHolidays: form.publicHolidays,
      companyPolicy: companyMode === "text" ? form.companyPolicy : "",
      companyPolicyFileUrl:
        companyMode === "file" ? form.companyPolicyFileUrl : "",
      companyPolicyFileName:
        companyMode === "file" ? form.companyPolicyFileName : "",
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
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${active
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
            <div className="flex flex-col items-start gap-2">
              <Label className="block text-xs">Attendance policy notes</Label>
              <PolicyModeToggle
                mode={attendanceMode}
                onChange={setAttendanceMode}
              />
            </div>
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
        <Section title={`Public holidays (${currentHolidayYear})`}>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="grid gap-3 md:grid-cols-[170px_minmax(0,1fr)_130px_auto_auto]">
                <Input
                  type="date"
                  value={holidayDraft.date}
                  onChange={(e) =>
                    setHolidayDraft((current) => ({
                      ...current,
                      date: e.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Holiday name"
                  value={holidayDraft.name}
                  onChange={(e) =>
                    setHolidayDraft((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                />
                <Select
                  value={holidayDraft.country}
                  onValueChange={(value) =>
                    setHolidayDraft((current) => ({
                      ...current,
                      country: value as Country,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="pk">Pakistan</SelectItem>
                    <SelectItem value="us">US</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" onClick={saveHolidayDraft}>
                  {holidayDraft.editingKey ? (
                    <>
                      <Pencil className="mr-2 h-4 w-4" />
                      Update
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </>
                  )}
                </Button>
                {holidayDraft.editingKey && (
                  <Button type="button" variant="ghost" onClick={resetHolidayDraft}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
              <FilterTab
                active={holidayFilter === "all"}
                onClick={() => setHolidayFilter("all")}
                label={`All (${counts.all})`}
              />
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
            <p className="text-xs text-muted-foreground">
              These holidays are used across attendance, salary, working-hours, and payroll calculations throughout the app.
            </p>

            {filteredHolidays.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No holidays in this view.
              </div>
            ) : (
              <HolidayTable
                items={filteredHolidays}
                highlighted={highlightedHoliday}
                onEdit={editHoliday}
                onDelete={removeHoliday}
              />
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
      className={`rounded px-2.5 py-1 text-xs transition ${active
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

function HolidayTable({
  items,
  highlighted,
  onEdit,
  onDelete,
}: {
  items: { date: string; name: string; country: Country }[];
  highlighted?: { date: string; name: string; country: Country };
  onEdit: (holiday: { date: string; name: string; country: Country }) => void;
  onDelete: (holiday: { date: string; name: string; country: Country }) => void;
}) {
  return (
    <div className="space-y-4">
      {highlighted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Highlighted holiday
          </p>
          <div className="mt-2 flex items-start gap-3">
            <div className="flex items-center gap-3">
              <CountryBadge country={highlighted.country} />
              <div>
                <p className="font-semibold text-foreground">
                  {formatDateCalendar(highlighted.date)} - {highlighted.name}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((holiday) => (
              <TableRow key={`${holiday.date}-${holiday.name}-${holiday.country}`}>
                <TableCell>{formatDateCalendar(holiday.date)}</TableCell>
                <TableCell>{getMonthLabel(holiday.date)}</TableCell>
                <TableCell className="font-medium">{holiday.name}</TableCell>
                <TableCell>
                  <CountryBadge country={holiday.country} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(holiday)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(holiday)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
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
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 ${mode === "text"
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
          }`}
      >
        <Type className="h-3.5 w-3.5" /> Write notes
      </button>
      <button
        type="button"
        onClick={() => onChange("file")}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 ${mode === "file"
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
