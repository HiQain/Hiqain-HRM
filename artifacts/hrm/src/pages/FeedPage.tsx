import { useState } from "react";
import {
  useGetFeed,
  useListNewsPosts,
  useCreateNewsPost,
  useDeleteNewsPost,
  getListNewsPostsQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Cake,
  PartyPopper,
  Loader2,
  Megaphone,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { FilePreview } from "@/components/FilePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl } from "@/lib/api";
import { formatDateShort } from "@/lib/utils";

function getAttachmentExtension(url?: string | null, name?: string | null) {
  const source = name || url || "";
  return source.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase() ?? "";
}

function isImageAttachment(url?: string | null, name?: string | null) {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(
    getAttachmentExtension(url, name),
  );
}

function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return fetch(getApiUrl("/api/uploads"), {
    method: "POST",
    body: fd,
    credentials: "include",
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      let msg = `Upload failed (${r.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) msg = parsed.message;
      } catch {
        if (text) msg = text;
      }
      throw new Error(msg);
    }
    return r.json();
  });
}

export function FeedPage() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const canCompose = me?.role === "admin" || me?.role === "hr";
  const { data, isLoading } = useGetFeed();
  const { data: news, isLoading: newsLoading } = useListNewsPosts();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const todayBirthdays = data?.todayBirthdays ?? [];
  const todayAnniversaries = data?.todayAnniversaries ?? [];
  const upcomingBirthdays = data?.upcomingBirthdays ?? [];
  const upcomingAnniversaries = data?.upcomingAnniversaries ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="News Feed"
        description="Company announcements, birthdays and work anniversaries."
      />

      {canCompose && <NewsComposer />}

      <NewsList
        posts={news ?? []}
        loading={newsLoading}
        canDelete={!!isAdmin}
      />

      {(todayBirthdays.length > 0 || todayAnniversaries.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-pink-50 p-5 shadow-sm dark:border-amber-900/40 dark:from-amber-950/40 dark:via-background dark:to-pink-950/30">
          <div className="mb-3 flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-semibold tracking-tight">
              Today's celebrations
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {todayBirthdays.map((b) => (
              <CelebrationCard
                key={`tb-${b.employeeId}`}
                kind="birthday"
                name={b.employeeName}
                avatarUrl={b.avatarUrl}
                detail="Happy birthday!"
              />
            ))}
            {todayAnniversaries.map((a) => (
              <CelebrationCard
                key={`ta-${a.employeeId}`}
                kind="anniversary"
                name={a.employeeName}
                avatarUrl={a.avatarUrl}
                detail={
                  a.yearsCount
                    ? `${a.yearsCount} year${a.yearsCount === 1 ? "" : "s"} with the team`
                    : "Work anniversary today"
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Cake className="h-5 w-5 text-pink-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming birthdays
            </h3>
          </div>
          {upcomingBirthdays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No birthdays in the next 60 days.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcomingBirthdays.map((b) => (
                <UpcomingRow
                  key={b.employeeId}
                  name={b.employeeName}
                  avatarUrl={b.avatarUrl}
                  date={b.date}
                  detail=""
                />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming work anniversaries
            </h3>
          </div>
          {upcomingAnniversaries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No anniversaries in the next 60 days.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcomingAnniversaries.map((a) => (
                <UpcomingRow
                  key={a.employeeId}
                  name={a.employeeName}
                  avatarUrl={a.avatarUrl}
                  date={a.date}
                  detail={
                    a.yearsCount
                      ? `${a.yearsCount} year${a.yearsCount === 1 ? "" : "s"}`
                      : ""
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function NewsComposer() {
  const qc = useQueryClient();
  const create = useCreateNewsPost();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setTitle("");
    setBody("");
    setAttachment(null);
  };

  const onPickFile = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadFile(file);
      setAttachment(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    create.mutate(
      {
        data: {
          title: title.trim(),
          body: body.trim(),
          attachmentUrl: attachment?.url ?? null,
          attachmentName: attachment?.name ?? null,
        },
      },
      {
        onSuccess: () => {
          toast.success("News posted");
          reset();
          qc.invalidateQueries({ queryKey: getListNewsPostsQueryKey() });
        },
        onError: (err) =>
          toast.error(
            err instanceof Error
              ? `Could not post news: ${err.message}`
              : "Could not post news",
          ),
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold tracking-tight">
          Post an announcement
        </h2>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="news-title" className="text-xs">
            Title
          </Label>
          <Input
            id="news-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Town hall on Friday"
            maxLength={200}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="news-body" className="text-xs">
            Message (optional)
          </Label>
          <Textarea
            id="news-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share details with the team..."
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Attachment (optional) </Label>
          {attachment ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="truncate font-medium">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"
                aria-label="Remove attachment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading
                ? "Uploading..."
                : "Click to attach an image, PDF or document"}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={create.isPending || uploading}
            className="gap-2"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Post
          </Button>
        </div>
      </div>
    </form>
  );
}

function NewsList({
  posts,
  loading,
  canDelete,
}: {
  posts: Array<{
    id: number;
    authorName: string;
    title: string;
    body: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    createdAt: string;
  }>;
  loading: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const del = useDeleteNewsPost();

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (posts.length === 0) {
    return null;
  }

  const onDelete = (id: number) => {
    if (!confirm("Delete this announcement?")) return;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Deleted");
          qc.invalidateQueries({ queryKey: getListNewsPostsQueryKey() });
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Delete failed"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Megaphone className="h-4 w-4" />
        Announcements
      </h2>
      <div className="space-y-3">
        {posts.map((p) => (
          <article
            key={p.id}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold tracking-tight">
                  {p.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Posted by {p.authorName} · {formatDateShort(p.createdAt)}
                </p>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600"
                  aria-label="Delete post"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {p.body && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {p.body}
              </p>
            )}
            {p.attachmentUrl && (
              <div className="mt-3">
                {isImageAttachment(p.attachmentUrl, p.attachmentName) && (
                  <div className="mb-3 overflow-hidden rounded-xl border border-border bg-muted/20">
                    <img
                      src={p.attachmentUrl}
                      alt={p.attachmentName ?? p.title}
                      className="max-h-[26rem] w-full object-cover"
                    />
                  </div>
                )}
                {!isImageAttachment(p.attachmentUrl, p.attachmentName) && (
                  <FilePreview
                    url={p.attachmentUrl}
                    name={p.attachmentName ?? null}
                    label="Attachment"
                  />
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function CelebrationCard({
  kind,
  name,
  avatarUrl,
  detail,
}: {
  kind: "birthday" | "anniversary";
  name: string;
  avatarUrl: string | null;
  detail: string;
}) {
  const Icon = kind === "birthday" ? Cake : PartyPopper;
  const tone =
    kind === "birthday"
      ? "from-pink-500 to-rose-500"
      : "from-indigo-500 to-violet-600";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 p-3 shadow-sm">
      <EmployeeAvatar name={name} url={avatarUrl ?? null} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <div
        className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br ${tone} text-white shadow`}
      >
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function UpcomingRow({
  name,
  avatarUrl,
  date,
  detail,
}: {
  name: string;
  avatarUrl: string | null;
  date: string;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <EmployeeAvatar name={name} url={avatarUrl ?? null} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          {detail && (
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {formatDateShort(date)}
      </span>
    </li>
  );
}
