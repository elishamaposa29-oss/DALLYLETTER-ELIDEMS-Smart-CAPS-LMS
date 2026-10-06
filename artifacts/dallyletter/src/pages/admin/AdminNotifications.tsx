import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListNotifications, useCreateNotification, useListUsers, getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Bell, Send, AlertTriangle, BookOpen, Video, Info, Trash2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateNotificationBodyType } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const createNotificationSchema = z.object({
  recipientId: z.coerce.number().optional().nullable(),
  title: z.string().min(2, "Title is required"),
  message: z.string().min(5, "Message is required"),
  type: z.enum([CreateNotificationBodyType.payment_overdue, CreateNotificationBodyType.new_lesson, CreateNotificationBodyType.class_starting, CreateNotificationBodyType.system, CreateNotificationBodyType.general]),
  recipientType: z.enum(["all", "specific"]),
  sendEmail: z.boolean(),
});

export default function AdminNotifications() {
  const { user } = useAuth();
  const { data: notifications, isLoading } = useListNotifications();
  const { data: users } = useListUsers();
  const createNotificationMutation = useCreateNotification();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof createNotificationSchema>>({
    resolver: zodResolver(createNotificationSchema),
    defaultValues: { title: "", message: "", type: CreateNotificationBodyType.general, recipientType: "all", recipientId: null, sendEmail: false },
  });

  const recipientType = form.watch("recipientType");

  const onSubmit = (values: z.infer<typeof createNotificationSchema>) => {
    const data = {
      title: values.title,
      message: values.message,
      type: values.type,
      recipientId: values.recipientType === "specific" ? values.recipientId : null
    };
    createNotificationMutation.mutate({ data }, {

      onSuccess: async () => {
        if (values.sendEmail) {
          try {
            const token = localStorage.getItem("dallyletter_token");
            const emailRes = await fetch(getApiUrl("/api/email/send"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ subject: values.title, text: values.message, recipientId: values.recipientType === "specific" ? values.recipientId : null }) });
            if (!emailRes.ok) throw new Error((await emailRes.json()).error || "Email delivery failed");
            toast({ title: "Notification and email sent" });
          } catch (e) {
            toast({ variant: "destructive", title: "In-app notification sent; email failed", description: e instanceof Error ? e.message : "Email provider is unavailable." });
          }
        }
        toast({ title: "Notification sent successfully" });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        form.reset({ title: "", message: "", type: CreateNotificationBodyType.general, recipientType: "all", recipientId: null, sendEmail: false });
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this notification? Students who have not yet read it will no longer see it.")) return;
    const token = localStorage.getItem("dallyletter_token");
    const res = await fetch(getApiUrl(`/api/notifications/${id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      toast({ title: "Notification deleted" });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } else {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete notification." });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "payment_overdue": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "new_lesson": return <BookOpen className="h-4 w-4 text-primary" />;
      case "class_starting": return <Video className="h-4 w-4 text-secondary" />;
      case "system": return <Info className="h-4 w-4 text-blue-500" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "payment_overdue": return "border-l-red-500 bg-red-50 dark:bg-red-950/20";
      case "new_lesson": return "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20";
      case "class_starting": return "border-l-green-500 bg-green-50 dark:bg-green-950/20";
      case "system": return "border-l-amber-500 bg-amber-50 dark:bg-amber-950/20";
      default: return "border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/10";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications & Email</h1>
          <p className="text-muted-foreground">Send in-app alerts and optionally email them. Manager and owner access is protected separately from owner audit logs.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Compose */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send New Notification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl><Input placeholder="e.g. System Maintenance" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CreateNotificationBodyType.general}>General</SelectItem>
                          <SelectItem value={CreateNotificationBodyType.system}>System Alert</SelectItem>
                          <SelectItem value={CreateNotificationBodyType.payment_overdue}>Payment Overdue</SelectItem>
                          <SelectItem value={CreateNotificationBodyType.new_lesson}>New Lesson</SelectItem>
                          <SelectItem value={CreateNotificationBodyType.class_starting}>Class Starting</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="recipientType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Send to..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Users</SelectItem>
                          <SelectItem value="specific">Specific User</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {recipientType === "specific" && (
                    <FormField control={form.control} name="recipientId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select User</FormLabel>
                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {users?.map(u => (
                              <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <FormField control={form.control} name="message" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Write your message here..." className="resize-none" rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sendEmail" render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-xl border p-3">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div>
                        <FormLabel>Also send by email</FormLabel>
                        <p className="text-xs text-muted-foreground">Uses the server email provider. No email is sent unless this is enabled and provider credentials are configured.</p>
                      </div>
                    </FormItem>
                  )} />

                  <Button type="submit" className="w-full" disabled={createNotificationMutation.isPending}>
                    {createNotificationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Notification
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* History */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Recent Notifications Sent
              </CardTitle>
              <CardDescription>History of all broadcasted notifications. Click the trash icon to delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : notifications?.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground border rounded-lg bg-muted/20">
                  No notifications have been sent yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications?.slice(0, 20).map((notification) => (
                    <div key={notification.id} className={`p-4 border-l-4 rounded-lg ${getTypeColor(notification.type)} transition-colors`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="shrink-0">
                            <div className="bg-amber-500 p-1 rounded-full">
                              <Shield className="h-3 w-3 text-white" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {getIcon(notification.type)}
                            <h4 className="font-semibold text-sm truncate">{notification.title}</h4>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {new Date(notification.createdAt).toLocaleDateString()}
                          </span>
{user?.role === "owner" && <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(notification.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>}
                        </div>
                      </div>
                      <p className="text-sm text-foreground/80 mt-2 ml-7">{notification.message}</p>
                      <div className="flex gap-2 mt-2 ml-7">
                        <Badge variant="outline" className="text-xs capitalize border-amber-300 text-amber-700 bg-amber-50">
                          Admin Notice
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">{notification.type.replace(/_/g, ' ')}</Badge>
                        <Badge variant="secondary" className="text-xs">
                          {notification.recipientId ? 'Specific User' : 'All Users'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
