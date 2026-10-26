import Svg, { Path, Text as SvgText } from "react-native-svg";
import { useMemo, useRef, useState } from "react";
import { PanResponder, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Segment = { x: number; y: number; px: number; py: number; color?: string; width?: number; opacity?: number; tool?: string; strokeId?: string };
type PointerMark = { id: string; x: number; y: number; length: number; angle: number; color?: string; opacity?: number; thickness?: number };
type LabelMark = { id: string; text: string; x: number; y: number; color?: string; opacity?: number; fontSize?: number };
type Drawing = Record<string, any> & { strokes?: Segment[]; paintStrokes?: Segment[]; pointers?: PointerMark[]; labels?: LabelMark[]; teacherDrawing?: { strokes?: Segment[]; paintStrokes?: Segment[]; pointers?: PointerMark[]; labels?: LabelMark[] } };
type Tool = "pen" | "paint" | "eraser" | "pointer" | "text" | "select";
const PALETTE = ["#111827", "#dc2626", "#2563eb", "#15803d", "#9333ea", "#d97706"];
const cloneDrawing = (drawing: Drawing): Drawing => ({ ...drawing, strokes: [...(drawing.strokes ?? [])], paintStrokes: [...(drawing.paintStrokes ?? [])], pointers: [...(drawing.pointers ?? [])], labels: [...(drawing.labels ?? [])] });

export default function MobileDrawAnswer({ value, onChange, disabled = false }: { value?: Drawing; onChange: (value: Drawing) => void; disabled?: boolean }) {
  const colors = useColors();
  const valueRef = useRef<Drawing>(value ?? {});
  const onChangeRef = useRef(onChange);
  const pending = useRef<Segment[]>([]);
  const undoStack = useRef<Drawing[]>([]);
  const redoStack = useRef<Drawing[]>([]);
  const pointerStart = useRef<{ x: number; y: number; id: string } | null>(null);
  const [liveSegments, setLiveSegments] = useState<Segment[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(320);
  const [penColor, setPenColor] = useState("#111827");
  const [penWidth, setPenWidth] = useState(3);
  const [penOpacity, setPenOpacity] = useState(1);
  const [magnify, setMagnify] = useState(1);
  const [eraseTarget, setEraseTarget] = useState<"pen" | "paint" | "both">("both");
  const [tool, setTool] = useState<Tool>("pen");
  const [labelText, setLabelText] = useState("");
  valueRef.current = value ?? {};
  onChangeRef.current = onChange;

  const remember = () => {
    undoStack.current.push(cloneDrawing(valueRef.current));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  };
  const viewWidth = 320 / magnify;
  const viewHeight = 220 / magnify;
  const viewX = (320 - viewWidth) / 2;
  const viewY = (220 - viewHeight) / 2;
  const point = (event: any) => ({
    x: Math.max(viewX, Math.min(viewX + viewWidth, viewX + event.nativeEvent.locationX * viewWidth / Math.max(1, canvasWidth))),
    y: Math.max(viewY, Math.min(viewY + viewHeight, viewY + event.nativeEvent.locationY * viewHeight / 220)),
  });
  const distance = (p: {x:number;y:number}, segment: Segment) => {
    const dx=segment.x-segment.px, dy=segment.y-segment.py, len=dx*dx+dy*dy;
    const t=len===0?0:Math.max(0,Math.min(1,((p.x-segment.px)*dx+(p.y-segment.py)*dy)/len));
    return Math.hypot(p.x-(segment.px+t*dx),p.y-(segment.py+t*dy));
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled && tool !== "select",
    onMoveShouldSetPanResponder: () => !disabled && tool !== "select",
    onPanResponderGrant: event => {
      const { x, y } = point(event);
      if (tool === "select") return;
      if (tool === "text") {
        if (!labelText.trim()) return;
        remember();
        const current = valueRef.current;
        onChangeRef.current({ ...current, labels: [...(current.labels ?? []), { id: String(Date.now()), text: labelText.trim(), x, y, color: penColor, opacity: penOpacity, fontSize: Math.max(12, penWidth * 5) }] });
        return;
      }
      if (tool === "pointer") {
        remember();
        const id = String(Date.now());
        pointerStart.current = { x, y, id };
        const current = valueRef.current;
        onChangeRef.current({ ...current, pointers: [...(current.pointers ?? []), { id, x, y, length: 0, angle: 0, color: penColor, opacity: penOpacity, thickness: penWidth }] });
        return;
      }
      remember();
      const strokeId = String(Date.now());
      const strokeTool = tool;
      pending.current = [{ x, y, px: x, py: y, color: penColor, width: strokeTool === "eraser" ? 18 : strokeTool === "paint" ? Math.max(penWidth * 2, penWidth + 8) : penWidth, opacity: strokeTool === "eraser" ? 1 : strokeTool === "paint" ? Math.min(penOpacity, 0.45) : penOpacity, tool: strokeTool, strokeId }];
      setLiveSegments([...pending.current]);
    },
    onPanResponderMove: event => {
      const { x, y } = point(event);
      if (pointerStart.current) {
        const start = pointerStart.current;
        const current = valueRef.current;
        const pointers = (current.pointers ?? []).map(item => item.id === start.id ? { ...item, length: Math.max(1, Math.hypot(x - start.x, y - start.y)), angle: Math.atan2(y - start.y, x - start.x) } : item);
        onChangeRef.current({ ...current, pointers });
        return;
      }
      const previous = pending.current[pending.current.length - 1];
      if (!previous) return;
      pending.current = [...pending.current, { x, y, px: previous.x, py: previous.y, color: previous.color, width: previous.width, opacity: previous.opacity, tool: previous.tool, strokeId: previous.strokeId }];
      setLiveSegments([...pending.current]);
    },
    onPanResponderRelease: () => {
      if (pointerStart.current) {
        pointerStart.current = null;
        return;
      }
      if (pending.current.length) {
        const current = valueRef.current;
        if (tool === "eraser") {
          const radius = Math.max(10, penWidth * 3);
          const near = (segment: Segment) => pending.current.some(p => distance(p, segment) <= radius);
          const strokes = (current.strokes ?? []).filter(segment => {
            const isPaint = segment.tool === "paint";
            const shouldErase = eraseTarget === "both" || (eraseTarget === "paint" && isPaint) || (eraseTarget === "pen" && !isPaint);
            return !shouldErase || !near(segment);
          });
          const paintStrokes = eraseTarget === "pen" ? (current.paintStrokes ?? []) : (current.paintStrokes ?? []).filter((segment: Segment) => !near(segment));
          onChangeRef.current({ ...current, strokes, paintStrokes });
        } else if (tool === "paint") {
          const paintStrokes = [...(current.paintStrokes ?? []), ...pending.current];
          onChangeRef.current({ ...current, paintStrokes });
        } else {
          const next = [...(current.strokes ?? []), ...pending.current];
          onChangeRef.current({ ...current, strokes: next });
        }
      }
      pending.current = [];
      setLiveSegments([]);
    },
    onPanResponderTerminate: () => { pending.current = []; pointerStart.current = null; setLiveSegments([]); },
  }), [disabled, canvasWidth, penColor, penWidth, penOpacity, tool, labelText, magnify, eraseTarget]);

  const teacherAllSegments = value?.teacherDrawing?.strokes ?? [];
  const teacherSegments = teacherAllSegments.filter(segment => segment.tool !== "paint");
  const teacherPaintSegments = [...(value?.teacherDrawing?.paintStrokes ?? []), ...teacherAllSegments.filter(segment => segment.tool === "paint")];
  const savedAllSegments = value?.strokes ?? [];
  const savedSegments = savedAllSegments.filter(segment => segment.tool !== "paint");
  const savedPaintSegments = [...(value?.paintStrokes ?? []), ...savedAllSegments.filter(segment => segment.tool === "paint")];
  const savedPointers = value?.pointers ?? [];
  const savedLabels = value?.labels ?? [];
  const pathFor = (segment: Segment) => `M ${segment.px} ${segment.py} L ${segment.x} ${segment.y}`;
  const pointerPath = (item: PointerMark) => {
    const x=Number(item.x), y=Number(item.y), length=Number(item.length||45), angle=Number(item.angle||0);
    const ex=x+Math.cos(angle)*length, ey=y+Math.sin(angle)*length, head=10;
    return `M ${x} ${y} L ${ex} ${ey} M ${ex} ${ey} L ${ex-Math.cos(angle-0.55)*head} ${ey-Math.sin(angle-0.55)*head} M ${ex} ${ey} L ${ex-Math.cos(angle+0.55)*head} ${ey-Math.sin(angle+0.55)*head}`;
  };
  const undo = () => {
    if (disabled || !undoStack.current.length) return;
    redoStack.current.push(cloneDrawing(valueRef.current));
    const previous = undoStack.current.pop()!;
    onChange(previous);
  };
  const redo = () => {
    if (disabled || !redoStack.current.length) return;
    undoStack.current.push(cloneDrawing(valueRef.current));
    const next = redoStack.current.pop()!;
    onChange(next);
  };
  const clearDrawing = () => {
    if (disabled || (!savedSegments.length && !savedPaintSegments.length && !savedPointers.length && !savedLabels.length)) return;
    remember();
    onChange({ ...(value ?? {}), strokes: [], paintStrokes: [], pointers: [], labels: [] });
  };
  const chooseTool = (next: Tool) => setTool(next);

  return <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" }}>
    <View style={{ padding: 10, backgroundColor: "#f8fafc" }}><Text style={{ color: "#334155", fontSize: 12, fontWeight: "600" }}>Drawing answer · Finger or stylus</Text></View>
    {!disabled && <View style={{ paddingHorizontal: 10, paddingTop: 10, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        {PALETTE.map(color => <TouchableOpacity key={color} accessibilityRole="button" accessibilityLabel={`Pen color ${color}`} onPress={() => setPenColor(color)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, borderWidth: penColor === color ? 3 : 1, borderColor: penColor === color ? "#0f172a" : "#cbd5e1" }} />)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        {([{id:"pen",label:"Pen"},{id:"paint",label:"Paint"},{id:"eraser",label:"Eraser"},{id:"pointer",label:"Arrow"},{id:"text",label:"Text"},{id:"select",label:"Stop tool"}] as {id:Tool;label:string}[]).map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={item.label+" drawing tool"} onPress={() => chooseTool(item.id)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: tool === item.id ? colors.primary : "#e2e8f0" }}><Text style={{ color: tool === item.id ? "#fff" : "#334155", fontSize: 12 }}>{item.label}</Text></TouchableOpacity>)}
      </View>
      {tool === "eraser" && <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}><Text style={{ color: "#64748b", fontSize: 12 }}>Erase</Text>{([{value:"both",label:"Both"},{value:"pen",label:"Pen only"},{value:"paint",label:"Paint only"}] as const).map(item => <TouchableOpacity key={item.value} onPress={() => setEraseTarget(item.value)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: eraseTarget === item.value ? colors.primary : "#e2e8f0" }}><Text style={{ color: eraseTarget === item.value ? "#fff" : "#334155", fontSize: 12 }}>{item.label}</Text></TouchableOpacity>)}</View>}
      {tool === "text" && <TextInput accessibilityLabel="Drawing text label" value={labelText} onChangeText={setLabelText} placeholder="Enter label, then tap the drawing" placeholderTextColor="#64748b" style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 8, color: "#111827" }} />}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Text style={{ color: "#64748b", fontSize: 12 }}>Size</Text>
        {[2, 4, 7].map(width => <TouchableOpacity key={width} onPress={() => setPenWidth(width)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: penWidth === width ? colors.primary : "#e2e8f0" }}><Text style={{ color: penWidth === width ? "#fff" : "#334155", fontSize: 12 }}>{width}px</Text></TouchableOpacity>)}
        <Text style={{ color: "#64748b", fontSize: 12 }}>Opacity</Text>
        {([{value:0.5,label:"50%"},{value:0.75,label:"75%"},{value:1,label:"100%"}]).map(item => <TouchableOpacity key={item.value} onPress={() => setPenOpacity(item.value)} style={{ paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8, backgroundColor: penOpacity === item.value ? colors.primary : "#e2e8f0" }}><Text style={{ color: penOpacity === item.value ? "#fff" : "#334155", fontSize: 12 }}>{item.label}</Text></TouchableOpacity>)}
        <Text style={{ color: "#64748b", fontSize: 12 }}>Zoom</Text>{([{value:1,label:"1×"},{value:1.5,label:"1.5×"},{value:2,label:"2×"}]).map(item => <TouchableOpacity key={item.value} onPress={() => setMagnify(item.value)} style={{ paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8, backgroundColor: magnify === item.value ? colors.primary : "#e2e8f0" }}><Text style={{ color: magnify === item.value ? "#fff" : "#334155", fontSize: 12 }}>{item.label}</Text></TouchableOpacity>)}
        <TouchableOpacity accessibilityRole="button" onPress={undo} disabled={!undoStack.current.length} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: "#e2e8f0", opacity: undoStack.current.length ? 1 : 0.5 }}><Text style={{ color: "#334155", fontSize: 12 }}>Undo</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={redo} disabled={!redoStack.current.length} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: "#e2e8f0", opacity: redoStack.current.length ? 1 : 0.5 }}><Text style={{ color: "#334155", fontSize: 12 }}>Redo</Text></TouchableOpacity>
      </View>
    </View>}
    <View style={{ height: 220 }} onLayout={event => setCanvasWidth(Math.max(1,event.nativeEvent.layout.width))} {...responder.panHandlers}>
      <Svg width="100%" height="220" viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}>
        {teacherPaintSegments.map((segment, index) => <Path key={`tpnt${index}`} d={pathFor(segment)} stroke={segment.color || "#d97706"} strokeWidth={segment.width || 10} strokeLinecap="round" opacity={segment.opacity ?? 0.4} fill="none" />)}
        {teacherSegments.map((segment, index) => <Path key={`t${index}`} d={pathFor(segment)} stroke={segment.color || "#64748b"} strokeWidth={segment.width || 2} strokeLinecap="round" fill="none" opacity={0.65} />)}
        {(value?.teacherDrawing?.pointers ?? []).map((item, index) => <Path key={`tp${index}`} d={pointerPath(item)} stroke={item.color || "#64748b"} strokeWidth={item.thickness || 2} opacity={0.65} fill="none" />)}
        {(value?.teacherDrawing?.labels ?? []).map((item, index) => <SvgText key={`tl${index}`} x={item.x} y={item.y} fill={item.color || "#64748b"} opacity={0.65} fontSize={item.fontSize || 14}>{item.text}</SvgText>)}
        {savedPaintSegments.map((segment, index) => <Path key={`pnt${index}`} d={pathFor(segment)} stroke={segment.color || "#d97706"} strokeWidth={segment.width || 10} strokeLinecap="round" strokeLinejoin="round" opacity={segment.opacity ?? 0.4} fill="none" />)}
        {savedSegments.map((segment, index) => <Path key={`s${index}`} d={pathFor(segment)} stroke={segment.color || "#111827"} strokeWidth={segment.width || 3} strokeLinecap="round" strokeLinejoin="round" opacity={segment.opacity ?? 1} fill="none" />)}
        {savedPointers.map(item => <Path key={item.id} d={pointerPath(item)} stroke={item.color || "#111827"} strokeWidth={item.thickness || 3} opacity={item.opacity ?? 1} fill="none" />)}
        {savedLabels.map(item => <SvgText key={item.id} x={item.x} y={item.y} fill={item.color || "#111827"} opacity={item.opacity ?? 1} fontSize={item.fontSize || 16}>{item.text}</SvgText>)}
        {liveSegments.map((segment, index) => <Path key={`l${index}`} d={pathFor(segment)} stroke={segment.color || "#111827"} strokeWidth={segment.width || 3} strokeLinecap="round" strokeLinejoin="round" opacity={segment.opacity ?? 1} fill="none" />)}
      </Svg>
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", gap: 8 }}>
      <Text style={{ color: "#64748b", fontSize: 11, flex: 1 }}>{savedSegments.length + savedPaintSegments.length ? `${savedSegments.length + savedPaintSegments.length} stroke segments saved` : savedPointers.length || savedLabels.length ? `${savedPointers.length} arrows · ${savedLabels.length} labels` : "No drawing yet"}</Text>
      <TouchableOpacity disabled={disabled || (!savedSegments.length && !savedPaintSegments.length && !savedPointers.length && !savedLabels.length)} onPress={clearDrawing} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: "#e2e8f0", opacity: disabled || (!savedSegments.length && !savedPaintSegments.length && !savedPointers.length && !savedLabels.length) ? 0.5 : 1 }}>
        <Text style={{ color: "#334155", fontSize: 12, fontWeight: "600" }}>Clear drawing</Text>
      </TouchableOpacity>
    </View>
  </View>;
}
