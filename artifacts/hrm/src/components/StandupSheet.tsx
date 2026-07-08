import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ColumnResizedEvent,
  type ICellRendererParams,
  type IHeaderParams,
  type IsFullWidthRowParams,
  type RowHeightParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Link } from "wouter";
import { Calendar as CalendarIcon, CheckCircle2, ChevronRight, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/lib/api";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

export type StandupSheetResponse = {
  employee: {
    id: number;
    name: string;
    email: string;
    position?: string | null;
    department?: string | null;
    avatarUrl?: string | null;
  };
  columns: StandupColumn[];
  days: Array<{
    date: string;
    entries: Array<{
      id: number;
      project: string;
      working: string;
      extraValues?: Record<string, string>;
      sortOrder: number;
    }>;
  }>;
};

export type StandupColumn = {
  key: string;
  label: string;
  width?: number;
  kind?: "system" | "custom";
};

type StandupDayDraft = {
  id: string;
  date: string;
  entries: Array<{
    id?: number;
    localId: string;
    project: string;
    working: string;
    extraValues: Record<string, string>;
  }>;
};

const EMPTY_DAY_ENTRY = { project: "", working: "" };
const STANDUP_TABLE_MIN_COLUMN_WIDTH = 100;
const STANDUP_UTILITY_COLUMN_WIDTH = 72;
const STANDUP_SERIAL_COLUMN_WIDTH = STANDUP_UTILITY_COLUMN_WIDTH;
const STANDUP_ACTIONS_COLUMN_WIDTH = STANDUP_UTILITY_COLUMN_WIDTH;
const STANDUP_DEFAULT_PROJECT_WIDTH = 180;
const STANDUP_DEFAULT_WORKING_WIDTH = 360;
const STANDUP_AUTOSAVE_DEBOUNCE_MS = 1800;
const DEFAULT_STANDUP_COLUMNS: StandupColumn[] = [
  { key: "project", label: "Project", width: STANDUP_DEFAULT_PROJECT_WIDTH, kind: "system" },
  { key: "working", label: "Working", width: STANDUP_DEFAULT_WORKING_WIDTH, kind: "system" },
];

type StandupColumnWidthMap = Record<string, number>;
type StandupGridRow =
  | {
    id: string;
    rowType: "date";
    dayId: string;
    date: string;
  }
  | {
    id: string;
    rowType: "entry";
    dayId: string;
    localId: string;
    serial: number;
    project: string;
    working: string;
    extraValues: Record<string, string>;
  }
  | {
    id: string;
    rowType: "add";
    dayId: string;
  };

type StandupTopScrollbarState = {
  visible: boolean;
  thumbWidth: number;
  thumbOffset: number;
};

function getStandupColumnWidthsStorageKey(path: string) {
  return `standup-column-widths:${path}`;
}

function getStandupColumnWidthsStorageKeyForEmployee(employeeId: number | undefined, path: string) {
  if (employeeId && Number.isFinite(employeeId) && employeeId > 0) {
    return `standup-column-widths:employee:${employeeId}`;
  }

  return getStandupColumnWidthsStorageKey(path);
}

function readStoredStandupColumnWidths(storageKey: string): StandupColumnWidthMap {
  if (typeof window === "undefined") return {};

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return {};

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        ([, value]) => typeof value === "number" && Number.isFinite(value),
      ),
    ) as StandupColumnWidthMap;
  } catch {
    return {};
  }
}

function writeStoredStandupColumnWidths(storageKey: string, widths: StandupColumnWidthMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(widths));
}

function getStandupColumnMinWidth(columnKey: string) {
  return STANDUP_TABLE_MIN_COLUMN_WIDTH;
}

function getStandupResolvedColumnWidth(column: StandupColumn) {
  const defaultWidth =
    column.key === "project"
      ? STANDUP_DEFAULT_PROJECT_WIDTH
      : column.key === "working"
        ? STANDUP_DEFAULT_WORKING_WIDTH
        : STANDUP_DEFAULT_PROJECT_WIDTH;

  return Math.max(
    getStandupColumnMinWidth(column.key),
    column.width ?? defaultWidth,
  );
}

function buildStandupColumnWidthMap(
  columns: StandupColumn[],
) {
  const normalizedColumns = normalizeStandupColumns(columns);
  return Object.fromEntries(
    normalizedColumns.map((column) => [column.key, getStandupResolvedColumnWidth(column)]),
  );
}

function areStandupColumnWidthsEqual(
  left: StandupColumnWidthMap,
  right: StandupColumnWidthMap,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => left[key] === right[key]);
}

function useStandupColumnState(columns: StandupColumn[], storageKey: string) {
  const [columnWidths, setColumnWidths] = useState<StandupColumnWidthMap>(() =>
    buildStandupColumnWidthMap(columns),
  );

  useEffect(() => {
    const baseWidths = buildStandupColumnWidthMap(columns);
    const storedWidths = readStoredStandupColumnWidths(storageKey);
    const nextWidths = Object.fromEntries(
      Object.entries(baseWidths).map(([key, width]) => [
        key,
        Math.max(getStandupColumnMinWidth(key), storedWidths[key] ?? width),
      ]),
    );

    setColumnWidths((current) =>
      areStandupColumnWidthsEqual(current, nextWidths) ? current : nextWidths,
    );
    writeStoredStandupColumnWidths(storageKey, nextWidths);
  }, [columns, storageKey]);

  const updateColumnWidths = (widths: StandupColumnWidthMap) => {
    setColumnWidths((current) => {
      const nextWidths = areStandupColumnWidthsEqual(current, widths) ? current : widths;
      writeStoredStandupColumnWidths(storageKey, nextWidths);
      return nextWidths;
    });
  };

  return {
    columnWidths,
    setColumnWidths: updateColumnWidths,
  };
}

function AutoGrowTextarea({ className, onInput, ...props }: ComponentProps<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const syncHeight = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    syncHeight();
  }, [props.value]);

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      rows={1}
      onInput={(event) => {
        syncHeight();
        onInput?.(event);
      }}
      className={className}
    />
  );
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultStandupDate(days: StandupDayDraft[]) {
  if (days.length === 0) {
    return formatLocalDateInputValue(new Date());
  }

  const usedDates = new Set(days.map((day) => day.date));
  let candidate = days[0]?.date ?? formatLocalDateInputValue(new Date());

  while (usedDates.has(candidate)) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function createBlankDay(date = formatLocalDateInputValue(new Date())): StandupDayDraft {
  return {
    id: buildLocalId(),
    date,
    entries: [{ localId: buildLocalId(), ...EMPTY_DAY_ENTRY, extraValues: {} }],
  };
}

function sortStandupDaysDescending(days: StandupDayDraft[]) {
  return [...days].sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeStandupColumns(columns?: StandupColumn[] | null): StandupColumn[] {
  const seen = new Set<string>();
  const normalized: StandupColumn[] = [];
  const incomingProjectWidth = columns?.find((item) => item.key === "project")?.width;
  const incomingWorkingWidth = columns?.find((item) => item.key === "working")?.width;
  const projectWidth = incomingProjectWidth ?? STANDUP_DEFAULT_PROJECT_WIDTH;
  const workingWidth =
    incomingWorkingWidth == null || incomingWorkingWidth <= projectWidth
      ? Math.max(STANDUP_DEFAULT_WORKING_WIDTH, projectWidth + 120)
      : incomingWorkingWidth;

  const addColumn = (column: StandupColumn) => {
    const key = column.key.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push({
      key,
      label: column.label.trim() || key,
      width: column.width,
      kind: column.kind ?? (key === "project" || key === "working" ? "system" : "custom"),
    });
  };

  for (const column of DEFAULT_STANDUP_COLUMNS) {
    addColumn({
      ...column,
      label: columns?.find((item) => item.key === column.key)?.label ?? column.label,
      width: column.key === "project" ? projectWidth : column.key === "working" ? workingWidth : column.width,
    });
  }

  for (const column of columns ?? []) {
    if (column.key === "project" || column.key === "working") continue;
    addColumn({ ...column, kind: "custom" });
  }

  return normalized;
}

function mapSheetToDraft(
  sheet: StandupSheetResponse | undefined,
  currentDays?: StandupDayDraft[],
): StandupDayDraft[] {
  if (!sheet?.days?.length) return [createBlankDay()];

  const currentDaysByDate = new Map(
    (currentDays ?? []).map((day) => [day.date, day]),
  );

  return sortStandupDaysDescending(
    sheet.days.map((day) => {
      const currentDay = currentDaysByDate.get(day.date);
      return {
        id: currentDay?.id ?? buildLocalId(),
        date: day.date,
        entries:
          day.entries.length > 0
            ? day.entries.map((entry, index) => ({
              id: entry.id,
              localId: currentDay?.entries[index]?.localId ?? buildLocalId(),
              project: entry.project,
              working: entry.working,
              extraValues: entry.extraValues ?? {},
            }))
            : [{ localId: buildLocalId(), ...EMPTY_DAY_ENTRY, extraValues: {} }],
      };
    }),
  );
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

function buildStandupPayload(days: StandupDayDraft[], columns: StandupColumn[]) {
  return {
    columns: normalizeStandupColumns(columns).map((column) => ({
      key: column.key,
      label: column.label,
      width: column.width,
      kind: column.kind,
    })),
    days: days.map((day) => ({
      date: day.date,
      entries: day.entries.map((entry) => ({
        id: entry.id,
        project: entry.project,
        working: entry.working,
        extraValues: entry.extraValues,
      })),
    })),
  };
}

function buildStandupComparableSignature(
  days: Array<{
    date: string;
    entries: Array<{
      project: string;
      working: string;
      extraValues?: Record<string, string>;
    }>;
  }>,
  columns?: StandupColumn[],
) {
  return JSON.stringify(
    {
      columns: normalizeStandupColumns(columns).map((column) => ({
        key: column.key,
        label: column.label,
        kind: column.kind,
      })),
      days: [...days]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((day) => ({
          date: day.date,
          entries: day.entries.map((entry) => ({
            project: entry.project,
            working: entry.working,
            extraValues: Object.fromEntries(
              Object.entries(entry.extraValues ?? {}).sort(([a], [b]) => a.localeCompare(b)),
            ),
          })),
        })),
    },
  );
}

function buildStandupComparableSignatureFromDraft(
  days: StandupDayDraft[],
  columns: StandupColumn[],
) {
  return buildStandupComparableSignature(
    days.map((day) => ({
      date: day.date,
      entries: day.entries.map((entry) => ({
        project: entry.project,
        working: entry.working,
        extraValues: entry.extraValues,
      })),
    })),
    columns,
  );
}

function buildStandupComparableSignatureFromSheet(
  sheet: StandupSheetResponse | undefined,
) {
  return buildStandupComparableSignature(
    (sheet?.days ?? []).map((day) => ({
      date: day.date,
      entries: day.entries.map((entry) => ({
        project: entry.project,
        working: entry.working,
        extraValues: entry.extraValues ?? {},
      })),
    })),
    sheet?.columns ?? DEFAULT_STANDUP_COLUMNS,
  );
}

function buildStandupGridRows(days: StandupDayDraft[], editable: boolean): StandupGridRow[] {
  return days.flatMap((day) => {
    const rows: StandupGridRow[] = [
      { id: `date-${day.id}`, rowType: "date", dayId: day.id, date: day.date },
      ...day.entries.map((entry, index) => ({
        id: `entry-${entry.localId}`,
        rowType: "entry" as const,
        dayId: day.id,
        localId: entry.localId,
        serial: index + 1,
        project: entry.project,
        working: entry.working,
        extraValues: entry.extraValues,
      })),
    ];

    if (editable) {
      rows.push({ id: `add-${day.id}`, rowType: "add", dayId: day.id });
    }

    return rows;
  });
}

function getStandupEntryRowHeight(
  row: Extract<StandupGridRow, { rowType: "entry" }>,
  customColumns: StandupColumn[],
) {
  const lineCounts = [
    row.project,
    row.working,
    ...customColumns.map((column) => row.extraValues[column.key] ?? ""),
  ].map((value) => Math.max(1, value.split("\n").length));

  const maxLines = Math.max(...lineCounts, 1);
  return Math.max(44, 18 + maxLines * 22);
}

export function useStandupSheet(
  path: string,
  queryKey: readonly unknown[],
  options: { polling?: boolean } = {},
) {
  const polling = options.polling ?? true;

  return useQuery({
    queryKey,
    queryFn: () => fetchJson<StandupSheetResponse>(path),
    refetchInterval: polling ? 2000 : false,
    refetchIntervalInBackground: polling,
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
  const { data, isLoading, isError, error } = useStandupSheet(path, queryKey, {
    polling: false,
  });
  const [days, setDays] = useState<StandupDayDraft[]>([]);
  const [columns, setColumns] = useState<StandupColumn[]>(DEFAULT_STANDUP_COLUMNS);
  const [syncState, setSyncState] = useState<"synced" | "saving" | "error">("synced");
  const lastSavedSignatureRef = useRef("");
  const lastServerSignatureRef = useRef("");
  const initializedPathRef = useRef<string | null>(null);
  const columnWidthsStorageKey = useMemo(
    () => getStandupColumnWidthsStorageKeyForEmployee(data?.employee.id, path),
    [data?.employee.id, path],
  );
  const { columnWidths, setColumnWidths } = useStandupColumnState(
    columns,
    columnWidthsStorageKey,
  );
  const saveStandup = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildStandupPayload>) =>
      fetchJson<StandupSheetResponse>(path, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (sheet, payload) => {
      qc.setQueryData(queryKey, sheet);
      lastSavedSignatureRef.current = buildStandupComparableSignature(
        payload.days.map((day) => ({
          date: day.date,
          entries: day.entries.map((entry) => ({
            project: entry.project,
            working: entry.working,
            extraValues: entry.extraValues,
          })),
        })),
        payload.columns,
      );
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
  const payload = useMemo(() => buildStandupPayload(days, columns), [columns, days]);
  const payloadSignature = useMemo(
    () => buildStandupComparableSignatureFromDraft(days, columns),
    [columns, days],
  );

  useEffect(() => {
    if (isLoading) return;

    const incomingSignature = buildStandupComparableSignatureFromSheet(data);
    const pathChanged = initializedPathRef.current !== path;

    if (pathChanged) {
      setDays((current) => mapSheetToDraft(data, current));
      setColumns(normalizeStandupColumns(data?.columns));

      lastSavedSignatureRef.current = incomingSignature;
      lastServerSignatureRef.current = incomingSignature;
      initializedPathRef.current = path;
      setSyncState("synced");
      return;
    }

    const serverChanged = incomingSignature !== lastServerSignatureRef.current;
    if (!serverChanged) return;

    const hasUnsavedLocalChanges =
      payloadSignature !== lastSavedSignatureRef.current || saveStandup.isPending;
    const localMatchesServer = payloadSignature === incomingSignature;

    // Keep the current draft mounted when autosave comes back with the same content.
    // Rebuilding the draft regenerates local ids, remounts textareas, and drops the cursor.
    if (!hasUnsavedLocalChanges && !localMatchesServer) {
      setDays((current) => mapSheetToDraft(data, current));
      setColumns(normalizeStandupColumns(data?.columns));
    }

    if (!hasUnsavedLocalChanges || localMatchesServer) {
      lastSavedSignatureRef.current = incomingSignature;
      setSyncState("synced");
    }

    lastServerSignatureRef.current = incomingSignature;
  }, [data, isLoading, path, payloadSignature, saveStandup.isPending]);

  const updateDay = (dayId: string, updater: (day: StandupDayDraft) => StandupDayDraft) => {
    setDays((current) =>
      sortStandupDaysDescending(
        current.map((day) => (day.id === dayId ? updater(day) : day)),
      ),
    );
  };

  const removeDay = (dayId: string) => {
    setDays((current) => {
      const next = current.filter((day) => day.id !== dayId);
      return next.length > 0 ? next : [createBlankDay()];
    });
  };

  const addColumn = () => {
    const label = window.prompt("Column name");
    if (!label) return;

    const cleanedLabel = label.trim();
    if (!cleanedLabel) return;

    const key = `custom_${Date.now()}`;
    setColumns((current) => [
      ...normalizeStandupColumns(current),
      {
        key,
        label: cleanedLabel,
        width: STANDUP_DEFAULT_PROJECT_WIDTH,
        kind: "custom",
      },
    ]);
    setDays((current) =>
      current.map((day) => ({
        ...day,
        entries: day.entries.map((entry) => ({
          ...entry,
          extraValues: { ...entry.extraValues, [key]: "" },
        })),
      })),
    );
  };

  const removeColumn = (columnKey: string) => {
    setColumns((current) => current.filter((column) => column.key !== columnKey));
    setDays((current) =>
      current.map((day) => ({
        ...day,
        entries: day.entries.map((entry) => {
          const nextExtraValues = { ...entry.extraValues };
          delete nextExtraValues[columnKey];
          return {
            ...entry,
            extraValues: nextExtraValues,
          };
        }),
      })),
    );
  };

  useEffect(() => {
    if (isLoading || isError) return;
    if (saveStandup.isPending) return;
    if (payloadSignature === lastSavedSignatureRef.current) {
      setSyncState("synced");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSyncState("saving");
      saveStandup.mutate(payload);
    }, STANDUP_AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    isError,
    isLoading,
    payload,
    payloadSignature,
    saveStandup.isPending,
    saveStandup.mutate,
  ]);

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
                setDays((current) =>
                  sortStandupDaysDescending([
                    createBlankDay(getDefaultStandupDate(current)),
                    ...current,
                  ]),
                )
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
          columns={columns}
          editable
          columnWidths={columnWidths}
          onColumnWidthsChange={(widths) => {
            setColumnWidths(widths);
          }}
          onAddColumn={addColumn}
          onRemoveColumn={removeColumn}
          onAddRow={(dayId) =>
            updateDay(dayId, (day) => ({
              ...day,
              entries: [
                ...day.entries,
                {
                  localId: buildLocalId(),
                  ...EMPTY_DAY_ENTRY,
                  extraValues: Object.fromEntries(
                    columns
                      .filter((column) => column.kind === "custom")
                      .map((column) => [column.key, ""]),
                  ),
                },
              ],
            }))
          }
          onUpdateDate={(dayId, value) =>
            updateDay(dayId, (day) => ({ ...day, date: value }))
          }
          onUpdateEntry={(dayId, localId, field, value) =>
            updateDay(dayId, (day) => ({
              ...day,
              entries: day.entries.map((entry) =>
                entry.localId === localId
                  ? field === "project" || field === "working"
                    ? { ...entry, [field]: value }
                    : {
                      ...entry,
                      extraValues: {
                        ...entry.extraValues,
                        [field]: value,
                      },
                    }
                  : entry,
              ),
            }))
          }
          onRemoveEntry={(dayId, localId) =>
            updateDay(dayId, (day) => ({
              ...day,
              entries:
                day.entries.length > 1
                  ? day.entries.filter((entry) => entry.localId !== localId)
                  : [
                    {
                      localId: buildLocalId(),
                      ...EMPTY_DAY_ENTRY,
                      extraValues: Object.fromEntries(
                        columns
                          .filter((column) => column.kind === "custom")
                          .map((column) => [column.key, ""]),
                      ),
                    },
                  ],
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
  const { data, isLoading, isError, error } = useStandupSheet(path, queryKey, {
    polling: true,
  });
  const days = mapSheetToDraft(data);
  const columns = normalizeStandupColumns(data?.columns);
  const columnWidthsStorageKey = useMemo(
    () => getStandupColumnWidthsStorageKeyForEmployee(data?.employee.id, path),
    [data?.employee.id, path],
  );
  const { columnWidths, setColumnWidths } = useStandupColumnState(
    columns,
    columnWidthsStorageKey,
  );
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
            columns={columns}
            columnWidths={columnWidths}
            onColumnWidthsChange={setColumnWidths}
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
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-2 rounded-md border border-slate-400 bg-white px-3 py-2"
        >
          <span className="text-sm font-semibold text-red-600">{formatStandupDate(value)}</span>
          <CalendarIcon className="h-4 w-4 text-slate-700" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg" align="center">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatLocalDateInputValue(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function StandupSheetTable({
  days,
  columns,
  editable = false,
  columnWidths,
  onColumnWidthsChange,
  onAddColumn,
  onRemoveColumn,
  onAddRow,
  onUpdateDate,
  onUpdateEntry,
  onRemoveEntry,
}: {
  days: StandupDayDraft[];
  columns: StandupColumn[];
  editable?: boolean;
  columnWidths: StandupColumnWidthMap;
  onColumnWidthsChange?: (widths: StandupColumnWidthMap) => void;
  onAddColumn?: () => void;
  onRemoveColumn?: (columnKey: string) => void;
  onAddRow?: (dayId: string) => void;
  onUpdateDate?: (dayId: string, value: string) => void;
  onUpdateEntry?: (
    dayId: string,
    localId: string,
    field: string,
    value: string,
  ) => void;
  onRemoveEntry?: (dayId: string, localId: string) => void;
}) {
  const dataColumns = useMemo(
    () => normalizeStandupColumns(columns),
    [columns],
  );
  const customColumns = useMemo(
    () => dataColumns.filter((column) => column.kind === "custom"),
    [dataColumns],
  );
  const gridRows = useMemo(() => buildStandupGridRows(days, editable), [days, editable]);
  const gridRef = useRef<AgGridReact<StandupGridRow> | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const gridHorizontalScrollRef = useRef<HTMLElement | null>(null);
  const topScrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const onAddColumnRef = useRef(onAddColumn);
  const onRemoveColumnRef = useRef(onRemoveColumn);
  const onAddRowRef = useRef(onAddRow);
  const onUpdateDateRef = useRef(onUpdateDate);
  const onUpdateEntryRef = useRef(onUpdateEntry);
  const onRemoveEntryRef = useRef(onRemoveEntry);
  const topScrollbarDragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const [topScrollbar, setTopScrollbar] = useState<StandupTopScrollbarState>({
    visible: false,
    thumbWidth: 0,
    thumbOffset: 0,
  });

  useEffect(() => {
    onAddColumnRef.current = onAddColumn;
    onRemoveColumnRef.current = onRemoveColumn;
    onAddRowRef.current = onAddRow;
    onUpdateDateRef.current = onUpdateDate;
    onUpdateEntryRef.current = onUpdateEntry;
    onRemoveEntryRef.current = onRemoveEntry;
  }, [
    onAddColumn,
    onRemoveColumn,
    onAddRow,
    onUpdateDate,
    onUpdateEntry,
    onRemoveEntry,
  ]);

  useEffect(() => {
    const gridContainerElement = gridContainerRef.current;
    if (!gridContainerElement) return;

    let frameId = 0;
    let cleanup: (() => void) | undefined;

    const attach = () => {
      const horizontalScrollElement =
        gridContainerElement.querySelector<HTMLElement>(".ag-body-horizontal-scroll-viewport") ??
        gridContainerElement.querySelector<HTMLElement>(".ag-center-cols-viewport");

      if (!horizontalScrollElement) {
        frameId = window.requestAnimationFrame(attach);
        return;
      }

      gridHorizontalScrollRef.current = horizontalScrollElement;

      const syncTopScrollbar = () => {
        const trackWidth =
          topScrollbarTrackRef.current?.clientWidth ?? horizontalScrollElement.clientWidth;
        const maxScrollLeft = Math.max(
          horizontalScrollElement.scrollWidth - horizontalScrollElement.clientWidth,
          0,
        );

        if (trackWidth <= 0 || maxScrollLeft <= 0) {
          setTopScrollbar((current) =>
            current.visible || current.thumbWidth !== 0 || current.thumbOffset !== 0
              ? { visible: false, thumbWidth: 0, thumbOffset: 0 }
              : current,
          );
          return;
        }

        const thumbWidth = Math.max(
          (horizontalScrollElement.clientWidth / horizontalScrollElement.scrollWidth) * trackWidth,
          40,
        );
        const maxThumbOffset = Math.max(trackWidth - thumbWidth, 0);
        const thumbOffset =
          maxScrollLeft > 0
            ? (horizontalScrollElement.scrollLeft / maxScrollLeft) * maxThumbOffset
            : 0;

        setTopScrollbar({
          visible: true,
          thumbWidth,
          thumbOffset,
        });
      };

      syncTopScrollbar();
      horizontalScrollElement.addEventListener("scroll", syncTopScrollbar);

      const resizeObserver = new ResizeObserver(syncTopScrollbar);
      resizeObserver.observe(horizontalScrollElement);
      const viewportContent = horizontalScrollElement.firstElementChild;
      if (viewportContent instanceof HTMLElement) {
        resizeObserver.observe(viewportContent);
      }
      const trackElement = topScrollbarTrackRef.current;
      if (trackElement) {
        resizeObserver.observe(trackElement);
      }

      cleanup = () => {
        horizontalScrollElement.removeEventListener("scroll", syncTopScrollbar);
        resizeObserver.disconnect();
        gridHorizontalScrollRef.current = null;
      };
    };

    attach();

    return () => {
      window.cancelAnimationFrame(frameId);
      cleanup?.();
    };
  }, [columnWidths, gridRows]);

  const handleTopScrollbarTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const bottomElement = gridHorizontalScrollRef.current;
      const trackElement = topScrollbarTrackRef.current;
      if (!bottomElement || !trackElement || !topScrollbar.visible) return;

      const rect = trackElement.getBoundingClientRect();
      const maxScrollLeft = Math.max(bottomElement.scrollWidth - bottomElement.clientWidth, 0);
      const maxThumbOffset = Math.max(rect.width - topScrollbar.thumbWidth, 0);
      const targetThumbOffset = clamp(
        event.clientX - rect.left - topScrollbar.thumbWidth / 2,
        0,
        maxThumbOffset,
      );

      bottomElement.scrollLeft =
        maxThumbOffset > 0 ? (targetThumbOffset / maxThumbOffset) * maxScrollLeft : 0;
    },
    [topScrollbar.thumbWidth, topScrollbar.visible],
  );

  const handleTopScrollbarThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const bottomElement = gridHorizontalScrollRef.current;
      if (!bottomElement) return;

      event.preventDefault();
      event.stopPropagation();
      topScrollbarDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: bottomElement.scrollLeft,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleTopScrollbarThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = topScrollbarDragRef.current;
      const bottomElement = gridHorizontalScrollRef.current;
      const trackElement = topScrollbarTrackRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || !bottomElement || !trackElement) {
        return;
      }

      const maxScrollLeft = Math.max(bottomElement.scrollWidth - bottomElement.clientWidth, 0);
      const maxThumbOffset = Math.max(trackElement.clientWidth - topScrollbar.thumbWidth, 0);
      if (maxScrollLeft <= 0 || maxThumbOffset <= 0) return;

      const deltaX = event.clientX - dragState.startX;
      const scrollDelta = (deltaX / maxThumbOffset) * maxScrollLeft;
      bottomElement.scrollLeft = clamp(
        dragState.startScrollLeft + scrollDelta,
        0,
        maxScrollLeft,
      );
    },
    [topScrollbar.thumbWidth],
  );

  const handleTopScrollbarThumbPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      topScrollbarDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const columnDefs = useMemo<ColDef<StandupGridRow>[]>(() => {
    const sharedTextCellClass = "px-0 py-0";
    const dividerCellStyle = { borderRight: "1px solid rgb(203 213 225)" };
    const defs: ColDef<StandupGridRow>[] = [
      {
        colId: "serial",
        headerName: "S. No",
        width: STANDUP_SERIAL_COLUMN_WIDTH,
        minWidth: STANDUP_SERIAL_COLUMN_WIDTH,
        maxWidth: STANDUP_SERIAL_COLUMN_WIDTH,
        resizable: false,
        sortable: false,
        suppressMovable: true,
        cellClass: "flex items-center justify-center",
        cellStyle: dividerCellStyle,
        cellRenderer: (params: ICellRendererParams<StandupGridRow>) =>
          params.data?.rowType === "entry" ? params.data.serial : null,
      },
      ...dataColumns.map((column) => ({
        colId: column.key,
        headerName: column.label,
        width: columnWidths[column.key] ?? getStandupResolvedColumnWidth(column),
        minWidth: getStandupColumnMinWidth(column.key),
        resizable: true,
        sortable: false,
        suppressMovable: true,
        autoHeight: true,
        cellClass: sharedTextCellClass,
        cellStyle: dividerCellStyle,
        headerComponent: (params: IHeaderParams<StandupGridRow>) => (
          <div className="flex h-full items-center justify-between gap-2 px-3 font-semibold text-slate-900">
            <span className="truncate">{params.displayName}</span>
            {editable && column.kind === "custom" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => onRemoveColumnRef.current?.(column.key)}
                aria-label={`Delete ${column.label} column`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ),
        cellRenderer: (params: ICellRendererParams<StandupGridRow>) => {
          const row = params.data;
          if (!row || row.rowType !== "entry") return null;
          const value =
            column.key === "project"
              ? row.project
              : column.key === "working"
                ? row.working
                : row.extraValues[column.key] ?? "";

          if (!editable) {
            return <div className="whitespace-pre-wrap px-3 py-1.5">{value || "-"}</div>;
          }

          return (
            <AutoGrowTextarea
              value={value}
              onChange={(event) =>
                onUpdateEntryRef.current?.(
                  row.dayId,
                  row.localId,
                  column.key,
                  event.target.value,
                )
              }
              placeholder={column.label}
              className="h-auto min-h-0 resize-none overflow-hidden border-0 bg-transparent px-3 py-1.5 leading-5 shadow-none focus-visible:ring-0"
            />
          );
        },
      })),
    ];

    if (editable) {
      defs.push({
        colId: "actions",
        headerName: "",
        width: STANDUP_ACTIONS_COLUMN_WIDTH,
        minWidth: STANDUP_ACTIONS_COLUMN_WIDTH,
        maxWidth: STANDUP_ACTIONS_COLUMN_WIDTH,
        resizable: false,
        sortable: false,
        suppressMovable: true,
        headerComponent: () => (
          <div className="flex h-full w-full items-center justify-center">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0 text-slate-900 hover:bg-slate-100"
              onClick={() => onAddColumnRef.current?.()}
              aria-label="Add column"
              title="Add column"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ),
        cellClass: "!flex !items-center !justify-center !p-0 !overflow-visible",
        cellStyle: {
          ...dividerCellStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        },
        cellRenderer: (params: ICellRendererParams<StandupGridRow>) => {
          const row = params.data;
          if (!row || row.rowType !== "entry") return null;

          return (
            <div className="flex h-full w-full items-center justify-center overflow-visible">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => onRemoveEntryRef.current?.(row.dayId, row.localId)}
                aria-label="Delete row"
                title="Delete row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        },
      });
    }

    return defs;
  }, [
    columnWidths,
    dataColumns,
    editable,
  ]);

  const handleColumnResized = useCallback((event: ColumnResizedEvent<StandupGridRow>) => {
    if (!event.finished) return;

    const state = new Map(
      event.api
        .getColumnState()
        .filter((item) => item.colId && item.width)
        .map((item) => [item.colId as string, item.width as number]),
    );

    onColumnWidthsChange?.(
      Object.fromEntries(
        dataColumns.map((column) => [
          column.key,
          state.get(column.key) ?? columnWidths[column.key] ?? getStandupResolvedColumnWidth(column),
        ]),
      ),
    );
  }, [columnWidths, dataColumns, onColumnWidthsChange]);

  const getRowHeight = useCallback((params: RowHeightParams<StandupGridRow>) => {
    const row = params.data;
    if (!row) return 44;
    if (row.rowType === "date") return 62;
    if (row.rowType === "add") return 60;
    return getStandupEntryRowHeight(row, customColumns);
  }, [customColumns]);

  const fullWidthCellRenderer = useCallback((params: ICellRendererParams<StandupGridRow>) => {
    const row = params.data;
    if (!row) return null;

    if (row.rowType === "date") {
      return (
        <div className="flex h-full w-full items-center justify-center border-y border-slate-400 bg-yellow-300 px-3 py-2 font-semibold text-red-600">
          {editable ? (
            <StandupDateControl
              value={row.date}
              onChange={(value) => onUpdateDateRef.current?.(row.dayId, value)}
            />
          ) : (
            <span>{formatStandupDate(row.date)}</span>
          )}
        </div>
      );
    }

    if (row.rowType === "add" && editable) {
      return (
        <div className="border-b border-slate-300 bg-white px-3 py-3 text-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
            onClick={() => onAddRowRef.current?.(row.dayId)}
            aria-label="Add row"
            title="Add row"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return null;
  }, [editable]);

  return (
    <div className="rounded-xl border border-border">
      {topScrollbar.visible ? (
        <div className="border-b border-border bg-slate-50 px-3 py-2">
          <div
            ref={topScrollbarTrackRef}
            className="relative h-2.5 rounded-full bg-slate-200"
            onPointerDown={handleTopScrollbarTrackPointerDown}
            aria-hidden="true"
          >
            <div
              className="absolute top-0 h-2.5 cursor-grab rounded-full bg-slate-400 transition-colors hover:bg-slate-500 active:cursor-grabbing active:bg-slate-600"
              style={{
                width: `${topScrollbar.thumbWidth}px`,
                transform: `translateX(${topScrollbar.thumbOffset}px)`,
              }}
              onPointerDown={handleTopScrollbarThumbPointerDown}
              onPointerMove={handleTopScrollbarThumbPointerMove}
              onPointerUp={handleTopScrollbarThumbPointerEnd}
              onPointerCancel={handleTopScrollbarThumbPointerEnd}
            />
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div
          ref={gridContainerRef}
          className="ag-theme-quartz min-w-full [&_.ag-root-wrapper]:border-0 [&_.ag-cell]:px-0 [&_.ag-cell]:[border-right:1px_solid_rgb(203_213_225)] [&_.ag-header]:border-b-0 [&_.ag-header-cell]:bg-slate-200 [&_.ag-header-cell]:px-0 [&_.ag-header-cell]:[border-right:1px_solid_rgb(148_163_184)] [&_.ag-row]:border-slate-300"
        >
          <AgGridReact<StandupGridRow>
            ref={gridRef}
            theme={"legacy" as never}
            rowData={gridRows}
            columnDefs={columnDefs}
            domLayout="autoHeight"
            headerHeight={48}
            rowHeight={44}
            getRowHeight={getRowHeight}
            isFullWidthRow={(params: IsFullWidthRowParams<StandupGridRow>) =>
              params.rowNode.data?.rowType !== "entry"
            }
            fullWidthCellRenderer={fullWidthCellRenderer}
            getRowId={(params) => params.data.id}
            suppressCellFocus
            suppressRowHoverHighlight
            suppressMovableColumns
            defaultColDef={{
              editable: false,
              wrapHeaderText: true,
            }}
            onColumnResized={handleColumnResized}
          />
        </div>
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
