import { DashboardLayout } from "@/components/DashboardLayout";
import { apiJson, authenticatedFetch } from "@/lib/api";
import {
  useListMessages,
  useSendMessage,
  useListStudyGroups,
  useListUsers,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Users, MessageSquare, Reply, X, Flag, BarChart3, RefreshCw, User, ArrowLeft, Check, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, useEffect, type ReactNode } from "react";
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
  memberCount: number;
  isMember?: boolean;
  members?: Array<{ id: number }>;
};

type GroupSettings = {
  allowPolls: boolean;
  allowMedia: boolean;
  announcementsOnly: boolean;
  rules: string | null;
};

type ChatPoll = {
  poll: { id: number; question: string; allowMultiple: boolean; closed: boolean };
  options: Array<{ id: number; label: string; voteCount: number; selected: boolean }>;
  totalVotes: number;
};

const defaultGroupSettings: GroupSettings = {
  allowPolls: true,
  allowMedia: true,
  announcementsOnly: false,
  rules: null,
};

export default function StudentChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => { const value = new URLSearchParams(window.location.search).get("groupId"); return value && /^\d+$/.test(value) ? Number(value) : null; });
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"groups" | "people">("groups");
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [reportingMessageId, setReportingMessageId] = useState<number | null>(null);
  const [settings, setSettings] = useState<GroupSettings>(defaultGroupSettings);
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const [pollLoading, setPollLoading] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Yes\nNo");
  const [pollError, setPollError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: groupData, isLoading: groupsLoading, isError: groupsError, refetch: refetchGroups } = useListStudyGroups();
  const groups = (groupData ?? []) as unknown as GroupView[];
  const joinedGroups = groups.filter(group => group.isMember ?? group.members?.some(member => member.id === user?.id));
  const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useListUsers();
  const contacts = (users ?? []).filter(contact =>
    contact.id !== user?.id
    && (contact.role === "teacher" || contact.role === "owner" || contact.isPrefect),
  );

  const { data: messages, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useListMessages(
    { groupId: selectedGroupId, recipientId: selectedUserId },
    { query: { enabled: !!selectedGroupId || !!selectedUserId, refetchInterval: 5000 } as any },
  );
  const sendMessageMutation = useSendMessage();
  const rootMessages = messages?.filter(currentMessage => currentMessage.parentMessageId == null) ?? [];
  const replyTarget = messages?.find(currentMessage => currentMessage.id === replyTo);
  const selectedGroup = joinedGroups.find(group => group.id === selectedGroupId);
  const selectedContact = contacts.find(contact => contact.id === selectedUserId);
  const isGroupConversation = selectedGroupId != null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedGroupId) {
      setSettings(defaultGroupSettings);
      setPolls([]);
      return;
    }
    let active = true;
    setPollLoading(true);
    setPollError(null);
    void Promise.all([
      apiJson<GroupSettings>(`/api/study-groups/${selectedGroupId}/settings`),
      apiJson<ChatPoll[]>(`/api/chat/groups/${selectedGroupId}/polls`),
    ]).then(([nextSettings, nextPolls]) => {
      if (!active) return;
      setSettings(nextSettings);
      setPolls(nextPolls);
    }).catch(error => {
      if (active) setPollError(error instanceof Error ? error.message : "Group extras could not be loaded.");
    }).finally(() => {
      if (active) setPollLoading(false);
    });
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

  const loadPolls = async () => {
    if (!selectedGroupId) return;
    setPollLoading(true);
    try {
      setPolls(await apiJson<ChatPoll[]>(`/api/chat/groups/${selectedGroupId}/polls`));
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Polls could not be loaded.");
    } finally {
      setPollLoading(false);
    }
  };

  const createPoll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId || !pollQuestion.trim()) return;
    const options = pollOptions.split("\n").map(option => option.trim()).filter(Boolean);
    if (options.length < 2) {
      setPollError("Add at least two poll options.");
      return;
    }
    try {
      await apiJson(`/api/chat/groups/${selectedGroupId}/polls`, {
        method: "POST",
        body: JSON.stringify({ question: pollQuestion.trim(), options }),
      });
      setPollQuestion("");
      setPollOptions("Yes\nNo");
      setPollComposerOpen(false);
      await loadPolls();
      toast({ title: "Poll created" });
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Poll could not be created.");
    }
  };

  const votePoll = async (pollId: number, optionId: number) => {
    try {
      await apiJson(`/api/chat/polls/${pollId}/vote`, { method: "POST", body: JSON.stringify({ optionIds: [optionId] }) });
      await loadPolls();
    } catch (error) {
      toast({ variant: "destructive", title: "Vote not saved", description: error instanceof Error ? error.message : "Try again." });
    }
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
          <div className="max-h-[34vh] flex-1 space-y-1 overflow-y-auto p-2 md:max-h-none">
            {activeTab === "groups" ? (
              groupsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : groupsError ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground"><p>Groups could not be loaded.</p><Button variant="outline" size="sm" onClick={() => void refetchGroups()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button></div>
              ) : joinedGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center"><Users className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No joined groups yet. Join one from Study Groups to start chatting.</p></div>
              ) : (
                joinedGroups.map(group => (
                  <button key={group.id} onClick={() => selectGroup(group.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors ${selectedGroupId === group.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <span className="truncate font-medium">{group.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${selectedGroupId === group.id ? "bg-primary-foreground/20" : "bg-muted-foreground/20"}`}>{group.memberCount}</span>
                  </button>
                ))
              )
            ) : (
              usersLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : usersError ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground"><p>Contacts could not be loaded.</p><Button variant="outline" size="sm" onClick={() => void refetchUsers()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button></div>
              ) : contacts.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No educator contacts are available yet.</div>
              ) : (
                contacts.map(contact => (
                  <button key={contact.id} onClick={() => selectContact(contact.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selectedUserId === contact.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">{contact.name.charAt(0)}</div>
                    <span className="min-w-0 flex-1 truncate font-medium">{contact.name}</span>
                    <span className="text-xs capitalize opacity-70">{contact.role}</span>
                  </button>
                ))
              )
            )}
          </div>
        </Card>

        <Card className="flex min-h-[420px] flex-1 flex-col overflow-hidden bg-card">
          {!selectedGroupId && !selectedUserId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground"><MessageSquare className="h-14 w-14 text-muted-foreground/20" /><p className="font-medium">Select a group or educator</p><p className="text-sm">Use the tabs to open an ELIDEMS Connect conversation.</p></div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => { setSelectedGroupId(null); setSelectedUserId(null); }} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">{isGroupConversation ? <Users className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}</div>
                  <div className="min-w-0"><p className="truncate font-semibold">{isGroupConversation ? selectedGroup?.name : selectedContact?.name}</p>{isGroupConversation && settings.rules && <p className="truncate text-xs text-muted-foreground">{settings.rules}</p>}</div>
                </div>
                {isGroupConversation && settings.allowPolls && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setPollComposerOpen(value => !value)}><BarChart3 className="mr-1 h-4 w-4" />Poll</Button>}
              </div>

              {pollComposerOpen && isGroupConversation && (
                <form onSubmit={createPoll} className="space-y-3 border-b bg-muted/20 p-4">
                  <Input placeholder="Poll question" value={pollQuestion} onChange={event => setPollQuestion(event.target.value)} maxLength={300} required />
                  <Textarea placeholder={"One option per line"} value={pollOptions} onChange={event => setPollOptions(event.target.value)} rows={3} />
                  <div className="flex gap-2"><Button type="submit" size="sm">Create poll</Button><Button type="button" size="sm" variant="ghost" onClick={() => setPollComposerOpen(false)}>Cancel</Button></div>
                </form>
              )}
              {pollError && <div className="flex items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive"><span>{pollError}</span><button type="button" onClick={() => setPollError(null)} aria-label="Dismiss poll error"><X className="h-3.5 w-3.5" /></button></div>}

              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4 dark:bg-slate-900/50">
                {isGroupConversation && (
                  <div className="space-y-3">
                    {pollLoading && <div className="text-center text-xs text-muted-foreground">Loading polls…</div>}
                    {polls.map(item => (
                      <Card key={item.poll.id} className="p-4">
                        <p className="font-medium">{item.poll.question}</p>
                        <div className="mt-3 space-y-2">
                          {item.options.map(option => (
                            <button key={option.id} type="button" onClick={() => void votePoll(item.poll.id, option.id)} className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${option.selected ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                              <span>{option.selected && <Check className="mr-1 inline h-3.5 w-3.5" />}{option.label}</span><span className="text-xs text-muted-foreground">{option.voteCount}</span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">{item.totalVotes} vote{item.totalVotes === 1 ? "" : "s"}</p>
                      </Card>
                    ))}
                  </div>
                )}
                {messagesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : messagesError ? (
                  <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground"><p>Messages could not be loaded.</p><Button variant="outline" onClick={() => void refetchMessages()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div>
                ) : messages?.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><MessageSquare className="h-12 w-12 opacity-20" /><p className="text-sm">No messages yet. Be the first to say hello.</p></div>
                ) : (
                  rootMessages.map(messageItem => {
                    const renderMessage = (currentMessage: typeof messageItem, depth = 0): ReactNode => {
                      const isMe = currentMessage.senderId === user?.id;
                      const replies = messages?.filter(reply => reply.parentMessageId === currentMessage.id) ?? [];
                      return (
                        <div key={currentMessage.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                          <div className="flex max-w-[90%] items-end gap-2" style={{ marginLeft: isMe ? 0 : `${Math.min(depth, 4) * 1.5}rem` }}>
                            {!isMe && <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{currentMessage.senderName.charAt(0)}</div>}
                            <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                              {!isMe && <span className="mb-1 ml-1 text-xs text-muted-foreground">{currentMessage.senderName} · {currentMessage.senderRole}</span>}
                              <div className={`rounded-2xl px-4 py-2.5 ${isMe ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border bg-card shadow-sm"}`}>
                                {currentMessage.type === "voice" && currentMessage.mediaUrl ? <AuthenticatedAudio className="h-10 max-w-[250px]" src={currentMessage.mediaUrl} /> : currentMessage.type === "media" && currentMessage.mediaUrl ? (
  <AuthenticatedMedia
    url={currentMessage.mediaUrl}
    type={new URL(currentMessage.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("image/") ? "image" : new URL(currentMessage.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("video/") ? "video" : "document"}
    title={currentMessage.content}
  />
) : <p className="whitespace-pre-wrap break-words text-sm">{currentMessage.content}</p>}
                              </div>
                              {isGroupConversation && <div className="mt-1 flex gap-2"><button type="button" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary" onClick={() => setReplyTo(currentMessage.id)}><Reply className="h-3 w-3" />Reply</button><button type="button" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-50" onClick={() => void handleReport(currentMessage.id)} disabled={reportingMessageId === currentMessage.id}>{reportingMessageId === currentMessage.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}Report</button></div>}
                              <span className="mt-1 text-[10px] text-muted-foreground opacity-70">{new Date(currentMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          </div>
                          {replies.length > 0 && <div className="mt-2 w-full space-y-2">{replies.map(reply => renderMessage(reply, depth + 1))}</div>}
                        </div>
                      );
                    };
                    return renderMessage(messageItem);
                  })
                )}
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
