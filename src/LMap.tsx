import { useEffect, useRef, useState } from "react";
import type * as LT from "leaflet";

export type Pin = { lat: number; lng: number; label: string; cls?: string; title?: string; onClick?: () => void };
type Props = { pins: Pin[]; lines?: [number, number][][]; dashed?: boolean; fitKey: string; className?: string };

const STREET = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

/** מפה אחת לכל האפליקציה: רחובות או לוויין, סיכות עם תווית, וקו מסלול. Leaflet נטען רק כשצריך. */
export default function LMap({ pins, lines = [], dashed, fitKey, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const st = useRef<{ L: typeof LT; map: LT.Map; base: LT.LayerGroup; over: LT.LayerGroup } | null>(null);
  const [sat, setSat] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const [{ default: L }] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
      if (dead || !box.current) return;
      const map = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([42, 20], 4);
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      st.current = { L, map, base: L.layerGroup().addTo(map), over: L.layerGroup().addTo(map) };
      setReady(true);
    })();
    return () => { dead = true; st.current?.map.remove(); st.current = null; };
  }, []);

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.base.clearLayers();
    if (sat) {
      s.L.tileLayer(SAT, { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" }).addTo(s.base);
      s.L.tileLayer(SAT_LABELS, { maxZoom: 19 }).addTo(s.base);
    } else {
      s.L.tileLayer(STREET, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(s.base);
    }
  }, [sat, ready]);

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.over.clearLayers();
    for (const line of lines) {
      s.L.polyline(line, { color: sat ? "#fff" : "#111", weight: dashed ? 1 : 2.5, opacity: dashed ? 0.45 : 0.9, dashArray: dashed ? "4 6" : undefined }).addTo(s.over);
    }
    for (const p of pins) {
      const m = s.L.marker([p.lat, p.lng], {
        title: p.title,
        icon: s.L.divIcon({ className: "", html: `<span class="pin ${p.cls ?? ""}">${p.label}</span>`, iconSize: [0, 0] }),
      }).addTo(s.over);
      if (p.onClick) m.on("click", p.onClick);
    }
  }, [pins, lines, dashed, sat, ready]);

  useEffect(() => {
    const s = st.current;
    if (!s || !pins.length) return;
    s.map.invalidateSize();
    s.map.fitBounds(s.L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])).pad(0.35), { maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  return (
    <div className={`lmap ${className ?? ""}`}>
      <div ref={box} className="lmap-box" />
      <div className="lmap-toggle" role="group" aria-label="סוג מפה">
        <button className="chip press" aria-pressed={!sat} onClick={() => setSat(false)}>מפה</button>
        <button className="chip press" aria-pressed={sat} onClick={() => setSat(true)}>לוויין</button>
      </div>
    </div>
  );
}
