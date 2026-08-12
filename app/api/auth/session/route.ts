import { getCurrentUser, unauthorized } from "../../_lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return user ? Response.json({ user }) : unauthorized();
}
