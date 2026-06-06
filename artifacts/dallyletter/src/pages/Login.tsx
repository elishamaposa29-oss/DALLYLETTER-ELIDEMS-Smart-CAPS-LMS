import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLoginUser } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, GraduationCap, BookOpen, Video, Users, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

const features = [
  { icon: BookOpen, text: "CAPS-aligned lessons uploaded by qualified teachers" },
  { icon: Video, text: "Live Google Meet classes with real-time Q&A" },
  { icon: Users, text: "Collaborative study groups for every subject" },
  { icon: ShieldCheck, text: "Secure, private platform for your school" },
];

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLoginUser();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
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
          description: error.message || "Invalid email or password. Please try again.",
        });
      }
    });
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left — Branding Panel */}
      <div className="hidden lg:flex w-[52%] flex-col bg-[#0a1628] relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-3xl translate-y-1/3 -translate-x-1/3" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.4) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-auto">
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-2.5 rounded-2xl shadow-lg shadow-amber-500/20">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-xl leading-none block">DallyLetter</span>
              <span className="text-amber-400/80 text-[10px] uppercase tracking-[0.2em] font-semibold">Elidems</span>
            </div>
          </div>

          {/* Main copy */}
          <div className="space-y-6 mb-12">
            <div className="inline-flex items-center gap-2 bg-white/8 border border-white/10 px-4 py-2 rounded-full text-sm text-white/70">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              CAPS Education Platform · South Africa
            </div>
            <h1 className="text-5xl font-bold text-white leading-[1.1] tracking-tight">
              Empowering the<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-500">
                future of learning.
              </span>
            </h1>
            <p className="text-lg text-white/60 leading-relaxed max-w-md">
              Premium CAPS curriculum support — connecting passionate educators with ambitious learners across Zimbabwe and South Africa.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3 mb-12">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3.5">
                <div className="shrink-0 h-8 w-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-sm text-white/60">{text}</p>
              </div>
            ))}
          </div>

          {/* Trust badge */}
          <div className="border-t border-white/10 pt-8">
            <p className="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">Trusted by learners & teachers</p>
            <div className="flex items-center gap-3">
              {["S", "T", "A", "M", "G"].map((l, i) => (
                <div key={i} className="h-9 w-9 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-white/60 text-sm font-bold">
                  {l}
                </div>
              ))}
              <span className="text-sm text-white/40 ml-1">+ many more</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Form Panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 px-6 py-5 border-b bg-white">
          <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-2 rounded-xl shadow-md">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-[#0a1628] text-lg leading-none block">DallyLetter</span>
            <span className="text-amber-500 text-[10px] uppercase tracking-widest font-semibold">Elidems</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-gray-500 mt-1.5">Sign in to access your dashboard</p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 font-medium">Email address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            className="h-11 border-gray-200 bg-gray-50 focus:bg-white transition-colors"
                            {...field}
                          />
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
                        <FormLabel className="text-gray-700 font-medium">Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="h-11 border-gray-200 bg-gray-50 focus:bg-white transition-colors"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold bg-[#0a1628] hover:bg-[#0d1e38] text-white rounded-xl shadow-lg shadow-[#0a1628]/20 mt-2"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                    Sign In
                  </Button>
                </form>
              </Form>
            </div>

            <p className="text-center text-sm text-gray-500 mt-6">
              Don't have an account?{" "}
              <Link href="/register" className="font-semibold text-[#0a1628] hover:underline transition-colors">
                Sign up for free
              </Link>
            </p>

            <p className="text-center text-xs text-gray-400 mt-8">
              © {new Date().getFullYear()} DallyLetter Elidems. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
