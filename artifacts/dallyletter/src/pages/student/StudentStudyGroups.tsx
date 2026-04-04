import { DashboardLayout } from "@/components/DashboardLayout";
import { useListStudyGroups, useJoinStudyGroup } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListStudyGroupsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export default function StudentStudyGroups() {
  const { data: groups, isLoading } = useListStudyGroups();
  const joinGroupMutation = useJoinStudyGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleJoinGroup = (groupId: number) => {
    joinGroupMutation.mutate({ data: { groupId } }, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "You have joined the study group.",
        });
        queryClient.invalidateQueries({ queryKey: getListStudyGroupsQueryKey() });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to join group",
        });
      }
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Groups</h1>
            <p className="text-muted-foreground">Collaborate and learn with your peers.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups?.length === 0 ? (
              <div className="col-span-full text-center p-8 border rounded-lg bg-card">
                <p className="text-muted-foreground">No study groups available yet.</p>
              </div>
            ) : (
              groups?.map((group) => {
                const isMember = group.members?.some(m => m.id === user?.id);
                
                return (
                  <Card key={group.id} className="flex flex-col h-full">
                    <CardHeader>
                      <div className="flex justify-between items-start gap-2">
                        <Badge variant="secondary" className="bg-secondary/20 text-secondary-foreground">
                          {group.subject}
                        </Badge>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          <Users className="h-3.5 w-3.5" />
                          <span>{group.memberCount}</span>
                        </div>
                      </div>
                      <CardTitle className="text-xl mt-2">{group.name}</CardTitle>
                      <CardDescription>Created by {group.creatorName}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        {group.description || "No description provided."}
                      </p>
                      
                      {group.members && group.members.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs font-semibold mb-2 text-foreground/70">MEMBERS</p>
                          <div className="flex flex-wrap gap-1">
                            {group.members.slice(0, 5).map(member => (
                              <div key={member.id} className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary" title={member.name}>
                                {member.avatarUrl ? (
                                  <img src={member.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  member.name.charAt(0).toUpperCase()
                                )}
                              </div>
                            ))}
                            {group.members.length > 5 && (
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                +{group.members.length - 5}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="pt-4 border-t">
                      {isMember ? (
                        <Button variant="secondary" className="w-full gap-2" disabled>
                          <BookOpen className="h-4 w-4" />
                          Already Joined
                        </Button>
                      ) : (
                        <Button 
                          className="w-full gap-2" 
                          onClick={() => handleJoinGroup(group.id)}
                          disabled={joinGroupMutation.isPending}
                        >
                          {joinGroupMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                          Join Group
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
