import { DashboardLayout } from "@/components/DashboardLayout";
import { apiJson } from "@/lib/api";
import {
  useListStudyGroups,
  useJoinStudyGroup,
  useLeaveStudyGroup,
  useCreateStudyGroup,
  getListStudyGroupsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Users, LogOut, Plus, Settings2, UserMinus, ShieldCheck, Mic, BarChart3, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useState, type FormEvent } from "react";

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
  description: string | null;
  creatorId: number;
  creatorName: string;
  memberCount: number;
  isMember?: boolean;
  members?: GroupMember[];
  settings?: GroupSettings;
};

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
  const [busyGroup, setBusyGroup] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: getListStudyGroupsQueryKey() });
  const isStaff = user?.role === "owner" || user?.isPrefect === true;

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !subject.trim()) return;
    createGroupMutation.mutate(
      { data: { name: name.trim(), subject: subject.trim(), description: description.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Study group created", description: "Your group is ready for learners to join." });
          setName("");
          setSubject("");
          setDescription("");
          setShowCreate(false);
          refresh();
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
            <h1 className="text-3xl font-bold tracking-tight">{isStaff ? "Study Groups Management" : "Study Groups"}</h1>
            <p className="text-muted-foreground">Create, join and manage focused learning communities.</p>
          </div>
          <Button onClick={() => setShowCreate(value => !value)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Create Group
          </Button>
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
            ) : groups.map(group => {
              const isMember = group.isMember ?? group.members?.some(member => member.id === user?.id) ?? false;
              const isOwner = group.creatorId === user?.id;
              const canManage = isOwner || isStaff;
              const groupSettings = group.settings ?? defaultSettings(group.id);
              return (
                <Card key={group.id} className="flex h-full flex-col transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary">{group.subject}</Badge>
                      <div className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5" /><span>{group.memberCount}/{groupSettings.maxMembers}</span></div>
                    </div>
                    <CardTitle className="mt-2 text-xl">{group.name}</CardTitle>
                    <CardDescription>Created by {group.creatorName}</CardDescription>
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
                              {canManage && member.id !== group.creatorId && (
                                <div className="flex gap-1">
                                  <Button type="button" variant={member.control?.muted ? "destructive" : "ghost"} size="sm" className="h-7 px-2 text-[10px]" onClick={() => void toggleMemberControl(group.id, member, "muted")} disabled={busyGroup === group.id}>{member.control?.muted ? "Unmute" : "Mute"}</Button>
                                  <Button type="button" variant={member.control?.mediaBlocked ? "destructive" : "ghost"} size="sm" className="h-7 px-2 text-[10px]" onClick={() => void toggleMemberControl(group.id, member, "mediaBlocked")} disabled={busyGroup === group.id}>{member.control?.mediaBlocked ? "Allow voice" : "Block voice"}</Button>
                                  <Button type="button" variant={member.control?.blocked ? "destructive" : "ghost"} size="sm" className="h-7 px-2 text-[10px]" onClick={() => void toggleMemberControl(group.id, member, "blocked")} disabled={busyGroup === group.id}>{member.control?.blocked ? "Unblock" : "Block"}</Button>
                                  <Button type="button" variant={member.control?.suspended ? "destructive" : "ghost"} size="sm" className="h-7 px-2 text-[10px]" onClick={() => void toggleMemberControl(group.id, member, "suspended")} disabled={busyGroup === group.id}>{member.control?.suspended ? "Unsuspend" : "Suspend"}</Button>
                                  {isOwner && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void apiJson(`/api/study-groups/${group.id}/members/${member.id}`, { method: "DELETE" }).then(() => { toast({ title: "Member removed" }); refresh(); }).catch(error => toast({ variant: "destructive", title: "Could not remove member", description: error instanceof Error ? error.message : "Try again." }))} disabled={busyGroup === group.id} aria-label={`Remove ${member.name}`}><UserMinus className="h-3.5 w-3.5" /></Button>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
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
        )}
      </div>
    </DashboardLayout>
  );
}
