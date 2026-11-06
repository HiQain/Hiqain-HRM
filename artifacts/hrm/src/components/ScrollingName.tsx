import { useEffect, useRef, useState } from "react";

/**
 * Renders a name on a single line. When the name is short enough to fit, it is
 * shown as-is (truncated if ever needed). When it overflows the available
 * width, a seamless left-scrolling marquee is applied so the full name can be
 * read. Hovering pauses the animation; reduced-motion users get static text.
 */
export function ScrollingName({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const check = () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;
      setOverflow(measure.scrollWidth > container.clientWidth + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [name]);

  // Keep a roughly constant scrolling speed regardless of name length.
  const duration = Math.max(6, name.length * 0.35);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {overflow ? (
        <div
          className="marquee-name-track"
          style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
        >
          <span className="whitespace-nowrap pr-8">{name}</span>
          <span className="whitespace-nowrap pr-8" aria-hidden="true">
            {name}
          </span>
        </div>
      ) : (
        <span className="block truncate">{name}</span>
      )}
      {/* Off-layout measurer used only to detect overflow. */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        {name}
      </span>
    </div>
  );
}
