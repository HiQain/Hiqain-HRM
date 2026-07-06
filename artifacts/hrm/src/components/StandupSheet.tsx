import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, CheckCircle2, ChevronRight, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/lib/api";

export type StandupSheetResponse = {
  employee: {
    id: number;
    name: string;
    email: string;
    position?: string | null;
    department?: string | null;
    avatarUrl?: string | null;
  };
  days: Array<{
    date: string;
    entries: Array<{
      id: number;
      project: string;
      working: string;
      sortOrder: number;
    }>;
  }>;
};

type StandupDayDraft = {
  id: string;
  date: string;
  entries: Array<{
    id?: number;
    localId: string;
    project: string;
    working: string;
  }>;
};

const EMPTY_DAY_ENTRY = { project: "", working: "" };
const STANDUP_TABLE_MIN_COLUMN_WIDTH = 220;
const STANDUP_SERIAL_COLUMN_WIDTH = 80;
const STANDUP_ACTIONS_COLUMN_WIDTH = 112;

type StandupColumnWidths = {
  project: number;
  working: number;
};

function getStandupColumnWidths(totalResizableWidth: number, current?: StandupColumnWidths) {
  const safeTotal = Math.max(totalResizableWidth, 0);
  const minColumnWidth = Math.min(STANDUP_TABLE_MIN_COLUMN_WIDTH, safeTotal / 2);

  if (!current) {
    const project = Math.round(safeTotal / 2);
    return { project, working: safeTotal - project };
  }

  const currentTotal = current.project + current.working;
  if (currentTotal <= 0) {
    const project = Math.round(safeTotal / 2);
    return { project, working: safeTotal - project };
  }

  const projectRatio = current.project / currentTotal;
  const project = Math.min(
    Math.max(Math.round(safeTotal * projectRatio), minColumnWidth),
    safeTotal - minColumnWidth,
  );

  return {
    project,
    working: safeTotal - project,
  };
}

function useStandupColumnResizer(editable: boolean) {
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<{
    column: "project" | "working";
    startX: number;
    startWidths: StandupColumnWidths;
    totalResizableWidth: number;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<StandupColumnWidths>({
    project: 420,
    working: 420,
  });

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const fixedWidth =
      STANDUP_SERIAL_COLUMN_WIDTH + (editable ? STANDUP_ACTIONS_COLUMN_WIDTH : 0);

    const syncWidths = (containerWidth: number) => {
      const totalResizableWidth = Math.max(containerWidth - fixedWidth, 0);
      setColumnWidths((current) => getStandupColumnWidths(totalResizableWidth, current));
    };

    syncWidths(container.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      syncWidths(entry.contentRect.width);
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [editable]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const minColumnWidth = Math.min(
        STANDUP_TABLE_MIN_COLUMN_WIDTH,
        resizeState.totalResizableWidth / 2,
      );
      const delta = event.clientX - resizeState.startX;

      if (resizeState.column === "project") {
        const nextProject = Math.min(
          Math.max(resizeState.startWidths.project + delta, minColumnWidth),
          resizeState.totalResizableWidth - minColumnWidth,
        );

        setColumnWidths({
          project: nextProject,
          working: resizeState.totalResizableWidth - nextProject,
        });
        return;
      }

      const nextWorking = Math.min(
        Math.max(resizeState.startWidths.working + delta, minColumnWidth),
        resizeState.totalResizableWidth - minColumnWidth,
      );

      setColumnWidths({
        project: resizeState.totalResizableWidth - nextWorking,
        working: nextWorking,
      });
    };

    const onPointerUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const startColumnResize = (column: "project" | "working", clientX: number) => {
    const containerWidth = tableContainerRef.current?.clientWidth ?? 0;
    const fixedWidth =
      STANDUP_SERIAL_COLUMN_WIDTH + (editable ? STANDUP_ACTIONS_COLUMN_WIDTH : 0);
    const totalResizableWidth = Math.max(containerWidth - fixedWidth, 0);

    resizeStateRef.current = {
      column,
      startX: clientX,
      startWidths: columnWidths,
      totalResizableWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return { tableContainerRef, columnWidths, startColumnResize };
}

function buildLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, amount: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + amount);
  return formatLocalDateInputValue(base);
}

function getDefaultStandupDate(days: StandupDayDraft[]) {
  if (days.length === 0) {
    return formatLocalDateInputValue(new Date());
  }

  const usedDates = new Set(days.map((day) => day.date));
  let candidate = days[days.length - 1]?.date ?? formatLocalDateInputValue(new Date());

  while (usedDates.has(candidate)) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function createBlankDay(date = formatLocalDateInputValue(new Date())): StandupDayDraft {
  return {
    id: buildLocalId(),
    date,
    entries: [{ localId: buildLocalId(), ...EMPTY_DAY_ENTRY }],
  };
}

function mapSheetToDraft(sheet: StandupSheetResponse | undefined): StandupDayDraft[] {
  if (!sheet?.days?.length) return [createBlankDay()];
  return sheet.days.map((day) => ({
    id: buildLocalId(),
    date: day.date,
    entries:
      day.entries.length > 0
        ? day.entries.map((entry) => ({
            id: entry.id,
            localId: buildLocalId(),
            project: entry.project,
            working: entry.working,
          }))
        : [{ localId: buildLocalId(), ...EMPTY_DAY_ENTRY }],
  }));
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "Request failed");
  }

  return response.json();
}

function formatStandupDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildStandupPayload(days: StandupDayDraft[]) {
  return {
    days: days.map((day) => ({
      date: day.date,
      entries: day.entries.map((entry) => ({
        id: entry.id,
        project: entry.project,
        working: entry.working,
      })),
    })),
  };
}

function buildStandupPayloadFromSheet(sheet: StandupSheetResponse | undefined) {
  return {
    days: (sheet?.days ?? []).map((day) => ({
      date: day.date,
      entries: day.entries.map((entry) => ({
        id: entry.id,
        project: entry.project,
        working: entry.working,
      })),
    })),
  };
}

export function useStandupSheet(path: string, queryKey: readonly unknown[]) {
  return useQuery({
    queryKey,
    queryFn: () => fetchJson<StandupSheetResponse>(path),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
}

export function EmployeeStandupSheet({
  queryKey,
  path,
  title = "Standup Sheet",
  description = "Track daily project updates in a sheet layout similar to your reference.",
  backHref,
  backLabel,
  showEmployeeSummary = true,
}: {
  queryKey: readonly unknown[];
  path: string;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  showEmployeeSummary?: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useStandupSheet(path, queryKey);
  const [days, setDays] = useState<StandupDayDraft[]>([]);
  const [syncState, setSyncState] = useState<"synced" | "saving" | "error">("synced");
  const lastSavedSignatureRef = useRef("");
  const lastServerSignatureRef = useRef("");
  const initializedPathRef = useRef<string | null>(null);
  const { tableContainerRef, columnWidths, startColumnResize } =
    useStandupColumnResizer(true);

  const saveStandup = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildStandupPayload>) =>
      fetchJson<StandupSheetResponse>(path, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (sheet, payload) => {
      qc.setQueryData(queryKey, sheet);
      lastSavedSignatureRef.current = JSON.stringify(payload);
      setSyncState("synced");
    },
    onError: (mutationError) => {
      setSyncState("error");
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Could not save standup sheet",
      );
    },
  });

  const totalRows = useMemo(
    () => days.reduce((sum, day) => sum + day.entries.length, 0),
    [days],
  );
  const payload = useMemo(() => buildStandupPayload(days), [days]);
  const payloadSignature = useMemo(() => JSON.stringify(payload), [payload]);

  useEffect(() => {
    if (isLoading) return;

    const incomingSignature = JSON.stringify(buildStandupPayloadFromSheet(data));
    const pathChanged = initializedPathRef.current !== path;
    const serverChanged = incomingSignature !== lastServerSignatureRef.current;

    if (!pathChanged && !serverChanged) return;

    const hasUnsavedLocalChanges =
      payloadSignature !== lastSavedSignatureRef.current || saveStandup.isPending;

    if (pathChanged || !hasUnsavedLocalChanges) {
      setDays(mapSheetToDraft(data));
      lastSavedSignatureRef.current = incomingSignature;
      setSyncState("synced");
    }

    lastServerSignatureRef.current = incomingSignature;
    initializedPathRef.current = path;
  }, [data, isLoading, path, payloadSignature, saveStandup.isPending]);

  const updateDay = (dayId: string, updater: (day: StandupDayDraft) => StandupDayDraft) => {
    setDays((current) => current.map((day) => (day.id === dayId ? updater(day) : day)));
  };

  const removeDay = (dayId: string) => {
    setDays((current) => {
      const next = current.filter((day) => day.id !== dayId);
      return next.length > 0 ? next : [createBlankDay()];
    });
  };

  useEffect(() => {
    if (isLoading || isError) return;
    if (saveStandup.isPending) return;
    if (payloadSignature === lastSavedSignatureRef.current) {
      setSyncState("synced");
      return;
    }

    setSyncState("saving");
    const timeoutId = window.setTimeout(() => {
      saveStandup.mutate(payload);
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [isError, isLoading, payload, payloadSignature, saveStandup]);

  if (isLoading) return <StandupSheetSkeleton />;
  if (isError) {
    return <StandupSheetError message={error instanceof Error ? error.message : undefined} />;
  }

  return (
    <div className="space-y-6">
      {backHref && backLabel ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          {backLabel}
        </Link>
      ) : null}
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() =>
                setDays((current) => [
                  ...current,
                  createBlankDay(getDefaultStandupDate(current)),
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Add date
            </Button>
            <StandupSyncBadge state={syncState} />
          </div>
        }
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {showEmployeeSummary ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <EmployeeAvatar
                name={data?.employee.name ?? "Employee"}
                url={data?.employee.avatarUrl ?? null}
                size="md"
              />
              <div>
                <p className="text-sm font-semibold">{data?.employee.name}</p>
                <p className="text-xs text-muted-foreground">
                  {data?.employee.position || "Team member"}
                  {data?.employee.department ? ` - ${data.employee.department}` : ""}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{totalRows} row(s)</p>
          </div>
        ) : (
          <div className="mb-4 flex justify-end">
            <p className="text-xs text-muted-foreground">{totalRows} row(s)</p>
          </div>
        )}

        <StandupSheetTable
          days={days}
          editable
          tableContainerRef={tableContainerRef}
          columnWidths={columnWidths}
          onStartColumnResize={startColumnResize}
          onAddRow={(dayId) =>
            updateDay(dayId, (day) => ({
              ...day,
              entries: [...day.entries, { localId: buildLocalId(), ...EMPTY_DAY_ENTRY }],
            }))
          }
          onUpdateDate={(dayId, value) =>
            updateDay(dayId, (day) => ({ ...day, date: value }))
          }
          onUpdateEntry={(dayId, localId, field, value) =>
            updateDay(dayId, (day) => ({
              ...day,
              entries: day.entries.map((entry) =>
                entry.localId === localId ? { ...entry, [field]: value } : entry,
              ),
            }))
          }
          onRemoveEntry={(dayId, localId) =>
            updateDay(dayId, (day) => ({
              ...day,
              entries:
                day.entries.length > 1
                  ? day.entries.filter((entry) => entry.localId !== localId)
                  : [{ localId: buildLocalId(), ...EMPTY_DAY_ENTRY }],
            }))
          }
        />
      </div>
    </div>
  );
}

export function ReadonlyStandupSheet({
  queryKey,
  path,
  backHref,
  backLabel,
}: {
  queryKey: readonly unknown[];
  path: string;
  backHref: string;
  backLabel: string;
}) {
  const { data, isLoading, isError, error } = useStandupSheet(path, queryKey);
  const days = mapSheetToDraft(data);
  const { tableContainerRef, columnWidths, startColumnResize } =
    useStandupColumnResizer(false);

  if (isLoading) return <StandupSheetSkeleton />;
  if (isError) {
    return <StandupSheetError message={error instanceof Error ? error.message : undefined} />;
  }

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        {backLabel}
      </Link>

      <PageHeader
        title={`${data?.employee.name ?? "Employee"} Standup Sheet`}
        description="Review this employee's standup updates grouped by date."
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <EmployeeAvatar
            name={data?.employee.name ?? "Employee"}
            url={data?.employee.avatarUrl ?? null}
            size="md"
          />
          <div>
            <p className="text-sm font-semibold">{data?.employee.name}</p>
            <p className="text-xs text-muted-foreground">
              {data?.employee.position || "Team member"}
              {data?.employee.department ? ` - ${data.employee.department}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{data?.employee.email}</p>
          </div>
        </div>

        {data?.days.length ? (
          <StandupSheetTable
            days={days}
            tableContainerRef={tableContainerRef}
            columnWidths={columnWidths}
            onStartColumnResize={startColumnResize}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm font-medium">No standup entries yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This employee has not filled their standup sheet yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function StandupUsersDirectory({
  employees,
  search,
  onSearchChange,
}: {
  employees: Array<{
    id: number;
    name: string;
    email: string;
    position?: string | null;
    department?: string | null;
    avatarUrl?: string | null;
  }>;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee: (typeof employees)[number]) =>
      [employee.name, employee.email, employee.position ?? "", employee.department ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [employees, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Standup Users"
        description="Open any employee to view their standup sheet."
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name, email, position, department..."
            className="sm:max-w-md"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4" />
            {filtered.length} employee(s)
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm font-medium">No employee users found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different search term.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((employee) => (
              <Link
                key={employee.id}
                href={`/admin/standup-users/${employee.id}`}
                className="group rounded-xl border border-border bg-muted/20 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <EmployeeAvatar
                    name={employee.name}
                    url={employee.avatarUrl ?? null}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{employee.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {employee.position || "Team member"}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {employee.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {employee.department || "No department"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StandupDateControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = () => {
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <button
      type="button"
      onClick={openDatePicker}
      className="relative flex items-center gap-2 rounded-md border border-slate-400 bg-white px-3 py-2"
    >
      <span className="text-sm font-semibold text-red-600">{formatStandupDate(value)}</span>
      <Calendar className="h-4 w-4 text-slate-700" />
      <Input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </button>
  );
}

function StandupSheetTable({
  days,
  editable = false,
  tableContainerRef,
  columnWidths,
  onStartColumnResize,
  onAddRow,
  onUpdateDate,
  onUpdateEntry,
  onRemoveEntry,
}: {
  days: StandupDayDraft[];
  editable?: boolean;
  tableContainerRef: RefObject<HTMLDivElement | null>;
  columnWidths: StandupColumnWidths;
  onStartColumnResize?: (column: "project" | "working", clientX: number) => void;
  onAddRow?: (dayId: string) => void;
  onUpdateDate?: (dayId: string, value: string) => void;
  onUpdateEntry?: (
    dayId: string,
    localId: string,
    field: "project" | "working",
    value: string,
  ) => void;
  onRemoveEntry?: (dayId: string, localId: string) => void;
}) {
  return (
    <div ref={tableContainerRef} className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-hidden">
        <table
          className="border-collapse text-sm table-fixed"
          style={{ width: "100%" }}
        >
          <colgroup>
            <col style={{ width: `${STANDUP_SERIAL_COLUMN_WIDTH}px` }} />
            <col style={{ width: `${columnWidths.project}px` }} />
            <col style={{ width: `${columnWidths.working}px` }} />
            {editable ? <col style={{ width: `${STANDUP_ACTIONS_COLUMN_WIDTH}px` }} /> : null}
          </colgroup>
          <thead>
            <tr className="bg-slate-200 text-slate-900">
              <th className="w-20 border border-slate-400 px-3 py-2 text-center font-semibold">
                S. No
              </th>
              <th className="relative border border-slate-400 px-3 py-2 text-left font-semibold">
                <span>Project</span>
                <button
                  type="button"
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-slate-400/30"
                  aria-label="Resize project column"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    onStartColumnResize?.("project", event.clientX);
                  }}
                />
              </th>
              <th className="relative border border-slate-400 px-3 py-2 text-left font-semibold">
                <span>Working</span>
                <button
                  type="button"
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-slate-400/30"
                  aria-label="Resize working column"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    onStartColumnResize?.("working", event.clientX);
                  }}
                />
              </th>
              {editable ? (
                <th className="w-28 border border-slate-400 px-3 py-2 text-center font-semibold">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <Fragment key={day.id}>
                <tr className="bg-yellow-300">
                  <td
                    colSpan={editable ? 4 : 3}
                    className="border border-slate-400 px-3 py-2 text-center font-semibold text-red-600"
                  >
                    <div className="flex items-center justify-center gap-3">
                      {editable ? (
                        <StandupDateControl
                          value={day.date}
                          onChange={(value) => onUpdateDate?.(day.id, value)}
                        />
                      ) : (
                        <span>{formatStandupDate(day.date)}</span>
                      )}
                    </div>
                  </td>
                </tr>
                {day.entries.map((entry, index) => (
                  <tr key={entry.localId} className="align-top">
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      {index + 1}
                    </td>
                    <td className="border border-slate-300 px-2 py-1">
                      {editable ? (
                        <Textarea
                          value={entry.project}
                          onChange={(event) =>
                            onUpdateEntry?.(day.id, entry.localId, "project", event.target.value)
                          }
                          placeholder="Project name"
                          className="min-h-12 resize-y border-0 bg-transparent px-2 py-1 shadow-none focus-visible:ring-0"
                        />
                      ) : (
                        <div className="whitespace-pre-wrap px-1 py-1.5">
                          {entry.project || "-"}
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1">
                      {editable ? (
                        <Textarea
                          value={entry.working}
                          onChange={(event) =>
                            onUpdateEntry?.(day.id, entry.localId, "working", event.target.value)
                          }
                          placeholder="What did you work on?"
                          className="min-h-12 resize-y border-0 bg-transparent px-2 py-1 shadow-none focus-visible:ring-0"
                        />
                      ) : (
                        <div className="whitespace-pre-wrap px-1 py-1.5">
                          {entry.working || "-"}
                        </div>
                      )}
                    </td>
                    {editable ? (
                      <td className="border border-slate-300 px-2 py-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => onRemoveEntry?.(day.id, entry.localId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {editable ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-slate-300 bg-white px-3 py-3 text-center"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                        onClick={() => onAddRow?.(day.id)}
                        aria-label="Add row"
                        title="Add row"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StandupSheetSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-[520px] w-full rounded-2xl" />
    </div>
  );
}

function StandupSheetError({ message }: { message?: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Standup Sheet"
        description="We could not load this standup sheet."
      />
      <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-8 text-center">
        <p className="text-sm font-medium text-rose-700">Unable to load standup sheet</p>
        <p className="mt-1 text-xs text-rose-600">
          {message || "Please refresh the page and try again."}
        </p>
      </div>
    </div>
  );
}

function StandupSyncBadge({
  state,
}: {
  state: "synced" | "saving" | "error";
}) {
  if (state === "saving") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        Syncing...
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        Auto-save failed
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      <CheckCircle2 className="h-4 w-4" />
      Synced
    </div>
  );
}
