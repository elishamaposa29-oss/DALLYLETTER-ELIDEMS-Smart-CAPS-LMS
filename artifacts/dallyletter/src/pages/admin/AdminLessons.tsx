import { DashboardLayout } from "@/components/DashboardLayout";
import { useListLessons, useDeleteLesson } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Loader2, Search, Trash2, Video, Image as ImageIcon, Headphones, FileText, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListLessonsQueryKey } from "@workspace/api-client-react";

export default function AdminLessons() {
  const { data: lessons, isLoading } = useListLessons();
  const deleteLessonMutation = useDeleteLesson();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const filteredLessons = lessons?.filter(lesson => {
    const matchesSearch = lesson.title.toLowerCase().includes(search.toLowerCase()) || 
                          lesson.teacherName.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = subjectFilter === "all" || lesson.subject === subjectFilter;
    return matchesSearch && matchesSubject;
  });

  const subjects = Array.from(new Set(lessons?.map(l => l.subject) || []));

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this lesson globally?")) {
      deleteLessonMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Lesson deleted" });
          queryClient.invalidateQueries({ queryKey: getListLessonsQueryKey() });
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Lessons</h1>
          <p className="text-muted-foreground">Manage all lessons on the platform.</p>
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
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
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

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLessons?.length === 0 ? (
              <div className="col-span-full text-center p-8 border rounded-lg bg-card">
                <p className="text-muted-foreground">No lessons found.</p>
              </div>
            ) : (
              filteredLessons?.map((lesson) => (
                <Card key={lesson.id} className="flex flex-col h-full hover:border-primary/50 transition-colors group">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                        {lesson.subject}
                      </Badge>
                      <div className="text-muted-foreground bg-muted p-1.5 rounded-md">
                        {getTypeIcon(lesson.type)}
                      </div>
                    </div>
                    <CardTitle className="text-lg mt-2 line-clamp-2">{lesson.title}</CardTitle>
                    <CardDescription>By {lesson.teacherName}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <div className="text-xs text-muted-foreground">
                      Added on {new Date(lesson.createdAt).toLocaleDateString()}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 border-t flex justify-end">
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
