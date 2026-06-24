import { DashboardLayout } from "@/components/DashboardLayout";
import { useListMessages, useSendMessage, useListStudyGroups } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Users, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListMessagesQueryKey } from "@workspace/api-client-react";
import { SendMessageBodyType } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { VoiceRecorder } from "@/components/VoiceRecorder";

export default function Chat() {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: groups, isLoading: groupsLoading } = useListStudyGroups();
  const { data: messages, isLoading: messagesLoading } = useListMessages(
    { groupId: selectedGroupId },
    { query: { enabled: !!selectedGroupId, refetchInterval: 5000 } as any }
  );

  const sendMessageMutation = useSendMessage();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedGroupId) return;
    sendMessageMutation.mutate({
      data: { content: message, type: SendMessageBodyType.text, groupId: selectedGroupId }
    }, {
      onSuccess: () => {
        setMessage("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId }) });
      }
    });
  };

  const handleSendVoice = (dataUrl: string) => {
    if (!selectedGroupId) return;
    sendMessageMutation.mutate({
      data: { content: "🎤 Voice message", type: SendMessageBodyType.voice, groupId: selectedGroupId, mediaUrl: dataUrl }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId }) });
      }
    });
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] min-h-[500px] flex gap-6">
        {/* Groups Sidebar */}
        <Card className="w-1/3 hidden md:flex flex-col bg-card/50">
          <div className="p-4 border-b font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Study Groups
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groupsLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : groups?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
                <Users className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No study groups joined.<br />Join a group to start chatting.</p>
              </div>
            ) : (
              groups?.map(group => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center justify-between ${
                    selectedGroupId === group.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium truncate">{group.name}</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full ${selectedGroupId === group.id ? "bg-primary-foreground/20" : "bg-muted-foreground/20"}`}>
                    {group.memberCount}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden bg-card border-shadow-sm">
          {!selectedGroupId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <MessageSquare className="h-14 w-14 text-muted-foreground/20" />
              <div className="text-center">
                <p className="font-medium">Select a study group</p>
                <p className="text-sm">Choose a group from the sidebar to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b bg-muted/30 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  {groups?.find(g => g.id === selectedGroupId)?.name}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                {messagesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : messages?.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <MessageSquare className="h-12 w-12 opacity-20" />
                    <p className="text-sm">No messages yet. Be the first to say hello!</p>
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
                                <audio controls className="h-10 max-w-[200px] sm:max-w-[250px]" src={msg.mediaUrl} />
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

              {/* Input Area */}
              <div className="p-4 border-t bg-card">
                <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
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
