import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Quote,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Eraser,
} from "lucide-react";

type Command =
  | "bold"
  | "italic"
  | "underline"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "formatBlock"
  | "createLink"
  | "unlink"
  | "removeFormat"
  | "undo"
  | "redo";

function exec(cmd: Command, value?: string) {
  // execCommand is deprecated but still works in all current browsers and is
  // by far the smallest way to ship a Word-style editor without extra deps.
  document.execCommand(cmd, false, value);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minRows = 6,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Initialize editor html only when the incoming value differs from current DOM.
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const handle = (cmd: Command, val?: string) => {
    ref.current?.focus();
    exec(cmd, val);
    onChange(ref.current?.innerHTML ?? "");
  };

  const tools: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
  }[] = [
    { icon: Bold, label: "Bold", onClick: () => handle("bold") },
    { icon: Italic, label: "Italic", onClick: () => handle("italic") },
    { icon: Underline, label: "Underline", onClick: () => handle("underline") },
    {
      icon: Heading1,
      label: "Heading 1",
      onClick: () => handle("formatBlock", "H2"),
    },
    {
      icon: Heading2,
      label: "Heading 2",
      onClick: () => handle("formatBlock", "H3"),
    },
    {
      icon: Quote,
      label: "Quote",
      onClick: () => handle("formatBlock", "BLOCKQUOTE"),
    },
    {
      icon: List,
      label: "Bulleted list",
      onClick: () => handle("insertUnorderedList"),
    },
    {
      icon: ListOrdered,
      label: "Numbered list",
      onClick: () => handle("insertOrderedList"),
    },
    {
      icon: LinkIcon,
      label: "Link",
      onClick: () => {
        const url = window.prompt("Link URL");
        if (url) handle("createLink", url);
      },
    },
    {
      icon: Eraser,
      label: "Clear formatting",
      onClick: () => handle("removeFormat"),
    },
    { icon: Undo2, label: "Undo", onClick: () => handle("undo") },
    { icon: Redo2, label: "Redo", onClick: () => handle("redo") },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
        {tools.map((t, idx) => (
          <button
            key={idx}
            type="button"
            title={t.label}
            aria-label={t.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.onClick}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <t.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="rte-content prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm leading-relaxed focus:outline-none"
        style={{ minHeight: `${minRows * 1.5}rem` }}
      />
    </div>
  );
}

export function RichTextView({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  if (!html?.trim()) return null;
  return (
    <div
      className={`rte-content prose prose-sm dark:prose-invert max-w-none ${className ?? ""}`}
      // Admin-authored content; rendered for trusted internal users only.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
