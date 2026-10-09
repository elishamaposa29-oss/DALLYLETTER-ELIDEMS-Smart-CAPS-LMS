import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { sanitizeRichText } from "@/components/RichTextEditor";
import { Badge } from "@/components/ui/badge";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";

interface Question {
  id: number;
  prompt: string;
  type: "input" | "poll" | "drawbox";
  marksAllocated: string;
  position: number;
  config: Record<string, unknown>;
}
interface ExerciseMedia {
  id: number;
  questionId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}
interface Option {
  id: number;
  questionId: number;
  label: string;
  value: string;
  position: number;
}
interface Exercise {
  id: number;
  title: string;
  instructions: string | null;
  totalMarks: string;
}
type DrawValue = Record<string, unknown>;
type Stroke = { x: number; y: number; px?: number; py?: number; color?: string; width?: number; opacity?: number; tool?: string };
type PointerMark = { id: string; x: number; y: number; length?: number; thickness?: number; opacity?: number; color?: string; angle?: number; width?: number };
type LabelMark = { text: string; x: number; y: number; anchorX?: number; anchorY?: number; color?: string; opacity?: number; fontSize?: number };

function QuestionAttachment({ url, fileName, mimeType }: { url: string; fileName: string; mimeType?: string }) {
  const type = (() => { const raw=mimeType || new URL(url,window.location.origin).searchParams.get("type") || ""; if(raw.startsWith("image/")) return "image" as const; if(raw.startsWith("video/")) return "video" as const; if(raw.startsWith("audio/")) return "audio" as const; return "document" as const; })();
  return <AuthenticatedMedia url={url} type={type} title={fileName} />;
}

function ReturnedMediaAnnotations({ data }: { data: Record<string, unknown> | null | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const source = data ?? {};
    const drawSegments = (items: unknown, fallback: string, alpha: number) => {
      if (!Array.isArray(items)) return;
      for (const raw of items) {
        const s = raw as Record<string, unknown>;
        ctx.save();
        ctx.globalAlpha = Number(s.opacity ?? alpha);
        ctx.strokeStyle = String(s.color ?? fallback);
        ctx.lineWidth = Number(s.width ?? 4);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(Number(s.px ?? s.x ?? 0), Number(s.py ?? s.y ?? 0));
        ctx.lineTo(Number(s.x ?? 0), Number(s.y ?? 0));
        ctx.stroke();
        ctx.restore();
      }
    };
    drawSegments(source.mediaStrokes, "#dc2626", 0.95);
    drawSegments(source.strokes, "#dc2626", 0.95);
    drawSegments(source.paintStrokes, "#f59e0b", 0.4);
    const ticks = Array.isArray(source.ticks) ? source.ticks as Array<Record<string, unknown>> : [];
    for (const tick of ticks) {
      ctx.save();
      ctx.globalAlpha = Number(tick.opacity ?? 0.95);
      ctx.fillStyle = String(tick.color ?? "#16a34a");
      ctx.font = `900 ${Math.max(22, Number(tick.size ?? 34))}px sans-serif`;
      ctx.fillText("✓", Number(tick.x ?? 0), Number(tick.y ?? 0));
      ctx.restore();
    }
    const pointers = Array.isArray(source.pointers) ? source.pointers as Array<Record<string, unknown>> : [];
    for (const p of pointers) {
      const x = Number(p.x ?? 0), y = Number(p.y ?? 0), angle = Number(p.angle ?? 0), length = Number(p.length ?? 90);
      const ex = x + Math.cos(angle) * length, ey = y + Math.sin(angle) * length;
      ctx.save(); ctx.strokeStyle = String(p.color ?? "#dc2626"); ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Number(p.thickness ?? 3); ctx.globalAlpha = Number(p.opacity ?? 0.9);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(angle - .55) * 12, ey - Math.sin(angle - .55) * 12); ctx.lineTo(ex - Math.cos(angle + .55) * 12, ey - Math.sin(angle + .55) * 12); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    const labels = Array.isArray(source.labels) ? source.labels as Array<Record<string, unknown>> : [];
    for (const label of labels) {
      ctx.save(); ctx.fillStyle = String(label.color ?? "#dc2626"); ctx.globalAlpha = Number(label.opacity ?? 1);
      ctx.font = `bold ${Number(label.fontSize ?? 18)}px sans-serif`;
      ctx.fillText(String(label.text ?? ""), Number(label.x ?? 0), Number(label.y ?? 0)); ctx.restore();
    }
  }, [data]);
  return <canvas ref={canvasRef} width={1200} height={700} aria-label="Teacher's returned annotations" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function DrawBox({
  value,
  onChange,
  readOnly = false,
  teacherDrawing,
  permissions,
}: {
  value: DrawValue | undefined;
  onChange: (next: DrawValue) => void;
  readOnly?: boolean;
  teacherDrawing?: DrawValue;
  permissions?: { preview?: boolean; allowClear?: boolean; allowModify?: boolean; allowRewrite?: boolean };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<"pen" | "paint" | "eraser" | "text" | "pointer" | "select">("pen");
  const [color, setColor] = useState("#111827");
  const [width, setWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [magnify, setMagnify] = useState(0);
  const [labelText, setLabelText] = useState("");
  const [pointerId, setPointerId] = useState<string | null>(null);
  const [eraseTarget, setEraseTarget] = useState<"pen" | "paint" | "both">("both");

  const strokes = () => (value?.strokes as Stroke[] | undefined) ?? [];
  const paintStrokes = () => (value?.paintStrokes as Stroke[] | undefined) ?? [];
  const pointers = () => (value?.pointers as PointerMark[] | undefined) ?? [];
  const labels = () => (value?.labels as LabelMark[] | undefined) ?? [];
  const teacherStrokes = () => (teacherDrawing?.strokes as Stroke[] | undefined) ?? [];
  const teacherPaintStrokes = () => (teacherDrawing?.paintStrokes as Stroke[] | undefined) ?? [];
  const teacherPointers = () => (teacherDrawing?.pointers as PointerMark[] | undefined) ?? [];
  const teacherLabels = () => (teacherDrawing?.labels as LabelMark[] | undefined) ?? [];

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawStroke = (stroke: Stroke, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = Number(stroke.opacity ?? alpha);
      ctx.strokeStyle = stroke.color ?? "#111827";
      ctx.lineWidth = Number(stroke.width ?? 3);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(Number(stroke.px ?? stroke.x), Number(stroke.py ?? stroke.y));
      ctx.lineTo(Number(stroke.x), Number(stroke.y));
      ctx.stroke();
      ctx.restore();
    };

    for (const stroke of teacherPaintStrokes()) drawStroke(stroke, 0.72);
    for (const stroke of teacherStrokes()) drawStroke(stroke, 0.72);
    for (const stroke of paintStrokes()) drawStroke(stroke, 0.3);
    for (const stroke of strokes()) drawStroke(stroke, 1);

    for (const pointer of pointers()) {
      const x = Number(pointer.x);
      const y = Number(pointer.y);
      const length = Number(pointer.length ?? 90);
      const angle = Number(pointer.angle ?? 0);
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;
      ctx.save();
      ctx.globalAlpha = Number(pointer.opacity ?? 0.8);
      ctx.strokeStyle = pointer.color ?? "#111827";
      ctx.fillStyle = pointer.color ?? "#111827";
      ctx.lineWidth = Number(pointer.thickness ?? 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      const head = Math.max(7, Number(pointer.thickness ?? 3) * 3);
      const headAngle = Math.atan2(endY - y, endX - x);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - Math.cos(headAngle - 0.55) * head, endY - Math.sin(headAngle - 0.55) * head);
      ctx.lineTo(endX - Math.cos(headAngle + 0.55) * head, endY - Math.sin(headAngle + 0.55) * head);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const label of labels()) {
      ctx.save();
      ctx.globalAlpha = Number(label.opacity ?? 1);
      ctx.fillStyle = label.color ?? "#111827";
      ctx.font = `${Number(label.fontSize ?? 16)}px sans-serif`;
      if (label.anchorX !== undefined && label.anchorY !== undefined) {
        ctx.beginPath();
        ctx.moveTo(Number(label.anchorX), Number(label.anchorY));
        ctx.lineTo(Number(label.x) - 4, Number(label.y) - 4);
        ctx.stroke();
      }
      ctx.fillText(String(label.text ?? ""), Number(label.x), Number(label.y));
      ctx.restore();
    }
    const teacherTicks = Array.isArray(teacherDrawing?.ticks) ? teacherDrawing.ticks as Array<Record<string, unknown>> : [];
    for (const tick of teacherTicks) {
      ctx.save(); ctx.globalAlpha = Number(tick.opacity ?? 0.95); ctx.fillStyle = String(tick.color ?? "#16a34a");
      ctx.font = `900 ${Math.max(22, Number(tick.size ?? 30))}px sans-serif`;
      ctx.fillText("✓", Number(tick.x ?? 0), Number(tick.y ?? 0)); ctx.restore();
    }
  };

  useEffect(() => redraw(), [value, teacherDrawing]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const updatePointer = (id: string, patch: Partial<PointerMark>) => {
    onChange({ ...value, pointers: pointers().map((item) => item.id === id ? { ...item, ...patch } : item) });
  };

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const position = point(event);
    if (!position) return;

    if (tool === "text") {
      if (!labelText.trim()) return;
      onChange({
        ...value,
        labels: [...labels(), {
          text: labelText.trim(),
          x: Math.min(position.x + 42, 1150),
          y: Math.max(position.y - 28, 24),
          anchorX: position.x,
          anchorY: position.y,
          color,
          opacity,
          fontSize: Math.max(12, width * 4),
        }],
      });
      return;
    }

    if (tool === "pointer") {
      const existing = pointers().find((item) => Math.hypot(Number(item.x) - position.x, Number(item.y) - position.y) < 35);
      if (existing) {
        setPointerId(existing.id);
        last.current = position;
      } else {
        const item: PointerMark = { id: crypto.randomUUID(), x: position.x, y: position.y, length: 90, thickness: 3, width: 3, opacity: 0.8, color, angle: 0 };
        setPointerId(item.id);
        onChange({ ...value, pointers: [...pointers(), item] });
      }
      drawing.current = true;
      canvasRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === "select" || (tool === "eraser" && permissions?.allowModify === false)) return;
    if (permissions?.allowModify === false) return;
    drawing.current = true;
    last.current = position;
    canvasRef.current?.setPointerCapture(event.pointerId);
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const position = point(event);
    if (!position || !last.current) return;

    if (tool === "pointer" && pointerId) {
      const dx = position.x - last.current.x;
      const dy = position.y - last.current.y;
      const current = pointers().find((item) => item.id === pointerId);
      if (current) updatePointer(pointerId, { x: Number(current.x) + dx, y: Number(current.y) + dy });
      last.current = position;
      return;
    }

    if (tool === "eraser") {
      const radius = Math.max(8, width * 3);
      const near = (stroke: Stroke) => Math.hypot(Number(stroke.x) - position.x, Number(stroke.y) - position.y) <= radius;
      onChange({
        ...value,
        strokes: eraseTarget === "paint" ? strokes() : strokes().filter((stroke) => !near(stroke)),
        paintStrokes: eraseTarget === "pen" ? paintStrokes() : paintStrokes().filter((stroke) => !near(stroke)),
      });
      last.current = position;
      return;
    }

    const stroke: Stroke = {
      x: position.x,
      y: position.y,
      px: last.current.x,
      py: last.current.y,
      color,
      width: tool === "paint" ? Math.max(width * 2, width + 8) : width,
      opacity: tool === "paint" ? Math.min(opacity, 0.45) : opacity,
      tool,
    };
    const key = tool === "paint" ? "paintStrokes" : "strokes";
    onChange({ ...value, [key]: [...(((value?.[key] as Stroke[] | undefined) ?? [])), stroke] });
    last.current = position;
  };

  const clear = () => {
    if (permissions?.allowClear === false) return;
    onChange({ ...value, strokes: [], paintStrokes: [], labels: [], pointers: [] });
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
          {(["pen", "paint", "eraser", "text", "pointer", "select"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="icon"
              variant={tool === item ? "default" : "outline"}
              title={item === "text" ? "Label" : item === "eraser" ? "Erase" : item === "pointer" ? "Pointer" : item === "select" ? "Stop tool" : item === "paint" ? "Paint" : "Pen"}
              aria-label={item}
              onClick={() => setTool(item)}
            >
              {item === "text" ? "🏷️" : item === "eraser" ? "⌫" : item === "pointer" ? "➤" : item === "select" ? "✕" : item === "paint" ? "🖌️" : "✎"}
            </Button>
          ))}
          <label className="flex items-center gap-1 text-xs">Colour <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-7 w-8" /></label>
          <label className="flex items-center gap-1 text-xs">Size <input type="range" min="1" max="24" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
          <label className="flex items-center gap-1 text-xs">Opacity <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
          <label className="flex items-center gap-1 text-xs" title="Magnifier">⌕ <input type="range" min="0" max="25" step="0.5" value={magnify} onChange={(event) => setMagnify(Number(event.target.value))} /> <span>×{magnify.toFixed(1)}</span></label>
          {tool === "eraser" && (
            <select value={eraseTarget} onChange={(event) => setEraseTarget(event.target.value as "pen" | "paint" | "both")} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="both">Erase both</option><option value="pen">Erase pen</option><option value="paint">Erase paint</option>
            </select>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={clear}>Clear</Button>
        </div>
      )}

      {tool === "pointer" && !readOnly && pointerId && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-background p-2 text-xs sm:grid-cols-5">
          {(["length", "thickness", "angle", "opacity"] as const).map((field) => {
            const selected = pointers().find((item) => item.id === pointerId);
            if (!selected) return null;
            const ranges = { length: [20, 400, 1], thickness: [1, 12, 1], angle: [0, 6.283, 0.017], opacity: [0.1, 1, 0.05] }[field];
            return (
              <label key={field}>{field}
                <input className="w-full" type="range" min={ranges[0]} max={ranges[1]} step={ranges[2]} value={Number(selected[field] ?? 0)} onChange={(event) => updatePointer(pointerId, { [field]: Number(event.target.value) })} />
              </label>
            );
          })}
          <Button type="button" size="sm" variant="outline" onClick={() => { onChange({ ...value, pointers: pointers().filter((item) => item.id !== pointerId) }); setPointerId(null); }}>Remove</Button>
        </div>
      )}

      <div className="overflow-auto rounded-lg border bg-white">
        <canvas
          ref={canvasRef}
          width={1200}
          height={700}
          style={{ transform: magnify > 0 ? `scale(${Math.min(25, Math.max(1, magnify))})` : "scale(1)", transformOrigin: "top left" }}
          className="h-[320px] w-full touch-none"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={() => { drawing.current = false; last.current = null; }}
          onPointerCancel={() => { drawing.current = false; last.current = null; }}
        />
      </div>

      {tool === "text" && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
          <Input value={labelText} onChange={(event) => setLabelText(event.target.value)} placeholder="Label text…" className="min-w-[180px] flex-1" dir="ltr" />
          <span className="text-xs text-muted-foreground">Tap the drawing to place it.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => { setLabelText(""); setTool("select"); }}>Stop labelling</Button>
        </div>
      )}
    </div>
  );
}

export default function StudentExercise() {
  const [, params] = useRoute("/student/exercises/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const [data, setData] = useState<{ exercise: Exercise; questions: Question[]; options: Option[]; media?: ExerciseMedia[] } | null>(null);
  const [answers, setAnswers] = useState<Record<number, { textAnswer?: string; selectedValue?: string; drawData?: DrawValue; mediaReference?: string }>>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingQuestion, setUploadingQuestion] = useState<number | null>(null);
  const [hiddenMedia, setHiddenMedia] = useState<Record<number, boolean>>({});
  const [confirmAttempt, setConfirmAttempt] = useState(false);
  const [newAttempt, setNewAttempt] = useState(false);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem("dallyletter_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch(getApiUrl(`/api/exercises/${id}`), { headers }).then(async (response) => {
        if (!response.ok) throw new Error("Exercise unavailable");
        return response.json();
      }),
      fetch(getApiUrl(`/api/exercises/${id}/result`), { headers }).then(async (response) => response.ok ? response.json() : null).catch(() => null),
    ])
      .then(([exerciseData, resultData]) => {
        setData(exerciseData);
        setResult(resultData);
        if (resultData?.answers) {
          setAnswers(Object.fromEntries(resultData.answers.map((answer: any) => [answer.questionId, {
            textAnswer: answer.textAnswer ?? undefined,
            selectedValue: answer.selectedValue ?? undefined,
            drawData: answer.drawData ?? undefined,
            mediaReference: answer.mediaReference ?? undefined,
          }])));
        }
      })
      .catch((cause) => setMessage(cause instanceof Error ? cause.message : "Exercise unavailable"));
  }, [id]);

  const optionsByQuestion = useMemo(() => {
    const grouped: Record<string, Option[]> = {};
    for (const option of data?.options ?? []) (grouped[option.questionId] ??= []).push(option);
    return grouped;
  }, [data]);

  const updateAnswer = (questionId: number, patch: Record<string, unknown>) => {
    setAnswers((current) => ({ ...current, [questionId]: { ...current[questionId], ...patch } }));
  };

  const uploadAnswerMedia = async (questionId: number, file: File) => {
    setUploadingQuestion(questionId);
    setMessage("");
    try {
      const token = localStorage.getItem("dallyletter_token");
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(getApiUrl("/api/exercises/answer-media"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const payload = await response.json().catch(() => null) as { mediaUrl?: string; fileName?: string; error?: string } | null;
      if (!response.ok || !payload?.mediaUrl) throw new Error(payload?.error || "Media upload failed");
      updateAnswer(questionId, { mediaReference: payload.mediaUrl });
      setMessage(`Attached ${payload.fileName || file.name} to Q${(data?.questions.findIndex((question) => question.id === questionId) ?? -1) + 1}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Media upload failed");
    } finally {
      setUploadingQuestion(null);
    }
  };

  const submit = async () => {
    if (!data) return;
    setBusy(true);
    setMessage("");
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl(`/api/exercises/${data.exercise.id}/submit`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ newAttempt, answers: Object.entries(answers).map(([questionId, answer]) => { const question = data.questions.find((item) => item.id === Number(questionId)); const teacherDrawing = question?.config?.teacherDrawing as DrawValue | undefined; return { questionId: Number(questionId), ...answer, ...(answer.drawData ? { drawData: { ...(answer.drawData as DrawValue), teacherDrawing: teacherDrawing ?? null, learnerDrawing: answer.drawData } } : {}) }; }) }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Submission failed");
      setResult({ submission: { status: "submitted" }, answers: [] });
      setNewAttempt(false);
      setMessage("Submitted. This attempt is complete. Start a new attempt when you are ready.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <DashboardLayout><div className="p-6">{message || "Loading exercise…"}</div></DashboardLayout>;

  const submissionStatus = result?.submission?.status as string | undefined;
  const isMarked = submissionStatus === "marked";
  const isLocked = Boolean(submissionStatus);
  const statusLabel = submissionStatus === "submitted"
    ? "Submitted • Awaiting marking"
    : submissionStatus === "ai_partial"
      ? "AI partially marked • Awaiting teacher"
      : submissionStatus === "ai_marked_pending_return"
        ? "AI marked • Awaiting teacher"
        : "Open • Ready to submit";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-black text-[#0A1931] dark:text-[#FFF8E1]">{data.exercise.title}</CardTitle>
            {data.exercise.instructions && <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeRichText(data.exercise.instructions) }} />}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{data.exercise.totalMarks} marks</Badge>
              <Badge variant={isMarked ? "default" : "secondary"}>{isMarked ? "Marked • Result returned" : statusLabel}</Badge>
            </div>
          </CardHeader>
        </Card>

        {data.questions.map((question, index) => {
          const attachment = (question.config?.attachment as { url?: string; fileName?: string; mimeType?: string } | undefined);
          const media = data.media?.find((item) => item.questionId === question.id);
          const attachmentUrl = attachment?.url || media?.url;
          const answerMedia = answers[question.id]?.mediaReference;
          return (
            <Card key={question.id} className="overflow-hidden border-primary/10 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="mr-1">Q{index + 1}.</span>
                  <span dangerouslySetInnerHTML={{ __html: sanitizeRichText(question.prompt) }} />
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary" className="w-fit">{question.marksAllocated} marks</Badge><Badge variant="outline" className="w-fit capitalize">{question.type}</Badge></div>
                {attachmentUrl && (
                  <div className="mt-3 rounded-xl border bg-background/70 p-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Question attachment</div>
                    <QuestionAttachment url={attachmentUrl} fileName={attachment?.fileName || media?.fileName || "Question attachment"} mimeType={attachment?.mimeType || media?.mimeType} />
                  </div>
                )}
                {answerMedia && !hiddenMedia[question.id] && (
                  <div className="mt-3 rounded-xl border-2 border-primary/10 bg-primary/[0.02] p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your attachment for Q{index + 1}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setHiddenMedia((current) => ({ ...current, [question.id]: true }))}>Hide media</Button>
                    </div>
                    <QuestionAttachment url={answerMedia} fileName="Your attached media" />
                  </div>
                )}
                {answerMedia && hiddenMedia[question.id] && (
                  <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setHiddenMedia((current) => ({ ...current, [question.id]: false }))}>Show attached media</Button>
                )}
              </CardHeader>

              <CardContent>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-muted">
                    <span>{uploadingQuestion === question.id ? "Uploading…" : "Attach file"}</span>
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      capture="environment"
                      disabled={isLocked || uploadingQuestion !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadAnswerMedia(question.id, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {answerMedia && <Badge variant="outline">Attachment added</Badge>}
                </div>

                {question.type === "input" && (
                  <Textarea
                    dir="ltr"
                    disabled={isLocked}
                    value={answers[question.id]?.textAnswer ?? ""}
                    onChange={(event) => updateAnswer(question.id, { textAnswer: event.target.value })}
                    placeholder={isMarked ? "Marked answer — read-only" : "Type your answer…"}
                  />
                )}

                {question.type === "poll" && (
                  <div className="space-y-2">
                    {(optionsByQuestion[String(question.id)] ?? []).map((option) => (
                      <label key={option.id} className="flex cursor-pointer gap-3 rounded-lg border p-3">
                        <input disabled={isLocked} type="radio" name={`q-${question.id}`} checked={answers[question.id]?.selectedValue === option.value} onChange={() => updateAnswer(question.id, { selectedValue: option.value })} />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {question.type === "drawbox" && (
                  <DrawBox
                    value={answers[question.id]?.drawData}
                    teacherDrawing={(question.config?.teacherDrawing as DrawValue | undefined)}
                    permissions={(question.config?.drawPermissions as { preview?: boolean; allowClear?: boolean; allowModify?: boolean; allowRewrite?: boolean } | undefined)}
                    readOnly={isLocked}
                    onChange={(drawData) => updateAnswer(question.id, { drawData })}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{message}</span>
          {!isLocked && <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit Exercise"}</Button>}
          {submissionStatus && <Button variant="outline" onClick={() => setConfirmAttempt(true)}>Start new attempt</Button>}
        </div>

        {confirmAttempt && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4">
              <p className="font-semibold text-amber-900">Start a new attempt?</p>
              <p className="mt-1 text-sm text-amber-800">Your previous submission remains preserved. The new attempt is separate.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => setConfirmAttempt(false)}>Not yet</Button>
                <Button onClick={() => { setConfirmAttempt(false); setNewAttempt(true); setResult(null); setAnswers({}); setMessage("New attempt started. Complete and submit when ready."); }}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {result?.submission?.status === "marked" && (
          <Card>
            <CardHeader><CardTitle>Returned result</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{result.submission.totalScore} / {data.exercise.totalMarks} marks</p>
              <p className="text-sm text-muted-foreground">{result.submission.percentage}%</p>
              <div className="mt-3 space-y-2">
                {(result.answers ?? []).map((answer: any, answerIndex: number) => {
                  const question = data.questions.find((item) => item.id === answer.questionId);
                  const marking = (answer.markingData && typeof answer.markingData === "object" ? answer.markingData : {}) as Record<string, unknown>;
                  const mediaUrl = answer.mediaReference as string | null;
                  const mediaType = mediaUrl ? (() => { const type = new URL(mediaUrl, window.location.origin).searchParams.get("type") ?? ""; return type.startsWith("image/") ? "image" as const : type.startsWith("video/") ? "video" as const : type.startsWith("audio/") ? "audio" as const : "document" as const; })() : null;
                  return (
                    <div key={answer.id} className="space-y-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">Question {question?.position != null ? question.position + 1 : answerIndex + 1}</p>
                        <Badge variant="outline">{answer.awardedMarks} / {question?.marksAllocated ?? "—"} marks</Badge>
                      </div>
                      {question?.prompt && <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichText(question.prompt) }} />}
                      {answer.drawData && <div className="space-y-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer with teacher's marks</p><DrawBox value={answer.drawData as DrawValue} onChange={() => undefined} readOnly teacherDrawing={marking} /></div>}
                      {mediaUrl && mediaType && <div className="space-y-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your media with teacher's marks</p><div className="relative overflow-hidden rounded-lg border"><AuthenticatedMedia url={mediaUrl} type={mediaType} title={`Question ${answerIndex + 1} returned media`} /><ReturnedMediaAnnotations data={marking} /></div></div>}
                      {!answer.drawData && !mediaUrl && <div className="rounded-md bg-muted/40 p-3 text-sm">{answer.textAnswer || answer.selectedValue || "No written answer was submitted."}</div>}
                      <div className="flex items-center gap-2 font-semibold">
                        {Number(answer.awardedMarks) > 0 ? <span className="text-emerald-600">✓</span> : <span className="text-red-600">✕</span>}
                        {answer.awardedMarks} marks earned
                      </div>
                      {answer.correctionNotes && <p className="mt-2 rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-950"><span className="font-semibold">Teacher's correction:</span> {answer.correctionNotes}</p>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border bg-muted/30 p-4">
                <p className="font-semibold">Teacher's final comment</p>
                <p className="mt-2 text-sm text-muted-foreground">{result.submission.overallComment || "No final comment was added."}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Button variant="ghost" onClick={() => navigate("/student/lessons")}>Back to lessons</Button>
      </div>
    </DashboardLayout>
  );
}
