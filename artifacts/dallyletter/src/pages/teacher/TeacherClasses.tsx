import { DashboardLayout } from "@/components/DashboardLayout";
import { useListClasses, useCreateClass, useUpdateClass, useDeleteClass, useListHandRaises } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import { Loader2, Plus, Trash2, Video, Calendar, Clock, Hand, Settings2, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListClassesQueryKey, getListHandRaisesQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateClassBodyStatus, UpdateClassBodyStatus } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";

const createClassSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  subject: z.string().min(2, "Subject is required"),
  grade: z.string().optional(),
  meetLink: z.string().url("Must be a valid URL"),
  scheduledAt: z.string().optional(),
  status: z.enum([CreateClassBodyStatus.upcoming, CreateClassBodyStatus.live, CreateClassBodyStatus.completed, CreateClassBodyStatus.cancelled]),
});

export default function TeacherClasses() {
  const { data: classes, isLoading } = useListClasses();
  const createClassMutation = useCreateClass();
  const updateClassMutation = useUpdateClass();
  const deleteClassMutation = useDeleteClass();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof createClassSchema>>({
    resolver: zodResolver(createClassSchema),
    defaultValues: {
      title: "",
      description: "",
      subject: "",
      grade: "",
      meetLink: "",
      scheduledAt: new Date().toISOString().slice(0, 16),
      status: CreateClassBodyStatus.upcoming,
    },
  });

  const onSubmit = (values: z.infer<typeof createClassSchema>) => {
    createClassMutation.mutate({ data: { ...values, scheduledAt: new Date(values.scheduledAt || "").toISOString() } }, {
      onSuccess: () => {
        toast({ title: "Class scheduled" });
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message });
      }
    });
  };

  const handleUpdateStatus = (id: number, status: UpdateClassBodyStatus) => {
    updateClassMutation.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this class?")) {
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live Classes</h1>
            <p className="text-muted-foreground">Manage your scheduled sessions.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Schedule Class
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Schedule Live Class</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Topic / Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Algebra Revision" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Mathematics" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="grade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Grade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"].map(g => (
                                <SelectItem key={g} value={g}>{g}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date & Time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="meetLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Google Meet Link</FormLabel>
                        <FormControl>
                          <Input placeholder="https://meet.google.com/..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="What will be covered in this class..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createClassMutation.isPending}>
                      {createClassMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Schedule Class
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes?.length === 0 ? (
              <div className="col-span-full text-center p-8 border rounded-lg bg-card">
                <p className="text-muted-foreground">You haven't scheduled any classes yet.</p>
              </div>
            ) : (
              classes?.map((c) => (
                <Card key={c.id} className="flex flex-col h-full border-l-4" style={{ borderLeftColor: c.status === 'live' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                  <CardHeader>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <Badge variant="outline" className="mb-2 bg-primary/5 text-primary border-primary/20">
                          {c.subject}
                        </Badge>
                        <CardTitle className="text-xl">{c.title}</CardTitle>
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
                    <div className="flex gap-2 flex-wrap mb-4">
                       <Button variant="outline" size="sm" onClick={() => window.open(c.meetLink, "_blank")} className="gap-1">
                          <Video className="h-3 w-3" /> Open Link
                        </Button>
                        <Select value={c.status} onValueChange={(val) => handleUpdateStatus(c.id, val as UpdateClassBodyStatus)}>
                          <SelectTrigger className="h-9 text-xs w-[140px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UpdateClassBodyStatus.upcoming}>Upcoming</SelectItem>
                            <SelectItem value={UpdateClassBodyStatus.live}>Live Now</SelectItem>
                            <SelectItem value={UpdateClassBodyStatus.completed}>Completed</SelectItem>
                            <SelectItem value={UpdateClassBodyStatus.cancelled}>Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                    </div>

                    <ClassHandRaises classId={c.id} isLive={c.status === "live"} />
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

function ClassHandRaises({ classId, isLive }: { classId: number, isLive: boolean }) {
  const { data: hands } = useListHandRaises({ classId }, { query: { enabled: isLive, refetchInterval: 10000 } as any });
  
  if (!isLive || !hands || hands.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3 text-destructive">
        <Hand className="h-4 w-4 animate-bounce" />
        Raised Hands ({hands.length})
      </h4>
      <div className="space-y-2">
        {hands.map(hand => (
          <div key={hand.id} className="bg-destructive/5 border border-destructive/20 rounded p-2 text-sm">
            <p className="font-medium">{hand.studentName}</p>
            {hand.question && <p className="text-muted-foreground mt-0.5">{hand.question}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
