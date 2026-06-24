import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Plus, Star, Gift } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";
const ICONS = ["🏆","⭐","🎯","🔥","💡","📚","🎖️","🌟","🦁","🚀","💎","🏅","🎓","✨","🌈","🎪"];
const CATEGORIES = ["learning","attendance","participation","leadership","academic","social"];

export default function AdminAchievements() {
  const { toast } = useToast();
  const [achievements, setAchievements] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [awardOpen, setAwardOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [awardUserId, setAwardUserId] = useState("");
  const [awardNote, setAwardNote] = useState("");
  const [form, setForm] = useState({ name: "", description: "", icon: "🏆", category: "learning", pointsValue: "10" });

  const load = () => {
    void Promise.all([
      fetch("/api/achievements", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/users", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([a, u]) => {
      setAchievements(Array.isArray(a) ? a : []);
      setStudents(Array.isArray(u) ? u : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = () => {
    if (!form.name || !form.description) { toast({ variant: "destructive", title: "Name and description required" }); return; }
    void fetch("/api/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ ...form, pointsValue: parseInt(form.pointsValue) }),
    }).then(r => {
      if (!r.ok) { toast({ variant: "destructive", title: "Failed" }); return; }
      toast({ title: "✅ Achievement created" });
      setCreateOpen(false);
      setForm({ name: "", description: "", icon: "🏆", category: "learning", pointsValue: "10" });
      load();
    });
  };

  const award = () => {
    if (!selectedAchievement || !awardUserId) { toast({ variant: "destructive", title: "Select a student" }); return; }
    void fetch("/api/achievements/award", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ userId: parseInt(awardUserId), achievementId: selectedAchievement.id, note: awardNote }),
    }).then(async r => {
      if (r.status === 409) { toast({ variant: "destructive", title: "Already awarded to this student" }); return; }
      if (!r.ok) { toast({ variant: "destructive", title: "Award failed" }); return; }
      toast({ title: `✅ ${selectedAchievement.icon} ${selectedAchievement.name} awarded!` });
      setAwardOpen(false); setAwardUserId(""); setAwardNote(""); setSelectedAchievement(null);
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="h-6 w-6 text-amber-500" /> Achievements & Badges
            </h1>
            <p className="text-slate-500 mt-1">Create badges and award them to outstanding learners</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={awardOpen} onOpenChange={setAwardOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Gift className="h-4 w-4" /> Award Badge</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Award a Badge to a Student</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">Select Achievement</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm" value={selectedAchievement?.id ?? ""} onChange={e => setSelectedAchievement(achievements.find(a => a.id === parseInt(e.target.value)) ?? null)}>
                      <option value="">— Choose badge —</option>
                      {achievements.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">Select Student</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm" value={awardUserId} onChange={e => setAwardUserId(e.target.value)}>
                      <option value="">— Choose student —</option>
                      {students.filter(s => s.role === "student").map(s => <option key={s.id} value={s.id}>{s.name} {s.grade ? `(${s.grade})` : ""}</option>)}
                    </select>
                  </div>
                  <Input placeholder="Award note (optional)" value={awardNote} onChange={e => setAwardNote(e.target.value)} />
                  <Button className="w-full bg-amber-500 text-white" onClick={award}>Award Badge</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-amber-500 text-white"><Plus className="h-4 w-4" /> Create Badge</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Create New Achievement Badge</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <Input placeholder="Badge Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none" placeholder="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Choose Icon</label>
                    <div className="flex flex-wrap gap-2">
                      {ICONS.map(ic => (
                        <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
                          className={`text-2xl p-1.5 rounded-lg transition-all ${form.icon === ic ? "bg-amber-100 ring-2 ring-amber-400 scale-110" : "hover:bg-slate-100"}`}>
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Category</label>
                      <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                        {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Points Value</label>
                      <Input type="number" value={form.pointsValue} onChange={e => setForm(f => ({ ...f, pointsValue: e.target.value }))} />
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-3xl">{form.icon}</span>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{form.name || "Badge Name"}</p>
                      <p className="text-xs text-slate-500">{form.description || "Description"}</p>
                      <p className="text-xs font-bold text-amber-600 mt-0.5">+{form.pointsValue} pts</p>
                    </div>
                  </div>
                  <Button className="w-full bg-amber-500 text-white" onClick={create}>Create Badge</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {achievements.length === 0 ? (
              <div className="col-span-full text-center py-16 text-slate-400">
                <Trophy className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No badges yet. Create your first achievement!</p>
              </div>
            ) : achievements.map(a => (
              <Card key={a.id} className="border-0 shadow-sm hover:shadow-md transition-shadow group">
                <CardContent className="p-4 text-center">
                  <div className="text-4xl mb-2">{a.icon}</div>
                  <p className="font-semibold text-slate-800 text-sm">{a.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{a.description}</p>
                  <div className="mt-2 flex items-center justify-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" />
                    <span className="text-xs font-bold text-amber-600">+{a.pointsValue} pts</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] mt-2 capitalize">{a.category}</Badge>
                  <Button size="sm" className="mt-3 w-full bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setSelectedAchievement(a); setAwardOpen(true); }}>
                    Award to Student
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
