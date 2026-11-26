import { Link, useLocation } from "wouter";
import { BookOpen, FileText, Home, RefreshCw, ExternalLink } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ResourceUnavailable() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const title = params.get("title") || "Learning resource";
  const reason = params.get("reason") || "The requested lesson or media could not be found.";
  return (
    <DashboardLayout>
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl overflow-hidden border-0 shadow-xl">
          <div className="bg-[#0a1628] p-8 text-white">
            <div className="mb-4 inline-flex rounded-2xl bg-amber-400/15 p-3"><BookOpen className="h-8 w-8 text-amber-300" /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">DALLYLETTER ELIDEMS</p>
            <h1 className="mt-2 text-3xl font-bold">This learning resource isn't available</h1>
            <p className="mt-2 text-sm text-white/70">We couldn't open <strong>{title}</strong>.</p>
          </div>
          <CardContent className="space-y-5 p-6">
            <div className="rounded-2xl border bg-muted/30 p-4">
              <p className="font-semibold">{reason}</p>
              <p className="mt-1 text-sm text-muted-foreground">The original link may have expired, been removed, or the uploaded media may no longer be available.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Button onClick={() => window.location.reload()} variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" />Try again</Button>
              <Button onClick={() => navigate("/student/lessons")} className="gap-2"><BookOpen className="h-4 w-4" />Lessons</Button>
              <Button onClick={() => navigate("/student")} variant="outline" className="gap-2"><Home className="h-4 w-4" />Dashboard</Button>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">Need help?</p>
                  <p className="mt-1 text-sm text-amber-800/80">Open the DallyLetter learner docs for guidance on lessons, assignments, groups and common problems.</p>
                  <Link href="/docs"><Button size="sm" variant="outline" className="mt-3 gap-2"><ExternalLink className="h-3.5 w-3.5" />Open Docs</Button></Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
