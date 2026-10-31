// Match supabase-js's project-specific default key; never clear unrelated data.
export function clearExpiredAuth(
  storage: Pick<Storage, "removeItem">,
  projectUrl: string,
) {
  const key = `sb-${new URL(projectUrl).hostname.split(".")[0]}-auth-token`;
  storage.removeItem(key);
  storage.removeItem(`${key}-code-verifier`);
}
