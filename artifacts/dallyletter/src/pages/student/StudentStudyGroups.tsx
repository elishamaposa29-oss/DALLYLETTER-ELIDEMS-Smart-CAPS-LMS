import { DashboardLayout } from "@/components/DashboardLayout";
import { useListStudyGroups, useJoinStudyGroup, useLeaveStudyGroup, useCreateStudyGroup, getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Users, LogOut, Plus, Settings2, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListStudyGroupsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function StudentStudyGroups() {
  const { data: groups, isLoading } = useListStudyGroups();
  const joinGroupMutation = useJoinStudyGroup();
  const leaveGroupMutation = useLeaveStudyGroup();
  const createGroupMutation = useCreateStudyGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busyGroup, setBusyGroup] = useState<number | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListStudyGroupsQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subject.trim()) return;
    createGroupMutation.mutate(
      { data: { name: name.trim(), subject: subject.trim(), description: description.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Study group created", description: "Your group is ready for learners to join." });
          setName(""); setSubject(""); setDescription(""); setShowCreate(false); refresh();
        },
        onError: (error) => toast({ variant: "destructive", title: "Could not create group", description: error.message }),
      },
    );
  };

  const handleJoinGroup = (groupId: number) => {
    joinGroupMutation.mutate({ id: groupId }, {
      onSuccess: () => { toast({ title: "Joined study group" }); refresh(); },
      onError: (error) => toast({ variant: "destructive", title: "Could not join group", description: error.message }),
    });
  };

  const handleLeaveGroup = (groupId: number) => {
    if (!confirm("Leave this study group?")) return;
    leaveGroupMutation.mutate({ id: groupId }, {
      onSuccess: () => { toast({ title: "You left the study group." }); refresh(); },
      onError: (error) => toast({ variant: "destructive", title: "Could not leave group", description: error.message }),
    });
  };

  const updateSettings = async (groupId: number) => {
    const rules = window.prompt("Group rules (optional):") ?? "";
    const allowPolls = window.confirm("Allow members to create polls?");
    const allowMedia = window.confirm("Allow members to send media/voice messages?");
    setBusyGroup(groupId);
    try {
      const r = await fetch(getApiUrl(`/api/study-groups/${groupId}/settings`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ rules, allowPolls, allowMedia }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Settings update failed");
      toast({ title: "Group settings saved" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save settings", description: e instanceof Error ? e.message : "Try again." });
    } finally { setBusyGroup(null); }
  };

  const removeMember = async (groupId: number, memberId: number, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this group?`)) return;
    setBusyGroup(groupId);
    try {
      const r = await fetch(getApiUrl(`/api/study-groups/${groupId}/members/${memberId}`), { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not remove member");
      toast({ title: "Member removed" }); refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not remove member", description: e instanceof Error ? e.message : "Try again." });
    } finally { setBusyGroup(null); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Groups</h1>
            <p className="text-muted-foreground">Create, join and manage focused learning communities.</p>
          </div>
          <Button onClick={() => setShowCreate(v => !v)} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> Create Group</Button>
        </div>

        {showCreate && (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader><CardTitle>Create a study group</CardTitle><CardDescription>Start a subject-focused space for classmates and peers.</CardDescription></CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Input placeholder="Group name" value={name} onChange={e => setName(e.target.value)} required />
                <Input placeholder="Subject (e.g. Mathematics)" value={subject} onChange={e => setSubject(e.target.value)} required />
                <Textarea className="sm:col-span-2" placeholder="What will this group focus on?" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
              </CardContent>
              <CardFooter className="gap-2">
                <Button type="submit" disabled={createGroupMutation.isPending || !name.trim() || !subject.trim()}>
                  {createGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Group
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups?.length === 0 ? (
              <div className="col-span-full text-center p-10 border rounded-xl bg-card">
                <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="font-medium">No study groups yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create the first group for your class or subject.</p>
              </div>
            ) : groups?.map(group => {
              const isMember = group.members?.some(m => m.id === user?.id);
              const isOwner = group.creatorId === user?.id;
              const canLeave = isMember && !isOwner;
              return (
                <Card key={group.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start gap-2">
                      <Badge variant="secondary">{group.subject}</Badge>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-2 py-1 rounded-full"><Users className="h-3.5 w-3.5" /><span>{group.memberCount}</span></div>
                    </div>
                    <CardTitle className="text-xl mt-2">{group.name}</CardTitle>
                    <CardDescription>Created by {group.creatorName}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground">{group.description || "No description provided."}</p>
                    {group.members?.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-xs font-semibold mb-2 text-foreground/70">MEMBERS</p>
                        <div className="space-y-2">
                          {group.members.slice(0, 5).map(member => (
                            <div key={member.id} className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 border flex items-center justify-center text-xs font-bold text-primary">
                                {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : member.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs truncate flex-1">{member.name}</span>
                              {isOwner && member.id !== user?.id && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void removeMember(group.id, member.id, member.name)} disabled={busyGroup === group.id} aria-label={`Remove ${member.name}`}><UserMinus className="h-3.5 w-3.5" /></Button>}
                            </div>
                          ))}
                          {group.members.length > 5 && <p className="text-xs text-muted-foreground">+{group.members.length - 5} more members</p>}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-4 border-t flex flex-wrap gap-2">
                    {isOwner && <Button variant="outline" className="gap-2" onClick={() => void updateSettings(group.id)} disabled={busyGroup === group.id}><Settings2 className="h-4 w-4" /> Settings</Button>}
                    {isMember ? (
                      <Button variant="secondary" className="flex-1 min-w-[130px] gap-2" onClick={() => canLeave && handleLeaveGroup(group.id)} disabled={!canLeave || leaveGroupMutation.isPending}>
                        {canLeave ? <LogOut className="h-4 w-4" /> : <Users className="h-4 w-4" />}{canLeave ? "Leave Group" : "Group Owner"}
                      </Button>
                    ) : (
                      <Button className="flex-1 min-w-[130px] gap-2" onClick={() => handleJoinGroup(group.id)} disabled={joinGroupMutation.isPending}><Users className="h-4 w-4" />Join Group</Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
