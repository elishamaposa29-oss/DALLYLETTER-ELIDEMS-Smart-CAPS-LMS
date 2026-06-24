import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Flame, TrendingUp, Medal, Crown } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function StudentAchievements() {
  const { user } = useAuth();
  const [myBadges, setMyBadges] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [allAchievements, setAllAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"badges" | "leaderboard" | "all">("badges");

  useEffect(() => {
    Promise.all([
      fetch("/api/achievements/my", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/achievements/leaderboard", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/achievements", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([my, lb, all]) => {
      setMyBadges(Array.isArray(my) ? my : []);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setAllAchievements(Array.isArray(all) ? all : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const myRank = leaderboard.findIndex((l: any) => l.id === (user as any)?.id) + 1;

  const rankColor = (rank: number) => {
    if (rank === 1) return "text-amber-500";
    if (rank === 2) return "text-slate-400";
    if (rank === 3) return "text-amber-700";
    return "text-slate-600";
  };

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-4 w-4 text-amber-500" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
    if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
    return <span className="text-xs font-bold text-slate-500">#{rank}</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" /> Achievements & Badges
          </h1>
          <p className="text-slate-500 mt-1">Your learning milestones and leaderboard ranking</p>
        </div>

        {/* My Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
            <CardContent className="p-4 text-center">
              <Trophy className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-amber-700">{myBadges.length ?? 0}</p>
              <p className="text-xs text-amber-600 font-medium">Badges Earned</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-4 text-center">
              <Star className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-700">{(user as any)?.performanceScore ?? 0}</p>
              <p className="text-xs text-blue-600 font-medium">Total Points</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-4 text-center">
              {myRank > 0 ? (
                <>
                  <Crown className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-orange-700">#{myRank}</p>
                  <p className="text-xs text-orange-600 font-medium">Leaderboard Rank</p>
                </>
              ) : (
                <>
                  <TrendingUp className="h-8 w-8 text-orange-300 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-orange-400">—</p>
                  <p className="text-xs text-orange-400 font-medium">Not ranked yet</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(["badges", "leaderboard", "all"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {t === "badges" ? "My Badges" : t === "leaderboard" ? "Leaderboard" : "All Achievements"}
            </button>
          ))}
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <>
            {tab === "badges" && (
              <div>
                {myBadges.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <Trophy className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No badges yet</p>
                    <p className="text-sm mt-1">Keep learning to earn your first badge!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {myBadges.map(ua => (
                      <Card key={ua.id} className="border-0 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-amber-50">
                        <CardContent className="p-4 text-center">
                          <div className="text-4xl mb-2">{ua.achievement?.icon ?? "🏆"}</div>
                          <p className="font-semibold text-slate-800 text-sm">{ua.achievement?.name ?? "Badge"}</p>
                          <p className="text-xs text-slate-500 mt-1">{ua.achievement?.description}</p>
                          <div className="mt-2 flex items-center justify-center gap-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            <span className="text-xs font-bold text-amber-600">+{ua.achievement?.pointsValue} pts</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">{new Date(ua.earnedAt).toLocaleDateString()}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "leaderboard" && (
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top Learners</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {leaderboard.map((u, i) => (
                      <div key={u.id} className={`flex items-center gap-3 p-3 rounded-xl ${u.id === (user as any)?.id ? "bg-blue-50 border border-blue-200" : "bg-slate-50"}`}>
                        <div className="w-8 flex items-center justify-center">{rankIcon(i + 1)}</div>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${u.id === (user as any)?.id ? "text-blue-700" : "text-slate-800"}`}>
                            {u.name} {u.id === (user as any)?.id ? "(You)" : ""} {u.isPrefect ? "⭐" : ""}
                          </p>
                          <p className="text-xs text-slate-400">{u.grade ?? "General"} · {u.streakDays ?? 0} day streak 🔥</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${rankColor(i + 1)}`}>{u.performanceScore ?? 0} pts</p>
                          <p className="text-xs text-slate-400">{u.badgeCount ?? 0} badges</p>
                        </div>
                      </div>
                    ))}
                    {leaderboard.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Leaderboard is empty</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            {tab === "all" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {allAchievements.map(a => {
                  const earned = myBadges.some((ua: any) => ua.achievementId === a.id);
                  return (
                    <Card key={a.id} className={`border-0 shadow-sm ${earned ? "bg-amber-50" : "bg-slate-50 opacity-70"}`}>
                      <CardContent className="p-4 text-center">
                        <div className={`text-4xl mb-2 ${!earned ? "grayscale" : ""}`}>{a.icon}</div>
                        <p className="font-semibold text-slate-800 text-sm">{a.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{a.description}</p>
                        <div className="mt-2">
                          {earned ? (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px]">Earned ✓</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">+{a.pointsValue} pts</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
