import { useState } from "react";
import { FileText, Eye, Download, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  url: string;
  name?: string | null;
  label?: string;
};

function getExt(url: string, name?: string | null): string {
  const source = name || url;
  const clean = source.split("?")[0]?.split("#")[0] ?? "";
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return ext;
}

function isPreviewable(ext: string): boolean {
  return [
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "txt",
  ].includes(ext);
}

function isImage(ext: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
}

export function FilePreview({ url, name, label }: Props) {
  const [open, setOpen] = useState(false);
  const ext = getExt(url, name);
  const previewable = isPreviewable(ext);
  const displayName = name || label || "Document";

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <FileText className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1 truncate font-medium">{displayName}</span>
        <div className="flex items-center gap-1.5">
          {previewable && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      {previewable && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 p-0">
            <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
              <DialogTitle className="truncate text-sm">
                {displayName}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close preview"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-hidden bg-muted/30">
              {isImage(ext) ? (
                <div className="flex h-full w-full items-center justify-center p-4">
                  <img
                    src={url}
                    alt={displayName}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <iframe
                  src={url}
                  title={displayName}
                  className="h-full w-full border-0"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
