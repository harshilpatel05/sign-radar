// app/api/socket/route.js
import { Server } from "socket.io";

let io;

export async function GET() {
  if (!globalThis.__RADAR_ROOMS) globalThis.__RADAR_ROOMS = {};

  if (!io) {
    io = new Server({
      cors: { origin: "*", methods: ["GET", "POST"] },
    });

    globalThis.__RADAR_IO = io;

    io.on("connection", (socket) => {
      console.log("Socket connected:", socket.id);

      socket.on("join-room", ({ roomId, role }) => {
        if (!roomId) return;
        socket.join(roomId);

        const rooms = globalThis.__RADAR_ROOMS;
        if (!rooms[roomId]) {
          rooms[roomId] = { host: null, clients: {} };
        }

        rooms[roomId].clients[socket.id] = { socketId: socket.id, role, pos: null };

        if (role === "host") {
          rooms[roomId].host = { socketId: socket.id, pos: null };
        }

        io.to(roomId).emit("room-state", sanitizeRoom(rooms[roomId]));
      });

      socket.on("update-pos", ({ roomId, pos }) => {
        if (!roomId || !pos) return;
        const rooms = globalThis.__RADAR_ROOMS;
        if (!rooms[roomId]) return;

        if (rooms[roomId].host && rooms[roomId].host.socketId === socket.id) {
          rooms[roomId].host.pos = { ...pos, ts: Date.now() };
        } else if (rooms[roomId].clients[socket.id]) {
          rooms[roomId].clients[socket.id].pos = { ...pos, ts: Date.now() };
        }

        io.to(roomId).emit("room-state", sanitizeRoom(rooms[roomId]));
      });

      socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
        const rooms = globalThis.__RADAR_ROOMS;
        if (!rooms) return;

        for (const [roomId, room] of Object.entries(rooms)) {
          if (room.clients[socket.id]) {
            delete room.clients[socket.id];
          }
          if (room.host && room.host.socketId === socket.id) {
            room.host = null;
          }
          const hasClients =
            Object.keys(room.clients).length > 0 || !!room.host;
          if (!hasClients) delete rooms[roomId];
          else io.to(roomId).emit("room-state", sanitizeRoom(room));
        }
      });
    });

    console.log("✅ Socket.IO server started");
  }

  return new Response("Socket ready", { status: 200 });
}

function sanitizeRoom(room) {
  return {
    host: room.host
      ? { socketId: room.host.socketId, pos: room.host.pos }
      : null,
    clients: Object.values(room.clients).map((c) => ({
      socketId: c.socketId,
      role: c.role,
      pos: c.pos,
    })),
  };
}
