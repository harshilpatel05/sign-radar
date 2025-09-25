import Ably from "ably";

export async function GET() {
  const client = new Ably.Rest(process.env.ABLY_API_KEY);
  const tokenRequest = await client.auth.createTokenRequest({ clientId: "radar-client" });

  return new Response(JSON.stringify(tokenRequest), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
