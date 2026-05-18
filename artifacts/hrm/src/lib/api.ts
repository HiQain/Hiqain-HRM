export function getApiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

function isAbsoluteAssetUrl(url: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url) || /^(?:data|blob):/i.test(url);
}

export function resolveAssetUrl(url: string | null | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed) return "";
  if (isAbsoluteAssetUrl(trimmed)) return trimmed;

  if (/^\/?api\/uploads\//i.test(trimmed)) {
    return `/${trimmed.replace(/^\/?api\//i, "")}`;
  }

  if (/^\/?uploads\//i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  return getApiUrl(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
}

export function getAssetUrlCandidates(url: string | null | undefined): string[] {
  const trimmed = url?.trim();
  if (!trimmed) return [];

  const candidates = [resolveAssetUrl(trimmed)];

  if (!isAbsoluteAssetUrl(trimmed)) {
    candidates.push(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);

    if (/^\/?uploads\//i.test(trimmed)) {
      candidates.push(`/api/${trimmed.replace(/^\/?/, "")}`);
    } else if (/^\/?api\/uploads\//i.test(trimmed)) {
      candidates.push(`/${trimmed.replace(/^\/?api\//i, "")}`);
    }
  }

  return candidates.filter((value, index, all) => value && all.indexOf(value) === index);
}
