import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Star, Clock, Video, Users, CheckCircle, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface Volunteer { id: number; userName: string; userId: number; role: string; isSelected: boolean; details: string | null; }
interface BreakEvent { id: number; title: string; description: string | null; eventDate: string; startTime: string; endTime: string; meetLink: string | null; status: string; volunteers?: Volunteer[]; }

export default function StudentBreakElidems() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [todayEvent, setTodayEvent] = useState<BreakEvent | null | undefined>(undefined);
  const [upcomingEvents, setUpcomingEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [volunteerOpen, setVolunteerOpen] = useState(false);
  const [volunteerDetails, setVolunteerDetails] = useState("");
  const [volunteering, setVolunteering] = useState(false);
  const [alreadyVolunteered, setAlreadyVolunteered] = useState(false);

  const token = () => localStorage.getItem("dallyletter_token");

  useEffect(() => {
    Promise.all([
      fetch("/api/break-elidems/today", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : null),
      fetch("/api/break-elidems", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : []),
    ]).then(([today, all]) => {
      setTodayEvent(today);
      setUpcomingEvents((all as BreakEvent[]).filter((e: BreakEvent) => e.status === "scheduled").slice(0, 3));
      if (today && user) {
        setAlreadyVolunteered(today.volunteers?.some((v: Volunteer) => v.userId === user.id) ?? false);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  async function handleVolunteer() {
    if (!todayEvent) return;
    setVolunteering(true);
    const r = await fetch(`/api/break-elidems/${todayEvent.id}/volunteer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ details: volunteerDetails }),
    });
    setVolunteering(false);
    if (r.ok) {
      toast({ title: "You've volunteered! 🎉", description: "The admin will review applications and select participants." });
      setVolunteerOpen(false);
      setAlreadyVolunteered(true);
    } else {
      const d = await r.json() as { error: string };
      toast({ variant: "destructive", title: d.error ?? "Could not volunteer" });
    }
  }

  const isTeacherOrPrefect = user?.role === "teacher" || user?.isPrefect;
  const isLive = todayEvent?.status === "active";
  const hasEvent = todayEvent !== null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Star className="h-7 w-7 text-amber-500" />BREAK-ELIDEMS
          </h1>
          <p className="text-muted-foreground">Daily community learning and engagement sessions open to all members.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : hasEvent ? (
          <div className="space-y-4">
            {/* Live/Today event */}
            <Card className={`border-2 ${isLive ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"}`}>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {isLive ? (
                        <Badge className="bg-emerald-600 text-white animate-pulse gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />LIVE NOW</Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white">TODAY</Badge>
                      )}
                    </div>
                    <h2 className="text-2xl font-bold">{todayEvent!.title}</h2>
                    {todayEvent!.description && <p className="text-muted-foreground mt-1">{todayEvent!.description}</p>}
                    <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" />{todayEvent!.eventDate}</span>
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" />{todayEvent!.startTime} – {todayEvent!.endTime}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                    {isLive && todayEvent!.meetLink ? (
                      <Button onClick={() => window.open(todayEvent!.meetLink!, "_blank")} className="bg-emerald-600 hover:bg-emerald-700 gap-2 w-full">
                        <Video className="h-4 w-4" />Join Session
                      </Button>
                    ) : !isLive ? (
                      <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/30 rounded-lg p-3 text-center">
                        <Clock className="h-5 w-5 mx-auto mb-1" />Event hasn't started yet.<br />Come back at {todayEvent!.startTime}
                      </div>
                    ) : null}
                    {isTeacherOrPrefect && !alreadyVolunteered && (
                      <Button variant="outline" onClick={() => setVolunteerOpen(true)} className="gap-2 w-full">
                        <Users className="h-4 w-4" />Volunteer to Host
                      </Button>
                    )}
                    {alreadyVolunteered && (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                        <CheckCircle className="h-4 w-4" />You've volunteered!
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected participants */}
                {todayEvent!.volunteers && todayEvent!.volunteers.filter((v: Volunteer) => v.isSelected).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Users className="h-4 w-4" />Today's Hosts</p>
                    <div className="flex gap-2 flex-wrap">
                      {todayEvent!.volunteers.filter((v: Volunteer) => v.isSelected).map((v: Volunteer) => (
                        <Badge key={v.id} variant="outline" className="gap-1">
                          <span className="capitalize">{v.role}</span>: {v.userName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Star className="h-16 w-16 text-amber-200 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">No Event Today</h3>
              <p className="text-muted-foreground max-w-md mx-auto">There's no BREAK-ELIDEMS event scheduled for today. Check back tomorrow or watch for notifications!</p>
            </CardContent>
          </Card>
        )}

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Upcoming Events</h2>
            {upcomingEvents.map(ev => (
              <Card key={ev.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold">{ev.title}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{ev.eventDate}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{ev.startTime} – {ev.endTime}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Scheduled</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* What is Break-Elidems? */}
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800">
          <CardContent className="p-5">
            <h3 className="font-bold text-amber-800 dark:text-amber-400 mb-2">What is BREAK-ELIDEMS? ⭐</h3>
            <p className="text-sm text-amber-700 dark:text-amber-500">A daily community event bringing together students, teachers, and prefects for live educational talks, motivation sessions, Q&A, and community discussions. Teachers and prefects may volunteer to host!</p>
          </CardContent>
        </Card>

        {/* Volunteer Dialog */}
        <Dialog open={volunteerOpen} onOpenChange={setVolunteerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-500" />Volunteer to Host</DialogTitle>
              <DialogDescription>Tell the admin what you'd like to present or contribute at today's BREAK-ELIDEMS event.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>What will you present? (optional)</Label>
                <Input placeholder="e.g. Maths revision, Motivational talk, Q&A session" value={volunteerDetails} onChange={e => setVolunteerDetails(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVolunteerOpen(false)}>Cancel</Button>
              <Button onClick={handleVolunteer} disabled={volunteering} className="bg-amber-500 hover:bg-amber-600 text-white">
                {volunteering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Volunteer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
