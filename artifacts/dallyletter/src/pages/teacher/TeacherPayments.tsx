import { DashboardLayout } from "@/components/DashboardLayout";
import { useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Receipt, AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TeacherPayments() {
  const { data: payments, isLoading } = useListPayments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredPayments = payments?.filter(payment => {
    const matchesSearch = payment.studentName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">Paid</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">Pending</Badge>;
      case "overdue": return <Badge variant="destructive">Overdue</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Payments</h1>
          <p className="text-muted-foreground">View payment records for students in your classes.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search students..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
            </CardHeader>
            <CardContent>
              {filteredPayments?.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  No payment records found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-muted/50 uppercase">
                      <tr>
                        <th className="px-4 py-3 font-medium">Student Name</th>
                        <th className="px-4 py-3 font-medium">Period</th>
                        <th className="px-4 py-3 font-medium">Amount</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Date Recorded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredPayments?.map((payment) => (
                        <tr key={payment.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-4 font-medium text-foreground">{payment.studentName}</td>
                          <td className="px-4 py-4">{payment.month} {payment.year}</td>
                          <td className="px-4 py-4">${payment.amount.toFixed(2)}</td>
                          <td className="px-4 py-4">{getStatusBadge(payment.status)}</td>
                          <td className="px-4 py-4 text-muted-foreground">{new Date(payment.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
