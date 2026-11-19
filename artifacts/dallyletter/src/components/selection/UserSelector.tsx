import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { getApiUrl } from "@/lib/api";

type DirectoryUser = {
  id: number;
  name: string;
  role: string;
  isPrefect?: boolean;
  isManager?: boolean;
  managerLevel?: string | null;
  grade?: string | null;
  subject?: string | null;
  avatarUrl?: string | null;
};

type UserGroup = "all" | "everyone" | "teachers" | "prefects" | "learners" | "managers" | "both";

const GROUPS: Array<{ value: UserGroup; label: string }> = [
  { value: "all", label: "All users" },
  { value: "everyone", label: "Everyone" },
  { value: "teachers", label: "Teachers" },
  { value: "prefects", label: "Prefects" },
  { value: "learners", label: "Learners" },
  { value: "managers", label: "Managers" },
  { value: "both", label: "Teachers + learners" },
];

export type UserSelectorProps = {
  value?: number | string | null;
  onChange: (value: number | null, user?: DirectoryUser) => void;
  group?: UserGroup;
  onGroupChange?: (group: UserGroup) => void;
  showGroupFilter?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function UserSelector({
  value,
  onChange,
  group = "all",
  onGroupChange,
  showGroupFilter = true,
  placeholder = "Search people by name…",
  disabled = false,
  className = "",
}: UserSelectorProps) {
  const [activeGroup, setActiveGroup] = useState<UserGroup>(group);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { setActiveGroup(group); }, [group]);
  const visibleUsers = suppliedUsers ?? users;\n  const selected = useMemo(() => visibleUsers.find(user => String(user.id) === String(value)), [visibleUsers, value]);

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem("dallyletter_token") ?? "";
    const params = new URLSearchParams({ group: activeGroup, q: query });
    setLoading(true);
    setError("");
    fetch(getApiUrl("/api/users/selection-directory?" + params.toString()), {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload?.error || "People could not be loaded.");
      return payload;
    }).then((rows: DirectoryUser[]) => setUsers(Array.isArray(rows) ? rows : []))
      .catch(reason => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "People could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeGroup, query, suppliedUsers]);

  const choose = (user: DirectoryUser) => {
    onChange(user.id, user);
  };

  return <div className={"space-y-2 " + className}>
    {showGroupFilter && <label className="block space-y-1 text-sm">
      <span className="font-medium">Show</span>
      <select disabled={disabled} value={activeGroup} onChange={event => { const next = event.target.value as UserGroup; setActiveGroup(next); onGroupChange?.(next); }} className="w-full rounded-md border bg-background px-3 py-2">
        {GROUPS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>}
    <input disabled={disabled} value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} aria-label="Search users" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
    {selected && <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
      <Link href={"/profile/" + selected.id} aria-label={"Open " + selected.name + " profile"} className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2">
        {selected.avatarUrl ? <img src={selected.avatarUrl} alt={selected.name + " profile"} className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold">{selected.name.slice(0, 1).toUpperCase()}</span>}
      </Link>
      <div className="min-w-0 flex-1"><div className="truncate font-medium">{selected.name}</div><div className="text-xs capitalize text-muted-foreground">{selected.isPrefect ? "Prefect" : selected.role.replaceAll("_", " ")}</div></div>
      <button type="button" disabled={disabled} onClick={() => onChange(null)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Clear</button>
    </div>}
    <div role="listbox" aria-label="Matching users" className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
      {!suppliedUsers && loading ? <p className="p-3 text-sm text-muted-foreground">Loading people…</p> : error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p> : visibleUsers.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No matching people.</p> : visibleUsers.map(person => <div key={person.id} className="flex items-center gap-2 rounded-md p-2 hover:bg-muted/60">
        <Link href={"/profile/" + person.id} aria-label={"Open " + person.name + " profile"} className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2">
          {person.avatarUrl ? <img src={person.avatarUrl} alt={person.name + " profile"} className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">{person.name.slice(0, 1).toUpperCase()}</span>}
        </Link>
        <button type="button" role="option" aria-selected={String(person.id) === String(value)} disabled={disabled} onClick={() => choose(person)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium">{person.name}</span>
          <span className="block truncate text-xs capitalize text-muted-foreground">{person.isPrefect ? "Prefect" : person.role.replaceAll("_", " ")}{person.grade ? " · " + person.grade : ""}</span>
        </button>
      </div>)}
    </div>
  </div>;
}
