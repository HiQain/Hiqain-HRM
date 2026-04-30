import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ReasonCellProps = {
  reason?: string | null;
  title?: string;
  description?: ReactNode;
};

export function ReasonCell({
  reason,
  title = "Reason",
  description,
}: ReasonCellProps) {
  const [open, setOpen] = useState(false);
  const text = reason?.trim();

  if (!text) {
    return <span className="text-muted-foreground/60">—</span>;
  }

  return (
    <>
      <button
        type="button"
        className="block w-full truncate text-left hover:text-foreground hover:underline"
        onClick={() => setOpen(true)}
        title="Click to read full reason"
      >
        {text}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription asChild>
                <div className="text-sm text-muted-foreground">{description}</div>
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
            {text}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
