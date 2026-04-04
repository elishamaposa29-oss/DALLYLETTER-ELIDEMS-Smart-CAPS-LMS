import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLoginUser } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLoginUser();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        login(data.token);
        if (data.user.role === "owner") setLocation("/admin");
        else if (data.user.role === "teacher") setLocation("/teacher");
        else setLocation("/");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: error.message || "Invalid credentials",
        });
      }
    });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-center px-12 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="relative z-10 space-y-6 max-w-lg">
          <h1 className="text-5xl font-serif font-bold leading-tight">
            Empowering the future of education.
          </h1>
          <p className="text-xl text-primary-foreground/80">
            Dallyletter Elidems provides world-class CAPS curriculum support, connecting passionate teachers with ambitious learners.
          </p>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-secondary/20 blur-3xl mix-blend-multiply" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-accent/20 blur-3xl mix-blend-multiply" />
      </div>
      
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-lg bg-transparent sm:bg-card">
          <CardHeader className="space-y-2 text-center lg:text-left">
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground font-serif">Welcome back</CardTitle>
            <CardDescription className="text-base">
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                      </div>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full text-base font-medium h-12" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Sign In
                </Button>
              </form>
            </Form>
            
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline hover:text-primary/80 transition-colors">
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
