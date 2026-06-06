import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegisterUser } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, GraduationCap, CheckCircle2 } from "lucide-react";
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Grade is required for students", path: ["grade"] });
  }
  if (data.role === "teacher" && !data.subject) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Subject is required for teachers", path: ["subject"] });
  }
});

const perks = [
  "Full access to CAPS-aligned lesson materials",
  "Live class sessions via Google Meet",
  "Study groups with fellow learners",
  "Payment tracking & fee notifications",
];

export default function Register() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegisterUser();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", role: RegisterUserBodyRole.student, grade: "", subject: "" },
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
          description: error.message || "An error occurred. Please try again.",
        });
      }
    });
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left — Branding Panel */}
      <div className="hidden lg:flex w-[45%] flex-col bg-[#0a1628] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-amber-500/10 blur-3xl translate-y-1/3 -translate-x-1/3" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.4) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

        <div className="relative z-10 flex flex-col h-full px-12 py-12">
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

          <div className="space-y-6 mb-10">
            <h1 className="text-4xl font-bold text-white leading-tight">
              Join the{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-500">
                Elidems
              </span>{" "}
              community.
            </h1>
            <p className="text-white/55 leading-relaxed">
              Create your free account and get instant access to all learning resources on the platform.
            </p>
          </div>

          <div className="space-y-3.5 mb-12">
            {perks.map((perk) => (
              <div key={perk} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-white/60">{perk}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-6">
            <p className="text-xs text-white/30 uppercase tracking-widest">
              © {new Date().getFullYear()} DallyLetter Elidems
            </p>
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

        <div className="flex-1 flex items-center justify-center p-6 py-8">
          <div className="w-full max-w-md">
            <div className="mb-7">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Create your account</h2>
              <p className="text-gray-500 mt-1.5">It only takes a minute to get started</p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 font-medium">Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Tafadzwa Moyo" className="h-11 border-gray-200 bg-gray-50 focus:bg-white transition-colors" {...field} />
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
                        <FormLabel className="text-gray-700 font-medium">Email address</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" className="h-11 border-gray-200 bg-gray-50 focus:bg-white transition-colors" {...field} />
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
                          <Input type="password" placeholder="Min. 6 characters" className="h-11 border-gray-200 bg-gray-50 focus:bg-white transition-colors" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 font-medium">I am a</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11 border-gray-200 bg-gray-50">
                                <SelectValue placeholder="Select role" />
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
                            <FormLabel className="text-gray-700 font-medium">Grade</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-11 border-gray-200 bg-gray-50">
                                  <SelectValue placeholder="Grade" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {["Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"].map(g => (
                                  <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
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
                            <FormLabel className="text-gray-700 font-medium">Subject</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Maths" className="h-11 border-gray-200 bg-gray-50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold bg-[#0a1628] hover:bg-[#0d1e38] text-white rounded-xl shadow-lg shadow-[#0a1628]/20 mt-1"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                    Create Account
                  </Button>
                </form>
              </Form>
            </div>

            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-[#0a1628] hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
