// pages/index.js
import { useEffect, useRef, useState } from "react";
import ioClient from "socket.io-client";

let socket;

export default function Home() {
  const canvasRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const pointsRef = useRef([]); // recent pings
  const sweepAngleRef = useRef(0);

  // Config
  const maxRangeMeters = 100; // radius of radar in meters (adjust)
  const keepSeconds = 8; // show pings for this many seconds

  useEffect(() => {
    // ensure the socket server is initialized on the server side
    fetch("/api/socket").finally(() => {
      // connect socket client
      socket = ioClient();

      socket.on("connect", () => {
        setConnected(true);
        console.log("connected to socket", socket.id);
      });

      socket.on("disconnect", () => {
        setConnected(false);
      });

      socket.on("coords", (payload) => {
        // payload should contain deviceId and either x/y or range/angle or lat/lon
        // We'll accept x/y relative values (meters). If lat/lon given, you'd convert externally.
        addPoint(payload);
      });
    });

    const anim = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(anim);
      if (socket) socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addPoint(payload) {
    const now = Date.now();
    let px = null;
    let py = null;

    // Accept x,y in meters
    if (typeof payload.x === "number" && typeof payload.y === "number") {
      px = payload.x;
      py = payload.y;
    } else if (typeof payload.range === "number" && typeof payload.angle === "number") {
      // convert polar to cartesian (angle in degrees)
      const r = payload.range;
      const a = (payload.angle * Math.PI) / 180;
      px = r * Math.cos(a);
      py = r * Math.sin(a);
    } else if (typeof payload.lat === "number" && typeof payload.lon === "number") {
      // If lat/lon provided, we default to interpreting them as already projected or as same point.
      // For real GPS you should project lat/lon to a local coordinate system (e.g. use a reference lat/lon).
      // Here we simply store them in a separate field and ignore for drawing.
      px = null;
      py = null;
    }

    pointsRef.current.push({
      deviceId: payload.deviceId,
      x: px,
      y: py,
      raw: payload,
      t: payload.ts || payload.receivedAt || now,
      receivedAt: now,
    });

    // cleanup
    const cutoff = Date.now() - keepSeconds * 1000;
    pointsRef.current = pointsRef.current.filter((p) => p.receivedAt >= cutoff);
  }

  // convert meters -> canvas coordinates
  function worldToCanvas(ctx, x, y) {
    const canvas = ctx.canvas;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    // scale: maxRangeMeters -> radius (min(canvas.width, canvas.height)/2 * 0.9)
    const r = Math.min(canvas.width, canvas.height) * 0.45;
    const s = r / maxRangeMeters;
    // assuming x is east+, y is north+; canvas y is down, so invert y
    return [cx + x * s, cy - y * s];
  }

  function drawRadar(ctx) {
    const c = ctx.canvas;
    ctx.clearRect(0, 0, c.width, c.height);

    const cx = c.width / 2;
    const cy = c.height / 2;
    const radius = Math.min(c.width, c.height) * 0.45;

    // background
    ctx.fillStyle = "#071126";
    ctx.fillRect(0, 0, c.width, c.height);

    // concentric circles
    ctx.strokeStyle = "rgba(100,200,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // cross lines
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // draw sweep gradient
    const sweepAngle = sweepAngleRef.current;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    // paint a subtle black overlay first (not necessary)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-Math.PI / 2)); // rotate so 0deg = East; adjust if you prefer North = 0
    ctx.rotate(sweepAngle);
    ctx.globalCompositeOperation = "lighter";

    // sweep as wedge
    const wedge = Math.PI / 9; // sweep width
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, -wedge / 2, wedge / 2);
    ctx.closePath();

    // fill gradient for sweep
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, "rgba(120,220,255,0.25)");
    g.addColorStop(1, "rgba(120,220,255,0.03)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    // draw center dot
    ctx.fillStyle = "#8ff";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // draw pings
    const pts = pointsRef.current;
    for (const p of pts) {
      if (typeof p.x !== "number" || typeof p.y !== "number") continue; // skip if not projected

      const [px, py] = worldToCanvas(ctx, p.x, p.y);
      // fade by age
      const age = (Date.now() - p.receivedAt) / (keepSeconds * 1000);
      const alpha = Math.max(0, 1 - age);

      ctx.beginPath();
      ctx.fillStyle = `rgba(0, 255, 180, ${0.7 * alpha})`;
      ctx.arc(px, py, 6 * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
      ctx.fill();

      // ripple
      ctx.beginPath();
      ctx.strokeStyle = `rgba(0,200,170, ${0.3 * alpha})`;
      ctx.lineWidth = 2;
      ctx.arc(px, py, 10 + 30 * (1 - alpha), 0, Math.PI * 2);
      ctx.stroke();
    }

    // legendary small HUD text
    ctx.fillStyle = "#99d";
    ctx.font = "12px monospace";
    ctx.fillText(`Range: 0 — ${maxRangeMeters} m`, 10, c.height - 10);
  }

  function loop() {
    // animate sweep and draw
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      // sizing for crisp canvas
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // update sweep angle
      sweepAngleRef.current += 0.01; // speed
      if (sweepAngleRef.current > Math.PI * 2) sweepAngleRef.current -= Math.PI * 2;

      drawRadar(ctx);
    }

    requestAnimationFrame(loop);
  }

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: 8, background: "#001022", color: "#9fe", display: "flex", gap: 12 }}>
        <div>Next.js Radar</div>
        <div style={{ color: connected ? "#8f8" : "#f88" }}>
          Socket: {connected ? "connected" : "disconnected"}
        </div>
        <div>Max range: {maxRangeMeters} m</div>
      </header>

      <main style={{ flex: 1, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", background: "#071126" }}
        />
      </main>

      <footer style={{ padding: 8, background: "#001022", color: "#9fe" }}>
        Send coordinates as POST /api/coords — example in README below
      </footer>
    </div>
  );
}
