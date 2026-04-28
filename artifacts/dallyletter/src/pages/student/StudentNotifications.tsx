import { DashboardLayout } from "@/components/DashboardLayout";
import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Bell, AlertTriangle, BookOpen, Video, Info, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";

export default function StudentNotifications() {
  const { data: notifications, isLoading } = useListNotifications();
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

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
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
              notifications?.map((notification) => (
                <Card key={notification.id} className={`transition-colors ${!notification.isRead ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
                  <CardContent className="p-4 sm:p-6 flex gap-4">
                    <div className="shrink-0 mt-1">
                      <div className={`p-2 rounded-full ${!notification.isRead ? 'bg-background shadow-sm' : 'bg-muted'}`}>
                        {getIcon(notification.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-1">
                        <h3 className={`text-base font-semibold ${!notification.isRead ? 'text-foreground' : 'text-foreground/80'}`}>
                          {notification.title}
                        </h3>
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
                            className="h-8 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
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
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
