import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListLessons, useCreateLesson, useDeleteLesson, getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Video, Image as ImageIcon, Headphones, FileText, BookOpen, Upload, X, ClipboardList, ClipboardCheck, Bell, Users, Clock, ListFilter, ArrowDownUp, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListLessonsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateLessonBodyType } from "@workspace/api-client-react";
import { ExerciseBuilderPanel } from "@/components/exercises/ExerciseBuilderPanel";
import { RichTextEditor, sanitizeRichText } from "@/components/RichTextEditor";

const createLessonSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  subject: z.string().min(2, "Subject is required"),
  grade: z.string().optional(),
  type: z.enum([CreateLessonBodyType.video, CreateLessonBodyType.image, CreateLessonBodyType.audio, CreateLessonBodyType.notes, CreateLessonBodyType.mixed]),
  mediaUrl: z.string().optional(),
  content: z.string().optional(),
});

export default function TeacherLessons() {
  const { data: lessons, isLoading } = useListLessons();
  const { user } = useAuth();
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [sortMode, setSortMode] = useState<"newest"|"oldest"|"subject">("newest");
  const visibleLessons = [...(lessons ?? [])]
    .filter((lesson) => user?.role !== "teacher" || showAllTeachers || lesson.teacherId === user.id)
    .sort((a,b) => sortMode === "oldest" ? new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime() : sortMode === "subject" ? String(a.subject).localeCompare(String(b.subject)) : new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  const canManageLesson = (lesson: { teacherId: number }) => lesson.teacherId === user?.id || user?.role === "owner" || (user?.role === "teacher" && Boolean((user as any).isManager) && (user as any).managerLevel === "senior");
  const requestPermission = async (contentId:number,requestedAction:"edit"|"create_exercise"|"delete"|"notify") => {
    try {
      const token = localStorage.getItem("dallyletter_token");
      const r = await fetch(getApiUrl("/api/content-permissions"), {method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({contentType:"lesson",contentId,requestedAction})});
      const d = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error || "Permission request failed");
      toast({title:d.alreadyAuthorized?"Already authorized":"Permission requested",description:d.pending?"The lesson creator will review your request.":"Permission is already available."});
      void loadMyPermissionRequests();
    } catch(e) { toast({variant:"destructive",title:"Permission request failed",description:e instanceof Error?e.message:"Try again"}); }
  };
  const createLessonMutation = useCreateLesson();
  const deleteLessonMutation = useDeleteLesson();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; previewUrl: string; mimeType: string } | null>(null);
  const [activeExerciseLessonId, setActiveExerciseLessonId] = useState<number | null>(null);
  const [markingExercises, setMarkingExercises] = useState<{ id: number; title: string; status?: string; totalMarks?: string }[]>([]);
  const [markingLessonId, setMarkingLessonId] = useState<number | null>(null);
  const [lessonRequests, setLessonRequests] = useState<any[]>([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState<"all"|"pending"|"accepted"|"declined"|"completed"|"cancelled"|"dismissed">("pending");
  const visibleLessonRequests = lessonRequests.filter(r => requestStatusFilter === "all" || String(r.status || "pending").toLowerCase() === requestStatusFilter);
  const [requestBusy, setRequestBusy] = useState<number | null>(null);
  const [permissionRequests, setPermissionRequests] = useState<any[]>([]);
  const [myPermissionRequests, setMyPermissionRequests] = useState<any[]>([]);
  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("dallyletter_token") ?? ""}` });
  const loadLessonRequests = async () => { const r=await fetch(getApiUrl("/api/achievements/lesson-requests"),{headers:authHeaders()}); if(r.ok)setLessonRequests(await r.json()); };
  const loadPermissionRequests = async () => { const r=await fetch(getApiUrl("/api/content-permissions"),{headers:authHeaders()}); if(r.ok)setPermissionRequests(await r.json()); };
  const loadMyPermissionRequests = async () => { const r=await fetch(getApiUrl("/api/content-permissions/mine"),{headers:authHeaders()}); if(r.ok)setMyPermissionRequests(await r.json()); };
  const respondPermission = async (id:number,status:"approved"|"declined") => { try { const r=await fetch(getApiUrl(`/api/content-permissions/${id}`),{method:"PATCH",headers:{"Content-Type":"application/json",...authHeaders()},body:JSON.stringify({status})}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error||"Permission update failed"); setPermissionRequests(rows=>rows.filter(item=>Number(item.id)!==id)); toast({title:status==="approved"?"Permission granted ✓":"Permission declined"}); void loadMyPermissionRequests(); } catch(e) { toast({variant:"destructive",title:"Permission update failed",description:e instanceof Error?e.message:"Try again"}); } };
  const respondToRequest = async (id:number,status:"accepted"|"declined"|"completed") => { setRequestBusy(id); try { const r=await fetch(getApiUrl(`/api/achievements/lesson-requests/${id}`),{method:"PATCH",headers:{"Content-Type":"application/json",...authHeaders()},body:JSON.stringify({status})}); if(!r.ok) throw new Error("Could not update request"); await loadLessonRequests(); toast({title:"Lesson request updated"}); } catch(e) { toast({variant:"destructive",title:"Request update failed",description:e instanceof Error?e.message:"Try again"}); } finally { setRequestBusy(null); } };
  const dismissRequest = async (id:number) => { if(!window.confirm("Dismiss this lesson request?")) return; setRequestBusy(id); try { const r=await fetch(getApiUrl(`/api/achievements/lesson-requests/${id}`),{method:"PATCH",headers:{"Content-Type":"application/json",...authHeaders()},body:JSON.stringify({status:"dismissed"})}); if(!r.ok) throw new Error((await r.json().catch(()=>null))?.error||"Could not dismiss request"); await loadLessonRequests(); toast({title:"Lesson request dismissed"}); if(window.confirm("The request is closed. Do you also want to permanently delete it?")) { const dr=await fetch(getApiUrl(`/api/achievements/lesson-requests/${id}`),{method:"DELETE",headers:authHeaders()}); if(!dr.ok) throw new Error((await dr.json().catch(()=>null))?.error||"Request closed, but deletion failed"); await loadLessonRequests(); toast({title:"Lesson request deleted"}); } } catch(e) { toast({variant:"destructive",title:"Request action failed",description:e instanceof Error?e.message:"Try again"}); } finally { setRequestBusy(null); } };
  useEffect(()=>{void loadLessonRequests();void loadPermissionRequests();void loadMyPermissionRequests();},[]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof createLessonSchema>>({
    resolver: zodResolver(createLessonSchema),
    defaultValues: {
      title: "",
      description: "",
      subject: "",
      grade: "",
      type: CreateLessonBodyType.notes,
      mediaUrl: "",
      content: "",
    },
  });
  const selectedLessonType = form.watch("type");

  const onSubmit = (values: z.infer<typeof createLessonSchema>) => {
    createLessonMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Lesson created", description: "Your lesson has been published." });
        queryClient.invalidateQueries({ queryKey: getListLessonsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create lesson" });
      }
    });
  };

  const handleMediaUpload = (file: File) => {
    const isDocument = selectedLessonType === "notes" && ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type);
    const expectedPrefix = selectedLessonType === "audio" ? "audio/" : selectedLessonType === "image" ? "image/" : "video/";
    if (!file.type.startsWith(expectedPrefix) && !isDocument) {
      toast({ variant: "destructive", title: "Unsupported media", description: `Choose a supported ${selectedLessonType} file.` });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setUploadedFile({ name: file.name, previewUrl, mimeType: file.type });
    setUploadProgress(0);
    const request = new XMLHttpRequest();
    request.open("POST", getApiUrl("/api/lessons/media"));
    const token = localStorage.getItem("dallyletter_token");
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        setUploadProgress(null);
        toast({ variant: "destructive", title: "Upload failed", description: "The video could not be uploaded." });
        return;
      }
      const result = JSON.parse(request.responseText) as { mediaUrl: string };
      form.setValue("mediaUrl", result.mediaUrl, { shouldValidate: true });
      setUploadProgress(100);
      toast({ title: "Video uploaded", description: "Preview it below, then publish the lesson." });
    };
    request.onerror = () => {
      setUploadProgress(null);
      toast({ variant: "destructive", title: "Upload failed", description: "Check your connection and try again." });
    };
    const formData = new FormData();
    formData.append("file", file);
    request.send(formData);
  };

  const removeUploadedVideo = () => {
    if (uploadedFile) URL.revokeObjectURL(uploadedFile.previewUrl);
    setUploadedFile(null);
    setUploadProgress(null);
    form.setValue("mediaUrl", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this lesson?")) {
      deleteLessonMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Lesson deleted" });
          if (activeExerciseLessonId === id) setActiveExerciseLessonId(null);
          queryClient.invalidateQueries({ queryKey: getListLessonsQueryKey() });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "The lesson could not be deleted.";
          toast({ variant: "destructive", title: "Lesson deletion blocked", description: message.includes("403") || /permission|forbidden|owner/i.test(message) ? "You are not the lesson owner. Request deletion from the lesson owner; deletion was not performed." : message });
        }
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="h-4 w-4" />;
      case "image": return <ImageIcon className="h-4 w-4" />;
      case "audio": return <Headphones className="h-4 w-4" />;
      case "notes": return <FileText className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {myPermissionRequests.length>0 && <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-lg">My permission requests</CardTitle><CardDescription>Track each resource-specific request and the owner’s decision.</CardDescription></CardHeader>
          <CardContent className="space-y-2">{myPermissionRequests.map((request:any)=>{
            const contentType=String(request.content_type ?? request.contentType ?? "content");
            const contentId=Number(request.content_id ?? request.contentId);
            const title=String(request.content_title ?? request.contentTitle ?? (contentType + " #" + contentId));
            const status=String(request.status ?? "pending").toLowerCase();
            return <div key={request.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{contentType} #{contentId} · {String(request.requested_action ?? request.requestedAction ?? "permission").replaceAll("_"," ")}</p>
                {request.owner_name && <p className="text-xs text-muted-foreground">Owner: {request.owner_name}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status==="approved"?"default":status==="declined"?"destructive":"outline"}>{status==="approved"?"Granted":status==="declined"?"Declined":status==="pending"?"Pending":status}</Badge>
                {status==="approved" && contentType==="lesson" && <Button type="button" size="sm" onClick={() => window.location.assign(`/preview/lesson/${contentId}`)}>Open permitted lesson</Button>}
                {status==="declined" && <><Button type="button" size="sm" variant="outline" onClick={() => void requestPermission(contentId, String(request.requested_action ?? request.requestedAction ?? "edit") as "edit"|"create_exercise"|"delete"|"notify")}>Request again</Button><Button type="button" size="sm" variant="secondary" onClick={async () => { try { const response=await fetch(getApiUrl(`/api/content-permissions/${Number(request.id)}/report`),{method:"POST",headers:{"Content-Type":"application/json",...authHeaders()},body:JSON.stringify({message:"Please review declined permission request"})}); const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||"Report failed"); toast({title:"Report sent to manager"}); } catch(error) { toast({variant:"destructive",title:"Could not report",description:error instanceof Error?error.message:"Try again"}); } }}>Report to manager</Button></>}
              </div>
            </div>;
          })}</CardContent>
        </Card>}
        {permissionRequests.length>0 && <Card className="border-primary/20"><CardHeader><CardTitle className="text-lg">Content permission requests</CardTitle><CardDescription>Requests are attached to the lesson or exercise they concern. Grant only the specific access you trust.</CardDescription></CardHeader><CardContent className="space-y-3">{permissionRequests.map((request:any)=>{const contentType=String(request.content_type ?? request.contentType ?? "content");const contentId=Number(request.content_id ?? request.contentId);const contentTitle=String(request.content_title ?? request.contentTitle ?? `${contentType} #${contentId}`);return <div key={request.id} className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{contentTitle}</p><p className="text-sm">{request.requester_name ?? request.requesterName ?? `User #${request.requester_id ?? request.requesterId}`} requests {String(request.requested_action ?? request.requestedAction ?? "permission").replaceAll("_"," ")}</p><p className="text-xs text-muted-foreground">{contentType} #{contentId}{request.content_subject ? ` · ${request.content_subject}` : ""}{request.content_grade ? ` · ${request.content_grade}` : ""}</p>{contentType==="lesson" && <Button type="button" size="sm" variant="ghost" className="mt-1 h-8 px-2" onClick={()=>window.location.assign(`/preview/lesson/${contentId}`)}>Preview lesson</Button>}</div><div className="flex gap-2"><Button size="sm" onClick={()=>void respondPermission(Number(request.id),"approved")}>Grant</Button><Button size="sm" variant="outline" onClick={()=>void respondPermission(Number(request.id),"declined")}>Deny</Button></div></div>})}</CardContent></Card>}
        {lessonRequests.length>0 && <Card className="border-amber-200 bg-amber-50/50"><CardHeader><CardTitle className="text-lg">Prefect lesson requests</CardTitle><CardDescription>Requests sent directly to your teacher account. Filter by status.</CardDescription><Select value={requestStatusFilter} onValueChange={(v)=>setRequestStatusFilter(v as typeof requestStatusFilter)}><SelectTrigger className="mt-2 w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All requests</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="declined">Declined</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="dismissed">Dismissed</SelectItem></SelectContent></Select></CardHeader><CardContent className="space-y-3">{visibleLessonRequests.map(r=><div key={r.id} className="rounded-xl border bg-background p-3 flex flex-col sm:flex-row sm:items-center gap-3"><div className="flex-1 min-w-0"><p className="font-semibold truncate">{r.topic}</p><p className="text-xs text-muted-foreground">{r.preferredDate?`Preferred ${r.preferredDate} · `:""}{r.status}</p>{r.notes&&<p className="text-sm mt-1">{r.notes}</p>}</div><div className="flex gap-2 flex-wrap"><Button size="sm" onClick={()=>void respondToRequest(r.id,"accepted")} disabled={requestBusy===r.id}>Accept</Button><Button size="sm" variant="outline" onClick={()=>void respondToRequest(r.id,"declined")} disabled={requestBusy===r.id}>Decline</Button><Button size="sm" variant="ghost" onClick={()=>void dismissRequest(r.id)} disabled={requestBusy===r.id}>Dismiss</Button></div></div>)}</CardContent></Card>}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Lessons</h1>
            <p className="text-muted-foreground">Manage and publish your course materials.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Lesson
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Lesson</DialogTitle>
                <DialogDescription>
                  Upload materials or write notes for your students.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Introduction to Algebra" {...field} />
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
                              {["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8 / Form 1","Grade 9 / Form 2","Grade 10 / Form 3","Grade 11 / Form 4","Grade 12 / Form 5","Form 6"].map(g => (
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
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lesson Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={CreateLessonBodyType.video}>Video</SelectItem>
                            <SelectItem value={CreateLessonBodyType.image}>Image</SelectItem>
                            <SelectItem value={CreateLessonBodyType.audio}>Audio</SelectItem>
                            <SelectItem value={CreateLessonBodyType.notes}>Notes</SelectItem>
                            <SelectItem value={CreateLessonBodyType.mixed}>Mixed</SelectItem>
                          </SelectContent>
                        </Select>
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
                          <Textarea placeholder="Brief overview of the lesson..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mediaUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lesson Link URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://... (learners click the title to open this)" {...field} />
                        </FormControl>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={selectedLessonType === "audio" ? "audio/*" : selectedLessonType === "image" ? "image/*" : selectedLessonType === "notes" ? ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "video/*"}
                            className="sr-only"
                            onChange={(event) => event.target.files?.[0] && handleMediaUpload(event.target.files[0])}
                          />
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploadProgress !== null && uploadProgress < 100}>
                            <Upload className="h-4 w-4" />
                            Upload {selectedLessonType === "audio" ? "Audio" : selectedLessonType === "image" ? "Image" : "Video"}
                          </Button>
                          {uploadedFile && (
                            <Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={removeUploadedVideo}>
                              <X className="h-4 w-4" />
                              Remove
                            </Button>
                          )}
                        </div>
                        {uploadProgress !== null && (
                          <div className="space-y-1" aria-live="polite">
                            <div className="flex justify-between text-xs text-muted-foreground"><span>Upload progress</span><span>{uploadProgress}%</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>
                          </div>
                        )}
                        {uploadedFile && selectedLessonType === "video" && <video className="mt-2 max-h-48 w-full rounded-md bg-black" src={uploadedFile.previewUrl} controls />}
                        {uploadedFile && selectedLessonType === "audio" && <audio className="mt-2 w-full" src={uploadedFile.previewUrl} controls />}
                        {uploadedFile && selectedLessonType === "image" && <img className="mt-2 max-h-48 w-full rounded-md object-contain" src={uploadedFile.previewUrl} alt="Lesson preview" />}
                        {uploadedFile && selectedLessonType === "notes" && uploadedFile.mimeType === "application/pdf" && <iframe className="mt-2 h-48 w-full rounded-md border" src={uploadedFile.previewUrl} title="Document preview" />}
                        <p className="text-xs text-muted-foreground">Paste a URL for an external lesson, or upload media to keep playback inside Elidems.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content / Notes (Optional)</FormLabel>
                        <FormControl>
                          <RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="Write the lesson content. Formatting is preserved; raw HTML/CSS/source code is not displayed as lesson text." className="min-h-[220px]" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createLessonMutation.isPending || uploadProgress !== null && uploadProgress < 100}>
                      {createLessonMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Publish Lesson
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={markingLessonId !== null} onOpenChange={(open) => { if (!open) { setMarkingLessonId(null); setMarkingExercises([]); } }}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Choose an exercise to mark</DialogTitle>
              <DialogDescription>This lesson has multiple published exercises. Select the one whose learner submissions you want to review.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {markingExercises.map((exercise) => (
                <Button
                  key={exercise.id}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-between gap-4 p-4 text-left"
                  onClick={() => window.location.assign(`/teacher/exercises/${exercise.id}/mark`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{exercise.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {exercise.totalMarks ? `${exercise.totalMarks} marks` : "Published exercise"}
                    </span>
                  </span>
                  <ClipboardCheck className="h-4 w-4 shrink-0" />
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2" aria-label="Lesson filters">
          <Button type="button" size="icon" variant={!showAllTeachers ? "default" : "ghost"} onClick={() => setShowAllTeachers(false)} title="My lessons" aria-label="My lessons"><BookOpen className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant={showAllTeachers ? "default" : "ghost"} onClick={() => setShowAllTeachers(true)} title="All teachers — preview only" aria-label="All teachers — preview only"><Users className="h-4 w-4" /></Button>
          <span className="ml-1 text-xs text-muted-foreground" aria-live="polite">{showAllTeachers ? "All teachers · preview only" : "My lessons"}</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownUp className="h-4 w-4" />Sort</span>
          <Button type="button" size="icon" variant={sortMode === "newest" ? "secondary" : "ghost"} onClick={() => setSortMode("newest")} title="Newest first" aria-label="Newest first"><Clock className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant={sortMode === "oldest" ? "secondary" : "ghost"} onClick={() => setSortMode("oldest")} title="Oldest first" aria-label="Oldest first"><ArrowDownUp className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant={sortMode === "subject" ? "secondary" : "ghost"} onClick={() => setSortMode("subject")} title="Sort by subject" aria-label="Sort by subject"><ListFilter className="h-4 w-4" /></Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">{sortMode === "newest" ? "Newest" : sortMode === "oldest" ? "Oldest" : "Subject"}</span>
        </div>
        {showAllTeachers && <p className="text-xs text-muted-foreground">Other teachers’ lessons are preview-only. Request permission before editing or managing them.</p>}
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleLessons.length === 0 ? (
              <div className="col-span-full text-center p-8 border rounded-lg bg-card">
                <p className="text-muted-foreground">You haven't created any lessons yet.</p>
              </div>
            ) : (
              visibleLessons.map((lesson) => (
                <Card key={lesson.id} className="flex flex-col h-full hover:border-primary/50 transition-colors group">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                          {lesson.subject}
                        </Badge>
                        {lesson.grade && (
                          <Badge variant="secondary" className="text-xs">
                            {lesson.grade}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground bg-muted p-1.5 rounded-md">
                        {getTypeIcon(lesson.type)}
                      </div>
                    </div>
                    <CardTitle className="text-lg mt-2 line-clamp-2">{lesson.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="mt-auto flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                      {lesson.description ? <span dangerouslySetInnerHTML={{ __html: sanitizeRichText(lesson.description) }} /> : "No description provided."}
                    </p>
                    <div className="text-xs text-muted-foreground">
                      Added on {new Date(lesson.createdAt).toLocaleDateString()}
                    </div>
                  </CardContent>
                  {activeExerciseLessonId === lesson.id && canManageLesson(lesson) && (
                    <CardContent className="border-t pt-4">
                      <ExerciseBuilderPanel
                        lessonId={lesson.id}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: getListLessonsQueryKey() })}
                      />
                    </CardContent>
                  )}
                  <CardFooter className="pt-4 border-t flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" size="icon" title="Preview lesson" aria-label={`Preview ${lesson.title}`} onClick={() => window.location.assign(`/preview/lesson/${lesson.id}`)}><Maximize2 className="h-4 w-4" /></Button>
                    {!canManageLesson(lesson) ? (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => void requestPermission(lesson.id,"edit")}>Request edit</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void requestPermission(lesson.id,"create_exercise")}>Request exercise</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void requestPermission(lesson.id,"notify")}>Request notify</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void requestPermission(lesson.id,"delete")}>Request delete</Button>
                      </>
                    ) : (
                      <>
                    <Button
                      variant={activeExerciseLessonId === lesson.id ? "secondary" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setActiveExerciseLessonId((current) => current === lesson.id ? null : lesson.id)}
                    >
                      <ClipboardList className="h-4 w-4" />
                      {activeExerciseLessonId === lesson.id ? "Close Exercise" : "Exercise"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={async () => {
                        const token = localStorage.getItem("dallyletter_token");
                        const r = await fetch(getApiUrl(`/api/exercises/lessons/${lesson.id}/exercises`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                        const exercises = r.ok ? await r.json() as { id: number; title: string; status?: string; totalMarks?: string }[] : [];
                        const published = exercises.filter((exercise) => exercise.status === "published");
                        if (!published.length) {
                          toast({ variant: "destructive", title: "No published exercises", description: "Create and publish an exercise for this lesson first." });
                          return;
                        }
                        if (published.length === 1) {
                          window.location.assign(`/teacher/exercises/${published[0].id}/mark`);
                          return;
                        }
                        setMarkingExercises(published);
                        setMarkingLessonId(lesson.id);
                      }}
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Mark Submissions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={async () => {
                        try {
                          const r = await fetch(getApiUrl(`/api/lessons/${lesson.id}/notify-followers`), { method: "POST", headers: authHeaders() });
                          const data = await r.json().catch(() => ({}));
                          if (!r.ok) throw new Error(data.error || "Could not notify followers");
                          toast({ title: "Followers notified", description: `${data.recipientCount ?? 0} follower(s) notified.` });
                        } catch (e) { toast({ variant: "destructive", title: "Follower notification failed", description: e instanceof Error ? e.message : "Try again." }); }
                      }}
                    >
                      <Bell className="h-4 w-4" />
                      Notify followers
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-2"
                      onClick={() => handleDelete(lesson.id)}
                      disabled={deleteLessonMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                      </>
                    )}
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
