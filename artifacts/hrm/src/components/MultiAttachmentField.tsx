import { useRef, useState } from "react";
import { Paperclip, X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Attachment } from "@/components/AttachmentField";

export function MultiAttachmentField({
  value,
  onChange,
  label = "Attachments",
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    const next: Attachment[] = [...value];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "Upload failed");
        }
        next.push((await res.json()) as Attachment);
      }
      onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => {
    const copy = value.slice();
    copy.splice(idx, 1);
    onChange(copy);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length > 0) void handleFiles(fs);
        }}
      />
      <div className="space-y-1.5">
        {value.map((a, idx) => (
          <div
            key={`${a.url}-${idx}`}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
          >
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 text-primary hover:underline"
            >
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate" title={a.name}>
                {a.name.length > 40 ? a.name.slice(0, 40) + "…" : a.name}
              </span>
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => removeAt(idx)}
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={handlePick}
          disabled={uploading}
          className="w-full justify-start gap-2 font-normal text-muted-foreground"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : value.length === 0 ? (
            <Paperclip className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {uploading
            ? "Uploading..."
            : value.length === 0
              ? "Add files (optional)"
              : "Add more files"}
        </Button>
      </div>
    </div>
  );
}
