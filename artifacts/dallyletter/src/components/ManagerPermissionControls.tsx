import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UserRow = { id: number; name: string; email: string; role: string; isManager?: boolean; managerLevel?: string };
type Permission = { key: string; group: string; label: string; description: string; granted: boolean };
type Props = { user: UserRow; onChanged: () => void };

const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("dallyletter_token") ?? ""}` });

export function ManagerPermissionControls({ user, onChanged }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"junior_manager" | "senior_manager">("junior_manager");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isManager = ["junior_manager", "senior_manager", "manager"].includes(user.role) || Boolean(user.isManager);
  const currentRole = user.role === "senior_manager" || user.managerLevel === "senior" ? "senior_manager" : "junior_manager";
  const groups = useMemo(() => [...new Set(permissions.map((p) => p.group))], [permissions]);

  const load = async (nextRole: "junior_manager" | "senior_manager", promote: boolean) => {
    setLoading(true); setError("");
    try {
      if (promote) {
        const roleResponse = await fetch(getApiUrl(`/api/manager-permissions/${user.id}/role`), {
          method: "PATCH", headers: authHeaders(), body: JSON.stringify({ role: nextRole }),
        });
        if (!roleResponse.ok) throw new Error((await roleResponse.json().catch(() => ({}))).error ?? "Could not assign manager role.");
        onChanged();
      }
      const response = await fetch(getApiUrl(`/api/manager-permissions/${user.id}`), { headers: authHeaders() });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Could not load saved permissions.");
      const data = await response.json();
      setPermissions(data.permissions ?? []);
      setRole(nextRole);
      setOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load manager permissions."); toast({ variant: "destructive", title: "Manager permissions", description: e instanceof Error ? e.message : "Unable to load permissions." }); }
    finally { setLoading(false); }
  };

  const decide = (key: string, granted: boolean) => setPermissions((current) => current.map((p) => p.key === key ? { ...p, granted } : p));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch(getApiUrl(`/api/manager-permissions/${user.id}`), {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ permissions: permissions.map(({ key, granted }) => ({ key, granted })) }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Could not save permissions.");
      toast({ title: "Permissions saved", description: `Saved ${permissions.length} individual decisions for ${user.name}.` });
      setOpen(false); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save permissions."); }
    finally { setSaving(false); }
  };

  const demote = async () => {
    if (!window.confirm(`Remove manager access from ${user.name}?`)) return;
    setLoading(true);
    try {
      const response = await fetch(getApiUrl(`/api/manager-permissions/${user.id}/role`), { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ role: "teacher" }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Could not remove manager role.");
      toast({ title: "Manager role removed", description: `${user.name} is now a teacher.` }); onChanged();
    } catch (e) { toast({ variant: "destructive", title: "Could not remove manager", description: e instanceof Error ? e.message : "Request failed." }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) setError(""); }, [open]);

  return <div className="flex flex-wrap items-center justify-end gap-1">
    <Button type="button" size="sm" variant="outline" className="h-8 border-violet-300 px-2 text-violet-700" disabled={loading} onClick={() => void load("junior_manager", !isManager || currentRole !== "junior_manager")}>
      {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Jr
    </Button>
    <Button type="button" size="sm" variant="outline" className="h-8 border-amber-400 px-2 text-amber-800" disabled={loading} onClick={() => void load("senior_manager", !isManager || currentRole !== "senior_manager")}>
      {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Sr
    </Button>
    {isManager && <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-destructive" disabled={loading} onClick={() => void demote()}>Remove</Button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#0f2a5a]"><ShieldCheck className="h-5 w-5" /> {role === "junior_manager" ? "Junior" : "Senior"} Manager permissions</DialogTitle>
          <DialogDescription>{user.name} · Account #{user.id} · {user.email}. Every capability below is individually controlled for this account only.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Owner protection is permanent: no manager can manage an Owner, view Owner activity or Owner audit records, or change Owner permissions. Admin approval powers are not inherited.
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading ? <div className="flex justify-center p-8"><Loader2 className="h-7 w-7 animate-spin" /></div> : groups.map((group) => <section key={group} className="space-y-2">
          <h3 className="border-b pb-1 font-semibold text-[#0f2a5a]">{group}</h3>
          {permissions.filter((p) => p.group === group).map((p) => <div key={p.key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="text-sm font-semibold">{p.label}</p><p className="text-xs text-muted-foreground">{p.description}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{p.key}</p></div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant={p.granted ? "default" : "outline"} className={p.granted ? "bg-emerald-700 hover:bg-emerald-800" : "border-emerald-600 text-emerald-700"} onClick={() => decide(p.key, true)}>✓ Grant</Button>
              <Button type="button" size="sm" variant={!p.granted ? "destructive" : "outline"} className={!p.granted ? "" : "border-red-500 text-red-700"} onClick={() => decide(p.key, false)}>✕ Deny</Button>
            </div>
          </div>)}
        </section>)}
        <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="button" className="bg-[#0f2a5a] hover:bg-[#173d7d]" onClick={() => void save()} disabled={saving || loading || permissions.length === 0}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save all {permissions.length} decisions</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
