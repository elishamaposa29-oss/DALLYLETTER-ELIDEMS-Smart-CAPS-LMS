import { DashboardLayout } from "@/components/DashboardLayout";
import { useListMessages, useSendMessage, useListStudyGroups, useListUsers, getApiUrl } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Users, MessageSquare, User, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListMessagesQueryKey } from "@workspace/api-client-react";
import { SendMessageBodyType } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { AuthenticatedAudio } from "@/components/AuthenticatedAudio";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";

export default function TeacherChat() {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("groups");
  const [lessonRequests, setLessonRequests] = useState<Array<{id:number; topic:string; notes:string|null; preferredDate:string|null; status:string; teacherReply:string|null; prefectId:number}>>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: groups, isLoading: groupsLoading } = useListStudyGroups();
  const { data: users, isLoading: usersLoading } = useListUsers();

  const { data: messages, isLoading: messagesLoading } = useListMessages(
    { groupId: selectedGroupId, recipientId: selectedUserId },
    { query: { enabled: !!selectedGroupId || !!selectedUserId, refetchInterval: 5000 } as any }
  );

  const sendMessageMutation = useSendMessage();

  const loadLessonRequests = async () => {
    setRequestLoading(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/achievements/lesson-requests"), { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (response.ok) setLessonRequests(await response.json());
    } finally { setRequestLoading(false); }
  };

  useEffect(() => { void loadLessonRequests(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || (!selectedGroupId && !selectedUserId)) return;
    sendMessageMutation.mutate({
      data: { content: message, type: SendMessageBodyType.text, groupId: selectedGroupId, recipientId: selectedUserId }
    }, {
      onSuccess: () => {
        setMessage("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId, recipientId: selectedUserId }) });
      }
    });
  };

  const handleSendMedia = async (file: File) => {
    if (!selectedGroupId && !selectedUserId) throw new Error("Select a conversation before attaching learning media.");
    const body = new FormData();
    if (selectedGroupId) body.append("groupId", String(selectedGroupId));
    if (selectedUserId) body.append("recipientId", String(selectedUserId));
    body.append("file", file, file.name);
    const upload = await fetch(getApiUrl("/api/messages/media"), { method: "POST", headers: localStorage.getItem("dallyletter_token") ? { Authorization: `Bearer ${localStorage.getItem("dallyletter_token")}` } : undefined, body });
    const result = await upload.json().catch(() => null) as { mediaUrl?: string; error?: string } | null;
    if (!upload.ok || !result?.mediaUrl) throw new Error(result?.error ?? "Attachment upload failed.");
    await sendMessageMutation.mutateAsync({ data: { content: file.name, type: "media" as SendMessageBodyType, groupId: selectedGroupId, recipientId: selectedUserId, mediaUrl: result.mediaUrl } });
    await queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId, recipientId: selectedUserId }) });
  };

  const handleSendVoice = async (audio: Blob) => {
    if (!selectedGroupId && !selectedUserId) throw new Error("Select a conversation before sending a voice message.");
    const body = new FormData();
    if (selectedGroupId) body.append("groupId", String(selectedGroupId));
    if (selectedUserId) body.append("recipientId", String(selectedUserId));
    body.append("file", audio, "voice-message.webm");
    const token = localStorage.getItem("dallyletter_token");
    const upload = await fetch(getApiUrl("/api/messages/media"), { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : undefined, body });
    if (!upload.ok) {
      const result = await upload.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? "Voice upload failed.");
    }
    const { mediaUrl } = await upload.json() as { mediaUrl: string };
    await sendMessageMutation.mutateAsync({
      data: { content: "Voice message", type: SendMessageBodyType.voice, groupId: selectedGroupId, recipientId: selectedUserId, mediaUrl },
    });
    await queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId, recipientId: selectedUserId }) });
  };

  const selectGroup = (id: number) => { setSelectedGroupId(id); setSelectedUserId(null); };
  const selectUser = (id: number) => { setSelectedUserId(id); setSelectedGroupId(null); };

  const chatTitle = selectedGroupId
    ? groups?.find(g => g.id === selectedGroupId)?.name
    : users?.find(u => u.id === selectedUserId)?.name;

  return (
    <DashboardLayout>
      <div className="h-[calc(100dvh-8rem)] min-h-[500px] flex flex-col md:flex-row gap-3 md:gap-6 min-w-0">
        <Card className="w-full md:w-1/3 flex flex-col bg-card/50 max-h-40 md:max-h-none shrink-0">
          <div className="p-4 border-b">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="groups">Groups</TabsTrigger>
                <TabsTrigger value="students">Students</TabsTrigger>
              <TabsTrigger value="requests">Lesson Requests</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeTab === "requests" ? (
              requestLoading ? (
                <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : lessonRequests.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No lesson requests yet.</div>
              ) : lessonRequests.map(request => (
                <div key={request.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2"><p className="font-medium text-sm">{request.topic}</p><span className="text-[10px] uppercase text-muted-foreground">{request.status}</span></div>
                  {request.preferredDate && <p className="text-xs text-muted-foreground">Preferred: {request.preferredDate}</p>}
                  {request.notes && <p className="text-xs text-muted-foreground">{request.notes}</p>}
                  {request.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        const reply = window.prompt("Optional reply to the learner:", "I can help with this topic.") ?? "";
                        try {
                          const token = localStorage.getItem("dallyletter_token");
                          const response = await fetch(getApiUrl(`/api/achievements/lesson-requests/${request.id}`), { method:"PATCH", headers:{ "Content-Type":"application/json", ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body:JSON.stringify({status:"accepted",teacherReply:reply.trim() || null}) });
                          if (!response.ok) throw new Error("Request update failed");
                          await loadLessonRequests();
                        } catch (error) { window.alert(error instanceof Error ? error.message : "Request update failed"); }
                      }}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        try {
                          const token = localStorage.getItem("dallyletter_token");
                          const response = await fetch(getApiUrl(`/api/achievements/lesson-requests/${request.id}`), { method:"PATCH", headers:{ "Content-Type":"application/json", ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body:JSON.stringify({status:"declined",teacherReply:"I cannot take this request right now."}) });
                          if (!response.ok) throw new Error("Request update failed");
                          await loadLessonRequests();
                        } catch (error) { window.alert(error instanceof Error ? error.message : "Request update failed"); }
                      }}>Decline</Button>
                    </div>
                  )}
                </div>
              ))
            ) : activeTab === "groups" ? (
              groupsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : groups?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-6">
                  <Users className="h-10 w-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No study groups yet.</p>
                </div>
              ) : (
                groups?.map(group => (
                  <button
                    key={group.id}
                    onClick={() => selectGroup(group.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center gap-2 ${
                      selectedGroupId === group.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <Users className="h-4 w-4 opacity-70 shrink-0" />
                    <span className="font-medium truncate">{group.name}</span>
                  </button>
                ))
              )
            ) : (
              usersLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (users?.filter(u => u.role === "student").length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-6">
                  <User className="h-10 w-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No students yet.</p>
                </div>
              ) : (
                users?.filter(u => u.role === "student").map(student => (
                  <button
                    key={student.id}
                    onClick={() => selectUser(student.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                      selectedUserId === student.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <span className="font-medium truncate flex-1">{student.name}</span>
                  </button>
                ))
              ))
            )}
          </div>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {!selectedGroupId && !selectedUserId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <MessageSquare className="h-14 w-14 text-muted-foreground/20" />
              <div className="text-center">
                <p className="font-medium">Select a conversation</p>
                <p className="text-sm">Choose a group or student from the sidebar</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b bg-muted/30 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedGroupId
                    ? <><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>{chatTitle}</>
                    : <><div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{chatTitle?.charAt(0)}</div>{chatTitle}</>
                  }
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                {messagesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : messages?.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <MessageSquare className="h-12 w-12 opacity-20" />
                    <p className="text-sm">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages?.map(msg => {
                    const isMe = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div className="flex items-end gap-2 max-w-[80%]">
                          {!isMe && (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-xs font-bold text-primary mb-1">
                              {msg.senderName.charAt(0)}
                            </div>
                          )}
                          <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                            {!isMe && <span className="text-xs text-muted-foreground mb-1 ml-1">{msg.senderName} · {msg.senderRole}</span>}
                            <div className={`px-4 py-2.5 rounded-2xl max-w-full ${
                              isMe
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-card border shadow-sm rounded-tl-sm"
                            }`}>
                              {msg.type === "voice" && msg.mediaUrl ? (
                                <AuthenticatedAudio className="h-10 max-w-[200px] sm:max-w-[250px]" src={msg.mediaUrl} />
                              ) : msg.type === "media" && msg.mediaUrl ? (
                                <AuthenticatedMedia url={msg.mediaUrl} type={new URL(msg.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("image/") ? "image" : new URL(msg.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("video/") ? "video" : "document"} title={msg.content} />
                              ) : (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-1 opacity-70">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t bg-card">
                <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                  <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-background hover:bg-muted" title="Attach learning media">
                    <Paperclip className="h-4 w-4" />
                    <input type="file" className="sr-only" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={event => {
                      const file = event.target.files?.[0]; event.target.value = "";
                      if (file) void handleSendMedia(file).catch(error => alert(error instanceof Error ? error.message : "Attachment failed."));
                    }} />
                  </label>
                  <VoiceRecorder onSend={handleSendVoice} isSending={sendMessageMutation.isPending} />
                  <Input
                    placeholder="Type a message..."
                    className="flex-1 bg-muted/50 border-transparent focus-visible:bg-background"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <Button type="submit" disabled={!message.trim() || sendMessageMutation.isPending} className="shrink-0 rounded-full h-10 w-10 p-0">
                    {sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
                  </Button>
                </form>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
