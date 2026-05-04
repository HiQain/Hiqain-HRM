import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

export function DateField({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  id,
  className,
}: DateFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Input
      id={inputId}
      type="date"
      value={value}
      min={min}
      max={max}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background text-sm shadow-sm",
        className,
      )}
    />
  );
}
