import { type FormEvent, useState } from "react";
import {
  useLogin,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  ShieldCheck,
  Users,
  CalendarRange,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/PasswordField";
import { useTheme } from "@/hooks/use-theme";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const login = useLogin();
  const { theme, toggle } = useTheme();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { data: { email: email.trim(), password } },
      {
        onSuccess: async () => {
          await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err: unknown) => {
          const msg =
            (err as { message?: string })?.message ?? "Could not sign in";
          setError(msg);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle theme"
        className="absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent transition"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        {/* Hero */}
        <div className="hidden flex-col justify-between p-10 lg:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow ring-1 ring-border overflow-hidden">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="HRM logo"
                className="h-9 w-9 object-contain"
              />
            </div>
            <p className="text-base font-semibold">HRM</p>
          </div>

          <div className="space-y-6">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
                <Sparkles className="h-3.5 w-3.5" />
                HR done thoughtfully
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
                Run your people operations
                <br />
                with calm, modern clarity.
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                HRM keeps attendance, leaves, salary events and
                payslips in one place — built for the HiQain team.
              </p>
            </div>

            <ul className="space-y-3 text-sm">
              <Feature
                icon={Users}
                title="Employee 360"
                desc="Profiles, journey timeline, salary events, payslips."
              />
              <Feature
                icon={CalendarRange}
                title="Attendance & Leaves"
                desc="Lateness with grace periods, approvals, and balances."
              />
              <Feature
                icon={ShieldCheck}
                title="Secure by default"
                desc="Hashed passwords, role-based access, audit-friendly."
              />
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} HiQain. HRM.
          </p>
        </div>

        {/* Form */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 lg:hidden">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow ring-1 ring-border overflow-hidden">
                  <img
                    src={`${import.meta.env.BASE_URL}logo.png`}
                    alt="HRM logo"
                    className="h-9 w-9 object-contain"
                  />
                </div>
                <p className="text-base font-semibold">HRM</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-7 shadow-xl shadow-indigo-100/40">
              <h2 className="text-2xl font-semibold tracking-tight">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to your HRM account.
              </p>

              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@hiqain.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <PasswordField
                    id="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
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
                  disabled={login.isPending}
                >
                  {login.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 text-primary ring-1 ring-primary/15">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}
