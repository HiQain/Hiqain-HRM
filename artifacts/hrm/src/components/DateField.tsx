import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDate, ymdLocal } from "@/lib/utils";

export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

function parseYmd(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  required,
  disabled,
  id,
  className,
  align = "start",
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmd(value);
  const fromDate = parseYmd(min);
  const toDate = parseYmd(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={required}
          className={cn(
            "w-full justify-start font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
          {value ? formatDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? fromDate ?? toDate}
          disabled={(d) => {
            if (fromDate && d < fromDate) return true;
            if (toDate && d > toDate) return true;
            return false;
          }}
          onSelect={(d) => {
            if (!d) return;
            onChange(ymdLocal(d));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
