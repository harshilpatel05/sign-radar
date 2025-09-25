// pages/api/coords.js
export default async function handler(req, res) {
  // Require POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // make sure socket server exists
  const io = res.socket.server.io;
  if (!io) {
    // Socket not initialized (client should call /api/socket first); fail safe:
    return res.status(500).json({
      error:
        "Socket server not ready. Call GET /api/socket first (browser usually does this).",
    });
  }

  const payload = req.body;

  /*
    Expected payload examples (choose one style):

    1) Local X,Y in meters relative to center:
      {
        "deviceId": "device-1",
        "x": 12.3,   // meters east
        "y": -4.5,   // meters north (or choose your convention)
        "ts": 1690000000000
      }

    2) Polar (range, angle in degrees) relative to center:
      {
        "deviceId": "device-2",
        "range": 20.5, // meters
        "angle": 135,  // degrees, 0 = East, 90 = North (you define)
        "ts": 1690000000000
      }

    3) GPS lat/lon (requires server or client to project to local coords before display):
      {
        "deviceId":"device-3",
        "lat": 37.123,
        "lon": -122.321,
        "ts": 1690000000000
      }
  */

  // Basic validation
  if (!payload || !payload.deviceId) {
    return res.status(400).json({ error: "Missing deviceId or payload" });
  }

  // Attach server timestamp if not provided
  payload.receivedAt = Date.now();

  // Broadcast to all connected browser clients
  io.emit("coords", payload);

  return res.status(200).json({ ok: true });
}
