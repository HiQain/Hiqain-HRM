import { type FormEvent, useState } from "react";
import {
  useChangePassword,
  useLogout,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ChangePasswordPage({
  mustChange,
}: {
  mustChange: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const change = useChangePassword();
  const logout = useLogout();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    change.mutate(
      {
        data: {
          ...(mustChange ? {} : { currentPassword }),
          newPassword,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Password updated");
          await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err: unknown) => {
          setError(
            (err as { message?: string })?.message ??
              "Could not update password",
          );
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center">
        <div className="rounded-2xl border border-border bg-card p-7 shadow-xl shadow-indigo-100/40">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">
            {mustChange ? "Set your new password" : "Change password"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mustChange
              ? "For security, please choose a new password before continuing."
              : "Update the password used to sign in to HRM."}
          </p>

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            {!mustChange && (
              <div className="space-y-1.5">
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={change.isPending}
            >
              {change.isPending ? "Updating..." : "Update password"}
            </Button>
          </form>
        </div>
        <button
          type="button"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: async () => {
                await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
                qc.clear();
              },
            })
          }
          className="mt-4 inline-flex items-center justify-center gap-2 self-center text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
