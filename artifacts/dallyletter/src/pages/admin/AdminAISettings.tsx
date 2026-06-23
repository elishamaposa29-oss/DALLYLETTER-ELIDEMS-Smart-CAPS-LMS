import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, CheckCircle, AlertTriangle, Eye, EyeOff, Trash2, Zap, Bot } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface AIStatus { provider: string; isLive: boolean; hasGeminiKey: boolean; hasOpenAIKey: boolean; hasAnthropicKey: boolean; configuredProvider?: string; }

const PROVIDERS = [
  { id: "mock", label: "Development Mode (No API Key)", description: "Uses smart mock responses. Free, no setup needed.", icon: "🤖" },
  { id: "gemini", label: "Google Gemini", description: "Best for education. Fast, accurate, supports CAPS curriculum.", icon: "✨", keyField: "gemini_api_key", keyLabel: "Gemini API Key", keyLink: "https://aistudio.google.com/apikey" },
  { id: "openai", label: "OpenAI GPT", description: "GPT-4o Mini. Reliable and widely supported.", icon: "🧠", keyField: "openai_api_key", keyLabel: "OpenAI API Key", keyLink: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic Claude", description: "Claude Haiku. Strong at reasoning and safety.", icon: "🔮", keyField: "anthropic_api_key", keyLabel: "Anthropic API Key", keyLink: "https://console.anthropic.com/settings/keys" },
];

export default function AdminAISettings() {
  const { toast } = useToast();
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("mock");
  const [keys, setKeys] = useState({ gemini_api_key: "", openai_api_key: "", anthropic_api_key: "" });
  const [showKeys, setShowKeys] = useState({ gemini_api_key: false, openai_api_key: false, anthropic_api_key: false });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const token = () => localStorage.getItem("dallyletter_token");

  useEffect(() => {
    fetch("/api/ai/status", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then((s: AIStatus) => {
        setStatus(s);
        setSelectedProvider(s.configuredProvider ?? "mock");
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    try {
      const payload: Record<string, string> = { provider: selectedProvider };
      const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);
      if (currentProvider?.keyField && keys[currentProvider.keyField as keyof typeof keys]) {
        payload[currentProvider.keyField] = keys[currentProvider.keyField as keyof typeof keys];
      }

      const r = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        toast({ title: "AI settings saved!", description: "ELIDEMS AI will use the new provider on next request." });
        const s = await fetch("/api/ai/status", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json());
        setStatus(s);
      } else {
        toast({ variant: "destructive", title: "Save failed" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload: Record<string, string> = { provider: selectedProvider };
      const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);
      if (currentProvider?.keyField && keys[currentProvider.keyField as keyof typeof keys]) {
        payload[currentProvider.keyField] = keys[currentProvider.keyField as keyof typeof keys];
      }
      await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      const r = await fetch("/api/ai/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      });
      const data = await r.json() as { success: boolean; provider: string; response?: string; error?: string };
      setTestResult({
        success: data.success,
        message: data.success ? `✅ Connected to ${data.provider}! Response: "${data.response?.slice(0, 80)}…"` : `❌ ${data.error ?? "Connection failed"}`,
      });
      if (data.success) {
        const s = await fetch("/api/ai/status", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json());
        setStatus(s);
      }
    } finally {
      setTesting(false);
    }
  }

  async function clearKey(field: string) {
    await fetch("/api/ai/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ [field]: "" }),
    });
    setKeys(prev => ({ ...prev, [field]: "" }));
    toast({ title: "API key cleared" });
    const s = await fetch("/api/ai/status", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json());
    setStatus(s);
  }

  const activeProvider = PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-purple-500" />
            ELIDEMS AI Settings
          </h1>
          <p className="text-muted-foreground">Configure your AI provider. ELIDEMS AI switches automatically when a key is saved.</p>
        </div>

        {/* Current status */}
        <Card className={status?.isLive ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${status?.isLive ? "bg-emerald-100 dark:bg-emerald-900" : "bg-amber-100 dark:bg-amber-900"}`}>
                {status?.isLive ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              </div>
              <div>
                <p className="font-semibold">{status?.isLive ? `Live Mode — ${status.provider}` : "Development Mode"}</p>
                <p className="text-sm text-muted-foreground">
                  {status?.isLive ? "ELIDEMS AI is using real AI capabilities" : "Using mock responses. Add an API key below to activate."}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={status?.isLive ? "border-emerald-400 text-emerald-700" : "border-amber-400 text-amber-700"}>
              {status?.provider ?? "mock"}
            </Badge>
          </CardContent>
        </Card>

        {/* Provider selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select AI Provider</CardTitle>
            <CardDescription>Choose which AI provider powers ELIDEMS AI. You can switch at any time.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedProvider} onValueChange={setSelectedProvider} className="space-y-3">
              {PROVIDERS.map(p => (
                <div key={p.id} className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${selectedProvider === p.id ? "border-purple-400 bg-purple-50 dark:bg-purple-950/20" : "hover:bg-muted/50"}`}
                  onClick={() => setSelectedProvider(p.id)}>
                  <RadioGroupItem value={p.id} id={p.id} className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor={p.id} className="font-semibold cursor-pointer flex items-center gap-2">
                      <span>{p.icon}</span> {p.label}
                      {status && ((p.id === "gemini" && status.hasGeminiKey) || (p.id === "openai" && status.hasOpenAIKey) || (p.id === "anthropic" && status.hasAnthropicKey)) && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">Key saved</Badge>
                      )}
                    </label>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.description}</p>
                    {p.keyLink && (
                      <a href={p.keyLink} target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:underline mt-1 inline-block">
                        Get a free API key →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* API Key input for selected provider */}
        {activeProvider?.keyField && (
          <Card>
            <CardHeader>
              <CardTitle>{activeProvider.label} — API Key</CardTitle>
              <CardDescription>Your key is stored securely in the database. It is never exposed to students.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{activeProvider.keyLabel}</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKeys[activeProvider.keyField as keyof typeof showKeys] ? "text" : "password"}
                      placeholder={`Paste your ${activeProvider.keyLabel} here`}
                      value={keys[activeProvider.keyField as keyof typeof keys]}
                      onChange={e => setKeys(prev => ({ ...prev, [activeProvider.keyField!]: e.target.value }))}
                      className="pr-10 font-mono text-sm"
                    />
                    <button type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowKeys(prev => ({ ...prev, [activeProvider.keyField!]: !prev[activeProvider.keyField as keyof typeof showKeys] }))}>
                      {showKeys[activeProvider.keyField as keyof typeof showKeys] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {(status?.[`has${activeProvider.id.charAt(0).toUpperCase() + activeProvider.id.slice(1)}Key` as keyof AIStatus]) && (
                    <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => clearKey(activeProvider.keyField!)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">The key is encrypted at rest. Never share it with anyone.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`p-4 rounded-lg border text-sm ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
            {testResult.message}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            Save Settings
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Test Connection
          </Button>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">How it works:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Select your preferred AI provider above</li>
              <li>Paste your API key in the field</li>
              <li>Click <strong>Test Connection</strong> to verify</li>
              <li>Click <strong>Save Settings</strong></li>
              <li>ELIDEMS AI immediately switches to Live Mode — no restart needed</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
