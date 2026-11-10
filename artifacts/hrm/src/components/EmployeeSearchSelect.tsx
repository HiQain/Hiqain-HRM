import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

export function EmployeeSearchSelect<T extends { id: number; name: string }>({
  employees,
  value,
  onChange,
  getMeta,
  placeholder = "Select an employee...",
  searchPlaceholder = "Search employee...",
  className,
}: {
  employees: T[];
  value: number | null;
  onChange: (employeeId: number) => void;
  getMeta?: (employee: T) => string | null | undefined;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedEmployee =
    employees.find((employee) => employee.id === value) ?? null;
  const selectedMeta = selectedEmployee ? getMeta?.(selectedEmployee) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selectedEmployee
              ? selectedMeta
                ? `${selectedEmployee.name} · ${selectedMeta}`
                : selectedEmployee.name
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup>
              {employees.map((employee) => {
                const meta = getMeta?.(employee);
                return (
                  <CommandItem
                    key={employee.id}
                    value={`${employee.name} ${meta ?? ""}`}
                    onSelect={() => {
                      onChange(employee.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        employee.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{employee.name}</span>
                    {meta ? (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {meta}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
