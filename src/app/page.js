"use client";

import { useEffect, useRef, useState } from "react";
import * as Ably from "ably";

function latLonDeltaToMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const latAvg = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const x = dLon * Math.cos(latAvg) * R;
  const y = dLat * R;
  return { x, y };
}

export default function Page() {
  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState("viewer");
  const [positions, setPositions] = useState({});
  const [connStatus, setConnStatus] = useState("disconnected"); // NEW
  const [joined, setJoined] = useState(false);

  const ablyRef = useRef(null);
  const channelRef = useRef(null);
  const canvasRef = useRef(null);
  const sweepRef = useRef(0);

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: "/api/ably-token" });

    client.connection.on("connecting", () => setConnStatus("connecting"));
    client.connection.on("connected", () => setConnStatus("connected"));
    client.connection.on("disconnected", () => setConnStatus("disconnected"));
    client.connection.on("failed", () => setConnStatus("failed"));

    ablyRef.current = client;
    return () => client.close();
  }, []);

  function joinRoom() {
    if (!roomId) return alert("Enter a room id");
    const channel = ablyRef.current.channels.get(`room:${roomId}`);
    channelRef.current = channel;
    setJoined(true);

    channel.subscribe("pos", (msg) => {
      setPositions((prev) => ({ ...prev, [msg.clientId]: msg.data }));
    });

    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          channel.publish("pos", {
            role,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
        },
        (err) => console.warn("geolocation error", err),
        { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 }
      );
    }

    requestAnimationFrame(loop);
  }

  function loop() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRadar(ctx);
    }
    requestAnimationFrame(loop);
  }

  function drawRadar(ctx) {
    const c = ctx.canvas;
    const cx = c.width / 2;
    const cy = c.height / 2;
    const radius = Math.min(c.width, c.height) * 0.42;

    ctx.fillStyle = "#071126";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.strokeStyle = "rgba(100,200,255,0.12)";
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    sweepRef.current += 0.01;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweepRef.current);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, -Math.PI / 18, Math.PI / 18);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, "rgba(120,220,255,0.25)");
    g.addColorStop(1, "rgba(120,220,255,0.03)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    const host = Object.values(positions).find((p) => p.role === "host");
    if (host) {
      ctx.fillStyle = "#ffd";
      ctx.font = "12px monospace";
      ctx.fillText("Host", cx + 8, cy - 8);

      const maxRange = 200;
      const scale = radius / maxRange;

      for (const [id, pos] of Object.entries(positions)) {
        if (pos.role === "host") continue;
        const d = latLonDeltaToMeters(host.lat, host.lon, pos.lat, pos.lon);
        const px = cx + d.x * scale;
        const py = cy - d.y * scale;

        ctx.beginPath();
        ctx.fillStyle = "#0f9";
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#9ff";
        ctx.fillText(id.slice(0, 4), px + 8, py - 6);
      }
    } else {
      ctx.fillStyle = "#99d";
      ctx.fillText("Waiting for host position...", 20, c.height - 30);
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          padding: 10,
          background: "#001022",
          color: "#9fe",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: "bold" }}>📡 Radar</div>
        <div>
          Status:{" "}
          <span
            style={{
              color:
                connStatus === "connected"
                  ? "#0f0"
                  : connStatus === "connecting"
                  ? "#ff0"
                  : "#f55",
            }}
          >
            {connStatus}
          </span>
        </div>
        {joined && (
          <div>
            Room: <b>{roomId}</b> ({role})
          </div>
        )}
      </header>

      {/* Controls */}
      <div
        style={{
          padding: 10,
          background: "#071126",
          color: "#9fe",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
          style={{ padding: "4px 8px" }}
        />
        <label>
          <input
            type="radio"
            checked={role === "host"}
            onChange={() => setRole("host")}
          />{" "}
          Host
        </label>
        <label>
          <input
            type="radio"
            checked={role === "viewer"}
            onChange={() => setRole("viewer")}
          />{" "}
          Viewer
        </label>
        <button onClick={joinRoom} style={{ padding: "4px 10px" }}>
          Join
        </button>
      </div>

      {/* Radar */}
      <main style={{ flex: 1 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", background: "#071126" }}
        />
      </main>
    </div>
  );
}
