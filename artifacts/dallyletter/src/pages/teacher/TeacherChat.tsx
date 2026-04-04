import { DashboardLayout } from "@/components/DashboardLayout";
import { useListMessages, useSendMessage, useListStudyGroups, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Send, Mic, Users, MessageSquare, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListMessagesQueryKey } from "@workspace/api-client-react";
import { SendMessageBodyType } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TeacherChat() {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("groups");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: groups, isLoading: groupsLoading } = useListStudyGroups();
  const { data: users, isLoading: usersLoading } = useListUsers(); // Note: might need owner role, assuming teacher can see students
  
  const { data: messages, isLoading: messagesLoading } = useListMessages(
    { groupId: selectedGroupId, recipientId: selectedUserId },
    { query: { enabled: !!selectedGroupId || !!selectedUserId, refetchInterval: 5000 } }
  );

  const sendMessageMutation = useSendMessage();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || (!selectedGroupId && !selectedUserId)) return;

    sendMessageMutation.mutate({
      data: {
        content: message,
        type: SendMessageBodyType.text,
        groupId: selectedGroupId,
        recipientId: selectedUserId
      }
    }, {
      onSuccess: () => {
        setMessage("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ groupId: selectedGroupId, recipientId: selectedUserId }) });
      }
    });
  };

  const selectGroup = (id: number) => {
    setSelectedGroupId(id);
    setSelectedUserId(null);
  };

  const selectUser = (id: number) => {
    setSelectedUserId(id);
    setSelectedGroupId(null);
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] min-h-[500px] flex gap-6">
        <Card className="w-1/3 hidden md:flex flex-col bg-card/50">
          <div className="p-4 border-b">
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="groups">Groups</TabsTrigger>
                <TabsTrigger value="students">Students</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeTab === "groups" ? (
              groupsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : groups?.length === 0 ? (
                <div className="text-center p-4 text-sm text-muted-foreground">No study groups.</div>
              ) : (
                groups?.map(group => (
                  <button
                    key={group.id}
                    onClick={() => selectGroup(group.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center justify-between ${
                      selectedGroupId === group.id 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="font-medium truncate flex items-center gap-2">
                      <Users className="h-4 w-4 opacity-70" />
                      {group.name}
                    </div>
                  </button>
                ))
              )
            ) : (
              usersLoading ? (
                 <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                users?.filter(u => u.role === "student").map(student => (
                  <button
                    key={student.id}
                    onClick={() => selectUser(student.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                      selectedUserId === student.id 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <div className="font-medium truncate flex-1">
                      {student.name}
                    </div>
                  </button>
                ))
              )
            )}
          </div>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden bg-card border-shadow-sm">
          {!selectedGroupId && !selectedUserId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 text-muted-foreground/30" />
              <p>Select a group or student to chat</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b bg-muted/30 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedGroupId 
                    ? <><Users className="h-5 w-5 text-primary"/> {groups?.find(g => g.id === selectedGroupId)?.name}</>
                    : <><User className="h-5 w-5 text-primary"/> {users?.find(u => u.id === selectedUserId)?.name}</>
                  }
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                {messagesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : messages?.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    No messages yet. Send a message to start the conversation!
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
                            {!isMe && <span className="text-xs text-muted-foreground mb-1 ml-1">{msg.senderName} • {msg.senderRole}</span>}
                            
                            <div className={`px-4 py-2.5 rounded-2xl ${
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
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
