import { DashboardLayout } from "@/components/DashboardLayout";
import { apiJson } from "@/lib/api";
import {
  useListStudyGroups,
  useJoinStudyGroup,
  useLeaveStudyGroup,
  useCreateStudyGroup,
  getListStudyGroupsQueryKey,
  getApiUrl,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Users, LogOut, Plus, Settings2, UserMinus, ShieldCheck, Mic, BarChart3, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, type FormEvent } from "react";

type GroupSettings = {
  groupId: number;
  rules: string | null;
  announcementsOnly: boolean;
  allowPolls: boolean;
  allowMedia: boolean;
  maxMembers: number;
};

type MemberControl = {
  blocked: boolean;
  mediaBlocked: boolean;
  suspended: boolean;
  muted: boolean;
  canManageSettings: boolean;
};

type GroupMember = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  control?: MemberControl | null;
};

type GroupView = {
  id: number;
  name: string;
  subject: string;
  grade?: string | null;
  topic?: string | null;
  coverImageUrl?: string | null;
  description: string | null;
  creatorId: number;
  creatorName: string;
  memberCount: number;
  isMember?: boolean;
  members?: GroupMember[];
  settings?: GroupSettings;
};

function AuthenticatedGroupCover({ url, name }: { url: string; name: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl(url), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(response => { if (!response.ok) throw new Error("Cover unavailable"); return response.blob(); })
      .then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setSource(objectUrl); })
      .catch(() => { if (active) setSource(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return source ? <img src={source} alt={`${name} cover`} className="mb-3 h-32 w-full rounded-lg object-cover" loading="lazy" /> : <div className="mb-3 flex h-32 w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">Cover image unavailable</div>;
}

const defaultSettings = (groupId: number): GroupSettings => ({
  groupId,
  rules: null,
  announcementsOnly: false,
  allowPolls: true,
  allowMedia: true,
  maxMembers: 1024,
});

export default function StudentStudyGroups() {
  const { data, isLoading, isError, refetch } = useListStudyGroups();
  const groups = (data ?? []) as unknown as GroupView[];
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
  const [grade, setGrade] = useState("");
  const [topic, setTopic] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busyGroup, setBusyGroup] = useState<number | null>(null);
  const [moderationTargetByGroup, setModerationTargetByGroup] = useState<Record<number, number>>({});
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: getListStudyGroupsQueryKey() });
  const canCreateGroup = user?.role === "owner" || user?.role === "teacher" || user?.isManager === true || user?.isPrefect === true;
  const isManager = user?.role === "owner" || user?.isManager === true;
  const groupSlides = Array.from(groups.reduce((slides, group) => {
    const key = [group.grade || "All grades", group.subject || "Other subject", group.topic || "General"].join(" · ");
    const existing = slides.get(key) ?? [];
    existing.push(group);
    slides.set(key, existing);
    return slides;
  }, new Map<string, GroupView[]>()).entries());

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !subject.trim()) return;
    createGroupMutation.mutate(
      { data: { name: name.trim(), subject: subject.trim(), description: description.trim() || null } },
      {
        onSuccess: async (created) => {
          try {
            let coverImageUrl: string | undefined;
            if (coverFile && user?.role === "owner") {
              const formData = new FormData();
              formData.append("file", coverFile);
              const token = localStorage.getItem("dallyletter_token");
              const upload = await fetch(getApiUrl("/api/lessons/media"), { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
              const uploaded = await upload.json().catch(() => null) as { mediaUrl?: string; error?: string } | null;
              if (!upload.ok || !uploaded?.mediaUrl) throw new Error(uploaded?.error ?? "Group cover upload failed.");
              coverImageUrl = uploaded.mediaUrl;
            }
            const createdId = (created as unknown as { id: number }).id;
            const profile = await apiJson(`/api/study-groups/${createdId}/profile`, { method: "PATCH", body: JSON.stringify({ grade, topic, ...(coverImageUrl ? { coverImageUrl } : {}) }) });
            void profile;
            toast({ title: "Study group created", description: "Your group profile is ready for learners to join." });
            setName(""); setSubject(""); setDescription(""); setGrade(""); setTopic(""); setCoverFile(null); setShowCreate(false); refresh();
          } catch (error) {
            toast({ variant: "destructive", title: "Group created but profile needs attention", description: error instanceof Error ? error.message : "Update the group profile and retry." });
            refresh();
          }
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
    if (!window.confirm("Leave this study group?")) return;
    leaveGroupMutation.mutate({ id: groupId }, {
      onSuccess: () => { toast({ title: "You left the study group." }); refresh(); },
      onError: (error) => toast({ variant: "destructive", title: "Could not leave group", description: error.message }),
    });
  };

  const openSettings = async (groupId: number) => {
    setEditingGroupId(groupId);
    setSettingsLoading(true);
    try {
      setSettings(await apiJson<GroupSettings>(`/api/study-groups/${groupId}/settings`));
    } catch (error) {
      setEditingGroupId(null);
      toast({ variant: "destructive", title: "Could not load group settings", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusyGroup(settings.groupId);
    try {
      await apiJson<GroupSettings>(`/api/study-groups/${settings.groupId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      toast({ title: "Group settings saved" });
      setEditingGroupId(null);
      setSettings(null);
      refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save settings", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusyGroup(null);
    }
  };

  const toggleMemberControl = async (groupId: number, member: GroupMember, field: keyof MemberControl) => {
    const nextValue = !member.control?.[field];
    setBusyGroup(groupId);
    try {
      await apiJson(`/api/study-groups/${groupId}/members/${member.id}/control`, {
        method: "POST",
        body: JSON.stringify({ [field]: nextValue }),
      });
      toast({ title: `${field === "mediaBlocked" ? "Media access" : field} ${nextValue ? "restricted" : "restored"}` });
      refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update member", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusyGroup(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{(user?.role === "owner" || user?.isManager === true) ? "Study Groups Management" : "Study Groups"}</h1>
            <p className="text-muted-foreground">Create, join and manage focused learning communities.</p>
          </div>
          {canCreateGroup && <Button onClick={() => setShowCreate(value => !value)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Create Group
          </Button>}
        </div>

        {showCreate && (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle>Create a study group</CardTitle>
              <CardDescription>Start a subject-focused space for classmates and peers. You become the owner automatically.</CardDescription>
            </CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Input placeholder="Group name" value={name} onChange={event => setName(event.target.value)} required maxLength={120} />
                <Input placeholder="Subject (e.g. Mathematics)" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={120} />
                <Input placeholder="Grade / Form (e.g. Form 3)" value={grade} onChange={event => setGrade(event.target.value)} maxLength={80} />
                <Input placeholder="Topic (e.g. Algebra)" value={topic} onChange={event => setTopic(event.target.value)} maxLength={120} />
                {user?.role === "owner" && <div className="sm:col-span-2 space-y-2"><label className="text-sm font-medium" htmlFor="group-cover-image">Group cover image (owner upload)</label><Input id="group-cover-image" type="file" accept="image/*" onChange={event => setCoverFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">Use an image up to the platform's media upload limit. The image is stored through the existing persistent media service.</p>{coverFile && <p className="text-xs text-muted-foreground">Selected: {coverFile.name}</p>}</div>}
                <Textarea className="sm:col-span-2" placeholder="What will this group focus on?" value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={1000} />
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

        {editingGroupId && settings && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>Group settings</CardTitle>
              <CardDescription>These controls are enforced by the chat API for every member.</CardDescription>
            </CardHeader>
            {settingsLoading ? (
              <CardContent className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></CardContent>
            ) : (
              <form onSubmit={saveSettings}>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="group-rules">Group rules</label>
                    <Textarea id="group-rules" className="mt-1" value={settings.rules ?? ""} onChange={event => setSettings({ ...settings, rules: event.target.value })} rows={4} maxLength={4000} placeholder="Share the rules members should follow." />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ["announcementsOnly", "Announcements only", "Only moderators can post messages."],
                      ["allowPolls", "Allow polls", "Members can create and vote in group polls."],
                      ["allowMedia", "Allow voice messages", "Members can send audio messages."],
                    ] as const).map(([key, label, help]) => (
                      <label key={key} className="flex items-start gap-3 rounded-lg border p-3">
                        <input type="checkbox" className="mt-1 h-4 w-4" checked={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.checked })} />
                        <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{help}</span></span>
                      </label>
                    ))}
                  </div>
                  <div className="max-w-xs">
                    <label className="text-sm font-medium" htmlFor="max-members">Maximum members</label>
                    <Input id="max-members" className="mt-1" type="number" min={2} max={1024} value={settings.maxMembers} onChange={event => setSettings({ ...settings, maxMembers: Math.max(2, Math.min(1024, Number(event.target.value) || 2)) })} />
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button type="submit" disabled={busyGroup === settings.groupId}>Save settings</Button>
                  <Button type="button" variant="ghost" onClick={() => { setEditingGroupId(null); setSettings(null); }}>Cancel</Button>
                </CardFooter>
              </form>
            )}
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="font-medium">Study groups could not be loaded.</p>
              <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
              <Button variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {groups.length === 0 ? (
              <div className="col-span-full rounded-xl border bg-card p-10 text-center">
                <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="font-medium">No study groups yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create the first group for your class or subject.</p>
              </div>
            ) : groupSlides.map(([slideKey, slideGroups]) => (
              <section key={slideKey} className="col-span-full min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{slideKey}</h2><span className="text-xs text-muted-foreground">{slideGroups.length} group{slideGroups.length === 1 ? "" : "s"}</span></div>
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
                  {slideGroups.map(group => {
              const isMember = group.isMember ?? group.members?.some(member => member.id === user?.id) ?? false;
              const isOwner = group.creatorId === user?.id;
              const selectedControl = group.members?.find(member => member.id === user?.id)?.control;
              const canManage = isOwner || isManager || selectedControl?.canManageSettings === true;
              const groupSettings = group.settings ?? defaultSettings(group.id);
              return (
                <Card key={group.id} className="flex h-full w-[min(88vw,360px)] shrink-0 snap-start flex-col transition-shadow hover:shadow-md">
                  <CardHeader>
                    {group.coverImageUrl && <AuthenticatedGroupCover url={group.coverImageUrl} name={group.name} />}
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary">{group.subject}</Badge>
                      <div className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5" /><span>{group.memberCount}/{groupSettings.maxMembers}</span></div>
                    </div>
                    <CardTitle className="mt-2 text-xl">{group.name}</CardTitle>
                    <CardDescription>Created by {group.creatorName}{group.grade ? ` · ${group.grade}` : ""}{group.topic ? ` · ${group.topic}` : ""}</CardDescription>
                    {isMember && <Badge className="mt-2 w-fit" variant="outline">Joined</Badge>}
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <p className="text-sm text-muted-foreground">{group.description || "No description provided."}</p>
                    {isMember && groupSettings.rules && (
                      <div className="rounded-lg bg-muted/60 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Group rules</p>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{groupSettings.rules}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />{groupSettings.allowPolls ? "Polls on" : "Polls off"}</span>
                      <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" />{groupSettings.allowMedia ? "Voice on" : "Voice off"}</span>
                      {groupSettings.announcementsOnly && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Announcements only</span>}
                    </div>
                    {group.members && group.members.length > 0 && (
                      <div className="border-t pt-4">
                        <p className="mb-2 text-xs font-semibold text-foreground/70">MEMBERS ({group.memberCount})</p>
                        <div className="space-y-2">
                          {group.members.map(member => (
                            <div key={member.id} className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full border bg-primary/10 text-xs font-bold text-primary">
                                {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : member.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="min-w-0 flex-1 truncate text-xs">{member.name}{member.id === group.creatorId ? " · owner" : ""}</span>
                              {member.control && <span className="text-[10px] text-muted-foreground">{[member.control.muted && "muted",member.control.suspended && "suspended",member.control.blocked && "blocked",member.control.mediaBlocked && "voice blocked"].filter(Boolean).join(" · ")}</span>}
                            </div>
                          ))}
                        </div>
                        {canManage && group.members.some(member => member.id !== group.creatorId) && (() => {
                          const targets = group.members.filter(member => member.id !== group.creatorId);
                          const targetId = moderationTargetByGroup[group.id] ?? targets[0]?.id;
                          const target = targets.find(member => member.id === targetId) ?? targets[0];
                          if (!target) return null;
                          return <div className="mt-3 space-y-3 rounded-xl border bg-muted/20 p-3">
                            <label className="block text-xs font-semibold" htmlFor={`moderation-target-${group.id}`}>Manage a member</label>
                            <select id={`moderation-target-${group.id}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={target.id} onChange={event => setModerationTargetByGroup(current => ({...current,[group.id]:Number(event.target.value)}))}>
                              {targets.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                            </select>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant={target.control?.muted ? "destructive" : "outline"} size="sm" onClick={() => void toggleMemberControl(group.id,target,"muted")} disabled={busyGroup===group.id}>{target.control?.muted ? "Unmute" : "Mute"}</Button>
                              <Button type="button" variant={target.control?.mediaBlocked ? "destructive" : "outline"} size="sm" onClick={() => void toggleMemberControl(group.id,target,"mediaBlocked")} disabled={busyGroup===group.id}>{target.control?.mediaBlocked ? "Allow voice" : "Block voice"}</Button>
                              <Button type="button" variant={target.control?.blocked ? "destructive" : "outline"} size="sm" onClick={() => void toggleMemberControl(group.id,target,"blocked")} disabled={busyGroup===group.id}>{target.control?.blocked ? "Unblock" : "Block"}</Button>
                              <Button type="button" variant={target.control?.suspended ? "destructive" : "outline"} size="sm" onClick={() => void toggleMemberControl(group.id,target,"suspended")} disabled={busyGroup===group.id}>{target.control?.suspended ? "Unsuspend" : "Suspend"}</Button>
                              <Button type="button" variant={target.control?.canManageSettings ? "secondary" : "outline"} size="sm" onClick={() => void toggleMemberControl(group.id,target,"canManageSettings")} disabled={busyGroup===group.id}>{target.control?.canManageSettings ? "Remove settings access" : "Grant settings access"}</Button>
                              {isOwner && <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { if(!window.confirm(`Remove ${target.name} from this group?`)) return; void apiJson(`/api/study-groups/${group.id}/members/${target.id}`,{method:"DELETE"}).then(()=>{toast({title:"Member removed"});refresh();}).catch(error=>toast({variant:"destructive",title:"Could not remove member",description:error instanceof Error?error.message:"Try again."})); }} disabled={busyGroup===group.id}><UserMinus className="mr-1 h-3.5 w-3.5"/>Remove member</Button>}
                            </div>
                          </div>;
                        })()}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
                    {user?.role === "owner" && <Button type="button" variant="outline" size="sm" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busyGroup === group.id} onClick={() => {
                      if (!window.confirm(`Permanently delete "${group.name}" and its members, messages, polls, settings and moderation records from Dallyletter? This cannot be undone.`)) return;
                      setBusyGroup(group.id);
                      void apiJson<{ok:boolean;deletedGroupName:string}>(`/api/study-groups/${group.id}`,{method:"DELETE"}).then(result=>{toast({title:"Study group permanently deleted",description:result.deletedGroupName});if(editingGroupId===group.id){setEditingGroupId(null);setSettings(null);}refresh();}).catch(error=>toast({variant:"destructive",title:"Group deletion failed",description:error instanceof Error?error.message:"Try again."})).finally(()=>setBusyGroup(null));
                    }}><Trash2 className="h-4 w-4" />Delete group</Button>}
                    {canManage && <Button variant="outline" className="gap-2" onClick={() => void openSettings(group.id)} disabled={busyGroup === group.id}><Settings2 className="h-4 w-4" />Settings</Button>}
                    {canManage && <Button variant="ghost" size="sm" onClick={() => {
                      if (!window.confirm("Clear all messages in this study group?")) return;
                      setBusyGroup(group.id);
                      void apiJson(`/api/study-groups/${group.id}/messages`, { method: "DELETE" }).then(() => toast({ title: "Group messages cleared" })).catch(error => toast({ variant: "destructive", title: "Could not clear messages", description: error instanceof Error ? error.message : "Try again." })).finally(() => setBusyGroup(null));
                    }} disabled={busyGroup === group.id}>Clear chat</Button>}
                    {isMember ? (
                      <Button variant="secondary" className="min-w-[130px] flex-1 gap-2" onClick={() => handleLeaveGroup(group.id)} disabled={isOwner || leaveGroupMutation.isPending}>
                        {isOwner ? <Users className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}{isOwner ? "Group Owner" : "Leave Group"}
                      </Button>
                    ) : (
                      <Button className="min-w-[130px] flex-1 gap-2" onClick={() => handleJoinGroup(group.id)} disabled={joinGroupMutation.isPending || group.memberCount >= groupSettings.maxMembers}><Users className="h-4 w-4" />{group.memberCount >= groupSettings.maxMembers ? "Group Full" : "Join Group"}</Button>
                    )}
                  </CardFooter>
                </Card>
              );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
