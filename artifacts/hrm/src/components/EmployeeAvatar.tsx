import { memo, useEffect, useMemo, useState } from "react";
import { getAssetUrlCandidates } from "@/lib/api";
import { avatarColor, cn, initialsFrom } from "@/lib/utils";

export const EmployeeAvatar = memo(function EmployeeAvatar({
  name,
  url,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const candidates = useMemo(() => getAssetUrlCandidates(url), [url]);
  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [url]);

  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-2xl",
  };
  if (candidates[srcIndex]) {
    return (
      <img
        src={candidates[srcIndex]}
        alt={name ?? "Avatar"}
        onError={() => {
          setSrcIndex((current) =>
            current < candidates.length - 1 ? current + 1 : current,
          );
        }}
        className={cn(
          "inline-block rounded-full object-cover ring-1 ring-black/5 shadow-sm shrink-0",
          sizes[size],
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold ring-1 ring-black/5 shadow-sm shrink-0",
        sizes[size],
        avatarColor(name),
        className,
      )}
    >
      {initialsFrom(name)}
    </div>
  );
});
