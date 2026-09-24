const storedMediaPath = /^\/api\/lessons\/media\/[a-f0-9-]{36}$/i;

export function isStoredMediaUrl(value: string): boolean {
  try {
    const url = new URL(value, "https://internal.invalid");
    return storedMediaPath.test(url.pathname) && !url.hash;
  } catch {
    return false;
  }
}

export function isValidLessonUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isStoredMediaUrl(trimmed)) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}