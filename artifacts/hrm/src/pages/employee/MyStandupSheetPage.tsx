import { EmployeeStandupSheet } from "@/components/StandupSheet";

export function MyStandupSheetPage() {
  return (
    <EmployeeStandupSheet
      path="/api/standups/me"
      queryKey={["standup-sheet", "me"]}
      showEmployeeSummary={false}
    />
  );
}
