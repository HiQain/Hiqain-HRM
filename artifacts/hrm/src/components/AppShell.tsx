import { memo, type ReactNode, useCallback, useState } from "react";
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
  KeyRound,
  Moon,
  Sun,
  PartyPopper,
  PiggyBank,
  Package,
  Settings as SettingsIcon,
} from "lucide-react";
import { useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { useTheme } from "@/hooks/use-theme";

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
  { label: "Leave Requests", href: "/admin/leaves", icon: CalendarRange },
  { label: "Requests", href: "/admin/requests", icon: Inbox },
  { label: "Salary", href: "/admin/salary", icon: Wallet },
  { label: "View", href: "/admin/view", icon: LayoutGrid },
  { label: "Inventory", href: "/admin/inventory", icon: Package },
  { label: "Payslips", href: "/admin/payslips", icon: Receipt },
  { label: "News Feed", href: "/admin/feed", icon: PartyPopper },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon },
];

const EMP_NAV: NavItem[] = [
  { label: "Dashboard", href: "/employee", icon: LayoutDashboard },
  { label: "Profile", href: "/employee/profile", icon: UserCircle },
  { label: "Attendance", href: "/employee/attendance", icon: CalendarCheck },
  { label: "Leaves", href: "/employee/leaves", icon: ClipboardList },
  { label: "Inventory", href: "/employee/inventory", icon: Package },
  { label: "Requests", href: "/employee/requests", icon: FilePlus2 },
  { label: "Salary", href: "/employee/salary", icon: Wallet },
  { label: "Provident Fund", href: "/employee/provident-fund", icon: PiggyBank },
  { label: "Payslips", href: "/employee/payslips", icon: Receipt },
  { label: "News Feed", href: "/employee/feed", icon: PartyPopper },
  { label: "Settings", href: "/employee/settings", icon: SettingsIcon },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: "admin" | "hr" | "employee" };
  children: ReactNode;
}) {
  const nav = user.role !== "employee" ? ADMIN_NAV : EMP_NAV;
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
            desktopOpen ? "lg:w-64" : "lg:w-16",
          )}
        >
          {desktopOpen ? (
            <SidebarInner
              user={user}
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
                user={user}
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
        <main className={cn("min-w-0 flex-1 overflow-x-hidden", desktopOpen && "lg:pl-64")}>
          <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
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
  user: { name: string; email: string; role: "admin" | "hr" | "employee" };
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

      <div className="flex w-full items-center justify-center py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border overflow-hidden">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="HRM logo"
            className="h-8 w-8 object-contain"
          />
        </div>
      </div>

      <nav className="flex-1 w-full flex flex-col items-center gap-1 px-2 pb-4">
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
        <div className="mt-1 w-full flex justify-center">
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

      <div className="w-full border-t border-border p-2 flex flex-col items-center gap-1">
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
          <EmployeeAvatar name={user.name} size="sm" />
        </div>
      </div>
    </div>
  );
});

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
  user: { name: string; email: string; role: "admin" | "hr" | "employee" };
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
        <div className="flex items-center justify-between px-5 py-5">
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
      <nav className="flex-1 space-y-1 px-3 pb-4">
        <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
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
        <div className="mt-1">
          <Link
            href="/change-password"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
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
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-md p-2">
          <EmployeeAvatar name={user.name} size="sm" />
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
