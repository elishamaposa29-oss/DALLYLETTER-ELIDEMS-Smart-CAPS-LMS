import { DashboardLayout } from "@/components/DashboardLayout";
import { useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Receipt, CreditCard, ExternalLink, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const PAYPAL_ME_URL = import.meta.env.VITE_PAYPAL_ME_URL || "";

export default function StudentPayments() {
  const { data: payments, isLoading } = useListPayments();
  const { toast } = useToast();
  const [notifying, setNotifying] = useState(false);
  const [reported, setReported] = useState(false);

  const hasOverdue = payments?.some(p => p.status === "overdue");
  const totalOwed = payments?.filter(p => p.status !== "paid").reduce((sum, p) => sum + p.amount, 0) || 0;
  const paidCount = payments?.filter(p => p.status === "paid").length || 0;
  const overdueCount = payments?.filter(p => p.status === "overdue").length || 0;

  const handlePayNow = () => {
    if (PAYPAL_ME_URL) {
      window.open(PAYPAL_ME_URL, "_blank", "noopener,noreferrer");
    } else {
      toast({ variant: "destructive", title: "Payment not yet configured", description: "Please contact your school administrator." });
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
        toast({ title: "School Notified ✓", description: "Your school has been notified of your payment and will confirm your records shortly." });
      } else {
        throw new Error("Failed");
      }
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

  const PayPalLogo = () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 4.054a.75.75 0 0 1 .737-.632h7.01c2.694 0 4.608.816 5.48 2.358.398.71.539 1.454.441 2.279-.024.198-.057.4-.1.608-.47 2.41-2.112 3.685-4.875 3.99l-.044.004c.004.013.007.026.01.038 1.07.245 1.624 1.052 1.492 2.289-.11 1.03-.64 2.046-1.465 2.787-.876.786-1.97 1.162-3.554 1.162H7.076zm3.36-13.23a.75.75 0 0 0-.738.632l-.607 3.849a.42.42 0 0 0 .414.485h.987c1.83 0 2.764-.667 3.032-2.098.05-.262.064-.497.046-.717-.183-1.578-1.274-2.15-3.134-2.15zm8.624-3.78C18.16 2.853 16.418 2 13.77 2H6.485a.96.96 0 0 0-.948.811L2.344 20.64a.747.747 0 0 0 .737.86h4.083l1.024-6.49-.032.203a.75.75 0 0 1 .738-.632h1.536c3.024 0 5.392-1.23 6.085-4.79.02-.104.038-.205.053-.304.21-1.34-.002-2.25-.708-3.16z"/>
    </svg>
  );

  return (
    <DashboardLayout>
      <div className="space-y-7">

        {/* Header */}
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

        {/* Overdue Alert + Pay Button */}
        {hasOverdue && (
          <Card className="border-red-200 dark:border-red-900 shadow-sm overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
            <CardContent className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="bg-red-100 dark:bg-red-900/50 p-2.5 rounded-xl shrink-0">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-red-700 dark:text-red-400 text-lg leading-tight">
                    Your account has overdue payments
                  </h3>
                  <p className="text-sm text-red-600/80 dark:text-red-400/70 mt-1">
                    Pay your outstanding school fees immediately to avoid account suspension and interruption to your studies.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 bg-[#003087] hover:bg-[#00256e] text-white gap-2 h-12 text-base font-bold shadow-md"
                  onClick={handlePayNow}
                >
                  <PayPalLogo />
                  Pay Now via PayPal
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </Button>

                {!reported ? (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 h-12 border-slate-300"
                    onClick={handleNotifyAdmin}
                    disabled={notifying}
                  >
                    {notifying
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Bell className="h-4 w-4" />
                    }
                    I've Paid — Notify School
                  </Button>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-lg px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">School has been notified!</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-4 text-center">
                After paying via PayPal, click "I've Paid" so your school can confirm and update your records.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Always-visible Pay button when no overdue */}
        {!hasOverdue && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/15 p-2.5 rounded-xl">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Pay School Fees</p>
                  <p className="text-sm text-muted-foreground">Settle upcoming or advance payments securely via PayPal</p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  className="flex-1 sm:flex-none bg-[#003087] hover:bg-[#00256e] text-white gap-2 font-semibold"
                  onClick={handlePayNow}
                >
                  <PayPalLogo />
                  Pay via PayPal
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </Button>
                {!reported ? (
                  <Button variant="outline" className="flex-1 sm:flex-none gap-2" onClick={handleNotifyAdmin} disabled={notifying}>
                    {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                    Notify School
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-sm px-3">
                    <CheckCircle2 className="h-4 w-4" /> Notified!
                  </div>
                )}
              </div>
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
                    <div
                      key={payment.id}
                      className="py-4 px-6 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-muted p-2.5 rounded-full hidden sm:flex shrink-0">
                          {getStatusIcon(payment.status)}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-base">
                            {payment.month} {payment.year}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Recorded {new Date(payment.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {payment.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">{payment.notes}</p>
                          )}
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
