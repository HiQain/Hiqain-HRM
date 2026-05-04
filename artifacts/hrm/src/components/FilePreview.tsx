import { FileText } from "lucide-react";

type Props = {
  url: string;
  name?: string | null;
  label?: string;
};

export function FilePreview({ url, name, label }: Props) {
  const displayName = name || label || "Document";

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm transition hover:bg-muted/50"
    >
      <FileText className="h-5 w-5 shrink-0 text-primary" />
      <span className="truncate font-medium">{displayName}</span>
    </a>
  );
}
