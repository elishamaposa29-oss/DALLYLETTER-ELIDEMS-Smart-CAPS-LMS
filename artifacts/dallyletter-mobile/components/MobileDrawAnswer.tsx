import Svg, { Path } from "react-native-svg";
import { useMemo, useRef, useState } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type Segment = { x: number; y: number; px: number; py: number; color?: string; width?: number };
type Drawing = Record<string, any> & { strokes?: Segment[]; teacherDrawing?: { strokes?: Segment[] } };

export default function MobileDrawAnswer({ value, onChange, disabled = false }: { value?: Drawing; onChange: (value: Drawing) => void; disabled?: boolean }) {
  const colors = useColors();
  const valueRef = useRef<Drawing>(value ?? {});
  const onChangeRef = useRef(onChange);
  const pending = useRef<Segment[]>([]);
  const [liveSegments, setLiveSegments] = useState<Segment[]>([]);
  valueRef.current = value ?? {};
  onChangeRef.current = onChange;

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: event => {
      const { locationX: x, locationY: y } = event.nativeEvent;
      pending.current = [{ x, y, px: x, py: y, color: "#111827", width: 3 }];
      setLiveSegments([...pending.current]);
    },
    onPanResponderMove: event => {
      const { locationX: x, locationY: y } = event.nativeEvent;
      const previous = pending.current[pending.current.length - 1];
      if (!previous) return;
      pending.current = [...pending.current, { x, y, px: previous.x, py: previous.y, color: "#111827", width: 3 }];
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
  }), [disabled]);

  const teacherSegments = value?.teacherDrawing?.strokes ?? [];
  const savedSegments = value?.strokes ?? [];
  const pathFor = (segment: Segment) => `M ${segment.px} ${segment.py} L ${segment.x} ${segment.y}`;

  return <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" }}>
    <View style={{ padding: 10, backgroundColor: "#f8fafc" }}><Text style={{ color: "#334155", fontSize: 12, fontWeight: "600" }}>Drawing answer · Use your finger to draw</Text></View>
    <View style={{ height: 220 }} {...responder.panHandlers}>
      <Svg width="100%" height="220" viewBox="0 0 320 220">
        {teacherSegments.map((segment, index) => <Path key={`t${index}`} d={pathFor(segment)} stroke={segment.color || "#64748b"} strokeWidth={segment.width || 2} strokeLinecap="round" fill="none" opacity={0.65} />)}
        {savedSegments.map((segment, index) => <Path key={`s${index}`} d={pathFor(segment)} stroke={segment.color || "#111827"} strokeWidth={segment.width || 3} strokeLinecap="round" fill="none" />)}
        {liveSegments.map((segment, index) => <Path key={`l${index}`} d={pathFor(segment)} stroke={segment.color || "#111827"} strokeWidth={segment.width || 3} strokeLinecap="round" fill="none" />)}
      </Svg>
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0" }}>
      <Text style={{ color: "#64748b", fontSize: 11 }}>{savedSegments.length ? `${savedSegments.length} stroke segments saved` : "No drawing yet"}</Text>
      <TouchableOpacity disabled={disabled || savedSegments.length === 0} onPress={() => onChange({ ...(value ?? {}), strokes: [], paintStrokes: [], pointers: [], labels: [] })} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: "#e2e8f0", opacity: disabled || savedSegments.length === 0 ? 0.5 : 1 }}>
        <Text style={{ color: "#334155", fontSize: 12, fontWeight: "600" }}>Clear drawing</Text>
      </TouchableOpacity>
    </View>
  </View>;
}
