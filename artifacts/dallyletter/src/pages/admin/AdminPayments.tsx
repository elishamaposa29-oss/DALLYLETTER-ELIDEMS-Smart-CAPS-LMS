import { DashboardLayout } from "@/components/DashboardLayout";
import { useListPayments, useRecordPayment, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import { Loader2, Plus, Receipt, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RecordPaymentBodyStatus } from "@workspace/api-client-react";

const recordPaymentSchema = z.object({
  studentId: z.coerce.number().min(1, "Student is required"),
  amount: z.coerce.number().min(1, "Amount is required"),
  month: z.string().min(1, "Month is required"),
  year: z.coerce.number().min(2000, "Valid year required"),
  status: z.enum([RecordPaymentBodyStatus.paid, RecordPaymentBodyStatus.pending, RecordPaymentBodyStatus.overdue]),
  notes: z.string().optional(),
});

export default function AdminPayments() {
  const { data: payments, isLoading: paymentsLoading } = useListPayments();
  const { data: users } = useListUsers();
  const recordPaymentMutation = useRecordPayment();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const students = users?.filter(u => u.role === "student") || [];

  const filteredPayments = payments?.filter(payment => {
    const matchesSearch = payment.studentName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const form = useForm<z.infer<typeof recordPaymentSchema>>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      studentId: 0,
      amount: 0,
      month: new Date().toLocaleString('default', { month: 'long' }),
      year: new Date().getFullYear(),
      status: RecordPaymentBodyStatus.paid,
      notes: "",
    },
  });

  const onSubmit = (values: z.infer<typeof recordPaymentSchema>) => {
    recordPaymentMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Payment recorded successfully" });
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Paid</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge>;
      case "overdue": return <Badge variant="destructive">Overdue</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payments Management</h1>
            <p className="text-muted-foreground">Record and track student tuition fees.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Record New Payment</DialogTitle>
                <DialogDescription>
                  Enter the details for the student's payment.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="studentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student</FormLabel>
                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Student" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {students.map(s => (
                              <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.email})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={RecordPaymentBodyStatus.paid}>Paid</SelectItem>
                              <SelectItem value={RecordPaymentBodyStatus.pending}>Pending</SelectItem>
                              <SelectItem value={RecordPaymentBodyStatus.overdue}>Overdue</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="month"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Month</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Paid via EFT" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={recordPaymentMutation.isPending}>
                      {recordPaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Record Payment
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
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

        {paymentsLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                All Payment Records
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
