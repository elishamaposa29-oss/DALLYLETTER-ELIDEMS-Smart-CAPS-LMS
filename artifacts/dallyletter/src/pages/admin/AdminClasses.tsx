import { DashboardLayout } from "@/components/DashboardLayout";
import { useListClasses, useDeleteClass } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Loader2, Search, Trash2, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListClassesQueryKey } from "@workspace/api-client-react";

export default function AdminClasses() {
  const { data: classes, isLoading } = useListClasses();
  const deleteClassMutation = useDeleteClass();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredClasses = classes?.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || 
                          c.teacherName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this class globally?")) {
      deleteClassMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Class deleted" });
          queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        }
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live": return "bg-destructive text-destructive-foreground animate-pulse";
      case "upcoming": return "bg-secondary text-secondary-foreground";
      case "completed": return "bg-muted text-muted-foreground";
      case "cancelled": return "bg-destructive/20 text-destructive";
      default: return "bg-primary text-primary-foreground";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Live Classes</h1>
          <p className="text-muted-foreground">Monitor and manage all scheduled sessions.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or teacher..."
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
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses?.length === 0 ? (
              <div className="col-span-full text-center p-8 border rounded-lg bg-card">
                <p className="text-muted-foreground">No classes found.</p>
              </div>
            ) : (
              filteredClasses?.map((c) => (
                <Card key={c.id} className="flex flex-col h-full border-l-4" style={{ borderLeftColor: c.status === 'live' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                  <CardHeader>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <Badge variant="outline" className="mb-2 bg-primary/5 text-primary border-primary/20">
                          {c.subject}
                        </Badge>
                        <CardTitle className="text-xl">{c.title}</CardTitle>
                        <CardDescription className="mt-1">Teacher: {c.teacherName}</CardDescription>
                      </div>
                      <Badge className={getStatusColor(c.status)}>
                        {c.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {c.scheduledAt && (
                      <div className="flex items-center gap-4 text-sm text-foreground mb-4 bg-muted/50 p-2 rounded-md">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-primary" />
                          <span>{new Date(c.scheduledAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-primary" />
                          <span>{new Date(c.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-4 border-t flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-2"
                      onClick={() => handleDelete(c.id)}
                      disabled={deleteClassMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
