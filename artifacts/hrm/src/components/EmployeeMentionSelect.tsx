import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useListMentionableMembers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export function EmployeeMentionSelect({
  value,
  onChange,
  excludeIds = [],
  label = "Tag members",
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  excludeIds?: number[];
  label?: string;
}) {
  const { data: members } = useListMentionableMembers();
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () => (members ?? []).filter((m) => !excludeIds.includes(m.id)),
    [members, excludeIds],
  );

  const selectedNames = useMemo(() => {
    const map = new Map((members ?? []).map((m) => [m.id, m.name]));
    return value.map((id) => ({ id, name: map.get(id) ?? `#${id}` }));
  }, [value, members]);

  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">
              {value.length === 0
                ? "Select members to notify (optional)"
                : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search members..." />
            <CommandList>
              <CommandEmpty>No members found.</CommandEmpty>
              <CommandGroup>
                {options.map((m) => {
                  const checked = value.includes(m.id);
                  return (
                    <CommandItem
                      key={m.id}
                      value={`${m.name} ${m.email}`}
                      onSelect={() => toggle(m.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          checked ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2">
                          {m.name}
                          {m.role === "admin" && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[10px] uppercase"
                            >
                              Admin
                            </Badge>
                          )}
                          {m.role === "hr" && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[10px] uppercase"
                            >
                              HR
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {m.position ?? m.email}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedNames.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1">
              @{s.name}
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="ml-0.5 rounded-full hover:bg-muted"
                aria-label={`Remove ${s.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
