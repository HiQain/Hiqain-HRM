import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Search,
  WifiOff,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAttendanceExtensionStatuses } from "@/lib/attendanceExtension";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  });
}

function formatState(value?: string | null) {
  if (!value) return "Not connected";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminExtensionActivityPage() {
  const { data, isLoading } = useAdminAttendanceExtensionStatuses();
  const [search, setSearch] = useState("");

  const rows = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.employeeName,
        row.employeeCode ?? "",
        row.department ?? "",
        row.position ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const connectedCount = rows.filter((row) => row.extension?.connected).length;
  const warningCount = rows.filter((row) => row.extension?.warningActive).length;
  const staleCount = rows.filter(
    (row) =>
      row.extension?.connected &&
      (row.extension.heartbeatStaleMinutes ?? 0) >= 5,
  ).length;
  const activeAttendanceCount = rows.filter(
    (row) => row.attendanceState === "active" || row.attendanceState === "paused",
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Extension Activity"
        description="Live browser-extension health for all employees."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[112px] rounded-xl" />
          ))
        ) : (
          <>
            <StatCard label="Connected browsers" value={connectedCount} icon={CheckCircle2} tone="success" />
            <StatCard label="Active warnings" value={warningCount} icon={AlertTriangle} tone="warning" />
            <StatCard label="Stale heartbeats" value={staleCount} icon={WifiOff} tone="danger" />
            <StatCard label="Open attendance sessions" value={activeAttendanceCount} icon={Activity} tone="primary" />
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Employee browser activity</p>
            <p className="text-sm text-muted-foreground">
              See which employees are connected, stale, warning, or offline.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee"
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Extension</TableHead>
                <TableHead>Last state</TableHead>
                <TableHead>Last heartbeat</TableHead>
                <TableHead>Idle</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-10 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    No employees matched this search.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar name={row.employeeName} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{row.employeeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.employeeCode, row.department].filter(Boolean).join(" · ") || row.position || "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.attendanceState} />
                    </TableCell>
                    <TableCell>
                      {row.extension?.connected ? (
                        row.extension.stale ? (
                          <span className="text-sm font-medium text-amber-700">Stale heartbeat</span>
                        ) : row.extension.warningActive ? (
                          <span className="text-sm font-medium text-amber-700">Warning active</span>
                        ) : (
                          <span className="text-sm font-medium text-emerald-700">Connected</span>
                        )
                      ) : row.extension?.status === "pending" ? (
                        <span className="text-sm font-medium text-blue-700">Pending connect</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not connected</span>
                      )}
                    </TableCell>
                    <TableCell>{formatState(row.extension?.lastState)}</TableCell>
                    <TableCell>{formatDateTime(row.extension?.lastHeartbeatAt)}</TableCell>
                    <TableCell>
                      {row.extension?.connected ? `${row.extension.idleForMinutes} min` : "—"}
                    </TableCell>
                    <TableCell>
                      {row.extension?.browserAlive == null
                        ? "—"
                        : row.extension.browserAlive
                          ? "Alive"
                          : "Offline"}
                    </TableCell>
                    <TableCell>
                      {row.extension?.networkOnline == null
                        ? "—"
                        : row.extension.networkOnline
                          ? "Online"
                          : "Offline"}
                    </TableCell>
                    <TableCell>{row.extension?.extensionVersion || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
