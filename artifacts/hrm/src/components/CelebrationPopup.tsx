import { useEffect, useState } from "react";
import { Cake, PartyPopper } from "lucide-react";
import { useGetFeed } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";

const STORAGE_KEY = "hiqain.celebrationsSeen";

export function CelebrationPopup() {
  const { data } = useGetFeed();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const today = data.today;
    const hasAny =
      (data.todayBirthdays?.length ?? 0) > 0 ||
      (data.todayAnniversaries?.length ?? 0) > 0;
    if (!hasAny) return;
    const seen = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (seen === today) return;
    setOpen(true);
  }, [data]);

  const handleClose = () => {
    setOpen(false);
    try {
      if (data?.today) localStorage.setItem(STORAGE_KEY, data.today);
    } catch {
      // ignore
    }
  };

  if (!data) return null;
  const birthdays = data.todayBirthdays ?? [];
  const anniversaries = data.todayAnniversaries ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else setOpen(v);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-amber-400 via-pink-500 to-rose-500 text-white shadow-lg">
            <PartyPopper className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-xl">
            Today is a special day!
          </DialogTitle>
          <DialogDescription className="text-center">
            Spread the joy and send your wishes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {birthdays.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Cake className="h-4 w-4 text-pink-600" />
                <h3 className="text-sm font-semibold">Birthday wishes</h3>
              </div>
              <ul className="space-y-2">
                {birthdays.map((b) => (
                  <li
                    key={b.employeeId}
                    className="flex items-center gap-3 rounded-lg border border-pink-200/60 bg-pink-50 px-3 py-2 dark:border-pink-900/40 dark:bg-pink-950/30"
                  >
                    <EmployeeAvatar
                      name={b.employeeName}
                      url={b.avatarUrl ?? null}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {b.employeeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Happy birthday!
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {anniversaries.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <PartyPopper className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-semibold">Work anniversaries</h3>
              </div>
              <ul className="space-y-2">
                {anniversaries.map((a) => (
                  <li
                    key={a.employeeId}
                    className="flex items-center gap-3 rounded-lg border border-indigo-200/60 bg-indigo-50 px-3 py-2 dark:border-indigo-900/40 dark:bg-indigo-950/30"
                  >
                    <EmployeeAvatar
                      name={a.employeeName}
                      url={a.avatarUrl ?? null}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.employeeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.yearsCount
                          ? `${a.yearsCount} year${a.yearsCount === 1 ? "" : "s"} with the team`
                          : "Work anniversary today"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
