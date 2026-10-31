import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Key, CreditCard, Bitcoin, Phone, Save, CheckCircle2, Sparkles, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function AdminSettings() {
  const { toast } = useToast();

  const [settings, setSettings] = useState({
    paynow_url: "",
    paypal_url: "",
    trust_wallet: "",
    ecocash_number: "",
    payment_instructions: "",
    docs_url: "/docs",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [managerAccounts, setManagerAccounts] = useState<any[]>([]);
  const [loadingManagerPermissions, setLoadingManagerPermissions] = useState(true);
  const [savingManagerId, setSavingManagerId] = useState<number | null>(null);
  const managerPermissionLabels: Record<string, string> = {
    transferView: "View transfer requests and approved letters",
    transferReview: "Approve or reject transfer letters",
    reportView: "View report review queue",
    reportCreate: "Create performance report drafts",
    reportReview: "Approve or reject reports",
    teacherMonitor: "Monitor teacher activity",
    studentManage: "View learner records and activity",
    prefectManage: "View prefect roster",
    awardIssue: "Issue awards",
  };

  useEffect(() => {
    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl("/api/manager-permissions"), { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Unable to load manager permissions"); return data; })
      .then(data => setManagerAccounts(Array.isArray(data) ? data : []))
      .catch(err => toast({ variant: "destructive", title: "Manager permissions unavailable", description: err instanceof Error ? err.message : "Unable to load manager permissions." }))
      .finally(() => setLoadingManagerPermissions(false));
  }, []);

  const updateManagerPermission = (managerId: number, key: string, enabled: boolean) => {
    setManagerAccounts(accounts => accounts.map(account => account.id === managerId
      ? { ...account, permissions: { ...account.permissions, [key]: enabled } }
      : account));
  };

  const saveManagerPermissions = async (manager: any) => {
    setSavingManagerId(manager.id);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/manager-permissions/" + manager.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissions: manager.permissions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save manager permissions.");
      setManagerAccounts(accounts => accounts.map(account => account.id === manager.id ? { ...account, permissions: data.permissions } : account));
      toast({ title: "Permissions saved", description: "Server-side permissions updated for " + manager.name + "." });
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err instanceof Error ? err.message : "Could not save manager permissions." });
    } finally {
      setSavingManagerId(null);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl("/api/settings"), { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Unable to load settings"); return data; })
      .then(data => { setSettings(data); setSettingsError(null); setLoadingSettings(false); })
      .catch(err => { setSettingsError(err instanceof Error ? err.message : "Unable to load settings"); setLoadingSettings(false); });
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch(getApiUrl("/api/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save settings.");
      setSettings(data);
      setSettingsError(null);
      toast({ title: "Settings saved", description: "Payment settings have been updated." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save settings.";
      setSettingsError(message);
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match", description: "New password and confirmation must match." });
      return;
    }
    if (passwordForm.newPassword.length < 8 || passwordForm.newPassword.length > 256) {
      toast({ variant: "destructive", title: "Password length invalid", description: "New password must be between 8 and 256 characters." });
      return;
    }
    setChangingPassword(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch(getApiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      window.location.assign("/login?passwordChanged=1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password.";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8 text-primary" />
            Platform Settings
          </h1>
          <p className="text-muted-foreground mt-1">Manage payment, security, and AI configuration for the owner account.</p>
          {settingsError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{settingsError}</div>}
        </div>

        {/* Payment Settings */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Payment Methods
            </CardTitle>
            <CardDescription>
              Set up the payment details students will see when paying school fees.
              Leave blank to hide a method.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {loadingSettings ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Paynow */}
                <div className="space-y-2"><Label className="text-sm font-semibold">Paynow live payment link</Label><Input placeholder="https://www.paynow.co.zw/..." value={settings.paynow_url} onChange={e => setSettings(s => ({ ...s, paynow_url: e.target.value }))} /><p className="text-xs text-muted-foreground">Use a live Paynow merchant link for real payments. Do not use a test-mode link in production.</p></div>

                {/* PayPal */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <div className="w-5 h-5 rounded bg-[#003087] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">P</span>
                    </div>
                    PayPal Link / PayPal.Me URL
                  </Label>
                  <Input
                    placeholder="https://paypal.me/yourname or paypal email"
                    value={settings.paypal_url}
                    onChange={e => setSettings(s => ({ ...s, paypal_url: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">e.g. https://paypal.me/dallylettersc or your PayPal email address</p>
                </div>

                {/* Trust Wallet */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Bitcoin className="h-4 w-4 text-amber-500" />
                    Trust Wallet / Crypto Address (USDT / BTC)
                  </Label>
                  <Input
                    placeholder="e.g. bc1q4snx5s8dkxff2yl898vfu4vfrem7rwgqs3xjt6"
                    value={settings.trust_wallet}
                    onChange={e => setSettings(s => ({ ...s, trust_wallet: e.target.value }))}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Students will see this address with a copy button.</p>
                </div>

                {/* EcoCash / Phone */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Phone className="h-4 w-4 text-emerald-500" />
                    EcoCash / Mobile Money Number
                  </Label>
                  <Input
                    placeholder="e.g. 0785069260"
                    value={settings.ecocash_number}
                    onChange={e => setSettings(s => ({ ...s, ecocash_number: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">EcoCash, OneMoney, or other mobile money number.</p>
                </div>

                {/* Instructions */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Payment Instructions</Label>
                  <Textarea
                    rows={3}
                    placeholder="Instructions shown to students above the payment options..."
                    value={settings.payment_instructions}
                    onChange={e => setSettings(s => ({ ...s, payment_instructions: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Learner documentation destination</Label>
                  <Input placeholder="/docs or https://docs.example.com" value={settings.docs_url} onChange={e => setSettings(s => ({ ...s, docs_url: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Read-only destination opened by the Missing Resource / Docs buttons. Keep this to an approved documentation site.</p>
                </div>

                <Button onClick={handleSaveSettings} disabled={savingSettings || loadingSettings} className="gap-2">
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Payment Settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Junior / Senior Manager Permissions</CardTitle>
            <CardDescription>These grants are saved to the server and enforced by protected APIs. The owner alone can change them. Owner accounts cannot be edited here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {loadingManagerPermissions ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading manager accounts…</div>
              : managerAccounts.length === 0 ? <p className="text-sm text-muted-foreground">No manager accounts found. Assign a manager role first.</p>
              : managerAccounts.map(manager => (
                <section key={manager.id} className="rounded-xl border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className="font-semibold">{manager.name}</h3><p className="text-xs text-muted-foreground">{manager.email} · {String(manager.role).replaceAll("_", " ")}{manager.managerLevel ? " · " + manager.managerLevel : ""}</p></div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">Account #{manager.id}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(managerPermissionLabels).map(([key, label]) => (
                      <label key={key} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={manager.permissions?.[key] === true} onChange={event => updateManagerPermission(manager.id, key, event.target.checked)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <Button onClick={() => void saveManagerPermissions(manager)} disabled={savingManagerId !== null} className="gap-2">
                    {savingManagerId === manager.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save permissions
                  </Button>
                </section>
              ))}
            <p className="text-xs text-muted-foreground">Junior defaults are restricted for approvals and learner/prefect actions. Senior defaults include those capabilities, but each grant can be adjusted here. Changing a checkbox does not take effect until saved.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-500" />ELIDEMS AI</CardTitle><CardDescription>AI provider keys and Live/Development mode are managed separately.</CardDescription></CardHeader>
          <CardContent className="pt-6"><a href="/admin/ai/settings" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Open AI Settings <Sparkles className="h-4 w-4" /></a></CardContent>
        </Card>

        {/* Password Change */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>Update your admin account password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                placeholder="Enter current password"
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password (min 6 chars)"
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                placeholder="Repeat new password"
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
              className="gap-2"
            >
              {changingPassword
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle2 className="h-4 w-4" />
              }
              Update Password
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
