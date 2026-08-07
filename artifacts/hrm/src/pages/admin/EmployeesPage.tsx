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
  type Employee,
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useBulkCreateEmployees,
  useGetMe,
  useGetSettings,
  getGetEmployeeQueryOptions,
  getListEmployeesQueryKey,
  getGetAdminDashboardQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Eye,
  KeyRound,
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
import {
  formatCurrency,
  formatDate,
  formatNumberInput,
  hasPhoneSubscriberNumber,
  normalizeCnicInput,
  normalizePakistanPhoneInput,
  parseNumberInput,
} from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordField } from "@/components/PasswordField";
import { getApiUrl, resolveAssetUrl } from "@/lib/api";
import { createEmployeeCsvTemplateHref } from "@/lib/onboarding";

function computePermanentDate(joiningDate: string, probationMonths: number) {
  const joining = new Date(`${joiningDate}T00:00:00`);
  if (Number.isNaN(joining.getTime())) return null;
  const permanentDate = new Date(joining);
  permanentDate.setMonth(permanentDate.getMonth() + probationMonths);
  return permanentDate;
}

function computeProRatedQuota(
  quota: number,
  joiningDate: string,
  probationMonths: number,
  enabled?: boolean,
) {
  if (!enabled || !joiningDate) return quota;
  const permanentDate = computePermanentDate(joiningDate, probationMonths);
  if (!permanentDate) return quota;
  const today = new Date();
  if (permanentDate.getFullYear() !== today.getFullYear()) return quota;
  const effectiveMonthIndex =
    permanentDate.getDate() >= 16
      ? permanentDate.getMonth() + 1
      : permanentDate.getMonth();
  const monthsRemaining = Math.max(0, 12 - effectiveMonthIndex);
  return Math.max(0, Math.round((quota * monthsRemaining) / 12));
}

const DEFAULT_EMPLOYEE_PASSWORD = "password";
const PRIMARY_PAYROLL_BANK = "Bank Al Habib";

function splitTotalSalary(totalSalary: number) {
  const safeTotal = Math.max(0, totalSalary);
  const basicSalary = Math.round(safeTotal / 2);
  const allowances = safeTotal - basicSalary;
  return { basicSalary, allowances };
}

function escapeCsvValue(value: unknown) {
  if (value == null) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

type EmployeeExportRow = Employee & {
  role?: string | null;
};

const EMPLOYEE_EXPORT_COLUMNS: Array<{
  header: string;
  value: (employee: EmployeeExportRow) => unknown;
}> = [
  { header: "name", value: (employee) => employee.name },
  { header: "email", value: (employee) => employee.email },
  { header: "password", value: () => "" },
  { header: "role", value: (employee) => employee.role ?? "employee" },
  { header: "isActive", value: (employee) => (employee.isActive === false ? "false" : "true") },
  { header: "personalEmail", value: (employee) => employee.personalEmail },
  { header: "phone", value: (employee) => employee.phone },
  { header: "position", value: (employee) => employee.position },
  { header: "department", value: (employee) => employee.department },
  { header: "positionType", value: (employee) => employee.positionType },
  { header: "joiningDate", value: (employee) => employee.joiningDate },
  { header: "probationMonths", value: (employee) => employee.probationMonths },
  { header: "officeStartTime", value: (employee) => employee.officeStartTime },
  { header: "officeEndTime", value: (employee) => employee.officeEndTime },
  { header: "gracePeriodMinutes", value: (employee) => employee.gracePeriodMinutes },
  { header: "breakMinutes", value: (employee) => employee.breakMinutes },
  { header: "basicSalary", value: (employee) => employee.basicSalary },
  { header: "allowances", value: (employee) => employee.allowances },
  { header: "casualLeaveQuota", value: (employee) => employee.casualLeaveQuota },
  { header: "sickLeaveQuota", value: (employee) => employee.sickLeaveQuota },
  { header: "annualLeaveQuota", value: (employee) => employee.annualLeaveQuota },
  { header: "dateOfBirth", value: (employee) => employee.dateOfBirth },
  { header: "education", value: (employee) => employee.education },
  { header: "address", value: (employee) => employee.address },
  { header: "maritalStatus", value: (employee) => employee.maritalStatus },
  { header: "wifeName", value: (employee) => employee.wifeName },
  { header: "wifeDateOfBirth", value: (employee) => employee.wifeDateOfBirth },
  { header: "kidsCount", value: (employee) => employee.kidsCount },
  { header: "emergencyContactName", value: (employee) => employee.emergencyContactName },
  { header: "emergencyContactNumber", value: (employee) => employee.emergencyContactNumber },
  { header: "emergencyContactRelation", value: (employee) => employee.emergencyContactRelation },
  { header: "cnic", value: (employee) => employee.cnic },
  { header: "lastQualification", value: (employee) => employee.lastQualification },
  { header: "previousCompany", value: (employee) => employee.previousCompany },
  { header: "lastPay", value: (employee) => employee.lastPay },
  { header: "notes", value: (employee) => employee.notes },
];

function downloadEmployeesCsv(employees: EmployeeExportRow[]) {
  const headers = EMPLOYEE_EXPORT_COLUMNS.map((column) => column.header);
  const rows = employees.map((employee) =>
    EMPLOYEE_EXPORT_COLUMNS.map((column) => column.value(employee)),
  );

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `employees-${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function splitAllowanceBreakdown(allowances: number) {
  const safeAllowances = Math.max(0, allowances);
  const homeRent = Math.round(safeAllowances / 2);
  const utilityBills = safeAllowances - homeRent;
  return { homeRent, utilityBills };
}

function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function computeShiftSpanMinutes(
  officeStartTime: string | null | undefined,
  officeEndTime: string | null | undefined,
) {
  const start = parseTimeToMinutes(officeStartTime);
  const end = parseTimeToMinutes(officeEndTime);
  return end <= start ? 24 * 60 - start + end : end - start;
}

function inferBreakMinutes(
  officeStartTime: string | null | undefined,
  officeEndTime: string | null | undefined,
) {
  return computeShiftSpanMinutes(officeStartTime, officeEndTime) <= 6 * 60
    ? 30
    : 60;
}

function buildEmployeeCode(sequence: number) {
  return `EMP-${String(sequence).padStart(3, "0")}`;
}

function parseEmployeeCodeSequence(code: string | null | undefined) {
  if (!code) return 0;
  const match = /^EMP-(\d+)$/i.exec(code.trim());
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNextEmployeeCode(
  employees: Array<{ employeeCode?: string | null }> | null | undefined,
) {
  const rows = employees ?? [];
  const maxSequence = rows.reduce(
    (max, employee) =>
      Math.max(max, parseEmployeeCodeSequence(employee.employeeCode)),
    0,
  );
  return buildEmployeeCode(Math.max(maxSequence, rows.length) + 1);
}

function getInitialQuotaTouched(editingEmployee?: { id?: number | string } | null) {
  const preserveSavedQuotas = Boolean(editingEmployee);
  return {
    casual: preserveSavedQuotas,
    sick: preserveSavedQuotas,
    annual: preserveSavedQuotas,
  };
}

function normalizeKidsNames(
  value: unknown,
  count: number,
): string[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const item = source[index];
    return typeof item === "string" ? item : "";
  });
}

export function EmployeesPage() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const { data, isLoading } = useListEmployees();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const qc = useQueryClient();

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

  const openEmployeeEditor = async (employee: Employee) => {
    try {
      const freshEmployee = await qc.fetchQuery({
        ...getGetEmployeeQueryOptions(employee.id),
        staleTime: 0,
      });
      setEditingEmployee(freshEmployee);
    } catch {
      setEditingEmployee(employee);
      toast.error("Could not load the latest employee details");
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!data?.length) return;
    if (open) return;
    const pendingId = window.localStorage.getItem("hrm-edit-employee-id");
    if (!pendingId) return;
    const employeeId = Number(pendingId);
    if (!Number.isFinite(employeeId)) {
      window.localStorage.removeItem("hrm-edit-employee-id");
      return;
    }
    const employee = data.find((item) => item.id === employeeId);
    if (!employee) return;
    window.localStorage.removeItem("hrm-edit-employee-id");
    void openEmployeeEditor(employee);
  }, [data, open]);

  const del = useDeleteEmployee();
  const handleDownloadAll = () => {
    if (!data?.length) {
      toast.error("No employees available to export");
      return;
    }
    downloadEmployeesCsv(data);
    toast.success("Employee CSV downloaded");
  };

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
        title="Employees"
        description="Manage your team profiles, roles, and compensation."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadAll}
              className="gap-2"
              disabled={!data?.length}
            >
              <Download className="h-4 w-4" />
              Download all
            </Button>
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Bulk upload
            </Button>
            <Button
              onClick={() => {
                setEditingEmployee(null);
                setOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add employee
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
                  <EmployeeAvatar name={e.name} url={e.avatarUrl ?? null} size="lg" />
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
                <div className="opacity-70 group-hover:opacity-100">
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
                      <DropdownMenuItem
                        onClick={() => void openEmployeeEditor(e)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit profile
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
                  <p className="font-medium">
                    {formatCurrency(
                      Number(e.basicSalary ?? 0) + Number(e.allowances ?? 0),
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewEmployeeSheet
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setEditingEmployee(null);
        }}
        departments={departments}
        existingEmployees={data ?? []}
        editingEmployee={editingEmployee}
      />
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
  departments,
  existingEmployees,
  editingEmployee,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departments: string[];
  existingEmployees: Array<{ employeeCode?: string | null }>;
  editingEmployee: any | null;
}) {
  const { data: me } = useGetMe();
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const isEditing = Boolean(editingEmployee?.id);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordPending, setResetPasswordPending] = useState(false);
  const generatedEmployeeCode = useMemo(
    () => getNextEmployeeCode(existingEmployees),
    [existingEmployees],
  );
  const defaultForm = useMemo(
    () => {
      if (editingEmployee) {
        const totalSalary =
          Number(editingEmployee.basicSalary ?? 0) +
          Number(editingEmployee.allowances ?? 0);
        return {
          name: editingEmployee.name ?? "",
          email: editingEmployee.email ?? "",
          password: "",
          role: editingEmployee.role === "admin" ? "admin" : "employee",
          isActive: editingEmployee.isActive !== false,
          phone: normalizePakistanPhoneInput(editingEmployee.phone ?? ""),
          position: editingEmployee.position ?? "",
          department: editingEmployee.department ?? "",
          positionType:
            (editingEmployee.positionType ?? "onsite") as "onsite" | "remote",
          joiningDate:
            editingEmployee.joiningDate ?? new Date().toISOString().slice(0, 10),
          probationMonths:
            editingEmployee.probationMonths ??
            settings?.defaultProbationMonths ??
            3,
          officeStartTime:
            editingEmployee.officeStartTime ??
            settings?.defaultOfficeStartTime ??
            "09:00",
          officeEndTime:
            editingEmployee.officeEndTime ??
            settings?.defaultOfficeEndTime ??
            "18:00",
          gracePeriodMinutes:
            editingEmployee.gracePeriodMinutes ??
            settings?.defaultGracePeriodMinutes ??
            15,
          breakMinutes:
            editingEmployee.breakMinutes ??
            inferBreakMinutes(
              editingEmployee.officeStartTime ??
                settings?.defaultOfficeStartTime ??
                "09:00",
              editingEmployee.officeEndTime ??
                settings?.defaultOfficeEndTime ??
                "18:00",
            ),
          totalSalary,
          basicSalary: Number(editingEmployee.basicSalary ?? 0),
          allowances: Number(editingEmployee.allowances ?? 0),
          casualLeaveQuota: editingEmployee.casualLeaveQuota ?? 0,
          sickLeaveQuota: editingEmployee.sickLeaveQuota ?? 0,
          annualLeaveQuota: editingEmployee.annualLeaveQuota ?? 0,
          dateOfBirth: editingEmployee.dateOfBirth ?? "",
          employeeCode: editingEmployee.employeeCode ?? generatedEmployeeCode,
          maritalStatus: editingEmployee.maritalStatus ?? "",
          wifeName: editingEmployee.wifeName ?? "",
          wifeDateOfBirth: editingEmployee.wifeDateOfBirth ?? "",
          kidsCount:
            editingEmployee.kidsCount != null
              ? String(editingEmployee.kidsCount)
              : "",
          kidsNames: normalizeKidsNames(
            editingEmployee.kidsNames,
            Number(editingEmployee.kidsCount ?? 0),
          ),
          personalEmail: editingEmployee.personalEmail ?? "",
          lastQualification: editingEmployee.lastQualification ?? "",
          address: editingEmployee.address ?? "",
          cnic: normalizeCnicInput(editingEmployee.cnic ?? ""),
          emergencyContactName: editingEmployee.emergencyContactName ?? "",
          emergencyContactNumber:
            normalizePakistanPhoneInput(
              editingEmployee.emergencyContactNumber ?? "",
            ),
          emergencyContactRelation:
            editingEmployee.emergencyContactRelation ?? "",
          emergencyContact: editingEmployee.emergencyContact ?? "",
          previousCompany: editingEmployee.previousCompany ?? "",
          lastPay:
            editingEmployee.lastPay != null
              ? String(editingEmployee.lastPay)
              : "",
          immediateFamily: editingEmployee.immediateFamily ?? "",
          notes: editingEmployee.notes ?? "",
          employmentContractUrl:
            editingEmployee.employmentContractUrl ?? "",
          employmentContractName:
            editingEmployee.employmentContractName ?? "",
          cnicDocumentUrl: editingEmployee.cnicDocumentUrl ?? "",
          cnicDocumentName: editingEmployee.cnicDocumentName ?? "",
          cnicFrontDocumentUrl: editingEmployee.cnicFrontDocumentUrl ?? "",
          cnicFrontDocumentName: editingEmployee.cnicFrontDocumentName ?? "",
          cnicBackDocumentUrl: editingEmployee.cnicBackDocumentUrl ?? "",
          cnicBackDocumentName: editingEmployee.cnicBackDocumentName ?? "",
          qualificationDocumentUrl:
            editingEmployee.qualificationDocumentUrl ?? "",
          qualificationDocumentName:
            editingEmployee.qualificationDocumentName ?? "",
          lastPayslipOneUrl: editingEmployee.lastPayslipOneUrl ?? "",
          lastPayslipOneName: editingEmployee.lastPayslipOneName ?? "",
          lastPayslipTwoUrl: editingEmployee.lastPayslipTwoUrl ?? "",
          lastPayslipTwoName: editingEmployee.lastPayslipTwoName ?? "",
          lastPayslipThreeUrl: editingEmployee.lastPayslipThreeUrl ?? "",
          lastPayslipThreeName: editingEmployee.lastPayslipThreeName ?? "",
          primaryBankAccountTitle:
            editingEmployee.primaryBankAccountTitle ?? "",
          primaryBankAccountNumber:
            editingEmployee.primaryBankAccountNumber ?? "",
          primaryBankName: PRIMARY_PAYROLL_BANK,
          primaryBankIban: editingEmployee.primaryBankIban ?? "",
          primaryBankBranchCode:
            editingEmployee.primaryBankBranchCode ?? "",
          primaryBankBranchLocation:
            editingEmployee.primaryBankBranchLocation ?? "",
          secondaryBankAccountTitle:
            editingEmployee.secondaryBankAccountTitle ?? "",
          secondaryBankAccountNumber:
            editingEmployee.secondaryBankAccountNumber ?? "",
          secondaryBankName: editingEmployee.secondaryBankName ?? "",
          secondaryBankIban: editingEmployee.secondaryBankIban ?? "",
          secondaryBankBranchCode:
            editingEmployee.secondaryBankBranchCode ?? "",
          secondaryBankBranchLocation:
            editingEmployee.secondaryBankBranchLocation ?? "",
          medicalEnabled: Boolean(editingEmployee.medicalEnabled ?? false),
          medicalDailyLimit: String(editingEmployee.medicalDailyLimit ?? 0),
          medicalOverallLimit: String(editingEmployee.medicalOverallLimit ?? 0),
          medicalOpdLimit: String(editingEmployee.medicalOpdLimit ?? 0),
          medicalIpdLimit: String(editingEmployee.medicalIpdLimit ?? 0),
        };
      }
      const defaultTotalSalary = 100000;
      const { basicSalary, allowances } = splitTotalSalary(defaultTotalSalary);
      return {
      name: "",
      email: "",
      password: DEFAULT_EMPLOYEE_PASSWORD,
      role: "employee" as "admin" | "employee",
      isActive: true,
      phone: "+92",
      position: "",
      department: "",
      positionType: "onsite" as "onsite" | "remote",
      joiningDate: new Date().toISOString().slice(0, 10),
      probationMonths: settings?.defaultProbationMonths ?? 3,
      officeStartTime: settings?.defaultOfficeStartTime ?? "09:00",
      officeEndTime: settings?.defaultOfficeEndTime ?? "18:00",
      gracePeriodMinutes: settings?.defaultGracePeriodMinutes ?? 15,
      breakMinutes: inferBreakMinutes(
        settings?.defaultOfficeStartTime ?? "09:00",
        settings?.defaultOfficeEndTime ?? "18:00",
      ),
      totalSalary: defaultTotalSalary,
      basicSalary,
      allowances,
      casualLeaveQuota: computeProRatedQuota(
        settings?.defaultCasualLeaveQuota ?? 6,
        new Date().toISOString().slice(0, 10),
        settings?.defaultProbationMonths ?? 3,
        settings?.proRatedQuotas,
      ),
      sickLeaveQuota: computeProRatedQuota(
        settings?.defaultSickLeaveQuota ?? 6,
        new Date().toISOString().slice(0, 10),
        settings?.defaultProbationMonths ?? 3,
        settings?.proRatedQuotas,
      ),
      annualLeaveQuota: computeProRatedQuota(
        settings?.defaultAnnualLeaveQuota ?? 12,
        new Date().toISOString().slice(0, 10),
        settings?.defaultProbationMonths ?? 3,
        settings?.proRatedQuotas,
      ),
      dateOfBirth: "",
      employeeCode: generatedEmployeeCode,
      maritalStatus: "",
      wifeName: "",
      wifeDateOfBirth: "",
      kidsCount: "",
      kidsNames: [] as string[],
      personalEmail: "",
      lastQualification: "",
      address: "",
      cnic: "",
      emergencyContactName: "",
      emergencyContactNumber: "+92",
      emergencyContactRelation: "",
      emergencyContact: "",
      previousCompany: "",
      lastPay: "",
      immediateFamily: "",
      notes: "",
      employmentContractUrl: "",
      employmentContractName: "",
      cnicDocumentUrl: "",
      cnicDocumentName: "",
      cnicFrontDocumentUrl: "",
      cnicFrontDocumentName: "",
      cnicBackDocumentUrl: "",
      cnicBackDocumentName: "",
      qualificationDocumentUrl: "",
      qualificationDocumentName: "",
      lastPayslipOneUrl: "",
      lastPayslipOneName: "",
      lastPayslipTwoUrl: "",
      lastPayslipTwoName: "",
      lastPayslipThreeUrl: "",
      lastPayslipThreeName: "",
      primaryBankAccountTitle: "",
      primaryBankAccountNumber: "",
      primaryBankName: PRIMARY_PAYROLL_BANK,
      primaryBankIban: "",
      primaryBankBranchCode: "",
      primaryBankBranchLocation: "",
      secondaryBankAccountTitle: "",
      secondaryBankAccountNumber: "",
      secondaryBankName: "",
      secondaryBankIban: "",
      secondaryBankBranchCode: "",
      secondaryBankBranchLocation: "",
      medicalEnabled: false,
      medicalDailyLimit: "",
      medicalOverallLimit: "",
      medicalOpdLimit: "",
      medicalIpdLimit: "",
    };
    },
    [editingEmployee, generatedEmployeeCode, settings],
  );
  const [form, setForm] = useState(defaultForm);
  const [breakMinutesInput, setBreakMinutesInput] = useState(() =>
    String(defaultForm.breakMinutes),
  );
  const [quotaTouched, setQuotaTouched] = useState(() =>
    getInitialQuotaTouched(editingEmployee),
  );
  const [breakMinutesTouched, setBreakMinutesTouched] = useState(
    Boolean(editingEmployee?.breakMinutes != null),
  );
  const lastHydratedEmployeeIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      lastHydratedEmployeeIdRef.current = null;
      return;
    }

    const nextEmployeeId = editingEmployee?.id ?? null;
    if (lastHydratedEmployeeIdRef.current === nextEmployeeId) return;

    setForm(defaultForm);
    setBreakMinutesInput(String(defaultForm.breakMinutes));
    setQuotaTouched(getInitialQuotaTouched(editingEmployee));
    setBreakMinutesTouched(Boolean(editingEmployee?.breakMinutes != null));
    lastHydratedEmployeeIdRef.current = nextEmployeeId;
  }, [defaultForm, editingEmployee, open]);

  useEffect(() => {
    if (!open) {
      setResetPasswordOpen(false);
      setResetPasswordPending(false);
    }
  }, [open]);

  const joiningYear = useMemo(
    () => Number(form.joiningDate.slice(0, 4)) || new Date().getFullYear(),
    [form.joiningDate],
  );
  const pfPercent = Number(settings?.defaultProvidentFundPercent ?? 0);
  const allowanceBreakdown = useMemo(
    () => splitAllowanceBreakdown(Number(form.allowances) || 0),
    [form.allowances],
  );

  useEffect(() => {
    // Preserve saved leave quotas when editing an existing employee.
    if (!open || editingEmployee) return;
    setForm((current) => ({
      ...current,
      casualLeaveQuota: quotaTouched.casual
        ? current.casualLeaveQuota
        : computeProRatedQuota(
            settings?.defaultCasualLeaveQuota ?? 6,
            current.joiningDate,
            Number(current.probationMonths) || 0,
            settings?.proRatedQuotas,
          ),
      sickLeaveQuota: quotaTouched.sick
        ? current.sickLeaveQuota
        : computeProRatedQuota(
            settings?.defaultSickLeaveQuota ?? 6,
            current.joiningDate,
            Number(current.probationMonths) || 0,
            settings?.proRatedQuotas,
          ),
      annualLeaveQuota: quotaTouched.annual
        ? current.annualLeaveQuota
        : computeProRatedQuota(
            settings?.defaultAnnualLeaveQuota ?? 12,
            current.joiningDate,
            Number(current.probationMonths) || 0,
            settings?.proRatedQuotas,
          ),
    }));
  }, [
    editingEmployee,
    open,
    form.joiningDate,
    form.probationMonths,
    quotaTouched.annual,
    quotaTouched.casual,
    quotaTouched.sick,
    settings?.defaultCasualLeaveQuota,
    settings?.defaultSickLeaveQuota,
    settings?.defaultAnnualLeaveQuota,
    settings?.defaultProbationMonths,
    settings?.proRatedQuotas,
  ]);

  useEffect(() => {
    if (!open || isEditing || breakMinutesTouched) return;
    const suggestedBreakMinutes = inferBreakMinutes(
      form.officeStartTime,
      form.officeEndTime,
    );
    setBreakMinutesInput(String(suggestedBreakMinutes));
  }, [
    breakMinutesTouched,
    form.officeEndTime,
    form.officeStartTime,
    isEditing,
    open,
  ]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submittedBreakMinutes = Number(breakMinutesInput);

    if (!Number.isFinite(submittedBreakMinutes) || submittedBreakMinutes < 0) {
      toast.error("Break time must be zero or more minutes");
      return;
    }

    const payload = {
      name: form.name.trim(),
      personalEmail: form.personalEmail.trim() || undefined,
      phone: hasPhoneSubscriberNumber(form.phone) ? form.phone : undefined,
      position: form.position || undefined,
      department: form.department || undefined,
      positionType: form.positionType,
      joiningDate: form.joiningDate as unknown as string,
      probationMonths: Number(form.probationMonths),
      officeStartTime: form.officeStartTime,
      officeEndTime: form.officeEndTime,
      gracePeriodMinutes: Number(form.gracePeriodMinutes),
      breakMinutes: submittedBreakMinutes,
      basicSalary: Number(form.basicSalary),
      allowances: Number(form.allowances) || 0,
      casualLeaveQuota: Number(form.casualLeaveQuota),
      sickLeaveQuota: Number(form.sickLeaveQuota),
      annualLeaveQuota: Number(form.annualLeaveQuota),
      dateOfBirth: form.dateOfBirth
        ? (form.dateOfBirth as unknown as string)
        : undefined,
      employeeCode: form.employeeCode || undefined,
      maritalStatus: form.maritalStatus || undefined,
      wifeName:
        form.maritalStatus === "Married" ? form.wifeName || undefined : null,
      wifeDateOfBirth:
        form.maritalStatus === "Married" && form.wifeDateOfBirth
          ? (form.wifeDateOfBirth as unknown as string)
          : null,
      kidsCount:
        form.maritalStatus === "Married" && form.kidsCount !== ""
          ? Number(form.kidsCount)
          : null,
      kidsNames:
        form.maritalStatus === "Married"
          ? form.kidsNames.map((name) => name.trim()).filter(Boolean)
          : null,
      lastQualification: form.lastQualification || undefined,
      address: form.address || undefined,
      cnic: form.cnic || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactNumber: hasPhoneSubscriberNumber(
        form.emergencyContactNumber,
      )
        ? form.emergencyContactNumber
        : undefined,
      emergencyContactRelation: form.emergencyContactRelation || undefined,
      emergencyContact:
        (hasPhoneSubscriberNumber(form.emergencyContactNumber)
          ? form.emergencyContactNumber
          : form.emergencyContact) || undefined,
      previousCompany: form.previousCompany || undefined,
      lastPay: form.lastPay ? Number(form.lastPay) : undefined,
      immediateFamily: form.immediateFamily || undefined,
      notes: form.notes || undefined,
      employmentContractUrl: form.employmentContractUrl || undefined,
      employmentContractName: form.employmentContractName || undefined,
      cnicDocumentUrl: form.cnicDocumentUrl || undefined,
      cnicDocumentName: form.cnicDocumentName || undefined,
      cnicFrontDocumentUrl: form.cnicFrontDocumentUrl || undefined,
      cnicFrontDocumentName: form.cnicFrontDocumentName || undefined,
      cnicBackDocumentUrl: form.cnicBackDocumentUrl || undefined,
      cnicBackDocumentName: form.cnicBackDocumentName || undefined,
      qualificationDocumentUrl: form.qualificationDocumentUrl || undefined,
      qualificationDocumentName: form.qualificationDocumentName || undefined,
      lastPayslipOneUrl: form.lastPayslipOneUrl || undefined,
      lastPayslipOneName: form.lastPayslipOneName || undefined,
      lastPayslipTwoUrl: form.lastPayslipTwoUrl || undefined,
      lastPayslipTwoName: form.lastPayslipTwoName || undefined,
      lastPayslipThreeUrl: form.lastPayslipThreeUrl || undefined,
      lastPayslipThreeName: form.lastPayslipThreeName || undefined,
      primaryBankAccountTitle: form.primaryBankAccountTitle || undefined,
      primaryBankAccountNumber: form.primaryBankAccountNumber || undefined,
      primaryBankName: PRIMARY_PAYROLL_BANK,
      primaryBankIban: form.primaryBankIban || undefined,
      primaryBankBranchCode: form.primaryBankBranchCode || undefined,
      primaryBankBranchLocation: form.primaryBankBranchLocation || undefined,
      secondaryBankAccountTitle: form.secondaryBankAccountTitle || undefined,
      secondaryBankAccountNumber: form.secondaryBankAccountNumber || undefined,
      secondaryBankName: form.secondaryBankName || undefined,
      secondaryBankIban: form.secondaryBankIban || undefined,
      secondaryBankBranchCode: form.secondaryBankBranchCode || undefined,
      secondaryBankBranchLocation: form.secondaryBankBranchLocation || undefined,
      medicalEnabled: form.medicalEnabled,
      medicalDailyLimit: Number(form.medicalDailyLimit) || 0,
      medicalOverallLimit: Number(form.medicalOverallLimit) || 0,
      medicalOpdLimit: 0,
      medicalIpdLimit: Number(form.medicalOverallLimit) || 0,
      isActive: form.isActive,
    } as any;

    if (isEditing) {
      update.mutate(
        { id: editingEmployee.id, data: { ...payload, role: form.role } as any },
        {
          onSuccess: (updatedEmployee) => {
            if (updatedEmployee.breakMinutes !== submittedBreakMinutes) {
              toast.error("Break time was not saved. Please try again.");
              qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
              return;
            }

            qc.setQueryData(
              getListEmployeesQueryKey(),
              (current: any[] | undefined) =>
                current?.map((employee) =>
                  employee.id === editingEmployee.id
                    ? updatedEmployee
                    : employee,
                ) ?? current,
            );
            toast.success(`${form.name} updated`);
            qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
            qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
            onOpenChange(false);
            setForm(defaultForm);
          },
          onError: (err: unknown) =>
            toast.error(
              (err as { message?: string }).message ??
                "Could not update employee",
            ),
        },
      );
      return;
    }

    create.mutate(
      {
        data: {
          ...payload,
          email: form.email.trim(),
          password: form.password,
          role: form.role,
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

  const handleResetPassword = async () => {
    if (!editingEmployee?.id) return;

    setResetPasswordPending(true);
    try {
      const response = await fetch(
        getApiUrl(`/api/employees/${editingEmployee.id}/reset-password`),
        {
          method: "POST",
          credentials: "include",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not reset password");
      }

      setResetPasswordOpen(false);
      toast.success(
        `Password reset to "${DEFAULT_EMPLOYEE_PASSWORD}" and the employee will be asked to change it on next sign-in.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reset password",
      );
    } finally {
      setResetPasswordPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit employee" : "Add employee"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the employee profile in the same quick drawer without leaving the list."
              : "A temporary password will be assigned and the employee will be prompted to change it at first sign-in."}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-6 px-1">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Leave preview for {joiningYear}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Casual</p>
                  <p className="font-semibold">{form.casualLeaveQuota} days</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sick</p>
                  <p className="font-semibold">{form.sickLeaveQuota} days</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Annual</p>
                  <p className="font-semibold">{form.annualLeaveQuota} days</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Defaults are calculated using the selected joining date and the
                current leave policy.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Default payroll setup
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Basic split</span>
                  <span className="font-semibold">
                    50% basic / 25% home rent / 25% utility bills
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Provident fund</span>
                  <span className="font-semibold">
                    {pfPercent > 0 ? `${pfPercent}% of basic` : "Disabled"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
          <Section title="User details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employee code">
                <Input
                  value={form.employeeCode ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, employeeCode: e.target.value })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-generated by default, but you can edit it before saving.
                </p>
              </Field>
              <Field label="Full name" required>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              {!isEditing && (
                <>
                  <Field label="Work email" required>
                    <Input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Password" required>
                    <PasswordField
                      required
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      minLength={6}
                    />
                  </Field>
                </>
              )}
              <Field label="Account role" required>
                <Select
                  value={form.role}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      role: v as "admin" | "employee",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    {isAdmin && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Phone number">
                <Input
                  value={form.phone}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      phone: normalizePakistanPhoneInput(e.target.value),
                    })
                  }
                  placeholder="+923XXXXXXXXX"
                />
              </Field>
              <Field label="Personal email">
                <Input
                  type="email"
                  value={form.personalEmail}
                  onChange={(e) =>
                    setForm({ ...form, personalEmail: e.target.value })
                  }
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Date of birth">
                <DateField
                  value={form.dateOfBirth}
                  onChange={(v) => setForm({ ...form, dateOfBirth: v })}
                />
              </Field>
              {isEditing && (
                <Field label="Account status">
                  <div className="space-y-2">
                    <Select
                      value={form.isActive ? "active" : "inactive"}
                      onValueChange={(value) =>
                        setForm({ ...form, isActive: value === "active" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Set this to inactive when the employee is on long leave
                      or bed rest and should not access the system.
                    </p>
                  </div>
                </Field>
              )}
              {isEditing && isAdmin && (
                <Field label="Password reset">
                  <div className="space-y-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3">
                    <p className="text-sm text-muted-foreground">
                      Reset this employee&apos;s password to the default temporary value.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                      onClick={() => setResetPasswordOpen(true)}
                      disabled={resetPasswordPending}
                    >
                      <KeyRound className="size-4" />
                      Reset password to "{DEFAULT_EMPLOYEE_PASSWORD}"
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      The employee will need to change it after the next sign-in.
                    </p>
                  </div>
                </Field>
              )}
              <Field label="Marital status">
                <Select
                  value={form.maritalStatus || "unset"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      maritalStatus: v === "unset" ? "" : v,
                      wifeName: v === "Married" ? form.wifeName : "",
                      kidsCount: v === "Married" ? form.kidsCount : "",
                      kidsNames:
                        v === "Married"
                          ? normalizeKidsNames(
                              form.kidsNames,
                              Number(form.kidsCount || 0),
                            )
                          : [],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select marital status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Select marital status</SelectItem>
                    <SelectItem value="Single">Single</SelectItem>
                    <SelectItem value="Married">Married</SelectItem>
                    <SelectItem value="Divorced">Divorced</SelectItem>
                    <SelectItem value="Widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.maritalStatus === "Married" && (
                <>
                  <Field label="Wife name">
                    <Input
                      value={form.wifeName}
                      onChange={(e) =>
                        setForm({ ...form, wifeName: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Kids">
                    <Input
                      type="number"
                      min={0}
                      value={form.kidsCount}
                      onChange={(e) => {
                        const nextCount = Math.max(
                          0,
                          Number(e.target.value || 0),
                        );
                        setForm({
                          ...form,
                          kidsCount: e.target.value,
                          kidsNames: normalizeKidsNames(
                            form.kidsNames,
                            nextCount,
                          ),
                        });
                      }}
                    />
                  </Field>
                  {Number(form.kidsCount || 0) > 0 && (
                    <div className="sm:col-span-2 grid gap-3">
                      {normalizeKidsNames(
                        form.kidsNames,
                        Number(form.kidsCount || 0),
                      ).map((kidName, index) => (
                        <Field
                          key={`kid-${index}`}
                          label={`Kid ${index + 1} name`}
                        >
                          <Input
                            value={kidName}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                kidsNames: normalizeKidsNames(
                                  form.kidsNames,
                                  Number(form.kidsCount || 0),
                                ).map((value, valueIndex) =>
                                  valueIndex === index
                                    ? e.target.value
                                    : value,
                                ),
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Employment details">
            <div className="grid gap-3 sm:grid-cols-2">
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
                  list="department-options"
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                  placeholder="Select or type a department"
                />
                {departments.length > 0 && (
                  <datalist id="department-options">
                    {departments.map((department) => (
                      <option key={department} value={department} />
                    ))}
                  </datalist>
                )}
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
              <Field label="Probation period (months)" required>
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
              <Field label="CNIC">
                <Input
                  value={form.cnic}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cnic: normalizeCnicInput(e.target.value),
                    })
                  }
                  placeholder="XXXXX-XXXXXXX-X"
                />
              </Field>
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                <Field label="Front CNIC">
                  <SimpleUploadField
                    fileUrl={form.cnicFrontDocumentUrl}
                    fileName={form.cnicFrontDocumentName}
                    onUploaded={(file) =>
                      setForm((current) => ({
                        ...current,
                        cnicFrontDocumentUrl: file.url,
                        cnicFrontDocumentName: file.name,
                      }))
                    }
                    onClear={() =>
                      setForm((current) => ({
                        ...current,
                        cnicFrontDocumentUrl: "",
                        cnicFrontDocumentName: "",
                      }))
                    }
                  />
                </Field>
                <Field label="Back CNIC">
                  <SimpleUploadField
                    fileUrl={form.cnicBackDocumentUrl}
                    fileName={form.cnicBackDocumentName}
                    onUploaded={(file) =>
                      setForm((current) => ({
                        ...current,
                        cnicBackDocumentUrl: file.url,
                        cnicBackDocumentName: file.name,
                      }))
                    }
                    onClear={() =>
                      setForm((current) => ({
                        ...current,
                        cnicBackDocumentUrl: "",
                        cnicBackDocumentName: "",
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <Input
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Schedule">
            <div className="grid gap-3 sm:grid-cols-4">
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
              <Field label="Break (min)" required>
                <Input
                  required
                  name="breakMinutes"
                  type="number"
                  min={0}
                  step={5}
                  value={breakMinutesInput}
                  onChange={(e) => {
                    setBreakMinutesTouched(true);
                    setBreakMinutesInput(e.target.value);
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested: 30 min for 6-hour shifts, 60 min for longer shifts.
                </p>
              </Field>
            </div>
          </Section>

          <Section title="Compensation">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Total salary (PKR)" required>
                <Input
                  required
                  type="text"
                  inputMode="numeric"
                  value={formatNumberInput(form.totalSalary)}
                  onChange={(e) => {
                    const totalSalary = parseNumberInput(e.target.value);
                    const split = splitTotalSalary(totalSalary);
                    setForm({
                      ...form,
                      totalSalary,
                      basicSalary: split.basicSalary,
                      allowances: split.allowances,
                    });
                  }}
                />
              </Field>
              <Field label="Basic salary (PKR)" required>
                <Input
                  required
                  type="text"
                  value={formatNumberInput(form.basicSalary)}
                  readOnly
                />
              </Field>
              <Field label="Home rent (PKR)">
                <Input
                  type="text"
                  value={formatNumberInput(allowanceBreakdown.homeRent)}
                  readOnly
                />
              </Field>
              <Field label="Utility bills (PKR)">
                <Input
                  type="text"
                  value={formatNumberInput(allowanceBreakdown.utilityBills)}
                  readOnly
                />
              </Field>
            </div>
            <p className="-mt-1 text-sm text-muted-foreground">
              The total salary is split automatically into 50% basic salary and
              25% home rent plus 25% utility bills.
            </p>
            <div className="grid items-start gap-3 md:grid-cols-3">
              <Field label="Casual leave" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.casualLeaveQuota}
                  onChange={(e) =>
                    {
                      setQuotaTouched((current) => ({
                        ...current,
                        casual: true,
                      }));
                      setForm({
                        ...form,
                        casualLeaveQuota: Number(e.target.value),
                      });
                    }
                  }
                />
              </Field>
              <Field label="Sick leave" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.sickLeaveQuota}
                  onChange={(e) =>
                    {
                      setQuotaTouched((current) => ({
                        ...current,
                        sick: true,
                      }));
                      setForm({
                        ...form,
                        sickLeaveQuota: Number(e.target.value),
                      });
                    }
                  }
                />
              </Field>
              <Field label="Annual leave" required>
                <Input
                  required
                  type="number"
                  min={0}
                  value={form.annualLeaveQuota}
                  onChange={(e) =>
                    {
                      setQuotaTouched((current) => ({
                        ...current,
                        annual: true,
                      }));
                      setForm({
                        ...form,
                        annualLeaveQuota: Number(e.target.value),
                      });
                    }
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Medical allowance">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Medical enabled">
                <Select
                  value={form.medicalEnabled ? "enabled" : "disabled"}
                  onValueChange={(value) =>
                    setForm({ ...form, medicalEnabled: value === "enabled" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Yearly IPD allowance (PKR)">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberInput(form.medicalOverallLimit)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      medicalOverallLimit: e.target.value
                        ? String(parseNumberInput(e.target.value))
                        : "",
                    })
                  }
                />
              </Field>
              <Field label="Per day limit (PKR)">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberInput(form.medicalDailyLimit)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      medicalDailyLimit: e.target.value
                        ? String(parseNumberInput(e.target.value))
                        : "",
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Primary bank details"
            description="This payroll account is always maintained with Bank Al Habib."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account title">
                <Input
                  value={form.primaryBankAccountTitle}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primaryBankAccountTitle: e.target.value,
                    })
                  }
                  placeholder="Muhammad Ali"
                />
              </Field>
              <Field label="Account number">
                <Input
                  value={form.primaryBankAccountNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primaryBankAccountNumber: e.target.value,
                    })
                  }
                  placeholder="0035123456789"
                />
              </Field>
              <Field label="Bank name">
                <Input
                  value={PRIMARY_PAYROLL_BANK}
                  readOnly
                />
              </Field>
              <Field label="IBAN">
                <Input
                  value={form.primaryBankIban}
                  onChange={(e) =>
                    setForm({ ...form, primaryBankIban: e.target.value })
                  }
                  placeholder="PK12BAGB0001234567890123"
                />
              </Field>
              <Field label="Branch code">
                <Input
                  value={form.primaryBankBranchCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primaryBankBranchCode: e.target.value,
                    })
                  }
                  placeholder="0123"
                />
              </Field>
              <Field label="Branch location">
                <Input
                  value={form.primaryBankBranchLocation}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primaryBankBranchLocation: e.target.value,
                    })
                  }
                  placeholder="Main Branch, Karachi"
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Secondary bank details"
            description="This account can belong to any bank and can be used before probation completion when needed."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account title">
                <Input
                  value={form.secondaryBankAccountTitle}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      secondaryBankAccountTitle: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Account number">
                <Input
                  value={form.secondaryBankAccountNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      secondaryBankAccountNumber: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Bank name">
                <Input
                  value={form.secondaryBankName}
                  onChange={(e) =>
                    setForm({ ...form, secondaryBankName: e.target.value })
                  }
                  placeholder="Meezan Bank"
                />
                </Field>
              <Field label="IBAN">
                <Input
                  value={form.secondaryBankIban}
                  onChange={(e) =>
                    setForm({ ...form, secondaryBankIban: e.target.value })
                  }
                  placeholder="PK36MEZN0001234567890123"
                />
              </Field>
              <Field label="Branch code">
                <Input
                  value={form.secondaryBankBranchCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      secondaryBankBranchCode: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Branch location">
                <Input
                  value={form.secondaryBankBranchLocation}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      secondaryBankBranchLocation: e.target.value,
                    })
                  }
                  placeholder="Gulshan Branch, Karachi"
                />
              </Field>
            </div>
          </Section>

          <Section title="Background">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emergency contact name">
                <Input
                  value={form.emergencyContactName}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactName: e.target.value })
                  }
                  placeholder="Muhammad Ali"
                />
              </Field>
              <Field label="Emergency contact number">
                <Input
                  value={form.emergencyContactNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      emergencyContactNumber: normalizePakistanPhoneInput(
                        e.target.value,
                      ),
                    })
                  }
                  placeholder="+923XXXXXXXXX"
                />
              </Field>
              <Field label="Relation">
                <Input
                  value={form.emergencyContactRelation}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      emergencyContactRelation: e.target.value,
                    })
                  }
                  placeholder="e.g. Father"
                />
              </Field>
              <Field label="Last qualification">
                <Input
                  value={form.lastQualification}
                  onChange={(e) =>
                    setForm({ ...form, lastQualification: e.target.value })
                  }
                  placeholder="e.g. BS Computer Science"
                />
              </Field>
              <Field label="Upload qualification">
                <SimpleUploadField
                  fileUrl={form.qualificationDocumentUrl}
                  fileName={form.qualificationDocumentName}
                  onUploaded={(file) =>
                    setForm((current) => ({
                      ...current,
                      qualificationDocumentUrl: file.url,
                      qualificationDocumentName: file.name,
                    }))
                  }
                  onClear={() =>
                    setForm((current) => ({
                      ...current,
                      qualificationDocumentUrl: "",
                      qualificationDocumentName: "",
                    }))
                  }
                />
              </Field>
              <Field label="Employment contract">
                <SimpleUploadField
                  fileUrl={form.employmentContractUrl}
                  fileName={form.employmentContractName}
                  onUploaded={(file) =>
                    setForm((current) => ({
                      ...current,
                      employmentContractUrl: file.url,
                      employmentContractName: file.name,
                    }))
                  }
                  onClear={() =>
                    setForm((current) => ({
                      ...current,
                      employmentContractUrl: "",
                      employmentContractName: "",
                    }))
                  }
                />
              </Field>
              <Field label="Previous company">
                <Input
                  value={form.previousCompany}
                  onChange={(e) =>
                    setForm({ ...form, previousCompany: e.target.value })
                  }
                />
              </Field>
              <Field label="Last pay (PKR)">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberInput(form.lastPay)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lastPay: e.target.value
                        ? String(parseNumberInput(e.target.value))
                        : "",
                    })
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Family members">
                  <Input
                    value={form.immediateFamily}
                    onChange={(e) =>
                      setForm({ ...form, immediateFamily: e.target.value })
                    }
                    placeholder="Optional family member details"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
                <Field label="Last 3 months payslip 1">
                  <SimpleUploadField
                    fileUrl={form.lastPayslipOneUrl}
                    fileName={form.lastPayslipOneName}
                    onUploaded={(file) =>
                      setForm((current) => ({
                        ...current,
                        lastPayslipOneUrl: file.url,
                        lastPayslipOneName: file.name,
                      }))
                    }
                    onClear={() =>
                      setForm((current) => ({
                        ...current,
                        lastPayslipOneUrl: "",
                        lastPayslipOneName: "",
                      }))
                    }
                  />
                </Field>
                <Field label="Last 3 months payslip 2">
                  <SimpleUploadField
                    fileUrl={form.lastPayslipTwoUrl}
                    fileName={form.lastPayslipTwoName}
                    onUploaded={(file) =>
                      setForm((current) => ({
                        ...current,
                        lastPayslipTwoUrl: file.url,
                        lastPayslipTwoName: file.name,
                      }))
                    }
                    onClear={() =>
                      setForm((current) => ({
                        ...current,
                        lastPayslipTwoUrl: "",
                        lastPayslipTwoName: "",
                      }))
                    }
                  />
                </Field>
                <Field label="Last 3 months payslip 3">
                  <SimpleUploadField
                    fileUrl={form.lastPayslipThreeUrl}
                    fileName={form.lastPayslipThreeName}
                    onUploaded={(file) =>
                      setForm((current) => ({
                        ...current,
                        lastPayslipThreeUrl: file.url,
                        lastPayslipThreeName: file.name,
                      }))
                    }
                    onClear={() =>
                      setForm((current) => ({
                        ...current,
                        lastPayslipThreeUrl: "",
                        lastPayslipThreeName: "",
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <Input
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    placeholder="Optional internal note"
                  />
                </Field>
              </div>
            </div>
          </Section>
          </div>

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {isEditing
                ? update.isPending
                  ? "Saving..."
                  : "Save changes"
                : create.isPending
                  ? "Adding..."
                  : "Add employee"}
            </Button>
          </SheetFooter>
        </form>
        <AlertDialog
          open={resetPasswordOpen}
          onOpenChange={setResetPasswordOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset employee password?</AlertDialogTitle>
              <AlertDialogDescription>
                This will set {form.name || "this employee"}&apos;s password to{" "}
                "{DEFAULT_EMPLOYEE_PASSWORD}" and require a password change
                after the next sign-in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetPasswordPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={handleResetPassword}
                disabled={resetPasswordPending}
              >
                {resetPasswordPending ? "Resetting..." : "Reset password"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

type CsvRow = Record<string, string>;

function getCsvValue(row: CsvRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

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

function parseCsvBoolean(v: string | undefined): boolean | undefined {
  const normalized = str(v)?.toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "y", "1", "active", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "inactive", "disabled"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function normalizeCsvTime(v: string | undefined): string | undefined {
  const raw = str(v);
  if (!raw) return undefined;

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const meridiemMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!meridiemMatch) return raw;

  const parsedHours = Number(meridiemMatch[1]);
  const parsedMinutes = Number(meridiemMatch[2]);
  if (parsedHours < 1 || parsedHours > 12 || parsedMinutes < 0 || parsedMinutes > 59) {
    return raw;
  }

  const meridiem = meridiemMatch[3].toUpperCase();
  const normalizedHours =
    meridiem === "AM"
      ? parsedHours % 12
      : (parsedHours % 12) + 12;

  return `${String(normalizedHours).padStart(2, "0")}:${String(parsedMinutes).padStart(2, "0")}`;
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
        generatedPasswords: { row: number; email: string; password: string }[];
      }
    | null
  >(null);
  const templateHref = useMemo(() => createEmployeeCsvTemplateHref(), []);

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
    const generatedPasswords: { row: number; email: string; password: string }[] = [];
    const lastRowByEmail = new Map<string, number>();
    rows.forEach((row, index) => {
      const normalizedEmail = (getCsvValue(row, "email") ?? "").trim().toLowerCase();
      if (normalizedEmail) {
        lastRowByEmail.set(normalizedEmail, index);
      }
    });
    const effectiveRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => {
        const normalizedEmail = (getCsvValue(row, "email") ?? "").trim().toLowerCase();
        if (!normalizedEmail) return true;
        return lastRowByEmail.get(normalizedEmail) === index;
      });

    const members = effectiveRows.map(({ row: r, index }) => {
      const email = (getCsvValue(r, "email") ?? "").trim().toLowerCase();
      const password = getCsvValue(r, "password") ?? DEFAULT_EMPLOYEE_PASSWORD;
      if (!getCsvValue(r, "password") && email) {
        generatedPasswords.push({
          row: index + 2,
          email,
          password,
        });
      }

      const probationMonths =
        num(getCsvValue(r, "probationMonths", "probation"), settings?.defaultProbationMonths ?? 3) ??
        (settings?.defaultProbationMonths ?? 3);
      const officeStartTime =
        normalizeCsvTime(
          getCsvValue(r, "officeStartTime", "officeStart", "startTime", "office start"),
        ) ??
        settings?.defaultOfficeStartTime ??
        "09:00";
      const officeEndTime =
        normalizeCsvTime(
          getCsvValue(r, "officeEndTime", "officeEnd", "endTime", "office end"),
        ) ??
        settings?.defaultOfficeEndTime ??
        "18:00";
      const joiningDate =
        (getCsvValue(r, "joiningDate", "joining_date", "dateOfJoining") ??
          new Date().toISOString().slice(0, 10)) as unknown as string;
      const uploadedCasualLeaveQuota = num(
        getCsvValue(r, "casualLeaveQuota", "casualLeave"),
      );
      const uploadedSickLeaveQuota = num(
        getCsvValue(r, "sickLeaveQuota", "sickLeave"),
      );
      const uploadedAnnualLeaveQuota = num(
        getCsvValue(r, "annualLeaveQuota", "annualLeave"),
      );

      return {
        name: getCsvValue(r, "name") ?? "",
        email,
        password,
        isActive:
          parseCsvBoolean(getCsvValue(r, "isActive", "active", "status")) ?? true,
        role: ((): "admin" | "hr" | "employee" => {
          const v = getCsvValue(r, "role")?.toLowerCase();
          if (v === "admin") return "admin";
          if (v === "hr") return "hr";
          return "employee";
        })(),
        phone: getCsvValue(r, "phone", "phoneNumber"),
        position: getCsvValue(r, "position", "jobTitle"),
        department: getCsvValue(r, "department", "team"),
        positionType:
          (getCsvValue(r, "positionType", "workLocation")?.toLowerCase() === "remote"
            ? "remote"
            : "onsite") as "onsite" | "remote",
        joiningDate,
        probationMonths,
        officeStartTime,
        officeEndTime,
        gracePeriodMinutes:
          num(
            getCsvValue(r, "gracePeriodMinutes", "gracePeriodMin", "gracePeriod"),
            settings?.defaultGracePeriodMinutes ?? 15,
          ) ?? (settings?.defaultGracePeriodMinutes ?? 15),
        breakMinutes:
          num(getCsvValue(r, "breakMinutes"), inferBreakMinutes(officeStartTime, officeEndTime)) ??
          inferBreakMinutes(officeStartTime, officeEndTime),
        basicSalary: num(getCsvValue(r, "basicSalary", "salary"), 0) ?? 0,
        allowances: num(getCsvValue(r, "allowances", "allowance"), 0) ?? 0,
        casualLeaveQuota: uploadedCasualLeaveQuota,
        sickLeaveQuota: uploadedSickLeaveQuota,
        annualLeaveQuota: uploadedAnnualLeaveQuota,
        dateOfBirth: getCsvValue(r, "dateOfBirth", "dob") as unknown as string | undefined,
        education: getCsvValue(r, "education"),
        address: getCsvValue(r, "address"),
        maritalStatus: getCsvValue(r, "maritalStatus"),
        wifeName: getCsvValue(r, "wifeName"),
        wifeDateOfBirth: getCsvValue(r, "wifeDateOfBirth") as unknown as string | undefined,
        kidsCount: num(getCsvValue(r, "kidsCount")),
        emergencyContactName: getCsvValue(r, "emergencyContactName"),
        emergencyContactNumber: getCsvValue(r, "emergencyContactNumber"),
        emergencyContactRelation: getCsvValue(r, "emergencyContactRelation"),
        cnic: getCsvValue(r, "cnic"),
        lastQualification: getCsvValue(r, "lastQualification"),
        previousCompany: getCsvValue(r, "previousCompany"),
        lastPay: num(getCsvValue(r, "lastPay")),
        notes: getCsvValue(r, "notes"),
      };
    });
    bulk.mutate(
      { data: { members } },
      {
        onSuccess: (res) => {
          const createdEmailSet = new Set(
            (res.createdEmails ?? []).map((email) => email.toLowerCase()),
          );
          setResult({
            created: res.created,
            errors: res.errors,
            generatedPasswords: generatedPasswords.filter((item) =>
              createdEmailSet.has(item.email.toLowerCase()),
            ),
          });
          if (res.created > 0) {
            toast.success(`Imported ${res.created} employee(s)`);
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
            Upload a CSV to add or update many members at once. Matching emails
            already in HRM will be overwritten by the uploaded row. Download the
            sample to see the expected columns.
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
                  href={templateHref}
                  download="sample-employees.csv"
                >
                  <Download className="h-4 w-4" />
                  Download template
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
                {result.created} employee(s) imported
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
              {result.generatedPasswords.length > 0 && (
                <div className="mt-3">
                  <p className="text-amber-700">
                    Generated temporary passwords:
                  </p>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-700">
                    {result.generatedPasswords.map((item) => (
                      <li key={`${item.row}-${item.email}`}>
                        Row {item.row} ({item.email}):{" "}
                        <span className="font-mono">{item.password}</span>
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
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      {description ? (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">{description}</p>
      ) : null}
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

function SimpleUploadField({
  fileUrl,
  fileName,
  onUploaded,
  onClear,
}: {
  fileUrl: string;
  fileName: string;
  onUploaded: (file: { url: string; name: string }) => void;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const normalizedLabel = fileName || "Document";
  const lowerAsset = `${fileUrl} ${normalizedLabel}`.toLowerCase();
  const isImageAsset =
    /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(lowerAsset) ||
    lowerAsset.includes("image/");

  const onPick = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json();
      onUploaded(result);
      toast.success("Document uploaded");
    } catch {
      toast.error("Could not upload document");
    } finally {
      setUploading(false);
    }
  };

  return fileUrl ? (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
      {isImageAsset ? (
        <a
          href={resolveAssetUrl(fileUrl)}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg border border-border bg-card"
        >
          <img
            src={resolveAssetUrl(fileUrl)}
            alt={normalizedLabel}
            className="h-56 w-full object-cover bg-muted/30"
          />
        </a>
      ) : (
        <a
          href={resolveAssetUrl(fileUrl)}
          target="_blank"
          rel="noreferrer"
          className="block truncate rounded-lg border border-border bg-card px-3 py-3 font-medium text-primary hover:underline"
        >
          {normalizedLabel}
        </a>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <a
            href={resolveAssetUrl(fileUrl)}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium text-primary hover:underline"
          >
            {normalizedLabel}
          </a>
          <a
            href={resolveAssetUrl(fileUrl)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Open
          </a>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted">
            {uploading ? "Uploading..." : "Replace"}
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPick(file);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-rose-600 hover:text-rose-700"
            onClick={onClear}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground hover:text-foreground">
      {uploading ? "Uploading..." : "Click to upload PDF / image"}
      <input
        type="file"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
