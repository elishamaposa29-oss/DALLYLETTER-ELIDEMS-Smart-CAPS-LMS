import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@/lib/api";

type CatalogResponse = { subjects?: string[]; canAddSubject?: boolean };
type SubjectSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function token() { return localStorage.getItem("dallyletter_token") ?? ""; }

export function SubjectSelector({ value, onChange, placeholder = "Search or type a subject…", disabled = false, className = "" }: SubjectSelectorProps) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [query, setQuery] = useState(value);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => { setQuery(value); }, [value]);
  const refresh = async () => {
    const response = await fetch(getApiUrl("/api/subjects/catalog"), { headers: { Authorization: "Bearer " + token() } });
    const data: CatalogResponse = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Subject catalogue could not be loaded.");
    setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
    setCanAdd(data.canAddSubject === true);
  };
  useEffect(() => {
    let active = true;
    refresh().catch(error => { if (active) setNotice(error instanceof Error ? error.message : "Subject catalogue unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const normalized = query.trim().replace(/\\s+/g, " ");
  const matches = useMemo(() => subjects.filter(subject => subject.toLowerCase().includes(normalized.toLowerCase())).slice(0, 12), [subjects, normalized]);
  const exact = subjects.some(subject => subject.toLowerCase() === normalized.toLowerCase());
  const choose = async (subject: string) => {
    onChange(subject);
    setQuery(subject);
    setNotice("");
    void fetch(getApiUrl("/api/subjects/catalog/interaction"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ subject }),
    }).catch(() => undefined);
  };
  const add = async () => {
    if (!normalized || !canAdd) return;
    setNotice("");
    try {
      const response = await fetch(getApiUrl("/api/subjects/catalog"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ subject: normalized }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Subject could not be added.");
      await refresh();
      await choose(String(data.subject || normalized));
      setNotice("Subject added to Dallyletter's shared catalogue.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Subject could not be added.");
    }
  };

  return <div className={"space-y-1 " + className}>
    <input value={query} disabled={disabled} onChange={event => { setQuery(event.target.value); onChange(event.target.value); }} placeholder={placeholder} aria-label="Subject" list="dallyletter-subject-options" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
    <datalist id="dallyletter-subject-options">{subjects.map(subject => <option key={subject} value={subject} />)}</datalist>
    {(loading || matches.length > 0 || (normalized && !exact && canAdd)) && <div className="max-h-44 overflow-y-auto rounded-md border bg-popover p-1">
      {loading && <p className="p-2 text-xs text-muted-foreground">Loading subjects…</p>}
      {matches.map(subject => <button type="button" key={subject} disabled={disabled} onClick={() => void choose(subject)} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">{subject}</button>)}
      {normalized && !exact && canAdd && <button type="button" disabled={disabled} onClick={() => void add()} className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-muted">+ Add “{normalized}” to Dallyletter</button>}
    </div>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </div>;
}
