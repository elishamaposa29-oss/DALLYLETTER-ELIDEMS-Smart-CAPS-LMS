import { DashboardLayout } from "@/components/DashboardLayout";
import { useListUsers, useUpdateUser, useBlockUser, usePromoteUser, useDeleteUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Search, Shield, Ban, Trash2, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListUsersQueryKey } from "@workspace/api-client-react";

export default function AdminUsers() {
  const { data: users, isLoading } = useListUsers();
  const blockUserMutation = useBlockUser();
  const promoteUserMutation = usePromoteUser();
  const deleteUserMutation = useDeleteUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const filteredUsers = users?.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase()) || user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleBlock = (id: number, isBlocked: boolean) => {
    blockUserMutation.mutate({ id, data: { isBlocked: !isBlocked } }, {
      onSuccess: () => {
        toast({ title: !isBlocked ? "User Blocked" : "User Unblocked" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      }
    });
  };

  const handleTogglePrefect = (id: number, isPrefect: boolean) => {
    promoteUserMutation.mutate({ id, data: { isPrefect: !isPrefect } }, {
      onSuccess: () => {
        toast({ title: !isPrefect ? "Promoted to Prefect" : "Prefect status removed" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to permanently delete this user?")) {
      deleteUserMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "User deleted" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        }
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage students, teachers, and their permissions.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="student">Students</SelectItem>
              <SelectItem value="teacher">Teachers</SelectItem>
              <SelectItem value="owner">Admins</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Details</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredUsers?.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                              {user.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={user.role === 'owner' ? 'default' : user.role === 'teacher' ? 'secondary' : 'outline'} className="capitalize">
                              {user.role}
                            </Badge>
                            {user.isPrefect && (
                              <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-[10px] py-0 px-1.5">
                                Prefect
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {user.grade && <div>Grade: {user.grade}</div>}
                          {user.subject && <div>Subj: {user.subject}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {user.isBlocked ? (
                            <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30">Blocked</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {user.role !== 'owner' && (
                            <div className="flex justify-end gap-2">
                              {user.role === 'student' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0" 
                                  title={user.isPrefect ? "Remove Prefect" : "Make Prefect"}
                                  onClick={() => handleTogglePrefect(user.id, user.isPrefect)}
                                >
                                  <Shield className={`h-4 w-4 ${user.isPrefect ? "text-amber-500" : "text-muted-foreground"}`} />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0" 
                                title={user.isBlocked ? "Unblock" : "Block"}
                                onClick={() => handleToggleBlock(user.id, user.isBlocked)}
                              >
                                <Ban className={`h-4 w-4 ${user.isBlocked ? "text-destructive" : "text-muted-foreground"}`} />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" 
                                title="Delete"
                                onClick={() => handleDelete(user.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredUsers?.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No users found matching the criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
