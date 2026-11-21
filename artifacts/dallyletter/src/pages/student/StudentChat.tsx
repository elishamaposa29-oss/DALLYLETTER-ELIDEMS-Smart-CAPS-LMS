import { DashboardLayout } from "@/components/DashboardLayout";
import { StudyGroupPollPanel, StudyGroupPollCard, type ChatPoll } from "@/components/StudyGroupPollPanel";
import UserProfileLink from "@/components/UserProfileLink";
import { apiJson, authenticatedFetch } from "@/lib/api";
import { getApiUrl } from "@workspace/api-client-react";
import {
  useListMessages,
  useSendMessage,
  useListStudyGroups,
  useListUsers,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Users, MessageSquare, Reply, X, Flag, RefreshCw, User, ArrowLeft, Paperclip, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { SendMessageBodyType } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { AuthenticatedAudio } from "@/components/AuthenticatedAudio";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type GroupView = {
  id: number;
  name: string;
  description?: string | null;
  subject?: string;
  coverImageUrl?: string | null;
  creatorName?: string;
  creatorId: number;
  canManage?: boolean;
  memberCount: number;
  isMember?: boolean;
  members?: Array<{ id: number; name?: string; avatarUrl?: string | null }>;
  settings?: GroupSettings;
};

function AuthenticatedContactAvatar({ url, name }: { url?: string | null; name: string }) {
  const [source, setSource] = useState<string | null>(/^https:\/\//i.test(url || "") ? (url || null) : null);
  useEffect(() => {
    if (!url) { setSource(null); return; }
    if (/^https:\/\//i.test(url)) { setSource(url); return; }
    let active = true;
    let objectUrl: string | undefined;
    const token = localStorage.getItem("dallyletter_token") ?? "";
    void fetch(getApiUrl(url), { headers: token ? { Authorization: "Bearer " + token } : undefined })
      .then(response => { if (!response.ok) throw new Error("Avatar unavailable"); return response.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setSource(objectUrl); })
      .catch(() => { if (active) setSource(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return source
    ? <img src={source} alt={name} className="h-full w-full object-cover" loading="lazy" />
    : <span>{name.charAt(0).toUpperCase()}</span>;
}

type GroupSettings = {
  allowPolls: boolean;
  allowMedia: boolean;
  announcementsOnly: boolean;
  rules: string | null;
};

const defaultGroupSettings: GroupSettings = {
  allowPolls: true,
  allowMedia: true,
  announcementsOnly: false,
  rules: null,
};

/** Authenticated blob loading mirrors the proven PR #131 group-cover implementation. */
function AuthenticatedGroupAvatar({ url, name }: { url: string; name: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setSource(null);
    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl(url), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(response => { if (!response.ok) throw new Error("Group image unavailable"); return response.blob(); })
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => { if (active) setSource(null); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return source
    ? <img src={source} alt={name + " group avatar"} className="h-full w-full object-cover" loading="lazy" />
    : <span role="img" aria-label={name + " group avatar"}>{name.slice(0, 1).toUpperCase()}</span>;
}

export default function StudentChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => { const value = new URLSearchParams(window.location.search).get("groupId"); return value && /^\d+$/.test(value) ? Number(value) : null; });
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => { const value = new URLSearchParams(window.location.search).get("recipientId"); return value && /^\d+$/.test(value) ? Number(value) : null; });
  const [activeTab, setActiveTab] = useState<"groups" | "people">(() => new URLSearchParams(window.location.search).has("recipientId") ? "people" : "groups");
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [groupHubOpen, setGroupHubOpen] = useState(false);
  const [unreadSummary, setUnreadSummary] = useState<{
    groups:Array<{id:number;unread:number}>;
    privateChats:Array<{id:number;unread:number}>;
    recentGroups:Array<{id:number;messageCount:number;lastMessageAt:string}>;
    recentPeople:Array<{id:number;messageCount:number;lastMessageAt:string}>;
  }>({groups:[],privateChats:[],recentGroups:[],recentPeople:[]});
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [reportingMessageId, setReportingMessageId] = useState<number | null>(null);
  const [settings, setSettings] = useState<GroupSettings>(defaultGroupSettings);
  const [groupPolls, setGroupPolls] = useState<ChatPoll[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: groupData, isLoading: groupsLoading, isError: groupsError, refetch: refetchGroups } = useListStudyGroups();
  const groups = (groupData ?? []) as unknown as GroupView[];
  const joinedGroups = groups.filter(group => group.isMember ?? group.members?.some(member => member.id === user?.id));
  const recentGroupRank = new Map(unreadSummary.recentGroups.map((item,index) => [item.id,index] as const));
  const visibleJoinedGroups = joinedGroups
    .filter(group => group.name.toLowerCase().includes(conversationSearch.trim().toLowerCase()))
    .sort((a,b) => (recentGroupRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (recentGroupRank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useListUsers();
  // Show every account returned by the privacy-filtered user directory, not just educators.
  // Recent direct-message partners appear first; the remaining directory stays available alphabetically.
  const contacts = (users ?? []).filter(contact => contact.id !== user?.id);
  const recentPeopleRank = new Map(unreadSummary.recentPeople.map((item,index) => [item.id,index] as const));
  const visibleContacts = contacts
    .filter(contact => contact.name.toLowerCase().includes(conversationSearch.trim().toLowerCase()))
    .sort((a,b) => {
      const aRank = recentPeopleRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = recentPeopleRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.name.localeCompare(b.name);
    });

  const { data: messages, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useListMessages(
    { groupId: selectedGroupId, recipientId: selectedUserId },
    { query: { enabled: !!selectedGroupId || !!selectedUserId, refetchInterval: 5000 } as any },
  );
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiJson<typeof unreadSummary>("/api/messages/unread-summary");
        if (active) setUnreadSummary({
          groups:result.groups ?? [],
          privateChats:result.privateChats ?? [],
          recentGroups:result.recentGroups ?? [],
          recentPeople:result.recentPeople ?? [],
        });
      } catch { /* Retry on the next polling cycle. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const unreadForGroup = (id:number) => unreadSummary.groups.find(item=>item.id===id)?.unread ?? 0;
  const unreadForPrivate = (id:number) => unreadSummary.privateChats.find(item=>item.id===id)?.unread ?? 0;
  const DUnread = ({count}:{count:number}) => count>0 ? <span className="dl-unread-gold-badge inline-flex items-center gap-1 rounded-md border-2 border-[#FFD700] bg-[#0B1E3A] px-1 py-0.5 text-[10px] font-bold text-[#FFD700]" aria-label={count+" unread"}><img src="/favicon.svg" alt="" className="h-3.5 w-3.5 rounded border border-[#FFD700]"/>{count>99?"99+":count}</span> : null;

  const sendMessageMutation = useSendMessage();
  const rootMessages = [...(messages?.filter(currentMessage => currentMessage.parentMessageId == null) ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
  const timelineItems = [
    ...rootMessages.map(item => ({ kind: "message" as const, id: item.id, createdAt: item.createdAt, item })),
    ...(selectedGroupId == null ? [] : groupPolls.map(item => ({ kind: "poll" as const, id: item.poll.id, createdAt: item.poll.createdAt ?? "", item }))),
  ].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || (a.kind === b.kind ? a.id-b.id : a.kind === "message" ? -1 : 1));
  const replyTarget = messages?.find(currentMessage => currentMessage.id === replyTo);
  const selectedGroup = joinedGroups.find(group => group.id === selectedGroupId);
  const selectedContact = contacts.find(contact => contact.id === selectedUserId);
  const isGroupConversation = selectedGroupId != null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedGroupId) { setSettings(defaultGroupSettings); return; }
    let active = true;
    void apiJson<GroupSettings>(`/api/study-groups/${selectedGroupId}/settings`)
      .then(nextSettings => { if (active) setSettings(nextSettings); })
      .catch(() => { if (active) setSettings(defaultGroupSettings); });
    return () => { active = false; };
  }, [selectedGroupId]);

  useEffect(() => {
    if (joinedGroups.length > 0 && !selectedGroupId && !selectedUserId) setSelectedGroupId(joinedGroups[0].id);
  }, [joinedGroups, selectedGroupId, selectedUserId]);

  const invalidateMessages = () => void queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId, recipientId: selectedUserId }) });

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || (!selectedGroupId && !selectedUserId)) return;
    sendMessageMutation.mutate({
      data: {
        content: message.trim(),
        type: SendMessageBodyType.text,
        groupId: selectedGroupId,
        recipientId: selectedUserId,
        parentMessageId: selectedGroupId ? replyTo : null,
      },
    }, {
      onSuccess: () => {
        setMessage("");
        setReplyTo(null);
        invalidateMessages();
      },
      onError: error => toast({ variant: "destructive", title: "Message not sent", description: error.message }),
    });
  };

  const handleSendMedia = async (file: File) => {
    if (!selectedGroupId && !selectedUserId) throw new Error("Select a conversation before attaching a learning file.");
    if (selectedGroupId && !settings.allowMedia) throw new Error("Learning attachments are disabled in this group.");
    const body = new FormData();
    if (selectedGroupId) body.append("groupId", String(selectedGroupId));
    if (selectedUserId) body.append("recipientId", String(selectedUserId));
    body.append("file", file, file.name);
    const upload = await authenticatedFetch("/api/messages/media", { method: "POST", body });
    const result = await upload.json().catch(() => null) as { mediaUrl?: string; mimeType?: string; error?: string } | null;
    if (!upload.ok || !result?.mediaUrl) throw new Error(result?.error ?? "Attachment upload failed.");
    await sendMessageMutation.mutateAsync({ data: {
      content: file.name, type: "media" as SendMessageBodyType, groupId: selectedGroupId, recipientId: selectedUserId, mediaUrl: result.mediaUrl,
    }});
    invalidateMessages();
  };

  const handleSendVoice = async (audio: Blob) => {
    if (!selectedGroupId && !selectedUserId) throw new Error("Select a conversation before sending a voice message.");
    if (selectedGroupId && !settings.allowMedia) throw new Error("Voice messages are disabled in this group.");
    const body = new FormData();
    if (selectedGroupId) body.append("groupId", String(selectedGroupId));
    if (selectedUserId) body.append("recipientId", String(selectedUserId));
    body.append("file", audio, "voice-message.webm");
    const upload = await authenticatedFetch("/api/messages/media", { method: "POST", body });
    const result = await upload.json().catch(() => null) as { mediaUrl?: string; error?: string } | null;
    if (!upload.ok || !result?.mediaUrl) throw new Error(result?.error ?? "Voice upload failed.");
    await sendMessageMutation.mutateAsync({
      data: {
        content: "Voice message",
        type: SendMessageBodyType.voice,
        groupId: selectedGroupId,
        recipientId: selectedUserId,
        mediaUrl: result.mediaUrl,
      },
    });
    invalidateMessages();
  };

  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const handleDeleteMessage = async (messageId: number) => {
    if (!window.confirm("Delete this message and its attachment, if any? This cannot be undone.")) return;
    setDeletingMessageId(messageId);
    try {
      const result = await apiJson<{deleted?:boolean;mediaCleanupPending?:boolean;warning?:string}>(`/api/messages/${messageId}`, { method: "DELETE" });
      if (!result.deleted) throw new Error("The server did not confirm that the message was deleted.");
      await queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId, recipientId: selectedUserId }) });
      toast({ title: "Message deleted", description: result.mediaCleanupPending ? result.warning || "The message is deleted; its stored attachment still needs cleanup." : undefined });
    } catch (error) {
      toast({ variant: "destructive", title: "Message could not be deleted", description: error instanceof Error ? error.message : "Try again." });
    } finally { setDeletingMessageId(null); }
  };

  const handleReport = async (messageId: number) => {
    const reason = window.prompt("Why are you reporting this message?")?.trim();
    if (!reason) return;
    setReportingMessageId(messageId);
    try {
      await apiJson(`/api/messages/${messageId}/report`, { method: "POST", body: JSON.stringify({ reason }) });
      toast({ title: "Report submitted", description: "Staff will review this message." });
    } catch (error) {
      toast({ variant: "destructive", title: "Report could not be submitted", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setReportingMessageId(null);
    }
  };

  const selectGroup = (id: number) => {
    setSelectedGroupId(id);
    setSelectedUserId(null);
    setReplyTo(null);
  };

  const selectContact = (id: number) => {
    setSelectedUserId(id);
    setSelectedGroupId(null);
    setReplyTo(null);
  };

  return (
    <DashboardLayout>
      <div className="flex min-w-0 flex-col gap-3 md:h-[calc(100dvh-8rem)] md:min-h-[500px] md:flex-row md:gap-6">
        <Card className="flex w-full shrink-0 flex-col bg-card/50 md:w-1/3 md:max-h-none">
          <div className="border-b p-4">
            <Tabs value={activeTab} onValueChange={value => setActiveTab(value as "groups" | "people")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="groups">Groups</TabsTrigger>
                <TabsTrigger value="people">People</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="px-3 pt-3"><Input aria-label="Search users, groups and communities" placeholder="Search users, groups and communities…" value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} /></div>
          <div className="max-h-[34vh] flex-1 space-y-1 overflow-y-auto p-2 md:max-h-none">
            {activeTab === "groups" ? (
              groupsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : groupsError ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground"><p>Groups could not be loaded.</p><Button variant="outline" size="sm" onClick={() => void refetchGroups()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button></div>
              ) : visibleJoinedGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center"><Users className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No joined groups yet. Join one from Study Groups to start chatting.</p></div>
              ) : (
                visibleJoinedGroups.map(group => (
                  <div key={group.id} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 transition-colors ${selectedGroupId === group.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"}`}>
                    <button type="button" onClick={() => selectGroup(group.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#C9A227] bg-[#0B1E3A] text-sm font-bold text-[#FFD700]">{group.coverImageUrl ? <AuthenticatedGroupAvatar url={group.coverImageUrl} name={group.name}/> : group.name.slice(0,1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                    </button>
                    <DUnread count={unreadForGroup(group.id)} />
                    <button type="button" aria-label={`Open ${group.name} chat`} onClick={() => selectGroup(group.id)} className="rounded-full bg-muted px-2 py-1 text-xs">{group.memberCount}</button>
                  </div>
                ))
              )
            ) : (
              usersLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : usersError ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground"><p>Contacts could not be loaded.</p><Button variant="outline" size="sm" onClick={() => void refetchUsers()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button></div>
              ) : visibleContacts.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No educator contacts are available yet.</div>
              ) : (
                visibleContacts.map(contact => (
                  <div key={contact.id} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors ${selectedUserId === contact.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                    <Link href={"/profile/" + Number(contact.id)} aria-label={`Open ${contact.name}'s profile`} title={`Open ${contact.name}'s profile`} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/20 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <AuthenticatedContactAvatar url={(contact as any).avatarUrl} name={contact.name} />
                    </Link>
                    <button type="button" onClick={() => selectContact(contact.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <span className="min-w-0 flex-1 truncate font-medium">{contact.name}</span><DUnread count={unreadForPrivate(contact.id)} />
                      <span className="shrink-0 text-xs capitalize opacity-70">{contact.isPrefect ? "Prefect" : contact.isManager ? `${String((contact as any).managerLevel || "Manager")} manager` : String(contact.role) === "student" || String(contact.role) === "learner" ? "Learner" : String(contact.role || "Member").replace(/_/g," ")}</span>
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </Card>

        <Card className={`flex min-h-[420px] flex-1 flex-col overflow-hidden bg-card ${chatFullscreen ? "fixed inset-0 z-[100] min-h-0 rounded-none" : ""}`}>
          {!selectedGroupId && !selectedUserId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground"><MessageSquare className="h-14 w-14 text-muted-foreground/20" /><p className="font-medium">Select a group or educator</p><p className="text-sm">Use the tabs to open an ELIDEMS Connect conversation.</p></div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => { setSelectedGroupId(null); setSelectedUserId(null); }} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button>
                  {isGroupConversation ? <button type="button" onClick={() => setGroupHubOpen(true)} aria-label="Open full group hub" title="Open group hub" className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#C9A227] bg-[#0B1E3A] text-sm font-bold text-[#FFD700]">{selectedGroup?.coverImageUrl ? <AuthenticatedGroupAvatar url={selectedGroup.coverImageUrl} name={selectedGroup.name}/> : selectedGroup?.name?.slice(0,1).toUpperCase()}</button> : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><User className="h-4 w-4 text-primary" /></div>}
                  <div className="min-w-0"><p className="truncate font-semibold">{isGroupConversation ? selectedGroup?.name : selectedContact?.name}</p>{isGroupConversation && settings.rules && <p className="truncate text-xs text-muted-foreground">{settings.rules}</p>}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1"><Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setChatFullscreen(value => !value)} aria-label={chatFullscreen ? "Exit full-screen chat" : "Open full-screen chat"} title={chatFullscreen ? "Exit full-screen chat" : "Open full-screen chat"}>{chatFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button></div>
              </div>

              {groupHubOpen && isGroupConversation && selectedGroup && (
                <div role="dialog" aria-modal="true" aria-label={`${selectedGroup.name} group hub`} className="fixed inset-0 z-[110] overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
                  <div className="mx-auto max-w-xl space-y-4 rounded-2xl border bg-card p-5 shadow-2xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 border-[#C9A227] bg-[#0B1E3A] text-2xl font-bold text-[#FFD700]">{selectedGroup.coverImageUrl ? <AuthenticatedGroupAvatar url={selectedGroup.coverImageUrl} name={selectedGroup.name}/> : selectedGroup.name.slice(0,1).toUpperCase()}</div>
                        <div><h2 className="text-lg font-bold">{selectedGroup.name}</h2><p className="text-sm text-muted-foreground">{selectedGroup.subject || "Study group"} · {selectedGroup.memberCount} members</p><p className="text-xs text-muted-foreground">Created by {selectedGroup.creatorName || "Group creator"}</p></div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setGroupHubOpen(false)} aria-label="Close group hub"><X className="h-5 w-5"/></Button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{selectedGroup.description || "No group description has been added."}</p>
                    {settings.rules && <div className="rounded-lg bg-muted p-3"><p className="mb-1 text-xs font-semibold uppercase">Group rules</p><p className="whitespace-pre-wrap text-sm">{settings.rules}</p></div>}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted p-3"><p className="text-lg font-bold">{settings.allowPolls ? "On" : "Off"}</p><p className="text-[11px] text-muted-foreground">Polls</p></div>
                      <div className="rounded-lg bg-muted p-3"><p className="text-lg font-bold">{settings.allowMedia ? "On" : "Off"}</p><p className="text-[11px] text-muted-foreground">Media</p></div>
                      <div className="rounded-lg bg-muted p-3"><p className="text-lg font-bold">{settings.announcementsOnly ? "Limited" : "Open"}</p><p className="text-[11px] text-muted-foreground">Posting</p></div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold">Recent group activity</h3>
                      {rootMessages.slice(-4).reverse().map(item => <div key={item.id} className="rounded-lg bg-muted/60 p-3"><UserProfileLink userId={item.senderId} name={item.senderName} avatarUrl={(users ?? []).find(contact=>contact.id===item.senderId)?.avatarUrl} className="text-xs font-semibold"/><p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{item.content || (item.mediaUrl ? "Shared media" : "Group activity")}</p></div>)}
                      {rootMessages.length===0 && <p className="text-sm text-muted-foreground">No group posts yet.</p>}
                    </div>
                    <div className="flex items-center justify-between"><h3 className="font-semibold">Members ({selectedGroup.members?.length ?? selectedGroup.memberCount})</h3><span className="text-xs text-muted-foreground">Group hub</span></div>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {(selectedGroup.members ?? []).map(member => <UserProfileLink key={member.id} userId={member.id} name={member.name || `Member ${member.id}`} avatarUrl={member.avatarUrl} className="text-sm"/>)}
                    </div>
                    <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => setGroupHubOpen(false)}>Return to chat</Button><Button type="button" variant="outline" onClick={() => { window.location.href = `/student/study-groups?groupProfile=${selectedGroup.id}`; }}>Open full group profile</Button>{selectedGroup.canManage === true && <Button type="button" variant="destructive" disabled={sendMessageMutation.isPending} onClick={() => void (async()=>{if(!window.confirm("Permanently delete this study group, its polls, messages and membership records?"))return;try{await apiJson(`/api/study-groups/${selectedGroup.id}`,{method:"DELETE"});setGroupHubOpen(false);setSelectedGroupId(null);setSelectedUserId(null);await refetchGroups();}catch(error){toast({variant:"destructive",title:"Group could not be deleted",description:error instanceof Error?error.message:"You may not have the required group-management permission."});}})()}>Delete group</Button>}</div>
                  </div>
                </div>
              )}

              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4 dark:bg-slate-900/50">
                {messagesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : messagesError ? (
                  <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground"><p>Messages could not be loaded.</p><Button variant="outline" onClick={() => void refetchMessages()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div>
                ) : messages?.length === 0 && groupPolls.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><MessageSquare className="h-12 w-12 opacity-20" /><p className="text-sm">No messages yet. Be the first to say hello.</p></div>
                ) : (
                  timelineItems.map(timelineItem => {
                    if (timelineItem.kind === "poll") return <div key={`poll-${timelineItem.id}`} className="flex w-full justify-center"><div className="w-full max-w-[90%]"><StudyGroupPollCard item={timelineItem.item as any} canDelete={Boolean((timelineItem.item as any).poll.canDelete)} onVoted={() => { if (selectedGroupId) void apiJson<typeof groupPolls>(`/api/chat/groups/${selectedGroupId}/polls`).then(setGroupPolls).catch(() => undefined); }} /></div></div>;
                    const messageItem = timelineItem.item;
                    const renderMessage = (currentMessage: typeof messageItem, depth = 0): ReactNode => {
                      const isMe = currentMessage.senderId === user?.id;
                      const replies = [...(messages?.filter(reply => reply.parentMessageId === currentMessage.id) ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
                      return (
                        <div key={currentMessage.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                          <div className="flex max-w-[90%] items-end gap-2" style={{ marginLeft: isMe ? 0 : `${Math.min(depth, 4) * 1.5}rem` }}>
                            <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                              {!isMe && <UserProfileLink userId={currentMessage.senderId} name={currentMessage.senderName + " · " + currentMessage.senderRole} avatarUrl={(users ?? []).find(contact => contact.id === currentMessage.senderId)?.avatarUrl} className="mb-1 ml-1 text-xs text-muted-foreground" />}
                              <div className={`rounded-2xl px-4 py-2.5 ${isMe ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border bg-card shadow-sm"}`}>
                                {currentMessage.type === "voice" && currentMessage.mediaUrl ? <AuthenticatedAudio className="h-10 max-w-[250px]" src={currentMessage.mediaUrl} /> : currentMessage.type === "media" && currentMessage.mediaUrl ? (
  <div className="space-y-2">
    {currentMessage.content && <p className="whitespace-pre-wrap break-words text-sm">{currentMessage.content}</p>}
    <AuthenticatedMedia
      url={currentMessage.mediaUrl}
      type={new URL(currentMessage.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("image/") ? "image" : new URL(currentMessage.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("video/") ? "video" : "document"}
      title={currentMessage.content}
    />
  </div>
) : <p className="whitespace-pre-wrap break-words text-sm">{currentMessage.content}</p>}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">{isGroupConversation && <><button type="button" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary" onClick={() => setReplyTo(currentMessage.id)}><Reply className="h-3 w-3" />Reply</button><button type="button" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-50" onClick={() => void handleReport(currentMessage.id)} disabled={reportingMessageId === currentMessage.id}>{reportingMessageId === currentMessage.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}Report</button></>}{(isMe || (isGroupConversation && selectedGroup?.canManage === true)) && <button type="button" aria-label="Delete message" title="Delete message" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-50" onClick={() => void handleDeleteMessage(currentMessage.id)} disabled={deletingMessageId === currentMessage.id}>{deletingMessageId === currentMessage.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Delete</button>}</div>
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span>{new Date(currentMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{isMe && ((currentMessage as any).readByUserIds?.length ?? 0) > 0 && <span className="inline-flex items-center gap-1 font-semibold text-[#9A7020]" aria-label={isGroupConversation ? "Seen by "+(currentMessage as any).readByUserIds.length+" group members" : "Seen"}>{isGroupConversation ? "Seen by "+(currentMessage as any).readByUserIds.length : "Seen"} <span aria-hidden="true">✓✓</span></span>}</div>
                            </div>
                          </div>
                          {replies.length > 0 && <div className="mt-2 w-full space-y-2">{replies.map(reply => renderMessage(reply, depth + 1))}</div>}
                        </div>
                      );
                    };
                    return renderMessage(messageItem);
                  })
                )}
                {isGroupConversation && <StudyGroupPollPanel groupId={selectedGroupId} inline allowPolls={selectedGroup?.settings?.allowPolls !== false} onPollsChange={setGroupPolls} />}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t bg-card p-4">
                {replyTo && (
                  <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"><span>Replying to {replyTarget?.senderName ?? "a message"}: {replyTarget?.content.slice(0, 80) ?? ""}</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="h-3 w-3" /></Button></div>
                )}
                {isGroupConversation && settings.announcementsOnly && user?.role === "student" && !user.isPrefect && <p className="mb-2 text-xs text-muted-foreground">Only group moderators can post in this group.</p>}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  {(!isGroupConversation || settings.allowMedia) && <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-background hover:bg-muted" title="Attach learning media">
                    <Paperclip className="h-4 w-4" />
                    <input type="file" className="sr-only" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void handleSendMedia(file).catch(error => toast({ variant: "destructive", title: "Attachment failed", description: error instanceof Error ? error.message : "Try again." }));
                    }} />
                  </label>}
                  {(!isGroupConversation || settings.allowMedia) && <VoiceRecorder onSend={handleSendVoice} isSending={sendMessageMutation.isPending} />}
                  <Input placeholder={isGroupConversation ? "Type a message…" : "Message your educator…"} className="flex-1 bg-muted/50" value={message} onChange={event => setMessage(event.target.value)} disabled={isGroupConversation && settings.announcementsOnly && user?.role === "student" && !user.isPrefect} />
                  <Button type="submit" disabled={!message.trim() || sendMessageMutation.isPending || (isGroupConversation && settings.announcementsOnly && user?.role === "student" && !user.isPrefect)} className="h-10 w-10 shrink-0 rounded-full p-0">{sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="ml-0.5 h-5 w-5" />}</Button>
                </form>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
