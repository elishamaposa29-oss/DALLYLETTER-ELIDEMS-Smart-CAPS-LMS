import Svg, { Path } from "react-native-svg";
import { useMemo, useRef, useState } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Segment = { x: number; y: number; px: number; py: number; color?: string; width?: number; tool?: string; strokeId?: string };
type Drawing = Record<string, any> & { strokes?: Segment[]; teacherDrawing?: { strokes?: Segment[] } };
const PALETTE = ["#111827", "#dc2626", "#2563eb", "#15803d", "#9333ea", "#d97706"];

export default function MobileDrawAnswer({ value, onChange, disabled = false }: { value?: Drawing; onChange: (value: Drawing) => void; disabled?: boolean }) {
  const colors = useColors();
  const valueRef = useRef<Drawing>(value ?? {});
  const onChangeRef = useRef(onChange);
  const pending = useRef<Segment[]>([]);
  const [liveSegments, setLiveSegments] = useState<Segment[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(320);
  const [penColor, setPenColor] = useState("#111827");
  const [penWidth, setPenWidth] = useState(3);
  const [eraser, setEraser] = useState(false);
  valueRef.current = value ?? {};
  onChangeRef.current = onChange;

  const point = (event: any) => ({
    x: Math.max(0, Math.min(320, event.nativeEvent.locationX * 320 / Math.max(1, canvasWidth))),
    y: Math.max(0, Math.min(220, event.nativeEvent.locationY * 220 / 220)),
  });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: event => {
      const { x, y } = point(event);
      const strokeId = String(Date.now());
      pending.current = [{ x, y, px: x, py: y, color: eraser ? "#ffffff" : penColor, width: eraser ? 18 : penWidth, tool: eraser ? "eraser" : "pen", strokeId }];
      setLiveSegments([...pending.current]);
    },
    onPanResponderMove: event => {
      const { x, y } = point(event);
      const previous = pending.current[pending.current.length - 1];
      if (!previous) return;
      pending.current = [...pending.current, { x, y, px: previous.x, py: previous.y, color: previous.color, width: previous.width, tool: previous.tool, strokeId: previous.strokeId }];
      setLiveSegments([...pending.current]);
    },
    onPanResponderRelease: () => {
      if (pending.current.length) {
        const next = [...(valueRef.current.strokes ?? []), ...pending.current];
        onChangeRef.current({ ...valueRef.current, strokes: next });
      }
      pending.current = [];
      setLiveSegments([]);
    },
    onPanResponderTerminate: () => { pending.current = []; setLiveSegments([]); },
  }), [disabled, canvasWidth, penColor, penWidth, eraser]);

  const teacherSegments = value?.teacherDrawing?.strokes ?? [];
  const savedSegments = value?.strokes ?? [];
  const pathFor = (segment: Segment) => `M ${segment.px} ${segment.py} L ${segment.x} ${segment.y}`;
  const undo = () => {
    if (disabled || !savedSegments.length) return;
    const lastId = savedSegments[savedSegments.length - 1].strokeId;
    const next = lastId ? savedSegments.filter(segment => segment.strokeId !== lastId) : savedSegments.slice(0, -1);
    onChange({ ...(value ?? {}), strokes: next });
  };

  return <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" }}>
    <View style={{ padding: 10, backgroundColor: "#f8fafc" }}><Text style={{ color: "#334155", fontSize: 12, fontWeight: "600" }}>Drawing answer · Finger or stylus</Text></View>
    {!disabled && <View style={{ paddingHorizontal: 10, paddingTop: 10, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        {PALETTE.map(color => <TouchableOpacity key={color} accessibilityRole="button" accessibilityLabel={`Pen color ${color}`} onPress={() => { setPenColor(color); setEraser(false); }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, borderWidth: penColor === color && !eraser ? 3 : 1, borderColor: penColor === color && !eraser ? "#0f172a" : "#cbd5e1" }} />)}
        <TouchableOpacity onPress={() => setEraser(v => !v)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: eraser ? "#fee2e2" : "#e2e8f0", borderWidth: eraser ? 1 : 0, borderColor: "#dc2626" }}><Text style={{ color: "#334155", fontSize: 12 }}>{eraser ? "Eraser on" : "Eraser"}</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Text style={{ color: "#64748b", fontSize: 12 }}>Pen size</Text>
        {[2, 4, 7].map(width => <TouchableOpacity key={width} onPress={() => { setPenWidth(width); setEraser(false); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: penWidth === width && !eraser ? colors.primary : "#e2e8f0" }}><Text style={{ color: penWidth === width && !eraser ? "#fff" : "#334155", fontSize: 12 }}>{width}px</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={undo} disabled={!savedSegments.length} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: "#e2e8f0", opacity: savedSegments.length ? 1 : 0.5 }}><Text style={{ color: "#334155", fontSize: 12 }}>Undo stroke</Text></TouchableOpacity>
      </View>
    </View>}
    <View style={{ height: 220 }} onLayout={event => setCanvasWidth(Math.max(1,event.nativeEvent.layout.width))} {...responder.panHandlers}>
      <Svg width="100%" height="220" viewBox="0 0 320 220">
        {teacherSegments.map((segment, index) => <Path key={`t${index}`} d={pathFor(segment)} stroke={segment.color || "#64748b"} strokeWidth={segment.width || 2} strokeLinecap="round" fill="none" opacity={0.65} />)}
        {savedSegments.map((segment, index) => <Path key={`s${index}`} d={pathFor(segment)} stroke={segment.color || "#111827"} strokeWidth={segment.width || 3} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
        {liveSegments.map((segment, index) => <Path key={`l${index}`} d={pathFor(segment)} stroke={segment.color || "#111827"} strokeWidth={segment.width || 3} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
      </Svg>
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", gap: 8 }}>
      <Text style={{ color: "#64748b", fontSize: 11, flex: 1 }}>{savedSegments.length ? `${savedSegments.length} stroke segments saved` : "No drawing yet"}</Text>
      <TouchableOpacity disabled={disabled || savedSegments.length === 0} onPress={() => onChange({ ...(value ?? {}), strokes: [], paintStrokes: [], pointers: [], labels: [] })} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: "#e2e8f0", opacity: disabled || savedSegments.length === 0 ? 0.5 : 1 }}>
        <Text style={{ color: "#334155", fontSize: 12, fontWeight: "600" }}>Clear drawing</Text>
      </TouchableOpacity>
    </View>
  </View>;
}
