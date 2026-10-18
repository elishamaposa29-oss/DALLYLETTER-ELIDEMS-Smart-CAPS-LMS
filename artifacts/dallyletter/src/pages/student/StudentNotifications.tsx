import { useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Bell, AlertTriangle, BookOpen, Video, Info, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";

export default function StudentNotifications() {
  const [devicePermission, setDevicePermission] = useState<NotificationPermission>(() => typeof Notification !== "undefined" ? Notification.permission : "default");
  const [pushTesting, setPushTesting] = useState(false);
  const [pushTestMessage, setPushTestMessage] = useState("");
  const [pushTestError, setPushTestError] = useState("");
  const runPushTest = async () => {
    setPushTesting(true); setPushTestMessage(""); setPushTestError("");
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/push/test"), { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || `Push test could not be queued (HTTP ${response.status})`);
      setPushTestMessage(result.message || `Push test queued (ID ${result.notificationId}). Delivery is still being processed.`);
    } catch (error) { setPushTestError(error instanceof Error ? error.message : "Push test failed. Please retry."); }
    finally { setPushTesting(false); }
  };
  const enableDeviceNotifications = async () => {
    setPushTestError("");
    setPushTestMessage("");
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushTestError("This browser does not support background push. Open Dallyletter in current Chrome on Android.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setDevicePermission(permission);
      if (permission !== "granted") {
        if (permission === "denied") setPushTestError("Notifications are blocked in browser settings. Allow notifications for Dallyletter, then retry.");
        return;
      }
      const authToken = localStorage.getItem("dallyletter_token") ?? "";
      const headers = { Authorization: "Bearer " + authToken };
      const configResponse = await fetch(getApiUrl("/api/push/config"), { headers });
      const config = await configResponse.json().catch(() => ({})) as { enabled?: boolean; publicKey?: string | null; error?: string };
      if (!configResponse.ok || !config.enabled || !config.publicKey) {
        throw new Error(config.error || "Background push is not configured on the server. The platform owner must set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT on the API service.");
      }
      const paddedKey = config.publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const decodedKey = window.atob(paddedKey + "=".repeat((4 - paddedKey.length % 4) % 4));
      const applicationServerKey = new Uint8Array(decodedKey.length);
      for (let index = 0; index < decodedKey.length; index++) applicationServerKey[index] = decodedKey.charCodeAt(index);
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
      }
      const saveResponse = await fetch(getApiUrl("/api/push/subscriptions"), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      const saved = await saveResponse.json().catch(() => ({})) as { error?: string };
      if (!saveResponse.ok) throw new Error(saved.error || "Could not register this device for push notifications.");
      setPushTestMessage("Device registered for background push. You can now run a delivery test.");
    } catch (error) {
      setPushTestError(error instanceof Error ? error.message : "Could not enable push notifications. Please retry.");
    }
  };
  const { data: notifications, isLoading } = useListNotifications();
  const [, navigate] = useLocation();
  const markReadMutation = useMarkNotificationRead();
  const queryClient = useQueryClient();

  const handleMarkAsRead = (id: number) => {
    markReadMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "payment_overdue": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "new_lesson": return <BookOpen className="h-5 w-5 text-primary" />;
      case "class_starting": return <Video className="h-5 w-5 text-secondary" />;
      case "system": return <Info className="h-5 w-5 text-blue-500" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  // Determine if notification is "admin/broadcast" type — broadcasts have recipientId = null
  const isAdminNotice = (n: { recipientId?: number | null }) => n.recipientId === null || n.recipientId === undefined;

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><p className="font-semibold text-sm">Device notifications</p><p className="text-xs text-muted-foreground">Get clickable DALLYLETTER alerts in your phone notification panel.</p></div><Button size="sm" variant={devicePermission==="granted"?"secondary":"default"} onClick={()=>void enableDeviceNotifications()} disabled={devicePermission==="granted"}>{devicePermission==="granted"?"Enabled":"Enable notifications"}</Button></div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <div className="mt-3 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Test phone push delivery</p><p className="text-xs text-muted-foreground">Queues a real push test for this signed-in device.</p></div><Button size="sm" variant="outline" disabled={pushTesting || devicePermission !== "granted"} onClick={() => void runPushTest()}>{pushTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test push delivery</Button></div>{devicePermission !== "granted" && <p className="mt-2 text-xs text-muted-foreground">Enable device notifications first, then retry.</p>}{pushTestMessage && <p role="status" className="mt-2 text-sm text-emerald-700">{pushTestMessage}</p>}{pushTestError && <p role="alert" className="mt-2 text-sm text-destructive">{pushTestError}</p>}</div>
            <p className="text-muted-foreground">Updates on your classes, lessons, and account status.</p>
          </div>
          {unreadCount > 0 && (
            <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
              {unreadCount} unread
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {notifications?.length === 0 ? (
              <div className="text-center p-12 border rounded-lg bg-card">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground">All caught up!</h3>
                <p className="text-muted-foreground mt-1">You don't have any notifications.</p>
              </div>
            ) : (
              notifications?.map((notification) => {
                const admin = isAdminNotice(notification);
                return (
                  <Card
                    key={notification.id}
                    className={`transition-colors cursor-pointer ${
                      admin
                        ? !notification.isRead
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 border-l-4 border-l-amber-400'
                          : 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800/50 border-l-4 border-l-amber-300'
                        : !notification.isRead
                          ? 'bg-primary/5 border-primary/20'
                          : 'bg-card'
                    }`}
                  >
                    <CardContent className="p-4 sm:p-6 flex gap-4">
                      <div className="shrink-0 mt-1">
                        <div className={`p-2 rounded-full relative ${!notification.isRead ? 'bg-background shadow-sm' : 'bg-muted'}`}>
                          {getIcon(notification.type)}
                          {/* Admin badge overlay */}
                          {admin && (
                            <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5">
                              <Shield className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`text-base font-semibold ${!notification.isRead ? 'text-foreground' : 'text-foreground/80'}`}>
                              {notification.title}
                            </h3>
                            {admin && (
                              <Badge className="text-[10px] py-0 px-1.5 bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700">
                                Admin Notice
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(notification.createdAt).toLocaleDateString()} at {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-sm ${!notification.isRead ? 'text-foreground/90' : 'text-muted-foreground'}`}>
                          {notification.message}
                        </p>
                        {!notification.isRead && (
                          <div className="mt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-8 px-2 text-xs ${admin ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-100' : 'text-primary hover:text-primary hover:bg-primary/10'}`}
                              onClick={() => handleMarkAsRead(notification.id)}
                              disabled={markReadMutation.isPending}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              Mark as read
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
