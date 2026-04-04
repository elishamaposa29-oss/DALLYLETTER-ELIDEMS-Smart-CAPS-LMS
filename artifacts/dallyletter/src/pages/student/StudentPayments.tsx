import { DashboardLayout } from "@/components/DashboardLayout";
import { useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function StudentPayments() {
  const { data: payments, isLoading } = useListPayments();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "pending": return <Clock className="h-5 w-5 text-yellow-500" />;
      case "overdue": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">Paid</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">Pending</Badge>;
      case "overdue": return <Badge variant="destructive">Overdue</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const hasOverdue = payments?.some(p => p.status === "overdue");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>
            <p className="text-muted-foreground">Track your fee payments and outstanding balances.</p>
          </div>
        </div>

        {hasOverdue && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-destructive">You have overdue payments</h3>
              <p className="text-sm text-destructive/80 mt-1">
                Your account may be suspended soon. Please pay your outstanding school fees as soon as possible to avoid interruption to your learning.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Payment Records
              </CardTitle>
              <CardDescription>
                A record of all your monthly fee payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payments?.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  No payment records found.
                </div>
              ) : (
                <div className="divide-y">
                  {payments?.map((payment) => (
                    <div key={payment.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0">
                      <div className="flex items-center gap-4">
                        <div className="bg-muted p-2 rounded-full hidden sm:block">
                          {getStatusIcon(payment.status)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {payment.month} {payment.year}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Recorded on {new Date(payment.createdAt).toLocaleDateString()}
                          </p>
                          {payment.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              Note: {payment.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">${payment.amount.toFixed(2)}</p>
                        <div className="mt-1">
                          {getStatusBadge(payment.status)}
                        </div>
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
