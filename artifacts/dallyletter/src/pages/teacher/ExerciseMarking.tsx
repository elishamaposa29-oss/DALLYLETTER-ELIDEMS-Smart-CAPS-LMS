import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, AlertTriangle, CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react";
import { useRoute } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { sanitizeRichText } from "@/components/RichTextEditor";

function DrawAnswer({ data, markingData }: { data: unknown; markingData?: Record<string,unknown>|null }) {
  const source = data as { teacherDrawing?: any; learnerDrawing?: any; strokes?: { x:number;y:number;px:number;py:number;color?:string;width?:number;tool?:string;opacity?:number }[]; paintStrokes?: { x:number;y:number;px:number;py:number;color?:string;width?:number;opacity?:number }[]; labels?: { text:string;x:number;y:number;anchorX?:number;anchorY?:number;color?:string;opacity?:number }[]; pointers?: { x:number;y:number;length?:number;thickness?:number;opacity?:number;color?:string;angle?:number }[] };
  const d = source.learnerDrawing ?? source;
  const teacher = source.teacherDrawing as any;
  const combinedPaint = [...(teacher?.paintStrokes ?? []), ...(d?.paintStrokes ?? [])];
  const combinedStrokes = [...(teacher?.strokes ?? []), ...(d?.strokes ?? [])];
  const combinedPointers = [...(teacher?.pointers ?? []), ...(d?.pointers ?? [])];
  const combinedLabels = [...(teacher?.labels ?? []), ...(d?.labels ?? [])];
  return <canvas width={1200} height={700} className="w-full max-h-[520px] rounded border bg-white" ref={canvas => {
    if (!canvas) return; const ctx=canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const s of combinedPaint) { ctx.save();ctx.lineCap="round";ctx.globalAlpha=Number(s.opacity??.28);ctx.lineWidth=Number(s.width??10);ctx.strokeStyle=s.color??"#f59e0b";ctx.beginPath();ctx.moveTo(s.px,s.py);ctx.lineTo(s.x,s.y);ctx.stroke();ctx.restore(); }
    for (const s of combinedStrokes) { ctx.save();ctx.lineCap="round";ctx.lineWidth=Number(s.width??2);ctx.globalAlpha=Number(s.opacity??1);ctx.strokeStyle=s.color??"#111827";ctx.globalCompositeOperation=s.tool==="eraser"?"destination-out":"source-over";ctx.beginPath();ctx.moveTo(s.px,s.py);ctx.lineTo(s.x,s.y);ctx.stroke();ctx.restore(); }
    for (const p of combinedPointers) { const x=Number(p.x),y=Number(p.y),len=Number(p.length??90),ang=Number(p.angle??0),ex=x+Math.cos(ang)*len,ey=y+Math.sin(ang)*len;ctx.save();ctx.globalAlpha=Number(p.opacity??.8);ctx.strokeStyle=p.color??"#111827";ctx.fillStyle=p.color??"#111827";ctx.lineWidth=Number(p.thickness??3);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();const ah=Math.max(7,Number(p.thickness??3)*3);ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(ang-.55)*ah,ey-Math.sin(ang-.55)*ah);ctx.lineTo(ex-Math.cos(ang+.55)*ah,ey-Math.sin(ang+.55)*ah);ctx.closePath();ctx.fill();ctx.restore(); }
        ctx.font="16px sans-serif"; for (const label of combinedLabels) { ctx.save();ctx.globalAlpha=Number(label.opacity??1);ctx.fillStyle=label.color??"#111827";if(label.anchorX!=null&&label.anchorY!=null){ctx.beginPath();ctx.moveTo(label.anchorX,label.anchorY);ctx.lineTo(label.x-4,label.y-4);ctx.strokeStyle=label.color??"#111827";ctx.stroke();}ctx.fillText(label.text,label.x,label.y);ctx.restore(); }
  }} />;
}


function FloatingTicks({ data, onChange }: { data: Record<string, unknown> | null | undefined; onChange: (data: Record<string, unknown>) => void }) {
  const ticks = (data?.ticks ?? []) as Array<{ x: number; y: number; size?: number; color?: string; opacity?: number }>;

  return (
    <>
      {ticks.map((tick, index) => {
        const left = Math.max(0, Math.min(96, (tick.x / 1200) * 100));
        const top = Math.max(0, Math.min(94, (tick.y / 700) * 100));
        return (
          <div
            key={index}
            className="pointer-events-auto absolute z-20 touch-none cursor-grab select-none font-black"
            style={{
              left: left + "%",
              top: top + "%",
              fontSize: Math.max(18, Number(tick.size ?? 28)),
              color: tick.color ?? "#16a34a",
              opacity: Number(tick.opacity ?? 0.9),
            }}
            onPointerDown={(event) => {
              const parent = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!parent) return;
              const startX = event.clientX;
              const startY = event.clientY;
              const originX = tick.x;
              const originY = tick.y;
              const move = (moveEvent: PointerEvent) => {
                onChange({
                  ...data,
                  ticks: ticks.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          x: Math.max(0, Math.min(1140, originX + ((moveEvent.clientX - startX) / parent.width) * 1200)),
                          y: Math.max(0, Math.min(660, originY + ((moveEvent.clientY - startY) / parent.height) * 700)),
                        }
                      : item,
                  ),
                });
              };
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            ✓
          </div>
        );
      })}
    </>
  );
}

function distanceToMarkSegment(point:{x:number;y:number},item:Record<string,unknown>){const x1=Number(item.px??item.x??0),y1=Number(item.py??item.y??0),x2=Number(item.x??x1),y2=Number(item.y??y1),dx=x2-x1,dy=y2-y1,len=dx*dx+dy*dy,t=len===0?0:Math.max(0,Math.min(1,((point.x-x1)*dx+(point.y-y1)*dy)/len));return Math.hypot(point.x-(x1+t*dx),point.y-(y1+t*dy));}

function ReturnedMarkingAnnotations({ data }: { data: Record<string, unknown> | null | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const d = data ?? {};
    for (const s of (d.mediaStrokes ?? []) as Array<Record<string, unknown>>) {
      ctx.save(); ctx.strokeStyle = String(s.color ?? "#dc2626"); ctx.lineWidth = Number(s.width ?? 4); ctx.globalAlpha = Number(s.opacity ?? .95); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(Number(s.px ?? s.x), Number(s.py ?? s.y)); ctx.lineTo(Number(s.x), Number(s.y)); ctx.stroke(); ctx.restore();
    }
    for (const p of (d.pointers ?? []) as Array<Record<string, unknown>>) {
      const x=Number(p.x??0), y=Number(p.y??0), a=Number(p.angle??0), len=Number(p.length??90), ex=x+Math.cos(a)*len, ey=y+Math.sin(a)*len;
      ctx.save(); ctx.strokeStyle=String(p.color??"#dc2626"); ctx.fillStyle=ctx.strokeStyle; ctx.globalAlpha=Number(p.opacity??.95); ctx.lineWidth=Number(p.thickness??3); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(ex,ey); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex-Math.cos(a-.55)*12,ey-Math.sin(a-.55)*12); ctx.lineTo(ex-Math.cos(a+.55)*12,ey-Math.sin(a+.55)*12); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (const label of (d.labels ?? []) as Array<Record<string, unknown>>) { ctx.save(); ctx.fillStyle=String(label.color??"#dc2626"); ctx.globalAlpha=Number(label.opacity??1); ctx.font="bold "+Number(label.fontSize??18)+"px sans-serif"; ctx.fillText(String(label.text??""),Number(label.x??0),Number(label.y??0)); ctx.restore(); }
    for (const tick of (d.ticks ?? []) as Array<Record<string, unknown>>) { ctx.save(); ctx.fillStyle=String(tick.color??"#16a34a"); ctx.globalAlpha=Number(tick.opacity??.95); ctx.font="bold "+Math.max(22,Number(tick.size??28))+"px sans-serif"; ctx.fillText("✓",Number(tick.x??0),Number(tick.y??0)); ctx.restore(); }
  }, [data]);
  return <canvas ref={ref} width={1200} height={700} className="pointer-events-none absolute inset-0 h-full w-full" aria-label="Teacher marking annotations" />;
}

function MediaMarkOverlay({ data, onChange }: { data: Record<string, unknown> | null | undefined; onChange: (data: Record<string, unknown>) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const activePointerId = useRef<string | null>(null);
  const pointerOrigin = useRef<{x:number;y:number}|null>(null);
  const [tool, setTool] = useState<"pen" | "tick" | "eraser" | "pointer" | "text">("pen");
  const [active, setActive] = useState(false);
  const [color, setColor] = useState("#dc2626");
  const [width, setWidth] = useState(4);
  const [label, setLabel] = useState("");
  const [eraseTarget, setEraseTarget] = useState<"all" | "pen" | "ticks" | "pointers" | "labels">("all");
  const [zoom, setZoom] = useState(1);
  const [undoStack, setUndoStack] = useState<Record<string, unknown>[]>([]);
  const [redoStack, setRedoStack] = useState<Record<string, unknown>[]>([]);
  const snapshot = (value: Record<string, unknown> | null | undefined) => structuredClone(value ?? {});
  const rememberChange = () => {
    setUndoStack(stack => [...stack.slice(-49), snapshot(data)]);
    setRedoStack([]);
  };
  const undo = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(stack => [...stack.slice(-49), snapshot(data)]);
    setUndoStack(stack => stack.slice(0, -1));
    onChange(snapshot(previous));
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(stack => [...stack.slice(-49), snapshot(data)]);
    setRedoStack(stack => stack.slice(0, -1));
    onChange(snapshot(next));
  };
  const adjustZoom = (event: React.MouseEvent<HTMLButtonElement>, delta: number) => { const surface=event.currentTarget.closest("[data-marking-surface]") as HTMLElement|null; const next=Math.max(0.75,Math.min(2,Math.round((zoom+delta)*100)/100)); if(surface){surface.style.setProperty("zoom",String(next));surface.style.setProperty("overflow","auto");} setZoom(next); };
  useEffect(()=>()=>{const surface=canvasRef.current?.closest("[data-marking-surface]") as HTMLElement|null;if(surface){surface.style.removeProperty("zoom");surface.style.removeProperty("overflow");}},[]);
  const redraw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const strokes = (data?.mediaStrokes ?? []) as Array<Record<string, unknown>>;
    for (const s of strokes) { ctx.save(); ctx.strokeStyle=String(s.color??"#dc2626"); ctx.lineWidth=Number(s.width??4); ctx.globalAlpha=Number(s.opacity??.95); ctx.lineCap="round"; ctx.lineJoin="round"; ctx.beginPath(); ctx.moveTo(Number(s.px??s.x),Number(s.py??s.y)); ctx.lineTo(Number(s.x),Number(s.y)); ctx.stroke(); ctx.restore(); }
    const pointers = (data?.pointers ?? []) as Array<Record<string, unknown>>;
    for (const p of pointers) { const x=Number(p.x??0),y=Number(p.y??0),angle=Number(p.angle??0),length=Number(p.length??90),ex=x+Math.cos(angle)*length,ey=y+Math.sin(angle)*length; ctx.save();ctx.strokeStyle=String(p.color??"#dc2626");ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=Number(p.thickness??3);ctx.globalAlpha=Number(p.opacity??.95);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(angle-.55)*12,ey-Math.sin(angle-.55)*12);ctx.lineTo(ex-Math.cos(angle+.55)*12,ey-Math.sin(angle+.55)*12);ctx.closePath();ctx.fill();ctx.restore(); }
    const labels = (data?.labels ?? []) as Array<Record<string, unknown>>;
    for (const item of labels) { ctx.save();ctx.fillStyle=String(item.color??"#dc2626");ctx.globalAlpha=Number(item.opacity??1);ctx.font=`bold ${Number(item.fontSize??18)}px sans-serif`;ctx.fillText(String(item.text??""),Number(item.x??0),Number(item.y??0));ctx.restore(); }
  };
  useEffect(()=>redraw(),[data]);
  const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{const c=canvasRef.current;if(!c)return null;const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*(1200/r.width),y:(e.clientY-r.top)*(700/r.height)};};
  const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const p=point(e);if(!p)return;
    if(tool==="text"){if(label.trim()){rememberChange();onChange({...data,labels:[...((data?.labels??[]) as Array<Record<string,unknown>>),{text:label.trim(),x:p.x,y:p.y,color,fontSize:Math.max(14,width*4),opacity:1}]});}return;}
    drawing.current=true;last.current=p;e.currentTarget.setPointerCapture(e.pointerId);
    if(tool==="pen"||tool==="eraser"||tool==="pointer") rememberChange();
    if(tool==="tick"){rememberChange();const ticks=(data?.ticks??[]) as Array<Record<string,unknown>>;onChange({...data,ticks:[...ticks,{x:p.x,y:p.y,size:Math.max(22,width*8),color:"#16a34a",opacity:.95}]});drawing.current=false;return;}
    if(tool==="pointer"){const id=crypto.randomUUID();activePointerId.current=id;pointerOrigin.current=p;const pointers=(data?.pointers??[]) as Array<Record<string,unknown>>;onChange({...data,pointers:[...pointers,{id,x:p.x,y:p.y,length:90,thickness:Math.max(2,width),opacity:1,color,angle:0}]});}
  };
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!drawing.current||!last.current)return;const p=point(e);if(!p)return;
    if(tool==="eraser"){const radius=Math.max(16,width*4);const near=(item:Record<string,unknown>)=>distanceToMarkSegment(p,item)<radius;const strokes=(data?.mediaStrokes??[]) as Array<Record<string,unknown>>;const ticks=(data?.ticks??[]) as Array<Record<string,unknown>>;const pointers=(data?.pointers??[]) as Array<Record<string,unknown>>;const labels=(data?.labels??[]) as Array<Record<string,unknown>>;onChange({...data,...(eraseTarget==="all"||eraseTarget==="pen"?{mediaStrokes:strokes.filter(item=>!near(item))}:{}),...(eraseTarget==="all"||eraseTarget==="ticks"?{ticks:ticks.filter(item=>!near(item))}:{}),...(eraseTarget==="all"||eraseTarget==="pointers"?{pointers:pointers.filter(item=>!near(item))}:{}),...(eraseTarget==="all"||eraseTarget==="labels"?{labels:labels.filter(item=>!near(item))}:{})});last.current=p;return;}
    if(tool==="pointer"){const id=activePointerId.current;const origin=pointerOrigin.current??p;if(id){const dx=p.x-origin.x,dy=p.y-origin.y;const pointers=(data?.pointers??[]) as Array<Record<string,unknown>>;onChange({...data,pointers:pointers.map(item=>item.id===id?{...item,x:origin.x,y:origin.y,length:Math.max(12,Math.hypot(dx,dy)),angle:Math.atan2(dy,dx)}:item)});}last.current=p;return;}
    if(tool!=="pen")return;
    const strokes=(data?.mediaStrokes??[]) as Array<Record<string,unknown>>;onChange({...data,mediaStrokes:[...strokes,{px:last.current.x,py:last.current.y,x:p.x,y:p.y,color,width,opacity:.98}]});last.current=p;
  };
  const openFullscreen=async(e:React.MouseEvent<HTMLButtonElement>)=>{const surface=e.currentTarget.closest("[data-marking-surface]") as HTMLElement|null;if(!surface)return;try{if(document.fullscreenElement)await document.exitFullscreen();else await surface.requestFullscreen();}catch{window.alert("Full-screen mode is not available in this browser.");}};
  return <div className="absolute inset-0 z-20 pointer-events-none">
    <div className="pointer-events-auto fixed left-1/2 top-20 z-[100] flex w-[calc(100vw-1rem)] max-w-5xl -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-white/20 bg-[#0A1931]/95 p-2 shadow-2xl backdrop-blur-md">
      {(["pen","tick","eraser","pointer","text"] as const).map(item=><Button key={item} type="button" size="icon" variant={tool===item?"default":"ghost"} className="h-8 w-8 text-white" aria-label={item==="tick"?"Place tick":item==="eraser"?"Erase marks":item==="pointer"?"Add directional pointer":item==="text"?"Add correction label":"Draw correction"} title={item} onClick={()=>{setTool(item);setActive(true)}}>{item==="pen"?"✎":item==="tick"?"✓":item==="eraser"?"⌫":item==="pointer"?"➤":"T"}</Button>)}
      <input aria-label="Correction ink colour" type="color" value={color} onChange={e=>setColor(e.target.value)} className="h-7 w-8" />
      <input aria-label="Correction ink size" type="range" min="1" max="12" value={width} onChange={e=>setWidth(Number(e.target.value))} className="w-14" />{tool==="eraser"&&<select aria-label="Choose marks to erase" value={eraseTarget} onChange={e=>setEraseTarget(e.target.value as typeof eraseTarget)} className="h-8 max-w-28 rounded border bg-white/95 px-1 text-xs text-slate-900"><option value="all">Erase all</option><option value="pen">Pen only</option><option value="ticks">Ticks only</option><option value="pointers">Pointers only</option><option value="labels">Labels only</option></select>}
      {tool==="text"&&<input aria-label="Correction label text" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Correction note" className="h-8 w-28 rounded border bg-white px-2 text-xs text-black" />}
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-white" aria-label="Undo correction" title="Undo correction" disabled={!undoStack.length} onClick={undo}>↶ Undo</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-white" aria-label="Redo correction" title="Redo correction" disabled={!redoStack.length} onClick={redo}>↷ Redo</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-white" aria-label="Zoom out" onClick={e=>adjustZoom(e,-0.25)}>−</Button><span className="self-center px-1 text-xs text-white">{Math.round(zoom*100)}%</span><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-white" aria-label="Zoom in" onClick={e=>adjustZoom(e,0.25)}>+</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-white" onClick={openFullscreen}>Full screen</Button>{(tool==="text"||tool==="tick"||tool==="pointer")&&<Button type="button" size="sm" variant="secondary" className="h-8 px-2" onClick={()=>{setTool("pen");setActive(true);}}>Stop {tool==="text"?"labelling":tool==="tick"?"ticks":"pointing"}</Button>}
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" aria-label="Stop marking" title="Stop marking" onClick={()=>{drawing.current=false;last.current=null;activePointerId.current=null;pointerOrigin.current=null;setActive(false);setTool("pen");}}>✕</Button>
    </div>
    <canvas ref={canvasRef} width={1200} height={700} className={active ? "pointer-events-auto absolute inset-0 h-full w-full touch-none" : "pointer-events-none absolute inset-0 h-full w-full"} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drawing.current=false;last.current=null;activePointerId.current=null;pointerOrigin.current=null}} onPointerCancel={()=>{drawing.current=false;last.current=null;activePointerId.current=null;pointerOrigin.current=null}} />
  </div>;
}

function AuthenticatedAttachment({ url }: { url: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    // Open the tab synchronously from the click; browsers often block window.open after fetch awaits.
    const tab = window.open("about:blank", "_blank");
    if (!tab) { window.alert("Your browser blocked the preview tab. Allow pop-ups for Dallyletter and try again."); return; }
    tab.opener = null;
    tab.document.title = "Opening Dallyletter attachment…";
    tab.document.body.textContent = "Loading your attachment…";
    setBusy(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const r = await fetch(getApiUrl(url), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error("Attachment could not be opened.");
      const blob = await r.blob();
      const objectUrl = URL.createObjectURL(blob);
      tab.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
    } catch (error) {
      tab.close();
      window.alert(error instanceof Error ? error.message : "Attachment could not be opened.");
    } finally {
      setBusy(false);
    }
  };
  return <Button type="button" size="sm" variant="link" className="h-auto p-0" onClick={open} disabled={busy}>{busy ? "Opening…" : "Open attachment"}</Button>;
}

interface Submission {
  id: number;
  learnerId: number;
  attemptNumber: number;
  totalScore: string;
  percentage: string | null;
  status: string;
}

interface Answer {
  id: number;
  questionId: number;
  textAnswer: string | null;
  selectedValue: string | null;
  drawData: unknown;
  awardedMarks: string;
  correctionNotes: string | null;
  mediaReference: string | null;
  markingData?: Record<string,unknown> | null;
}

interface Question {
  id: number;
  prompt: string;
  type: string;
  marksAllocated: string;
  position: number;
}
interface PollOption { id:number; questionId:number; label:string; value:string; isCorrect?:boolean; }

interface Exercise {
  id: number;
  title: string;
  totalMarks: string;
}

const statusMeta: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  submitted: { label: "Awaiting teacher", className: "bg-amber-500/10 text-amber-700 border-amber-500/20", icon: Clock3 },
  ai_partial: { label: "Partially marked", className: "bg-orange-500/10 text-orange-700 border-orange-500/20", icon: AlertTriangle },
  ai_marked_pending_return: { label: "Awaiting teacher", className: "bg-blue-500/10 text-blue-700 border-blue-500/20", icon: Sparkles },
  marked: { label: "Returned", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", icon: CheckCircle2 },
};

function FloatingMark({ value, max, onChange }: { value: string; max?: string; onChange: (value: string) => void }) {
  const [pos, setPos] = useState({ x: 12, y: 12 });
  const dragging = useRef(false);
  const startPoint = useRef({ x: 0, y: 0, px: 12, py: 12 });

  return (
    <div
      className="absolute z-10 touch-none"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      onPointerDown={(event) => {
        dragging.current = true;
        startPoint.current = { x: event.clientX, y: event.clientY, px: pos.x, py: pos.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const parent = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!parent) return;
        setPos({
          x: Math.max(0, Math.min(90, startPoint.current.px + ((event.clientX - startPoint.current.x) / parent.width) * 100)),
          y: Math.max(0, Math.min(90, startPoint.current.py + ((event.clientY - startPoint.current.y) / parent.height) * 100)),
        });
      }}
      onPointerUp={() => { dragging.current = false; }}
    >
      <div className="flex items-center gap-1 rounded-full border-2 border-amber-400 bg-amber-50/95 p-1 shadow-lg backdrop-blur">
        <span className="cursor-grab px-1 text-[10px] text-amber-700">⋮⋮</span>
        <Input
          type="number"
          min="0"
          max={undefined}
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-20 border-0 bg-transparent text-center font-bold focus-visible:ring-0"
          aria-label="Floating mark"
        />
      </div>
    </div>
  );
}

function SubmissionStatus({ status }: { status: string }) {
  const meta = statusMeta[status] ?? { label: status, className: "bg-muted text-muted-foreground", icon: Clock3 };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

export default function ExerciseMarking() {
  const [, params] = useRoute("/teacher/exercises/:id/mark");
  const id = params?.id;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [markingData, setMarkingData] = useState<Record<number, Record<string,unknown>>>({});
  const [overallComment, setOverallComment] = useState("");
  const [message, setMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiState, setAiState] = useState<"idle"|"checking"|"partially_marked"|"awaiting_teacher"|"returned">("idle");
  const [loading, setLoading] = useState(false);
  const [learnerPreviewOpen, setLearnerPreviewOpen] = useState(false);

  const token = localStorage.getItem("dallyletter_token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const selectedSubmission = useMemo(
    () => subs.find((s) => s.id === selected) ?? null,
    [subs, selected],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(getApiUrl(`/api/exercises/${id}`), { headers }).then((r) => r.json()),
      fetch(getApiUrl(`/api/exercises/${id}/submissions`), { headers }).then((r) => r.json()),
    ])
      .then(([exerciseData, submissionData]) => {
        if (cancelled) return;
        if (exerciseData?.exercise) setExercise(exerciseData.exercise);
        setQuestions(Array.isArray(exerciseData?.questions) ? exerciseData.questions : []);
        setPollOptions(Array.isArray(exerciseData?.options) ? exerciseData.options : []);
        setSubs(Array.isArray(submissionData) ? submissionData : []);
      })
      .catch(() => setMessage("Could not load the exercise and submissions."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const load = async (submissionId: number) => {
    if (!id) return;
    setSelected(submissionId);
    setMessage("");
    setAiMessage("");
    try {
      const r = await fetch(getApiUrl(`/api/exercises/${id}/submissions/${submissionId}`), { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load submission.");
      const loadedAnswers = (d.answers ?? []) as Answer[];
      setAnswers(loadedAnswers);
      setMarks(Object.fromEntries(loadedAnswers.map((a) => [a.id, a.awardedMarks])));
      setNotes(Object.fromEntries(loadedAnswers.map((a) => [a.id, a.correctionNotes ?? ""])));
      setMarkingData(Object.fromEntries(loadedAnswers.map((a) => [a.id, a.markingData ?? { ticks: [] }])))
      setOverallComment(d.submission?.overallComment ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load submission.");
    }
  };

  const runAIMarking = async () => {
    if (!id || selected === null) return;
    setAiBusy(true);
    setAiState("checking");
    setAiMessage("Checking learner work with ELIDEMS AI…");
    setMessage("");
    try {
      const r = await fetch(getApiUrl(`/api/exercises/${id}/ai-marking/${selected}/run`), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!r.ok) {
        setAiState("idle");
        setAiMessage(d.error || "AI marking could not start. The normal teacher workflow remains available.");
        return;
      }
      const nextLabel = d.needsReview ? "Partially marked — awaiting teacher review." : "AI marks prepared — awaiting teacher confirmation.";
      setAiState(d.needsReview ? "partially_marked" : "awaiting_teacher");
      setAiMessage(nextLabel);
      await load(selected);
      setSubs((current) =>
        current.map((x) => (x.id === selected ? { ...x, status: d.status } : x)),
      );
    } catch {
      setAiState("idle");
      setAiMessage("AI marking could not start. The normal teacher workflow remains available.");
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!id || selected === null) return;
    setMessage("");
    const r = await fetch(getApiUrl(`/api/exercises/${id}/submissions/${selected}/mark`), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        marks: answers.map((a) => ({
          answerId: a.id,
          awardedMarks: Number(marks[a.id] ?? 0),
          correctionNotes: notes[a.id] ?? "",
          markingData: markingData[a.id] ?? { ticks: [] },
        })),
        overallComment,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setMessage(d.error || "Marking failed.");
      return;
    }
    setMessage(`Result returned to learner: ${d.submission.totalScore} / ${exercise?.totalMarks ?? "—"} • ${d.submission.percentage}%`);
    setSubs((current) => current.map((x) => (x.id === selected ? d.submission : x)));
  };

  const selectedQuestion = (answer: Answer) => questions.find((q) => q.id === answer.questionId);
  const optionsFor = (questionId:number) => pollOptions.filter(option => option.questionId === questionId);
  const mediaTypeFor = (url:string): "audio"|"video"|"image"|"document" => { const type=new URL(url,window.location.origin).searchParams.get("type") ?? ""; if(type.startsWith("image/"))return "image"; if(type.startsWith("video/"))return "video"; if(type.startsWith("audio/"))return "audio"; return "document"; };
  const liveEarned = answers.reduce((sum,a)=>sum+Math.max(0,Math.min(Number(selectedQuestion(a)?.marksAllocated??0),Number(marks[a.id]??0)||0)),0);
  const liveTotal = Number(exercise?.totalMarks??0);
  const livePercentage = liveTotal>0 ? (liveEarned/liveTotal)*100 : 0;

  return (
    <DashboardLayout>
      {learnerPreviewOpen && <div className="fixed inset-0 z-[70] overflow-y-auto bg-background/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Learner view preview"><Card className="mx-auto min-h-[calc(100dvh-1.5rem)] w-full max-w-4xl"><CardHeader className="border-b"><div className="flex items-center justify-between gap-3"><div><CardTitle>Learner view preview</CardTitle><p className="mt-1 text-sm text-muted-foreground">Preview of the returned exercise using the current saved learner answer and teacher feedback.</p></div><Button type="button" variant="outline" onClick={()=>setLearnerPreviewOpen(false)}>Close preview</Button></div></CardHeader><CardContent className="space-y-4 p-4 sm:p-6"><div className="rounded-xl bg-amber-50 p-4 text-slate-900"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Returned result</p><p className="mt-1 text-2xl font-bold">{answers.reduce((sum,a)=>sum+Number(marks[a.id]??0),0).toFixed(2)} / {exercise?.totalMarks??"—"}</p><p className="text-sm">{exercise?.totalMarks ? ((answers.reduce((sum,a)=>sum+Number(marks[a.id]??0),0)/Number(exercise.totalMarks))*100).toFixed(1)+"%" : "Percentage unavailable"}</p><p className="mt-2 whitespace-pre-wrap text-sm">{overallComment}</p></div>{answers.map((a,i)=>{const q=selectedQuestion(a);return <section key={a.id} className="space-y-3 rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Question {q?.position!=null?q.position+1:i+1}</h3>{q?.prompt&&<div className="prose prose-sm dark:prose-invert mt-1 max-w-none" dangerouslySetInnerHTML={{__html:sanitizeRichText(q.prompt)}}/>}</div><Badge variant="secondary">{marks[a.id]??"0"} / {q?.marksAllocated??"—"}</Badge></div><div className="rounded-lg bg-muted/40 p-3 text-sm">{a.drawData?<div className="relative overflow-hidden rounded-lg bg-white"><DrawAnswer data={a.drawData} markingData={markingData[a.id]}/><ReturnedMarkingAnnotations data={markingData[a.id]}/></div>:a.mediaReference?<div className="relative overflow-hidden rounded-lg"><AuthenticatedMedia url={a.mediaReference} type={mediaTypeFor(a.mediaReference)} title={"Returned media for question "+(i+1)}/><ReturnedMarkingAnnotations data={markingData[a.id]}/></div>:a.textAnswer||a.selectedValue||"No answer submitted"}</div>{markingData[a.id]&&<div className="rounded-lg border p-3 text-sm"><strong>Teacher annotations</strong><p className="mt-1">{((markingData[a.id].labels??[]) as Array<Record<string,unknown>>).map(x=>String(x.text??"")).filter(Boolean).join(" · ")||"Annotations saved with this result."}</p></div>}{notes[a.id]&&<div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Teacher feedback</strong><p className="mt-1 whitespace-pre-wrap">{notes[a.id]}</p></div>}</section>})}</CardContent></Card></div>}

      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{exercise?.title ?? "Exercise submissions"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review learner work, use AI only as an assistant, then explicitly return the final result.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading submissions…</p>
            ) : subs.length ? (
              <div className="flex flex-wrap gap-2">
                {subs.map((s) => (
                  <Button
                    key={s.id}
                    variant={selected === s.id ? "default" : "outline"}
                    className="h-auto justify-start gap-2 p-3"
                    onClick={() => load(s.id)}
                  >
                    <span className="text-left">
                      <span className="block">Learner #{s.learnerId} · Attempt {s.attemptNumber}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-90">
                        <SubmissionStatus status={s.status} />
                        <span>{s.totalScore} marks</span>
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No learner submissions yet.</p>
            )}
          </CardContent>
        </Card>

        {selected !== null && selectedSubmission && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Review submission #{selected}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedSubmission.status === "marked"
                      ? "This result has already been returned. You can review it, but use the normal marking action only when a correction is needed."
                      : "AI proposals are editable. Nothing reaches the learner until you save and return the result."}
                  </p>
                </div>
                <SubmissionStatus status={selectedSubmission.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4"><div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Current marking</p><p className="text-lg font-bold">{liveEarned.toFixed(2)} / {liveTotal.toFixed(2)} marks</p></div><Badge variant="secondary">{livePercentage.toFixed(2)}%</Badge></div>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm"><strong>Answer coverage:</strong> {answers.length} / {questions.length} questions answered. Unanswered questions receive 0 marks unless the teacher enters a different valid mark. {answers.length < questions.length ? "This was an incomplete submission." : "All questions have an answer."}</div>
              {answers.map((a, i) => {
                const q = selectedQuestion(a);
                return (
                  <div key={a.id} className="relative space-y-3 rounded-xl border p-4">{selectedSubmission.status === "marked" ? <Badge className="absolute right-3 top-3 gap-1 bg-emerald-600 text-white"><CheckCircle2 className="h-3.5 w-3.5" />Mark submitted</Badge> : <FloatingMark value={marks[a.id] ?? "0"} max={undefined} onChange={value=>setMarks(m=>({...m,[a.id]:value}))}/>}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">Question {q?.position != null ? q.position + 1 : i + 1}</div>
                        {q?.prompt && <div className="prose prose-sm dark:prose-invert mt-1 max-w-none break-words" dangerouslySetInnerHTML={{ __html: sanitizeRichText(q.prompt) }} />}
                      </div>
                      <Badge variant="secondary">{q?.marksAllocated ?? "—"} marks</Badge>
                    </div>

                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Learner answer · teacher annotations are saved with the returned result</div>
                      {a.drawData ? <div data-marking-surface className="relative overflow-hidden rounded-lg border bg-white"><DrawAnswer data={a.drawData} /><MediaMarkOverlay data={markingData[a.id]} onChange={d=>setMarkingData(m=>({...m,[a.id]:d}))}/><div className="pointer-events-none absolute inset-0"><FloatingTicks data={markingData[a.id]} onChange={d=>setMarkingData(m=>({...m,[a.id]:d}))}/></div></div> : a.mediaReference ? <div data-marking-surface className="relative overflow-hidden rounded-lg border bg-background"><AuthenticatedMedia url={a.mediaReference} type={mediaTypeFor(a.mediaReference)} title={`Question ${i+1} learner media`} /><MediaMarkOverlay data={markingData[a.id]} onChange={d=>setMarkingData(m=>({...m,[a.id]:d}))}/><div className="pointer-events-none absolute inset-0"><FloatingTicks data={markingData[a.id]} onChange={d=>setMarkingData(m=>({...m,[a.id]:d}))}/></div></div> : q?.type==="poll" && a.selectedValue ? <div className={`rounded-lg border p-3 font-semibold ${optionsFor(q.id).find(o=>o.value===a.selectedValue)?.isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}`}>Selected: {optionsFor(q.id).find(o=>o.value===a.selectedValue)?.label ?? a.selectedValue} {optionsFor(q.id).find(o=>o.value===a.selectedValue)?.isCorrect ? "✓ Correct" : "✕ Wrong"}</div> : (a.textAnswer || "No answer")}
                    </div>

                    <div className="grid items-start gap-3 pt-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1"><Button type="button" size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50" onClick={()=>setMarks((m)=>({...m,[a.id]:q?.marksAllocated??"0"}))} aria-label={`Mark question ${i+1} correct`}><CheckCircle2 className="h-4 w-4" /></Button><Button type="button" size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={()=>setMarks((m)=>({...m,[a.id]:"0"}))} aria-label={`Mark question ${i+1} incorrect`}><XCircle className="h-4 w-4" /></Button><Input
                          type="number"
                          min="0"
                          max={undefined}
                          step="0.01"
                          value={marks[a.id] ?? "0"}
                          onChange={(e) => { const raw=Number(e.target.value); setMarks((m) => ({ ...m, [a.id]: Number.isFinite(raw)?String(Math.max(0,raw)):"0" })); }}
                          className="w-28"
                          aria-label={`Awarded marks for question ${i + 1}`}
                        /></div>
                        <span className="text-sm text-muted-foreground">/ {q?.marksAllocated ?? "—"} • any numeric mark; server validates the allocation</span>
                      </div>
                      <Textarea
                        className="min-h-24 w-full"
                        value={notes[a.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                        placeholder="Correction / feedback"
                      />
                    </div>
                  </div>
                );
              })}

              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Final result</p><p className="mt-1 text-3xl font-black text-slate-900">{answers.reduce((sum,a)=>sum+Number(marks[a.id]??0),0).toFixed(2)} <span className="text-base font-semibold text-slate-500">/ {exercise?.totalMarks ?? "—"}</span></p></div>
                  <Badge className="bg-amber-500 text-slate-950">{exercise?.totalMarks ? ((answers.reduce((sum,a)=>sum+Number(marks[a.id]??0),0)/Number(exercise.totalMarks))*100).toFixed(1)+"%" : "—"}</Badge>
                </div>
                <Textarea className="mt-4 min-h-28 w-full bg-white" value={overallComment} onChange={e=>setOverallComment(e.target.value)} placeholder="Final teacher comment for the whole exercise — celebrate strengths, explain the main improvement point, and encourage the learner." />
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-4 w-4" /> ELIDEMS AI marking
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      AI can propose marks and feedback, including partial marking. Teacher review and confirmation are always required before return.
                    </p>
                  </div>
                  <Button onClick={runAIMarking} disabled={aiBusy || !selected || selectedSubmission.status === "marked"} variant="outline">
                    <Sparkles className="mr-2 h-4 w-4" />
                    {aiBusy ? "Checking…" : "Ask ELIDEMS AI to mark"}
                  </Button>
                </div>
                {aiMessage && (
                  <div className="mt-3 flex gap-2 rounded-lg bg-background p-3 text-sm" role="status">
                    {aiMessage.toLowerCase().includes("partially") ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
                    ) : (
                      <Sparkles className="h-4 w-4 shrink-0" />
                    )}
                    <span>{aiMessage}</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="AI marking workflow state"><Badge variant={aiState==="checking"?"default":"outline"}>Checking</Badge><Badge variant={aiState==="awaiting_teacher"?"default":"outline"}>Ready</Badge><Badge variant={aiState==="partially_marked"?"default":"outline"}>Partially marked</Badge><Badge variant={aiState==="awaiting_teacher"||aiState==="partially_marked"?"default":"outline"}>Awaiting teacher</Badge><Badge variant={selectedSubmission.status==="marked"?"default":"outline"}>Returned</Badge></div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={()=>setLearnerPreviewOpen(true)}>Preview as learner</Button>
                <Button onClick={save} disabled={!answers.length || selectedSubmission.status === "marked"}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save marks & return result
                </Button>
                {selectedSubmission.status === "marked" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Review mode
                  </span>
                )}
                {message && <span className="text-sm text-muted-foreground">{message}</span>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
