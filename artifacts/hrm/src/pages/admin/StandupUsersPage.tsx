import { useState } from "react";
import { useListEmployees } from "@workspace/api-client-react";
import { StandupUsersDirectory } from "@/components/StandupSheet";
import { Skeleton } from "@/components/ui/skeleton";

export function StandupUsersPage() {
  const { data, isLoading } = useListEmployees();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-[480px] w-full rounded-2xl" />
      </div>
    );
  }

  const employees = (data ?? [])
    .filter((employee) => ((employee as any).role ?? "employee") === "employee")
    .map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      position: employee.position,
      department: employee.department,
      avatarUrl: employee.avatarUrl,
    }));

  return (
    <StandupUsersDirectory
      employees={employees}
      search={search}
      onSearchChange={setSearch}
    />
  );
}
