import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import {
  useListEmployees,
  useCreateEmployee,
  useDeleteEmployee,
  useBulkCreateEmployees,
  useGetMe,
  useGetSettings,
  getListEmployeesQueryKey,
  getGetAdminDashboardQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  MoreVertical,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { DateField } from "@/components/DateField";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function EmployeesPage() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const { data, isLoading } = useListEmployees();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const departments = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((e) => e.department && set.add(e.department));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          (e.position ?? "").toLowerCase().includes(q),
      );
    }
    if (department !== "all") {
      rows = rows.filter((e) => e.department === department);
    }
    return rows;
  }, [data, search, department]);

  const qc = useQueryClient();
  const del = useDeleteEmployee();
  const handleDelete = () => {
    if (!confirmDelete) return;
    del.mutate(
      { id: confirmDelete.id },
      {
        onSuccess: () => {
          toast.success(`${confirmDelete.name} removed`);
          qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
          setConfirmDelete(null);
        },
        onError: () => toast.error("Could not remove employee"),
      },
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Members"
        description="Manage your team profiles, roles, and compensation."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Bulk upload
            </Button>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add member
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, position..."
            className="pl-9"
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium">No employees match your filter</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try clearing search or pick a different department.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="group rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <Link href={`/admin/employees/${e.id}`}>
                  <EmployeeAvatar name={e.name} size="lg" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/employees/${e.id}`}
                    className="block truncate text-base font-semibold hover:underline"
                  >
                    {e.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.position ?? "Team member"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {e.email}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                  <Link href={`/admin/employees/${e.id}`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="View profile"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={`/admin/employees/${e.id}?edit=1`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit profile"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/employees/${e.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/employees/${e.id}?edit=1`}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit profile
                        </Link>
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-700"
                          onClick={() =>
                            setConfirmDelete({ id: e.id, name: e.name })
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="font-medium">{e.department ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Joined</p>
                  <p className="font-medium">{formatDate(e.joiningDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Salary</p>
                  <p className="font-medium">{formatCurrency(e.basicSalary)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewEmployeeSheet open={open} onOpenChange={setOpen} />
      <BulkUploadSheet open={bulkOpen} onOpenChange={setBulkOpen} />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {confirmDelete?.name} along with
              their account, attendance history, leaves and payslips. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDelete}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewEmployeeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: me } = useGetMe();
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();
  const create = useCreateEmployee();
  const defaultForm = useMemo(
    () => ({
      name: "",
      email: "",
      password: "welcome123",
      role: "employee" as "admin" | "hr" | "employee",
      phone: "",
      position: "",
      department: "",
      positionType: "onsite" as "onsite" | "remote",
      joiningDate: new Date().toISOString().slice(0, 10),
      probationMonths: settings?.defaultProbationMonths ?? 3,
      officeStartTime: settings?.defaultOfficeStartTime ?? "09:00",
      officeEndTime: settings?.defaultOfficeEndTime ?? "18:00",
      gracePeriodMinutes: settings?.defaultGracePeriodMinutes ?? 15,
      basicSalary: 100000,
      allowances: 0,
      casualLeaveQuota: settings?.defaultCasualLeaveQuota ?? 6,
      sickLeaveQuota: settings?.defaultSickLeaveQuota ?? 6,
      annualLeaveQuota: settings?.defaultAnnualLeaveQuota ?? 12,
      dateOfBirth: "",
      education: "",
      address: "",
    }),
    [settings],
  );
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (open) {
      setForm(defaultForm);
    }
  }, [defaultForm, open]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          phone: form.phone || undefined,
          position: form.position || undefined,
          department: form.department || undefined,
          positionType: form.positionType,
          joiningDate: form.joiningDate as unknown as string,
          probationMonths: Number(form.probationMonths),
          officeStartTime: form.officeStartTime,
          officeEndTime: form.officeEndTime,
          gracePeriodMinutes: Number(form.gracePeriodMinutes),
          basicSalary: Number(form.basicSalary),
          allowances: Number(form.allowances) || 0,
          casualLeaveQuota: Number(form.casualLeaveQuota),
          sickLeaveQuota: Number(form.sickLeaveQuota),
          annualLeaveQuota: Number(form.annualLeaveQuota),
          dateOfBirth: form.dateOfBirth
            ? (form.dateOfBirth as unknown as string)
            : undefined,
          education: form.education || undefined,
          address: form.address || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${form.name} added to your team`);
          qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
          onOpenChange(false);
          setForm(defaultForm);
        },
        onError: (err: unknown) =>
          toast.error(
            (err as { message?: string }).message ?? "Could not add employee",
          ),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Add a new employee</SheetTitle>
          <SheetDescription>
            They'll get a temporary password and be asked to set a new one on
            first sign-in.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-5 px-1">
          <Section title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Work email" required>
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+923XXXXXXXXX"
                />
              </Field>
              <Field label="Date of birth">
                <DateField
                  value={form.dateOfBirth}
                  onChange={(v) => setForm({ ...form, dateOfBirth: v })}
                />
              </Field>
            </div>
          </Section>

          <Section title="Role">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account role" required>
                <Select
                  value={form.role}
                  onValueChange={(v) =>
                    setForm({ ...form, role: v as "admin" | "hr" | "employee" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    {isAdmin && (
                      <SelectItem value="admin">Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Position">
                <Input
                  value={form.position}
                  onChange={(e) =>
                    setForm({ ...form, position: e.target.value })
                  }
                />
              </Field>
              <Field label="Department">
                <Input
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                />
              </Field>
              <Field label="Work location" required>
                <Select
                  value={form.positionType}
                  onValueChange={(v) =>
                    setForm({ ...form, positionType: v as "onsite" | "remote" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite">Onsite</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Joining date" required>
                <DateField
                  required
                  value={form.joiningDate}
                  onChange={(v) => setForm({ ...form, joiningDate: v })}
                />
              </Field>
              <Field label="Probation (months)" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.probationMonths}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      probationMonths: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Schedule">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Start time" required>
                <Input
                  required
                  type="time"
                  value={form.officeStartTime}
                  onChange={(e) =>
                    setForm({ ...form, officeStartTime: e.target.value })
                  }
                />
              </Field>
              <Field label="End time" required>
                <Input
                  required
                  type="time"
                  value={form.officeEndTime}
                  onChange={(e) =>
                    setForm({ ...form, officeEndTime: e.target.value })
                  }
                />
              </Field>
              <Field label="Grace (min)" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.gracePeriodMinutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      gracePeriodMinutes: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Compensation">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Basic salary (PKR)" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.basicSalary}
                  onChange={(e) =>
                    setForm({ ...form, basicSalary: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Allowances (PKR)">
                <Input
                  type="number"
                  min={0}
                  value={form.allowances}
                  onChange={(e) =>
                    setForm({ ...form, allowances: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Leave quotas (days / year)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Casual" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.casualLeaveQuota}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      casualLeaveQuota: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Sick" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.sickLeaveQuota}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sickLeaveQuota: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Annual" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.annualLeaveQuota}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      annualLeaveQuota: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Background">
            <div className="grid gap-3">
              <Field label="Education">
                <Input
                  value={form.education}
                  onChange={(e) =>
                    setForm({ ...form, education: e.target.value })
                  }
                />
              </Field>
              <Field label="Address">
                <Input
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Account">
            <Field label="Temporary password" required>
              <Input
                required
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                minLength={6}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              They'll be asked to change this on first sign-in.
            </p>
          </Section>

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding..." : "Add employee"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inQuotes) {
      if (c === '"' && cleaned[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && cleaned[i + 1] === "\n") i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  const filtered = rows.filter((r) => r.some((v) => v.trim().length > 0));
  if (filtered.length === 0) return [];
  const header = filtered[0]!.map((h) => h.trim());
  return filtered.slice(1).map((r) => {
    const obj: CsvRow = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

function num(v: string | undefined, fallback?: number): number | undefined {
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : undefined;
}

function BulkUploadSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const qc = useQueryClient();
  const bulk = useBulkCreateEmployees();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [result, setResult] = useState<
    | {
        created: number;
        errors: { row: number; email?: string | null; message: string }[];
      }
    | null
  >(null);

  const reset = () => {
    setRows([]);
    setFileName("");
    setParseError("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setResult(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setRows([]);
        setParseError("CSV is empty.");
        return;
      }
      setRows(parsed);
    } catch {
      setRows([]);
      setParseError("Could not read this file.");
    }
  };

  const onUpload = () => {
    if (rows.length === 0) return;
    const members = rows.map((r) => ({
      name: r["name"] ?? "",
      email: r["email"] ?? "",
      password: str(r["password"]) ?? "welcome123",
      role: ((): "admin" | "hr" | "employee" => {
        const v = str(r["role"])?.toLowerCase();
        if (v === "admin") return "admin";
        if (v === "hr") return "hr";
        return "employee";
      })(),
      phone: str(r["phone"]),
      position: str(r["position"]),
      department: str(r["department"]),
      positionType:
        (str(r["positionType"])?.toLowerCase() === "remote"
          ? "remote"
          : "onsite") as "onsite" | "remote",
      joiningDate: (str(r["joiningDate"]) ??
        new Date().toISOString().slice(0, 10)) as unknown as string,
      probationMonths:
        num(r["probationMonths"], settings?.defaultProbationMonths ?? 3) ??
        (settings?.defaultProbationMonths ?? 3),
      officeStartTime:
        str(r["officeStartTime"]) ??
        settings?.defaultOfficeStartTime ??
        "09:00",
      officeEndTime:
        str(r["officeEndTime"]) ??
        settings?.defaultOfficeEndTime ??
        "18:00",
      gracePeriodMinutes:
        num(
          r["gracePeriodMinutes"],
          settings?.defaultGracePeriodMinutes ?? 15,
        ) ?? (settings?.defaultGracePeriodMinutes ?? 15),
      basicSalary: num(r["basicSalary"], 0) ?? 0,
      allowances: num(r["allowances"], 0) ?? 0,
      casualLeaveQuota:
        num(
          r["casualLeaveQuota"],
          settings?.defaultCasualLeaveQuota ?? 6,
        ) ?? (settings?.defaultCasualLeaveQuota ?? 6),
      sickLeaveQuota:
        num(r["sickLeaveQuota"], settings?.defaultSickLeaveQuota ?? 6) ??
        (settings?.defaultSickLeaveQuota ?? 6),
      annualLeaveQuota:
        num(
          r["annualLeaveQuota"],
          settings?.defaultAnnualLeaveQuota ?? 12,
        ) ?? (settings?.defaultAnnualLeaveQuota ?? 12),
      dateOfBirth: str(r["dateOfBirth"]) as unknown as string | undefined,
      education: str(r["education"]),
      address: str(r["address"]),
    }));
    bulk.mutate(
      { data: { members } },
      {
        onSuccess: (res) => {
          setResult({
            created: res.created,
            errors: res.errors,
          });
          if (res.created > 0) {
            toast.success(`Imported ${res.created} member(s)`);
            qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
            qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
          }
          if (res.failed > 0) {
            toast.error(`${res.failed} row(s) failed`);
          }
        },
        onError: (err) =>
          toast.error(
            err instanceof Error ? err.message : "Bulk upload failed",
          ),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Bulk upload members</SheetTitle>
          <SheetDescription>
            Upload a CSV to add many members at once. Download the sample to see
            the expected columns.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 px-1">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Sample CSV</p>
                <p className="text-xs text-muted-foreground">
                  Use this template — keep the header row.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a
                  href={`${import.meta.env.BASE_URL}sample-employees.csv`}
                  download="sample-employees.csv"
                >
                  <Download className="h-4 w-4" />
                  Download sample
                </a>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>CSV file</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                {fileName} — {rows.length} row(s) detected
              </p>
            )}
            {parseError && (
              <p className="text-xs text-rose-600">{parseError}</p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Preview (first 5)
              </p>
              <div className="space-y-1 text-xs">
                {rows.slice(0, 5).map((r, i) => (
                  <div key={i} className="truncate">
                    <span className="font-medium">{r["name"] || "—"}</span>{" "}
                    <span className="text-muted-foreground">
                      ({r["email"] || "no email"})
                    </span>{" "}
                    · {r["role"] || "employee"} · {r["department"] || "—"}
                  </div>
                ))}
                {rows.length > 5 && (
                  <p className="text-muted-foreground">
                    + {rows.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="font-semibold">Upload finished</p>
              <p className="text-emerald-700">
                {result.created} member(s) created
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-rose-700">
                    {result.errors.length} failed:
                  </p>
                  <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-rose-700">
                    {result.errors.map((f, i) => (
                      <li key={i}>
                        Row {f.row} ({f.email || "—"}): {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={onUpload}
            disabled={rows.length === 0 || bulk.isPending}
          >
            {bulk.isPending ? "Uploading..." : `Upload ${rows.length} row(s)`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}
