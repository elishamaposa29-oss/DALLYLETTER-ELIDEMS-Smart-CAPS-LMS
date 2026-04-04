import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegisterUser } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RegisterUserBodyRole } from "@workspace/api-client-react";

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  role: z.enum([RegisterUserBodyRole.student, RegisterUserBodyRole.teacher]),
  grade: z.string().optional(),
  subject: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === "student" && !data.grade) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Grade is required for students",
      path: ["grade"],
    });
  }
  if (data.role === "teacher" && !data.subject) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Subject is required for teachers",
      path: ["subject"],
    });
  }
});

export default function Register() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegisterUser();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: RegisterUserBodyRole.student,
      grade: "",
      subject: "",
    },
  });

  const role = form.watch("role");

  function onSubmit(values: z.infer<typeof registerSchema>) {
    registerMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        login(data.token);
        if (data.user.role === "teacher") setLocation("/teacher");
        else setLocation("/");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: error.message || "An error occurred during registration",
        });
      }
    });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-center px-12 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="relative z-10 space-y-6 max-w-lg">
          <h1 className="text-5xl font-serif font-bold leading-tight">
            Join the Dallyletter community.
          </h1>
          <p className="text-xl text-primary-foreground/80">
            Sign up today to access premium CAPS curriculum resources, live classes, and peer study groups.
          </p>
        </div>
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-secondary/20 blur-3xl mix-blend-multiply" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-accent/20 blur-3xl mix-blend-multiply" />
      </div>
      
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-lg bg-transparent sm:bg-card">
          <CardHeader className="space-y-2 text-center lg:text-left">
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground font-serif">Create an account</CardTitle>
            <CardDescription className="text-base">
              Enter your details to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>I am a</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={RegisterUserBodyRole.student}>Student</SelectItem>
                          <SelectItem value={RegisterUserBodyRole.teacher}>Teacher</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {role === "student" && (
                  <FormField
                    control={form.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select your grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Grade 8">Grade 8</SelectItem>
                            <SelectItem value="Grade 9">Grade 9</SelectItem>
                            <SelectItem value="Grade 10">Grade 10</SelectItem>
                            <SelectItem value="Grade 11">Grade 11</SelectItem>
                            <SelectItem value="Grade 12">Grade 12</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {role === "teacher" && (
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject Specialization</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Mathematics, Physics" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <Button type="submit" className="w-full text-base font-medium h-12 mt-2" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Create Account
                </Button>
              </form>
            </Form>
            
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
