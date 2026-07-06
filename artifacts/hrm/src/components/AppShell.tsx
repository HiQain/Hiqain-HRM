import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  Receipt,
  Wallet,
  UserCircle,
  ClipboardList,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Inbox,
  FilePlus2,
  Package,
  KeyRound,
  Moon,
  Sun,
  PartyPopper,
  PiggyBank,
  Settings as SettingsIcon,
  Bell,
  HeartPulse,
  Activity,
  FileSpreadsheet,
} from "lucide-react";
import {
  useLogout,
  useGetEmployee,
  getGetEmployeeQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { useTheme } from "@/hooks/use-theme";
import {
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/notifications";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Employees", href: "/admin/employees", icon: Users },
  { label: "Today's Attendance", href: "/admin/attendance", icon: CalendarCheck },
  {
    label: "Attendance Calendar",
    href: "/admin/attendance-calendar",
    icon: CalendarDays,
  },
  { label: "Extension Activity", href: "/admin/extension-activity", icon: Activity },
  { label: "Leave Requests", href: "/admin/leaves", icon: CalendarRange },
  { label: "Requests", href: "/admin/requests", icon: Inbox },
  { label: "Medical", href: "/admin/medical", icon: HeartPulse },
  { label: "Salary", href: "/admin/salary", icon: Wallet },
  { label: "View", href: "/admin/view", icon: LayoutGrid },
  { label: "Payslips", href: "/admin/payslips", icon: Receipt },
  { label: "Standup Users", href: "/admin/standup-users", icon: FileSpreadsheet },
  { label: "News Feed", href: "/admin/feed", icon: PartyPopper },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon },
];

const EMP_NAV: NavItem[] = [
  { label: "Dashboard", href: "/employee", icon: LayoutDashboard },
  { label: "Profile", href: "/employee/profile", icon: UserCircle },
  { label: "Attendance", href: "/employee/attendance", icon: CalendarCheck },
  { label: "Leaves", href: "/employee/leaves", icon: ClipboardList },
  { label: "Requests", href: "/employee/requests", icon: FilePlus2 },
  { label: "Medical", href: "/employee/medical", icon: HeartPulse },
  { label: "Salary", href: "/employee/salary", icon: Wallet },
  { label: "Provident Fund", href: "/employee/provident-fund", icon: PiggyBank },
  { label: "Payslips", href: "/employee/payslips", icon: Receipt },
  { label: "Standup Sheet", href: "/employee/standup-sheet", icon: FileSpreadsheet },
  { label: "News Feed", href: "/employee/feed", icon: PartyPopper },
  { label: "Settings", href: "/employee/settings", icon: SettingsIcon },
];

const HR_NAV: NavItem[] = [
  { label: "My Dashboard", href: "/employee", icon: LayoutDashboard },
  { label: "Profile", href: "/employee/profile", icon: UserCircle },
  { label: "Attendance", href: "/employee/attendance", icon: CalendarCheck },
  { label: "Leaves", href: "/employee/leaves", icon: ClipboardList },
  { label: "Requests", href: "/employee/requests", icon: FilePlus2 },
  { label: "Medical", href: "/employee/medical", icon: HeartPulse },
  { label: "Salary", href: "/employee/salary", icon: Wallet },
  { label: "Provident Fund", href: "/employee/provident-fund", icon: PiggyBank },
  { label: "Payslips", href: "/employee/payslips", icon: Receipt },
  { label: "Standup Sheet", href: "/employee/standup-sheet", icon: FileSpreadsheet },
  { label: "Feed", href: "/employee/feed", icon: PartyPopper },
  { label: "Team", href: "/admin/employees", icon: Users },
  { label: "Standup Users", href: "/admin/standup-users", icon: FileSpreadsheet },
  { label: "Team Attendance", href: "/admin/attendance", icon: CalendarDays },
  { label: "Extension Activity", href: "/admin/extension-activity", icon: Activity },
  { label: "Team Requests", href: "/admin/requests", icon: Inbox },
  { label: "Team View", href: "/admin/view", icon: LayoutGrid },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon },
];

export function AppShell({
  user,
  children,
}: {
  user: {
    name: string;
    email: string;
    role: "admin" | "hr" | "employee";
    employeeId?: number | null;
    avatarUrl?: string | null;
  };
  children: ReactNode;
}) {
  const nav =
    user.role === "admin" ? ADMIN_NAV : user.role === "hr" ? HR_NAV : EMP_NAV;
  const [open, setOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("hrm-sidebar-open");
    return saved === null ? true : saved === "1";
  });
  const toggleDesktop = useCallback(() => {
    setDesktopOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("hrm-sidebar-open", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const [location, setLocation] = useLocation();
  const qc = useQueryClient();
  const logout = useLogout();
  const { theme, toggle } = useTheme();
  const employeeId = user.employeeId ?? 0;
  const { data: employee } = useGetEmployee(employeeId, {
    query: {
      enabled: employeeId > 0,
      queryKey: getGetEmployeeQueryKey(employeeId),
    },
  });
  const displayUser = {
    ...user,
    name: employee?.name ?? user.name,
    avatarUrl: employee?.avatarUrl ?? user.avatarUrl ?? null,
  };

  const handleLogout = useCallback(() => {
    logout.mutate(undefined, {
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        qc.clear();
        setLocation("/");
        toast.success("Signed out");
      },
      onError: () => toast.error("Could not sign out"),
    });
  }, [logout, qc, setLocation]);

  const isActive = useCallback(
    (href: string) =>
      location === href ||
      (href !== "/admin" && href !== "/employee" && location.startsWith(href + "/")),
    [location],
  );
  const toggleMobileMenu = useCallback(() => {
    setOpen((v) => !v);
  }, []);
  const closeMobileMenu = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <BrandMark />
        <div className="flex items-center gap-2">
          <NotificationButton userRole={user.role} mobile />
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
            onClick={toggle}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
            onClick={toggleMobileMenu}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex min-w-0 overflow-x-hidden">
        {/* Sidebar (desktop) */}
        <aside
          className={cn(
            "hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:flex-col lg:border-r lg:border-border lg:bg-sidebar lg:transition-[width] lg:duration-200",
            desktopOpen ? "lg:w-60" : "lg:w-16",
          )}
        >
          {desktopOpen ? (
            <SidebarInner
              user={displayUser}
              nav={nav}
              isActive={isActive}
              onNavigate={() => {}}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggle}
              onCollapseDesktop={toggleDesktop}
            />
          ) : (
            <SidebarRail
              user={user}
              nav={nav}
              isActive={isActive}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggle}
              onExpand={toggleDesktop}
            />
          )}
        </aside>

        {/* Sidebar (mobile drawer) */}
        {open && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            onClick={closeMobileMenu}
          >
            <div className="absolute inset-0 bg-black/40" />
            <aside
              className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-sidebar shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4">
                <BrandMark />
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                  onClick={closeMobileMenu}
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarInner
                user={displayUser}
                nav={nav}
                isActive={isActive}
                onNavigate={closeMobileMenu}
                onLogout={handleLogout}
                hideHeader
                theme={theme}
                onToggleTheme={toggle}
              />
            </aside>
          </div>
        )}

        {/* Main */}
        <main className={cn("min-w-0 flex-1 overflow-x-hidden", desktopOpen && "lg:pl-60")}>
          <div className="sticky top-0 z-20 hidden border-b border-border bg-card/95 px-6 py-3 backdrop-blur lg:block">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-2">
              <NotificationButton userRole={user.role} />
            </div>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            <NotificationSync userRole={user.role} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

const SidebarRail = memo(function SidebarRail({
  user,
  nav,
  isActive,
  onLogout,
  theme,
  onToggleTheme,
  onExpand,
}: {
  user: {
    name: string;
    email: string;
    role: "admin" | "hr" | "employee";
    avatarUrl?: string | null;
  };
  nav: NavItem[];
  isActive: (href: string) => boolean;
  onLogout: () => void;
  theme: string;
  onToggleTheme: () => void;
  onExpand: () => void;
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center">
      {/* Small side expand button (sticks out on the right edge) */}
      <button
        type="button"
        onClick={onExpand}
        className="absolute -right-3 top-6 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
        aria-label="Expand sidebar"
        title="Expand sidebar"
      >
        <PanelLeftOpen className="h-3 w-3" />
      </button>

      <div className="flex w-full items-center justify-center py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border overflow-hidden">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="HRM logo"
            className="h-8 w-8 object-contain"
          />
        </div>
      </div>

      <nav className="flex-1 w-full flex flex-col items-center gap-0.5 px-2 pb-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md transition",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </Link>
          );
        })}
        <div className="mt-0.5 w-full flex justify-center">
          <Link
            href="/change-password"
            title="Change Password"
            aria-label="Change Password"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md transition",
              isActive("/change-password")
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <KeyRound className="h-4 w-4" />
          </Link>
        </div>
      </nav>

      <div className="w-full border-t border-border p-1.5 flex flex-col items-center gap-0.5">
        <button
          onClick={onToggleTheme}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={onLogout}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <div className="pt-1" title={`${user.name} (${user.email})`}>
          <EmployeeAvatar name={user.name} url={user.avatarUrl ?? null} size="sm" />
        </div>
      </div>
    </div>
  );
});

function NotificationButton({
  userRole,
  mobile = false,
}: {
  userRole: "admin" | "hr" | "employee";
  mobile?: boolean;
}) {
  const [location, setLocation] = useLocation();
  const { data } = useNotifications(true);
  const unreadCount = data?.length ?? 0;
  const href =
    userRole === "admin" ? "/admin/notifications" : "/employee/notifications";
  const active = location === href;

  return (
    <button
      type="button"
      onClick={async () => {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          try {
            await Notification.requestPermission();
          } catch {
            // ignore permission errors
          }
        }
        setLocation(href);
      }}
      className={cn(
        "relative inline-flex items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:bg-muted",
        mobile ? "h-9 w-9" : "h-10 w-10",
        active && "bg-primary text-primary-foreground",
      )}
      aria-label="Notifications"
      title="Notifications"
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

function NotificationSync({
  userRole,
}: {
  userRole: "admin" | "hr" | "employee";
}) {
  const { data } = useNotifications(false);
  const markRead = useMarkNotificationRead();
  const [, setLocation] = useLocation();
  const initializedRef = useRef(false);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const fallbackHref =
    userRole === "admin" ? "/admin/notifications" : "/employee/notifications";

  useEffect(() => {
    if (!data) return;

    if (!initializedRef.current) {
      seenIdsRef.current = new Set(data.map((item) => item.id));
      initializedRef.current = true;
      return;
    }

    for (const item of data) {
      if (seenIdsRef.current.has(item.id)) continue;
      seenIdsRef.current.add(item.id);
      if (item.isRead) continue;

      toast(item.title, {
        description: item.message,
        action: item.href
          ? {
              label: "Open",
              onClick: () => {
                if (!item.isRead) markRead.mutate(item.id);
                setLocation(item.href || fallbackHref);
              },
            }
          : undefined,
      });

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const browserNotification = new Notification(item.title, {
          body: item.message,
        });
        browserNotification.onclick = () => {
          window.focus();
          if (!item.isRead) markRead.mutate(item.id);
          if (item.href) {
            setLocation(item.href);
          }
          browserNotification.close();
        };
      }
    }
  }, [data, fallbackHref, markRead, setLocation]);

  return null;
}

const BrandMark = memo(function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="HRM logo"
          className="h-8 w-8 object-contain"
        />
      </div>
      <div className="leading-none">
        <p className="text-sm font-semibold tracking-tight">HRM</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          HiQain
        </p>
      </div>
    </div>
  );
});

const SidebarInner = memo(function SidebarInner({
  user,
  nav,
  isActive,
  onNavigate,
  onLogout,
  hideHeader,
  theme,
  onToggleTheme,
  onCollapseDesktop,
}: {
  user: {
    name: string;
    email: string;
    role: "admin" | "hr" | "employee";
    avatarUrl?: string | null;
  };
  nav: NavItem[];
  isActive: (href: string) => boolean;
  onNavigate: () => void;
  onLogout: () => void;
  hideHeader?: boolean;
  theme: string;
  onToggleTheme: () => void;
  onCollapseDesktop?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-4">
          <BrandMark />
          {onCollapseDesktop && (
            <button
              type="button"
              onClick={onCollapseDesktop}
              className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground lg:inline-flex"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <nav className="flex-1 space-y-0.5 px-2.5 pb-3">
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {user.role === "admin" ? "HR Console" : "Workspace"}
        </p>
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <div className="mt-0.5">
          <Link
            href="/change-password"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition",
              isActive("/change-password")
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <KeyRound className="h-4 w-4" />
            Change Password
          </Link>
        </div>
      </nav>
      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-2 rounded-md p-1.5">
          <EmployeeAvatar name={user.name} url={user.avatarUrl ?? null} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <button
            onClick={onToggleTheme}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={onLogout}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
