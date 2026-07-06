import { useParams } from "wouter";
import { EmployeeStandupSheet } from "@/components/StandupSheet";

export function StandupUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  return (
    <EmployeeStandupSheet
      path={`/api/standups/employees/${id}`}
      queryKey={["standup-sheet", "employee", id]}
      title="Employee Standup Sheet"
      description="Review and update this employee's standup entries."
      backHref="/admin/standup-users"
      backLabel="Back to standup users"
    />
  );
}
