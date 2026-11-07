import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Clock, AlertTriangle, XCircle, Receipt, CreditCard, ExternalLink, Bell, Copy, Phone, Bitcoin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface Settings {
  paynow_url: string;
  paypal_url: string;
  trust_wallet: string;
  ecocash_number: string;
  payment_instructions: string;
  school_fee_amount: string;
}

export default function StudentPayments() {
  const { data: payments, isLoading, refetch: refetchPayments } = useListPayments();
  const { toast } = useToast();
  const [notifying, setNotifying] = useState(false);
  const [reported, setReported] = useState(false);
  const [manualReportAmount, setManualReportAmount] = useState("");
  const [manualReportMethod, setManualReportMethod] = useState("ecocash");
  const [manualReportReference, setManualReportReference] = useState("");
  const [settings, setSettings] = useState<Settings>({ paynow_url: "", paypal_url: "", trust_wallet: "", ecocash_number: "", payment_instructions: "", school_fee_amount: "" });
  const [paynowBusy, setPaynowBusy] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paynowReady, setPaynowReady] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl("/api/settings"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(() => {});
    fetch(getApiUrl("/api/payments/paynow/status"), { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("Paynow status unavailable"); return r.json(); })
      .then(data => setPaynowReady(data.configured === true))
      .catch(() => setPaynowReady(false));
    fetch(getApiUrl("/api/payments/paypal/status"), { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("PayPal status unavailable"); return r.json(); })
      .then(data => setPaypalReady(data.configured === true))
      .catch(() => setPaypalReady(false));
    const query = new URLSearchParams(window.location.search);
    const orderId = query.get("token");
    if (query.get("paypal") === "return" && orderId) {
      const authToken = localStorage.getItem("dallyletter_token");
      fetch(getApiUrl("/api/payments/paypal/capture"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
        body: JSON.stringify({ orderId }),
      })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.captured !== true) throw new Error(data.error || "PayPal capture is not confirmed.");
          toast({ title: "PayPal payment submitted", description: "PayPal has completed capture. Your school-fee record will update after the verified payment notification is processed." });
          void refetchPayments();
        })
        .catch(error => toast({ variant: "destructive", title: "PayPal confirmation pending", description: error instanceof Error ? error.message : "Refresh payment records after checking with PayPal." }));
    }
    const paynowReference = query.get("reference");
    if (paynowReference) {
      toast({ title: "Paynow confirmation pending", description: "Your payment will be marked paid only after Dallyletter receives and verifies Paynow's signed result notification. Do not pay again while confirmation is processing." });
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        void refetchPayments().then(result => {
          const settled = Array.isArray(result.data) && result.data.some((payment: any) => String(payment.notes || "").includes("Paynow reference " + paynowReference) && payment.status === "paid");
          if (settled) {
            window.clearInterval(timer);
            toast({ title: "Paynow payment verified", description: "Your school-fee record has been updated from Paynow's verified confirmation." });
          } else if (attempts >= 12) {
            window.clearInterval(timer);
          }
        }).catch(() => { if (attempts >= 12) window.clearInterval(timer); });
      }, 5000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, []);

  const hasOverdue = payments?.some(p => p.status === "overdue");
  const nextPayablePayment = payments
    ?.filter((p: any) => p.status === "pending" || p.status === "overdue" || p.status === "partially_paid")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || Number(a.id) - Number(b.id))[0];
  const totalOwed = payments?.filter((p: any) => p.status === "pending" || p.status === "overdue" || p.status === "partially_paid").reduce((sum, p: any) => sum + Math.max(0, Number(p.amount) - Number(p.amountPaid || 0)), 0) || 0;
  const paidCount = payments?.filter(p => p.status === "paid").length || 0;
  const overdueCount = payments?.filter(p => p.status === "overdue").length || 0;

  const handlePaynowLive = async () => {
    if (!nextPayablePayment) { toast({ variant: "destructive", title: "Nothing to pay", description: "There is no outstanding fee record." }); return; }
    setPaynowBusy(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const due = Math.max(0, Number((nextPayablePayment as any).amount) - Number((nextPayablePayment as any).amountPaid || 0));
      const chosenAmount = paymentAmount.trim() ? Number(paymentAmount) : due;
      if (!Number.isFinite(chosenAmount) || chosenAmount <= 0 || chosenAmount > 100000) throw new Error("Enter a valid payment amount greater than zero.");
      const r = await fetch(getApiUrl("/api/payments/paynow/create"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ amount: chosenAmount }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.checkoutUrl) throw new Error(d.error || "Could not start Paynow checkout");
      window.location.assign(d.checkoutUrl);
    } catch (e) { toast({ variant: "destructive", title: "Payment could not start", description: e instanceof Error ? e.message : "Try again." }); }
    finally { setPaynowBusy(false); }
  };

  const handlePayPal = async () => {
    if (!nextPayablePayment) {
      toast({ variant: "destructive", title: "Nothing to pay", description: "There is no outstanding fee record." });
      return;
    }
    setPaynowBusy(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/payments/paypal/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ amount: paymentAmount.trim() ? Number(paymentAmount) : undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || "Could not start PayPal checkout.");
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      toast({ variant: "destructive", title: "PayPal payment could not start", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setPaynowBusy(false);
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
    if (!nextPayablePayment) {
      toast({ variant: "destructive", title: "No unpaid invoice", description: "There is no outstanding school-fee invoice to attach this report to." });
      return;
    }
    setNotifying(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch(getApiUrl("/api/payments/notify-admin"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ paymentId: nextPayablePayment.id, amount: manualReportAmount.trim() ? Number(manualReportAmount) : Math.max(0, Number((nextPayablePayment as any).amount) - Number((nextPayablePayment as any).amountPaid || 0)), method: manualReportMethod, providerReference: manualReportReference.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReported(true);
        toast({ title: "Payment report submitted", description: "Report " + data.reference + " is awaiting Owner verification. Your fee balance will not change until it is verified." });
      } else throw new Error(data.error || "Could not submit payment report.");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not notify the school. Please try again." });
    } finally {
      setNotifying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case "partially_paid": return <Clock className="h-5 w-5 text-sky-600" />;
      case "pending": return <Clock className="h-5 w-5 text-amber-500" />;
      case "overdue": return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case "failed": return <XCircle className="h-5 w-5 text-red-600" />;
      case "cancelled": return <XCircle className="h-5 w-5 text-muted-foreground" />;
      case "refunded": return <CheckCircle2 className="h-5 w-5 text-sky-600" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-300 font-semibold">✓ Paid</Badge>;
      case "pending": return <Badge className="bg-amber-500/10 text-amber-700 border border-amber-300 font-semibold">⏳ Pending</Badge>;
      case "partially_paid": return <Badge className="bg-sky-500/10 text-sky-700 border border-sky-300 font-semibold">Partially paid</Badge>;
      case "overdue": return <Badge className="bg-red-500/10 text-red-700 border border-red-300 font-semibold">⚠ Overdue</Badge>;
      case "failed": return <Badge className="bg-red-500/10 text-red-700 border border-red-300 font-semibold">✕ Payment failed</Badge>;
      case "cancelled": return <Badge variant="outline">Cancelled</Badge>;
      case "refunded": return <Badge variant="outline" className="border-sky-300 text-sky-700">Refunded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const hasAnyPaymentMethod = paynowReady || paypalReady || settings.trust_wallet || settings.ecocash_number;

  const PaymentMethods = () => (
    <div className="space-y-3">
      {settings.school_fee_amount && Number(settings.school_fee_amount) > 0 && (
        <p className="text-sm rounded-lg p-3 border bg-muted/50">Owner-published standard school fee: <strong>USD {Number(settings.school_fee_amount).toFixed(2)}</strong>. Your actual fee and remaining balance are shown in your records below.</p>
      )}
      {settings.payment_instructions && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 border">{settings.payment_instructions}</p>
      )}
      {(paynowReady || paypalReady) && nextPayablePayment && (
        <div className="space-y-2 rounded-lg border p-3">
          <label htmlFor="school-fee-payment-amount" className="block text-sm font-semibold">Checkout amount to pay now (USD)</label>
          <input id="school-fee-payment-amount" type="number" min="0.01" max="100000" step="0.01" inputMode="decimal" className="w-full rounded-md border bg-background p-2 text-foreground" placeholder={String(Math.max(0, Number((nextPayablePayment as any).amount)-Number((nextPayablePayment as any).amountPaid||0)).toFixed(2))} value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} />
          <p className="text-xs text-muted-foreground">You may pay part of the balance or pay extra. Verified extra funds are recorded as credit; they are not lost. Leave blank to pay the full remaining balance on the next fee record.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Paynow */}
      {paynowReady && (<Button onClick={handlePaynowLive} disabled={paynowBusy || !nextPayablePayment} className="h-auto py-3 flex-col gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"><div className="font-bold">{paynowBusy ? "Starting…" : "Paynow"}</div><span className="text-[11px] opacity-80 font-normal">{nextPayablePayment ? "Next fee balance: $" + Math.max(0,Number((nextPayablePayment as any).amount)-Number((nextPayablePayment as any).amountPaid||0)).toFixed(2) : "No unpaid fee"}</span><ExternalLink className="h-3 w-3 opacity-70" /></Button>)}

      {/* PayPal */}
        {paypalReady && (
          <Button
            onClick={handlePayPal}
            disabled={paynowBusy || !nextPayablePayment}
            className="h-auto py-3 flex-col gap-1.5 bg-[#003087] hover:bg-[#00256e] text-white"
          >
            <div className="flex items-center gap-2 font-bold">
              <span className="text-lg">P</span>
              PayPal
            </div>
            <span className="text-[11px] opacity-80 font-normal">
              {nextPayablePayment ? "Next fee balance: $" + Math.max(0,Number(nextPayablePayment.amount)-Number((nextPayablePayment as any).amountPaid||0)).toFixed(2) : "No unpaid fee"}
            </span>
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
        <div className="space-y-3 pt-2">
          <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
            <label className="text-xs font-semibold">Amount paid (USD)<input type="number" min="0.01" max="100000" step="0.01" value={manualReportAmount} onChange={e=>setManualReportAmount(e.target.value)} placeholder={totalOwed.toFixed(2)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm"/></label>
            <label className="text-xs font-semibold">Payment method<select value={manualReportMethod} onChange={e=>setManualReportMethod(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm"><option value="ecocash">EcoCash / Econet</option><option value="bank_transfer">Bank transfer</option><option value="crypto">Crypto / wallet</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
            <label className="text-xs font-semibold">Receipt / transaction reference<input value={manualReportReference} onChange={e=>setManualReportReference(e.target.value)} maxLength={120} placeholder="Enter receipt reference (cash optional)" className="mt-1 w-full rounded-md border bg-background p-2 text-sm"/></label>
          </div>
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
                        {Number((payment as any).amountPaid || 0) > 0 && <p className="text-xs text-muted-foreground">Paid: ${Number((payment as any).amountPaid).toFixed(2)} · Balance: ${Math.max(0,Number(payment.amount)-Number((payment as any).amountPaid)).toFixed(2)} · Credit: ${Math.max(0,Number((payment as any).amountPaid)-Number(payment.amount)).toFixed(2)}</p>}
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
