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
    school_fee_amount: "",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [manualReports, setManualReports] = useState<any[]>([]);
  const [reviewingReport, setReviewingReport] = useState<number | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [applyingFees, setApplyingFees] = useState(false);
  const [feeMonth, setFeeMonth] = useState(new Date().toLocaleString("en-US", { month: "long" }));
  const [feeYear, setFeeYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl("/api/settings"), { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Unable to load settings"); return data; })
      .then(data => { setSettings(data); setSettingsError(null); setLoadingSettings(false); })
      .catch(err => { setSettingsError(err instanceof Error ? err.message : "Unable to load settings"); setLoadingSettings(false); });
  }, []);

  const loadManualReports = async () => {
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/payments/manual-reports"), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) throw new Error("Could not load payment reports.");
      setManualReports(await response.json());
    } catch (error) {
      toast({ variant: "destructive", title: "Payment review unavailable", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  useEffect(() => { void loadManualReports(); }, []);

  const reviewManualReport = async (report: any, approve: boolean) => {
    setReviewingReport(Number(report.report_id));
    try {
      const token = localStorage.getItem("dallyletter_token");
      const method = String(report.provider || "").replace(/^reported:/, "");
      const url = approve ? "/api/payments/" + report.payment_id + "/manual-settlement" : "/api/payments/manual-reports/" + report.report_id + "/reject";
      const response = await fetch(getApiUrl(url), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(approve ? { reportId: report.report_id, amount: Number(report.amount), method, providerReference: report.provider_reference || "" } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update payment report.");
      toast({ title: approve ? "Payment verified" : "Report rejected", description: approve ? "The verified amount has been applied to invoice #" + report.payment_id + "." : "The invoice balance was left unchanged." });
      await loadManualReports();
    } catch (error) {
      toast({ variant: "destructive", title: "Review failed", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setReviewingReport(null);
    }
  };
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


  const handleApplySchoolFees = async () => {
    if (!settings.school_fee_amount || Number(settings.school_fee_amount) <= 0) {
      toast({ variant: "destructive", title: "Set the school fee first", description: "Save a valid default school fee before applying it to learner invoices." });
      return;
    }
    setApplyingFees(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/settings/school-fees/apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month: feeMonth, year: Number(feeYear) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not apply school fees.");
      toast({ title: "School fees applied", description: `${data.created} new learner invoices created for ${data.month} ${data.year} at USD ${Number(data.amount).toFixed(2)}. ${data.unchanged} existing invoices were preserved.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Fee application failed", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setApplyingFees(false);
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
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">Paynow secure checkout</p>
                  <p>Checkout is enabled only when the API has PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY, PUBLIC_APP_URL and PUBLIC_API_URL configured as server secrets. This page does not collect or expose provider credentials.</p>
                </div>

                <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">PayPal verified checkout</p>
                  <p>Checkout requires PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PUBLIC_APP_URL and PUBLIC_API_URL as server secrets. Register the server's public API URL followed by /api/payments/paypal/webhook in the same PayPal environment as the credentials. Learner payments remain pending until PayPal confirms a completed capture.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Default school fee (USD)</Label>
                  <Input
                    type="number"
                    min="0.01"
                    max="100000"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="e.g. 45.00"
                    value={settings.school_fee_amount}
                    onChange={e => setSettings(s => ({ ...s, school_fee_amount: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">This is the Owner-published reference fee learners can see before paying. It does not silently create invoices or overwrite individual learner balances; the actual amount owed remains the amount recorded in each learner's fee ledger.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                    <div className="space-y-1"><Label htmlFor="fee-billing-month">Billing month</Label><Input id="fee-billing-month" value={feeMonth} onChange={e => setFeeMonth(e.target.value)} maxLength={20} /></div>
                    <div className="space-y-1"><Label htmlFor="fee-billing-year">Year</Label><Input id="fee-billing-year" type="number" min="2020" max="2200" value={feeYear} onChange={e => setFeeYear(e.target.value)} /></div>
                    <Button type="button" onClick={handleApplySchoolFees} disabled={applyingFees || loadingSettings || !settings.school_fee_amount} className="gap-2">
                      {applyingFees ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Apply to learners
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Creates a pending invoice for each learner for the selected month. Existing invoices are preserved and skipped, so retrying will not duplicate fees.</p>
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
          <CardHeader className="border-b"><CardTitle>Manual payment verification</CardTitle><CardDescription>Learner reports are unverified until you confirm the receipt. Approving a report applies its amount to the linked invoice; rejecting it does not change the balance.</CardDescription></CardHeader>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{manualReports.length} report(s) awaiting review</p><Button type="button" variant="outline" size="sm" onClick={() => void loadManualReports()}>Refresh</Button></div>
            {manualReports.length === 0 ? <p className="text-sm text-muted-foreground">No pending manual payment reports.</p> : manualReports.map(report => (
              <div key={report.report_id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{report.learner_name} · USD {Number(report.amount).toFixed(2)}</p><p className="text-xs text-muted-foreground">Invoice #{report.payment_id} · {report.month} {report.year} · {String(report.provider).replace(/^reported:/, "").replace(/_/g, " ")}</p></div><span className="text-xs rounded-full border px-2 py-1">Unverified</span></div>
                <p className="text-sm">Receipt/reference: <span className="font-mono">{report.provider_reference || "Not supplied (cash)"}</span></p>
                <p className="text-xs text-muted-foreground">Reported {new Date(report.created_at).toLocaleString()} · Current invoice paid: USD {Number(report.amount_paid || 0).toFixed(2)}</p>
                <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={reviewingReport !== null} onClick={() => void reviewManualReport(report, true)}>{reviewingReport === Number(report.report_id) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and apply payment"}</Button><Button type="button" size="sm" variant="outline" disabled={reviewingReport !== null} onClick={() => void reviewManualReport(report, false)}>Reject report</Button></div>
              </div>
            ))}
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
