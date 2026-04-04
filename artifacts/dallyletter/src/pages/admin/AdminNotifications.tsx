import { DashboardLayout } from "@/components/DashboardLayout";
import { useListNotifications, useCreateNotification, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import { Loader2, Bell, Send, AlertTriangle, BookOpen, Video, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateNotificationBodyType } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";

const createNotificationSchema = z.object({
  recipientId: z.coerce.number().optional().nullable(),
  title: z.string().min(2, "Title is required"),
  message: z.string().min(5, "Message is required"),
  type: z.enum([CreateNotificationBodyType.payment_overdue, CreateNotificationBodyType.new_lesson, CreateNotificationBodyType.class_starting, CreateNotificationBodyType.system, CreateNotificationBodyType.general]),
  recipientType: z.enum(["all", "specific"]),
});

export default function AdminNotifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const { data: users } = useListUsers();
  const createNotificationMutation = useCreateNotification();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof createNotificationSchema>>({
    resolver: zodResolver(createNotificationSchema),
    defaultValues: {
      title: "",
      message: "",
      type: CreateNotificationBodyType.general,
      recipientType: "all",
      recipientId: null,
    },
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
      onSuccess: () => {
        toast({ title: "Notification sent successfully" });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        form.reset({
          title: "",
          message: "",
          type: CreateNotificationBodyType.general,
          recipientType: "all",
          recipientId: null,
        });
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Broadcast Notifications</h1>
          <p className="text-muted-foreground">Send alerts and announcements to users.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. System Maintenance" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
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
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recipientType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipient</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Send to..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">All Users</SelectItem>
                            <SelectItem value="specific">Specific User</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {recipientType === "specific" && (
                    <FormField
                      control={form.control}
                      name="recipientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select User</FormLabel>
                          <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select user" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users?.map(u => (
                                <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.role})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Write your message here..." className="resize-none" rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={createNotificationMutation.isPending}>
                    {createNotificationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Notification
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Recent Notifications Sent
              </CardTitle>
              <CardDescription>History of all broadcasted notifications.</CardDescription>
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
                <div className="space-y-4">
                  {notifications?.slice(0, 10).map((notification) => (
                    <div key={notification.id} className="p-4 border rounded-lg bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {getIcon(notification.type)}
                          <h4 className="font-semibold">{notification.title}</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 mb-3">{notification.message}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{notification.type.replace('_', ' ')}</Badge>
                        <Badge variant="secondary" className="text-xs">
                          {notification.recipientId ? 'Specific User' : 'Broadcast (All)'}
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
