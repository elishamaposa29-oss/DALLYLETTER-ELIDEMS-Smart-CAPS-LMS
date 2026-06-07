import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Key, CreditCard, Bitcoin, Phone, Save, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function AdminSettings() {
  const { toast } = useToast();

  const [settings, setSettings] = useState({
    paypal_url: "",
    trust_wallet: "",
    ecocash_number: "",
    payment_instructions: "",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("dallyletter_token");
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setSettings(data); setLoadingSettings(false); })
      .catch(() => setLoadingSettings(false));
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Settings saved", description: "Payment settings have been updated." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save settings." });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match", description: "New password and confirmation must match." });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast({ variant: "destructive", title: "Password too short", description: "New password must be at least 6 characters." });
      return;
    }
    setChangingPassword(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
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
          <p className="text-muted-foreground mt-1">Configure payment methods and security settings.</p>
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

                <Button onClick={handleSaveSettings} disabled={savingSettings} className="gap-2">
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Payment Settings
                </Button>
              </>
            )}
          </CardContent>
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
