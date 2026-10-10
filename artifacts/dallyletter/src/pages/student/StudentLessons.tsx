import { DashboardLayout } from "@/components/DashboardLayout";
import { useListLessons, getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, FileText, Image as ImageIcon, Video, Headphones, BookOpen, ExternalLink, GraduationCap, ClipboardList, Sparkles, Users, Layers, Clock, ListFilter } from "lucide-react";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { isValidLessonUrl } from "@/lib/media-url";

function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  return <iframe className="aspect-video w-full rounded-md" src={url} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
}

function StoredMedia({ url, type, title }: { url: string; type: string; title: string }) {
  const mediaType = type === "audio" || type === "video" || type === "image" ? type : "document";
  return <AuthenticatedMedia url={url} type={mediaType} title={title} />;
}

function sanitizeLessonHtml(input: string): string {
  if (!input) return "";
  // Older lesson records may contain HTML that was escaped before being saved.
  // Decode one layer only, then sanitize the resulting document before rendering.
  const decoder = document.createElement("textarea");
  decoder.innerHTML = input;
  const decoded = decoder.value;
  const source = decoded.includes("<") && decoded.includes(">") ? decoded : input;
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script,iframe,object,embed,style,link").forEach(node => node.remove());
  doc.querySelectorAll("*").forEach(node => {
    [...node.attributes].forEach(attr => {
      if (/^on/i.test(attr.name) || ((attr.name === "href" || attr.name === "src") && /^javascript:/i.test(attr.value))) node.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

function hasValidMediaUrl(url: string | null | undefined): url is string {
  return Boolean(url && isValidLessonUrl(url));
}

export default function StudentLessons() {
  const { data: lessons, isLoading } = useListLessons();
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState(() => localStorage.getItem("dallyletter.student.lesson.teacherFilter") ?? "all");
  const [classFilter, setClassFilter] = useState(() => localStorage.getItem("dallyletter.student.lesson.classFilter") ?? "all");
  const [sortMode, setSortMode] = useState<"newest"|"oldest"|"subject">("newest");
  const [classes, setClasses] = useState<Array<{id:number;title:string;subject:string;grade:string|null;teacherId:number;teacherName:string}>>([]);
  useEffect(() => { const token = localStorage.getItem("dallyletter_token"); fetch(getApiUrl("/api/classes"), { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r=>r.ok?r.json():[]).then(d=>setClasses(Array.isArray(d)?d:[])).catch(()=>setClasses([])); }, []);
  useEffect(() => { localStorage.setItem("dallyletter.student.lesson.teacherFilter", teacherFilter); }, [teacherFilter]);
  useEffect(() => { localStorage.setItem("dallyletter.student.lesson.classFilter", classFilter); }, [classFilter]);
  const [follows, setFollows] = useState<any[]>([]);
  const token = localStorage.getItem("dallyletter_token");
  useEffect(()=>{fetch(getApiUrl("/api/follows"),{headers:token?{Authorization:`Bearer ${token}`}:{}}).then(r=>r.ok?r.json():[]).then(d=>setFollows(Array.isArray(d)?d:[])).catch(()=>{});},[]);
  const toggleFollow=async(targetType:string,targetUserId:number|undefined,targetKey:string|undefined,targetName:string)=>{const existing=follows.find(f=>f.targetType===targetType&&(targetUserId?f.targetUserId===targetUserId:f.targetKey===targetKey));if(existing){await fetch(getApiUrl(`/api/follows/${existing.id}`),{method:"DELETE",headers:token?{Authorization:`Bearer ${token}`}:{}});setFollows(follows.filter(f=>f.id!==existing.id));return;}const r=await fetch(getApiUrl("/api/follows"),{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({targetType,targetUserId,targetKey,targetName})});if(r.ok)setFollows([...follows,await r.json()]);};
  const [exerciseMap, setExerciseMap] = useState<Record<number, { id:number; title:string; status:string; totalMarks:string; submissionStatus?:string; submission?:{totalScore:string;percentage:string|null;returnedAt:string|null}|null }[]>>({});
  useEffect(() => { let cancelled = false; const token = localStorage.getItem("dallyletter_token"); if (!lessons?.length) return; Promise.all(lessons.map(async lesson => { try { const r = await fetch(getApiUrl(`/api/exercises/lessons/${lesson.id}/exercises`), { headers: token ? { Authorization: `Bearer ${token}` } : {} }); return [lesson.id, r.ok ? await r.json() : []] as const; } catch { return [lesson.id, []] as const; } })).then(rows => { if (!cancelled) setExerciseMap(Object.fromEntries(rows)); }); return () => { cancelled = true; }; }, [lessons]);

  const filteredLessons = (lessons ?? []).filter(lesson => {
    const matchesSearch = lesson.title.toLowerCase().includes(search.toLowerCase()) ||
                          (lesson.description?.toLowerCase().includes(search.toLowerCase()));
    const matchesSubject = subjectFilter === "all" || lesson.subject === subjectFilter;
    const matchesTeacher = teacherFilter === "all" || String(lesson.teacherId) === teacherFilter;
    const selectedClass = classes.find(item => String(item.id) === classFilter);
    const matchesClass = !selectedClass || (lesson.subject === selectedClass.subject && (!selectedClass.grade || lesson.grade === selectedClass.grade));
    return matchesSearch && matchesSubject && matchesTeacher && matchesClass;
  }).slice().sort((a, b) => {
    if (sortMode === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortMode === "subject") return a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const subjects = Array.from(new Set(lessons?.map(l => l.subject) || []));

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="h-4 w-4" />;
      case "image": return <ImageIcon className="h-4 w-4" />;
      case "audio": return <Headphones className="h-4 w-4" />;
      case "notes": return <FileText className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "video": return "bg-blue-500/10 text-blue-600 border-blue-200";
      case "image": return "bg-purple-500/10 text-purple-600 border-purple-200";
      case "audio": return "bg-orange-500/10 text-orange-600 border-orange-200";
      case "notes": return "bg-green-500/10 text-green-600 border-green-200";
      default: return "bg-primary/10 text-primary border-primary/20";
    }
  };

  const handleOpen = (url: string, lessonId?: number) => {
    if (url.startsWith("/api/lessons/media/") && lessonId) { window.location.assign(`/preview/lesson/${lessonId}`); return; }
    window.open(url.startsWith("/") ? getApiUrl(url) : url, "_blank", "noopener,noreferrer");
  };

  const isYouTubeUrl = (url: string) => url.includes("youtube.com/embed/");

  return (
    <DashboardLayout>
      <div className="space-y-4 rounded-2xl bg-gradient-to-b from-[#FFF8E1]/70 via-background to-[#0A1931]/5 p-1">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#0A1931] dark:text-[#FFF8E1]">Lessons</h1>
            <p className="text-muted-foreground">Browse your course materials and study notes.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
            <GraduationCap className="h-4 w-4" />
            <span>{lessons?.length || 0} lessons available</span>
          </div>
        </div>

        {/* Filters */}
        <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-2xl border border-[#D4AF37]/20 bg-[#0A1931]/95 p-3 shadow-lg backdrop-blur sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search lessons by title or description..."
              className="pl-9 h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex w-full flex-nowrap items-center gap-1 overflow-x-auto sm:w-auto" aria-label="Lesson sorting and filters">
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2 text-white"><Users className="h-4 w-4"/><Select value={teacherFilter} onValueChange={(value) => { setTeacherFilter(value); }}><SelectTrigger className="h-9 w-[118px] border-0 bg-transparent text-white focus:ring-0"><SelectValue placeholder="All teachers" /></SelectTrigger><SelectContent><SelectItem value="all">All teachers</SelectItem>{Array.from(new Map((lessons ?? []).map(l=>[String(l.teacherId),l.teacherName])).entries()).map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2 text-white"><Layers className="h-4 w-4"/><Select value={classFilter} onValueChange={(value) => { setClassFilter(value); }}><SelectTrigger className="h-9 w-[110px] border-0 bg-transparent text-white focus:ring-0"><SelectValue placeholder="All classes" /></SelectTrigger><SelectContent><SelectItem value="all">All classes</SelectItem>{classes.map(item=><SelectItem key={item.id} value={String(item.id)}>{item.title}{item.grade?` · ${item.grade}`:""}</SelectItem>)}</SelectContent></Select></div>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 px-2 text-white hover:bg-white/15" onClick={() => { setSortMode("newest"); }} title="Newest first"><Clock className="h-4 w-4"/><span>Newest</span></Button>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 px-2 text-white hover:bg-white/15" onClick={() => { setTeacherFilter("all"); setClassFilter("all"); setSubjectFilter("all"); setSearch(""); setSortMode("newest"); }} title="Show all lessons"><ListFilter className="h-4 w-4"/><span>All</span></Button>
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-11">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjects.map(sub => (
                <SelectItem key={sub} value={sub}>{sub}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lessons Grid */}
        {isLoading ? (
          <div className="flex justify-center p-16">
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Loading lessons...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredLessons?.length === 0 ? (
              <div className="col-span-full text-center py-16 border-2 border-dashed rounded-xl bg-muted/20">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <p className="text-lg font-medium text-muted-foreground">No lessons found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Try a different search or subject filter</p>
              </div>
            ) : (
              filteredLessons?.map((lesson) => (
                <Card
                  key={lesson.id}
                  className={`flex flex-col h-full overflow-hidden rounded-2xl border-[#D4AF37]/20 bg-[#FFF8E1]/60 shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-[#D4AF37]/70 hover:shadow-xl dark:bg-[#0A1931]/80 ${hasValidMediaUrl(lesson.mediaUrl) ? "cursor-pointer" : ""}`}
                  onClick={() => hasValidMediaUrl(lesson.mediaUrl) && handleOpen(lesson.mediaUrl!, lesson.id)}
                >
                  <CardHeader className="pb-3 space-y-3">
                    {/* Top row: subject + type */}
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-medium">
                        {lesson.subject}
                      </Badge>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${getTypeColor(lesson.type)}`}>
                        {getTypeIcon(lesson.type)}
                        {lesson.type}
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      {hasValidMediaUrl(lesson.mediaUrl) ? (
                        <h3 className="font-bold text-lg leading-tight text-primary hover:underline flex items-start gap-1.5 group line-clamp-2">
                          {lesson.title}
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-1 opacity-60 group-hover:opacity-100" />
                        </h3>
                      ) : (
                        <h3 className="font-bold text-lg leading-tight text-foreground line-clamp-2">
                          {lesson.title}
                        </h3>
                      )}
                      <div className="mt-1 flex items-center gap-2"><p className="text-xs text-muted-foreground">by {lesson.teacherName}</p>{lesson.teacherId && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={e=>{e.stopPropagation();void toggleFollow("teacher",lesson.teacherId,undefined,lesson.teacherName)}}>{follows.some(f=>f.targetType==="teacher"&&f.targetUserId===lesson.teacherId)?"Following":"Follow teacher"}</Button>}</div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col justify-between gap-4">
                    {hasValidMediaUrl(lesson.mediaUrl) && (isYouTubeUrl(lesson.mediaUrl) ? <YouTubeEmbed url={lesson.mediaUrl} title={lesson.title} /> : lesson.mediaUrl.startsWith("/api/lessons/media/") ? <StoredMedia url={lesson.mediaUrl} type={lesson.type} title={lesson.title} /> : null)}
                    {lesson.content && <div className="rounded-xl border bg-background/70 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lesson notes</p><div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{__html:sanitizeLessonHtml(lesson.content)}} /></div>}
                    <div className="rounded-lg bg-muted/20 p-3"><p className="text-sm text-muted-foreground line-clamp-4">{lesson.description || "No description provided."}</p></div>

                    {(exerciseMap[lesson.id] ?? []).length > 0 && <div className="space-y-2 border-t pt-3"><div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="h-4 w-4 text-primary" />Exercises</div>{(exerciseMap[lesson.id] ?? []).map(ex => <Button key={ex.id} variant="outline" className={`w-full justify-between gap-2 border transition-all hover:-translate-y-0.5 ${ex.submissionStatus==="marked" ? (localStorage.getItem(`dallyletter.exercise.viewed.${ex.id}`)==="1" ? "border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#6b4f00]" : "border-emerald-300 bg-emerald-50 text-emerald-800") : "border-purple-300 bg-purple-50 text-purple-800"}`} onClick={(e) => { e.stopPropagation(); localStorage.setItem(`dallyletter.exercise.viewed.${ex.id}`,"1"); window.location.assign(`/student/exercises/${ex.id}`); }}><span className="truncate text-left font-semibold">{ex.title}</span><span className="flex shrink-0 items-center gap-1"><Badge variant="secondary">{ex.totalMarks} marks</Badge><Badge className={ex.submissionStatus==="marked" ? (localStorage.getItem(`dallyletter.exercise.viewed.${ex.id}`)==="1" ? "bg-[#D4AF37] text-[#0A1931]" : "bg-emerald-600 text-white") : "bg-purple-600 text-white"}>{ex.submissionStatus==="marked" ? `Result: ${ex.submission?.totalScore ?? "0"}/${ex.totalMarks}` : ex.submissionStatus==="submitted" ? "Awaiting marking" : "Unmarked • Unviewed"}</Badge></span></Button>)}</div>}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-muted-foreground">
                        {new Date(lesson.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {hasValidMediaUrl(lesson.mediaUrl) && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5 h-8 text-xs"
                          onClick={(e) => { e.stopPropagation(); handleOpen(lesson.mediaUrl!, lesson.id); }}
                        >
                          Open Lesson
                          <ExternalLink className="h-3 w-3" />
                        </Button>
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
