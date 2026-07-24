import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { EmployeesPage } from "@/pages/admin/EmployeesPage";
import { EmployeeDetailPage } from "@/pages/admin/EmployeeDetailPage";
import { AdminAttendancePage } from "@/pages/admin/AttendancePage";
import { AdminAttendanceCalendarPage } from "@/pages/admin/AttendanceCalendarPage";
import { AdminLeavesPage } from "@/pages/admin/LeavesPage";
import { AdminRequestsPage } from "@/pages/admin/RequestsPage";
import { AdminPayslipsPage } from "@/pages/admin/PayslipsPage";
import { AdminSalaryPage } from "@/pages/admin/SalaryPage";
import { AdminSettingsPage } from "@/pages/admin/SettingsPage";
import { AdminInventoryPage } from "@/pages/admin/InventoryPage";
import { AdminMonthlyViewPage } from "@/pages/admin/MonthlyViewPage";
import { AdminMedicalPage } from "@/pages/admin/AdminMedicalPage";
import { EmployeeDashboard } from "@/pages/employee/EmployeeDashboard";
import { MyMedicalPage } from "@/pages/employee/MyMedicalPage";
import { EmployeeProfilePage } from "@/pages/employee/EmployeeProfilePage";
import { MyAttendancePage } from "@/pages/employee/MyAttendancePage";
import { MyLeavesPage } from "@/pages/employee/MyLeavesPage";
import { MyRequestsPage } from "@/pages/employee/MyRequestsPage";
import { MyPayslipsPage } from "@/pages/employee/MyPayslipsPage";
import { MySalaryPage } from "@/pages/employee/MySalaryPage";
import { MyProvidentFundPage } from "@/pages/employee/MyProvidentFundPage";
import { MySettingsPage } from "@/pages/employee/MySettingsPage";
import { MyStandupSheetPage } from "@/pages/employee/MyStandupSheetPage";
import { FeedPage } from "@/pages/FeedPage";
import { CelebrationPopup } from "@/components/CelebrationPopup";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { StandupUsersPage } from "@/pages/admin/StandupUsersPage";
import { StandupUserDetailPage } from "@/pages/admin/StandupUserDetailPage";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function RedirectToAdmin() {
  return <Redirect to="/admin" />;
}

function RedirectToEmployee() {
  return <Redirect to="/employee" />;
}

function RedirectAdminInventory() {
  return <Redirect to="/admin/requests" />;
}

function RedirectEmployeeInventory() {
  return <Redirect to="/employee/requests" />;
}

function RedirectToHome({ role }: { role: "admin" | "hr" | "employee" }) {
  return <Redirect to={role === "admin" ? "/admin" : "/employee"} />;
}

function ChangePasswordRoute() {
  return <ChangePasswordPage mustChange={false} />;
}

function AuthGate() {
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnMount: true,
    },
  });
  const [location, setLocation] = useLocation();

  // When unauthenticated, ensure URL is at /
  useEffect(() => {
    if (!isLoading && (isError || !user) && location !== "/") {
      setLocation("/");
    }
  }, [isLoading, isError, user, location, setLocation]);

  if (isLoading) return <FullScreenLoader />;

  if (isError || !user) {
    return <LoginPage />;
  }

  if (user.mustChangePassword) {
    return <ChangePasswordPage mustChange />;
  }

  return (
    <AppShell user={user}>
      <CelebrationPopup />
      {user.role === "admin" ? (
        <Switch>
          <Route path="/" component={RedirectToAdmin} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/employees" component={EmployeesPage} />
          <Route path="/admin/employees/:id" component={EmployeeDetailPage} />
          <Route path="/admin/attendance" component={AdminAttendancePage} />
          <Route
            path="/admin/attendance-calendar"
            component={AdminAttendanceCalendarPage}
          />
          <Route path="/admin/leaves" component={AdminLeavesPage} />
          <Route path="/admin/requests" component={AdminRequestsPage} />
          <Route path="/admin/payslips" component={AdminPayslipsPage} />
          <Route path="/admin/salary" component={AdminSalaryPage} />
          <Route path="/admin/view" component={AdminMonthlyViewPage} />
          <Route path="/admin/medical" component={AdminMedicalPage} />
          <Route path="/admin/standup-users" component={StandupUsersPage} />
          <Route path="/admin/standup-users/:id" component={StandupUserDetailPage} />
          <Route path="/admin/inventory" component={RedirectAdminInventory} />
          <Route path="/admin/feed" component={FeedPage} />
          <Route path="/admin/notifications" component={NotificationsPage} />
          <Route path="/admin/settings" component={AdminSettingsPage} />
          <Route path="/change-password" component={ChangePasswordRoute} />
          <Route component={RedirectToAdmin} />
        </Switch>
      ) : user.role === "hr" ? (
        <Switch>
          <Route path="/">
            <RedirectToHome role={user.role} />
          </Route>
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/employees" component={EmployeesPage} />
          <Route path="/admin/employees/:id" component={EmployeeDetailPage} />
          <Route path="/admin/attendance" component={AdminAttendancePage} />
          <Route
            path="/admin/attendance-calendar"
            component={AdminAttendanceCalendarPage}
          />
          <Route path="/admin/leaves" component={AdminLeavesPage} />
          <Route path="/admin/requests" component={AdminRequestsPage} />
          <Route path="/admin/payslips" component={AdminPayslipsPage} />
          <Route path="/admin/salary" component={AdminSalaryPage} />
          <Route path="/admin/view" component={AdminMonthlyViewPage} />
          <Route path="/admin/medical" component={AdminMedicalPage} />
          <Route path="/admin/standup-users" component={StandupUsersPage} />
          <Route path="/admin/standup-users/:id" component={StandupUserDetailPage} />
          <Route path="/admin/inventory" component={RedirectAdminInventory} />
          <Route path="/admin/feed" component={FeedPage} />
          <Route path="/admin/notifications" component={NotificationsPage} />
          <Route path="/admin/settings" component={AdminSettingsPage} />
          <Route path="/employee" component={EmployeeDashboard} />
          <Route path="/employee/profile" component={EmployeeProfilePage} />
          <Route path="/employee/attendance" component={MyAttendancePage} />
          <Route path="/employee/inventory" component={RedirectEmployeeInventory} />
          <Route path="/employee/leaves" component={MyLeavesPage} />
          <Route path="/employee/medical" component={MyMedicalPage} />
          <Route path="/employee/requests" component={MyRequestsPage} />
          <Route path="/employee/payslips" component={MyPayslipsPage} />
          <Route path="/employee/salary" component={MySalaryPage} />
          <Route path="/employee/provident-fund" component={MyProvidentFundPage} />
          <Route path="/employee/settings" component={MySettingsPage} />
          <Route path="/employee/standup-sheet" component={MyStandupSheetPage} />
          <Route path="/employee/feed" component={FeedPage} />
          <Route path="/employee/notifications" component={NotificationsPage} />
          <Route path="/change-password" component={ChangePasswordRoute} />
          <Route>
            <RedirectToHome role={user.role} />
          </Route>
        </Switch>
      ) : (
        <Switch>
          <Route path="/" component={RedirectToEmployee} />
          <Route path="/employee" component={EmployeeDashboard} />
          <Route path="/employee/profile" component={EmployeeProfilePage} />
          <Route path="/employee/attendance" component={MyAttendancePage} />
          <Route path="/employee/inventory" component={RedirectEmployeeInventory} />
          <Route path="/employee/leaves" component={MyLeavesPage} />
          <Route path="/employee/medical" component={MyMedicalPage} />
          <Route path="/employee/requests" component={MyRequestsPage} />
          <Route path="/employee/payslips" component={MyPayslipsPage} />
          <Route path="/employee/salary" component={MySalaryPage} />
          <Route path="/employee/provident-fund" component={MyProvidentFundPage} />
          <Route path="/employee/settings" component={MySettingsPage} />
          <Route path="/employee/standup-sheet" component={MyStandupSheetPage} />
          <Route path="/employee/feed" component={FeedPage} />
          <Route path="/employee/notifications" component={NotificationsPage} />
          <Route path="/change-password" component={ChangePasswordRoute} />
          <Route component={RedirectToEmployee} />
        </Switch>
      )}
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate />
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
