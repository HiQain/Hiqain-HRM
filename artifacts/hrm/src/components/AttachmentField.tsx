import { useRef, useState } from "react";
import { Paperclip, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getApiUrl, resolveAssetUrl } from "@/lib/api";

export interface Attachment {
  url: string;
  name: string;
}

export function AttachmentField({
  value,
  onChange,
  label = "Attachment",
}: {
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(getApiUrl("/api/uploads"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Upload failed");
      }
      const data = (await res.json()) as Attachment;
      onChange(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <a
            href={resolveAssetUrl(value.url)}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-2 text-primary hover:underline"
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate" title={value.name}>
              {value.name.length > 30 ? value.name.slice(0, 30) + "…" : value.name}
            </span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onChange(null)}
            aria-label="Remove attachment"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={handlePick}
          disabled={uploading}
          className="w-full justify-start gap-2 font-normal text-muted-foreground"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          {uploading ? "Uploading..." : "Add a file (optional)"}
        </Button>
      )}
    </div>
  );
}
