import { useEffect, useRef, useState } from "react";
import type * as ML from "maplibre-gl";

export type Pin = { id: string; lat: number; lng: number; label: string; img?: string; cls?: string; badge?: string };
type Props = {
  pins: Pin[];
  /** קו מסלול (עיר) או קשתות מנקודת היציאה (עולם) */
  lines?: [number, number][][];
  world?: boolean;
  /** המקום שבמוקד: המפה טסה אליו */
  focusId?: string | null;
  onPick?: (id: string) => void;
  fitKey: string;
  className?: string;
};

const STREET = "https://tiles.openfreemap.org/styles/liberty";
const SAT: ML.StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    sat: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Esri, Maxar, Earthstar Geographics",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] },
    names: { type: "raster", tileSize: 256, maxzoom: 19,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"] },
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }, { id: "names", type: "raster", source: "names" }],
};
const DEM: ML.RasterDEMSourceSpecification = {
  type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 13,
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], attribution: "Mapzen, AWS Terrain Tiles",
};

/** קשת בין שתי נקודות על הגלובוס, כדי שהקו ייראה כמסלול טיסה ולא כקו ישר */
function arc(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const r = Math.PI / 180, [la1, lo1, la2, lo2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (!d) return [[a[1], a[0]]];
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    return [Math.atan2(y, x) / r, Math.atan2(z, Math.sqrt(x * x + y * y)) / r] as [number, number];
  });
}

/** המפה היחידה באפליקציה: רחובות עם בניינים בתלת־ממד, לוויין עם תבליט, גלובוס לתצוגת העולם, וטיסה אל כל מקום שנלחץ. */
export default function Map3D({ pins, lines = [], world, focusId, onPick, fitKey, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const st = useRef<{ ml: typeof ML; map: ML.Map; markers: ML.Marker[] } | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const data = useRef({ pins, lines });
  data.current = { pins, lines };
  const [sat, setSat] = useState(false);
  const [flat, setFlat] = useState(false);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    let dead = false;
    (async () => {
      const [ml, worker] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"), import("maplibre-gl/dist/maplibre-gl.css")]);
      if (dead || !box.current) return;
      ml.setWorkerUrl(worker.default);
      const map = new ml.Map({
        container: box.current, style: STREET, center: world ? [22, 41] : [20, 45], zoom: world ? 3.4 : 4,
        pitch: world ? 0 : 55, maxPitch: 75, attributionControl: { compact: true },
      });
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), "bottom-left");
      st.current = { ml, map, markers: [] };
      map.on("style.load", () => {
        if (world) map.setProjection({ type: "globe" });
        if (!map.getSource("dem")) map.addSource("dem", DEM);
        map.setSky({ "sky-color": "#bcd7f5", "horizon-color": "#ffffff", "fog-color": "#ffffff", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4, "atmosphere-blend": 0.7 });
        map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": world ? 0 : 7, "line-opacity": 0.9 } });
        map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" },
          paint: world ? { "line-color": "#0a7d4f", "line-width": 1.6, "line-opacity": 0.75 } : { "line-color": "#111", "line-width": 3.2 } });
        setReady((n) => n + 1);
      });
    })();
    return () => { dead = true; st.current?.map.remove(); st.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // סוג המפה: רחובות או לוויין. התבליט מופעל בלוויין, שם הוא נראה.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    st.current?.map.setStyle(sat ? SAT : STREET);
  }, [sat]);
  useEffect(() => {
    const s = st.current;
    if (!s || !ready) return;
    s.map.setTerrain(sat && !world && !flat ? { source: "dem", exaggeration: 1.5 } : null);
  }, [sat, flat, ready, world]);

  const firstFlat = useRef(true);
  useEffect(() => {
    if (firstFlat.current) { firstFlat.current = false; return; }
    st.current?.map.easeTo({ pitch: flat ? 0 : 58, duration: 800 });
  }, [flat]);

  useEffect(() => {
    const s = st.current;
    if (!s || !ready) return;
    const src = s.map.getSource("route") as ML.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: lines.filter((l) => l.length > 1).map((l) => ({
        type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: world ? arc(l[0], l[l.length - 1]) : l.map(([la, lo]) => [lo, la]) },
      })),
    });
    s.markers.forEach((m) => m.remove());
    s.markers = pins.map((p) => {
      const el = document.createElement("button");
      el.className = `mk ${p.cls ?? ""} ${p.id === focusId ? "on" : ""}`;
      el.setAttribute("aria-label", p.label.replace(/<[^>]+>/g, ""));
      el.innerHTML = `${p.img ? `<i style="background-image:url('${p.img}')"></i>` : ""}${p.badge ? `<em>${p.badge}</em>` : ""}<span>${p.label}</span>`;
      el.addEventListener("click", (e) => { e.stopPropagation(); pick.current?.(p.id); });
      return new s.ml.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(s.map);
    });
  }, [pins, lines, focusId, ready, world]);

  useEffect(() => {
    const s = st.current, ps = data.current.pins;
    if (!s || !ready || !ps.length) return;
    // ממסגרים את מה שבמוקד (עצירות היום), לא את נקודות הרקע
    const main = ps.filter((p) => p.cls !== "dim");
    const b = new s.ml.LngLatBounds();
    (main.length ? main : ps).forEach((p) => b.extend([p.lng, p.lat]));
    const cam = s.map.cameraForBounds(b, { padding: world ? 80 : { top: 110, bottom: 190, left: 90, right: 90 }, maxZoom: world ? 4.6 : 16 });
    if (!cam) return;
    s.map.flyTo({ ...cam, zoom: Math.min(cam.zoom ?? 14, world ? 4.6 : 16) - (world || flat ? 0 : 0.35), pitch: world || flat ? 0 : 58, bearing: world ? 0 : -14, duration: 1600, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  useEffect(() => {
    const s = st.current, p = data.current.pins.find((x) => x.id === focusId);
    if (!s || !ready || !p) return;
    s.map.flyTo(world
      ? { center: [p.lng, p.lat], zoom: 5.2, duration: 1600 }
      : { center: [p.lng, p.lat], zoom: 16.4, pitch: flat ? 0 : 62, bearing: s.map.getBearing() + 28, duration: 2000, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, ready]);

  return (
    <div className={`map3d ${className ?? ""}`}>
      <div ref={box} className="map3d-box" />
      <div className="map3d-toggle">
        <div role="group" aria-label="סוג מפה">
          <button className="chip press" aria-pressed={!sat} onClick={() => setSat(false)}>מפה</button>
          <button className="chip press" aria-pressed={sat} onClick={() => setSat(true)}>לוויין</button>
        </div>
        {!world && (
          <div role="group" aria-label="זווית">
            <button className="chip press" aria-pressed={!flat} onClick={() => setFlat(false)}>תלת־ממד</button>
            <button className="chip press" aria-pressed={flat} onClick={() => setFlat(true)}>מלמעלה</button>
          </div>
        )}
      </div>
    </div>
  );
}
