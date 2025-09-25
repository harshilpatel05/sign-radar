// pages/api/socket.js
import { Server } from "socket.io";

export default function handler(req, res) {
  // Only initialize once
  if (!res.socket.server.io) {
    console.log("Initializing Socket.IO server...");
    const io = new Server(res.socket.server);

    io.on("connection", (socket) => {
      console.log("Client connected", socket.id);

      socket.on("disconnect", () => {
        console.log("Client disconnected", socket.id);
      });

      // Optionally allow clients to send messages to server
      socket.on("ping-from-client", (d) => {
        console.log("ping-from-client:", d);
      });
    });

    res.socket.server.io = io;
  } else {
    // already initialized
    // console.log("Socket.IO already running");
  }
  res.end();
}
