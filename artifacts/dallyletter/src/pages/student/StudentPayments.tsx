import { DashboardLayout } from "@/components/DashboardLayout";
import { useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Receipt, CreditCard, ExternalLink, Bell, Copy, Phone, Bitcoin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface Settings {
  paypal_url: string;
  trust_wallet: string;
  ecocash_number: string;
  payment_instructions: string;
}

export default function StudentPayments() {
  const { data: payments, isLoading } = useListPayments();
  const { toast } = useToast();
  const [notifying, setNotifying] = useState(false);
  const [reported, setReported] = useState(false);
  const [settings, setSettings] = useState<Settings>({ paypal_url: "", trust_wallet: "", ecocash_number: "", payment_instructions: "" });

  useEffect(() => {
    const token = localStorage.getItem("dallyletter_token");
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(() => {});
  }, []);

  const hasOverdue = payments?.some(p => p.status === "overdue");
  const totalOwed = payments?.filter(p => p.status !== "paid").reduce((sum, p) => sum + p.amount, 0) || 0;
  const paidCount = payments?.filter(p => p.status === "paid").length || 0;
  const overdueCount = payments?.filter(p => p.status === "overdue").length || 0;

  const handlePayPal = () => {
    if (settings.paypal_url) {
      const url = settings.paypal_url.startsWith("http") ? settings.paypal_url : `https://paypal.me/${settings.paypal_url}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast({ variant: "destructive", title: "PayPal not configured", description: "Please contact your school administrator." });
    }
  };

  const handleCopyWallet = () => {
    if (settings.trust_wallet) {
      navigator.clipboard.writeText(settings.trust_wallet).then(() => {
        toast({ title: "Wallet address copied!", description: "Paste it in Trust Wallet to send payment." });
      });
    }
  };

  const handleEcoCash = () => {
    if (settings.ecocash_number) {
      window.open(`tel:${settings.ecocash_number}`);
    }
  };

  const handleNotifyAdmin = async () => {
    setNotifying(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch("/api/payments/notify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ amount: totalOwed }),
      });
      if (res.ok) {
        setReported(true);
        toast({ title: "School Notified ✓", description: "Your school has been notified and will confirm your payment shortly." });
      } else throw new Error("Failed");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not notify the school. Please try again." });
    } finally {
      setNotifying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case "pending": return <Clock className="h-5 w-5 text-amber-500" />;
      case "overdue": return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-300 font-semibold">✓ Paid</Badge>;
      case "pending": return <Badge className="bg-amber-500/10 text-amber-700 border border-amber-300 font-semibold">⏳ Pending</Badge>;
      case "overdue": return <Badge className="bg-red-500/10 text-red-700 border border-red-300 font-semibold">⚠ Overdue</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const hasAnyPaymentMethod = settings.paypal_url || settings.trust_wallet || settings.ecocash_number;

  const PaymentMethods = () => (
    <div className="space-y-3">
      {settings.payment_instructions && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 border">{settings.payment_instructions}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* PayPal */}
        {settings.paypal_url && (
          <Button
            onClick={handlePayPal}
            className="h-auto py-3 flex-col gap-1.5 bg-[#003087] hover:bg-[#00256e] text-white"
          >
            <div className="flex items-center gap-2 font-bold">
              <span className="text-lg">P</span>
              PayPal
            </div>
            <span className="text-[11px] opacity-80 font-normal">Pay online</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Button>
        )}

        {/* Trust Wallet */}
        {settings.trust_wallet && (
          <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
              <Bitcoin className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-sm text-amber-800 dark:text-amber-400">Trust Wallet (Crypto)</span>
            </div>
            <p className="text-[10px] font-mono text-amber-700 dark:text-amber-500 break-all mb-2 leading-tight">
              {settings.trust_wallet}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={handleCopyWallet}
            >
              <Copy className="h-3 w-3" /> Copy Address
            </Button>
          </div>
        )}

        {/* EcoCash */}
        {settings.ecocash_number && (
          <div className="border rounded-lg p-3 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-sm text-emerald-800 dark:text-emerald-400">EcoCash / Mobile</span>
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mb-2">{settings.ecocash_number}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              onClick={handleEcoCash}
            >
              <Phone className="h-3 w-3" /> Send Money
            </Button>
          </div>
        )}

        {!hasAnyPaymentMethod && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-4">
            Payment methods not yet configured. Please contact your school administrator.
          </div>
        )}
      </div>

      {/* Notify school after paying */}
      {hasAnyPaymentMethod && (
        <div className="pt-2">
          {!reported ? (
            <Button
              variant="outline"
              className="w-full gap-2 h-10 border-slate-300"
              onClick={handleNotifyAdmin}
              disabled={notifying}
            >
              {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              I've Paid — Notify School
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">School has been notified!</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center mt-2">
            After paying via any method, click "I've Paid" so your school can confirm and update your records.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-7">

        <div>
          <h1 className="text-3xl font-bold tracking-tight">School Fees</h1>
          <p className="text-muted-foreground mt-1">View your payment history and settle outstanding balances.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Paid</p>
              </div>
              <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-400">{paidCount}</p>
              <p className="text-xs text-emerald-600/70 mt-1 uppercase tracking-wide">months</p>
            </CardContent>
          </Card>

          <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Overdue</p>
              </div>
              <p className="text-4xl font-bold text-red-700 dark:text-red-400">{overdueCount}</p>
              <p className="text-xs text-red-600/70 mt-1 uppercase tracking-wide">months</p>
            </CardContent>
          </Card>

          <Card className="col-span-2 lg:col-span-1 bg-primary/5 border-primary/25">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-primary">Outstanding</p>
              </div>
              <p className="text-4xl font-bold text-primary">${totalOwed.toFixed(2)}</p>
              <p className="text-xs text-primary/70 mt-1 uppercase tracking-wide">total owed</p>
            </CardContent>
          </Card>
        </div>

        {/* Overdue Alert + Payment Options */}
        {hasOverdue && (
          <Card className="border-red-200 dark:border-red-900 shadow-sm overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
            <CardHeader className="pb-2">
              <div className="flex items-start gap-4">
                <div className="bg-red-100 dark:bg-red-900/50 p-2.5 rounded-xl shrink-0">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-red-700 dark:text-red-400 text-lg">Your account has overdue payments</CardTitle>
                  <CardDescription className="text-red-600/80 dark:text-red-400/70 mt-1">
                    Pay immediately to avoid account suspension and interruption to your studies.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PaymentMethods />
            </CardContent>
          </Card>
        )}

        {/* Always-visible payment options when no overdue */}
        {!hasOverdue && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-primary" />
                Pay School Fees
              </CardTitle>
              <CardDescription>Settle upcoming or advance payments using any method below.</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentMethods />
            </CardContent>
          </Card>
        )}

        {/* Payment History */}
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Receipt className="h-5 w-5 text-primary" />
                Payment Records
              </CardTitle>
              <CardDescription>Full history of your monthly school fee payments.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {payments?.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Receipt className="h-14 w-14 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">No payment records yet</p>
                  <p className="text-sm mt-1">Your payment history will appear here once recorded by your school.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {payments?.map((payment) => (
                    <div key={payment.id} className="py-4 px-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="bg-muted p-2.5 rounded-full hidden sm:flex shrink-0">
                          {getStatusIcon(payment.status)}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-base">{payment.month} {payment.year}</p>
                          <p className="text-sm text-muted-foreground">
                            Recorded {new Date(payment.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {payment.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{payment.notes}</p>}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1.5">
                        <p className="font-bold text-2xl tracking-tight">${payment.amount.toFixed(2)}</p>
                        {getStatusBadge(payment.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
