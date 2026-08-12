import { env } from "cloudflare:workers";
import { createSession, seedDemoUsers, verifyPassword } from "../../_lib/auth";

type UserRow = { id: number; username: string; displayName: string; passwordHash: string; role: "user" | "admin" };

export async function POST(request: Request) {
  const payload = await request.json() as { username?: string; password?: string };
  const username = payload.username?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";
  if (!username || !password) return Response.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });

  await seedDemoUsers();
  const user = await env.DB.prepare(`SELECT id, username, display_name AS displayName, password_hash AS passwordHash, role FROM users WHERE username = ?`).bind(username).first<UserRow>();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const session = await createSession(user.id);
  const { passwordHash: _, ...safeUser } = user;
  return Response.json({ user: safeUser }, { headers: { "Set-Cookie": session.cookie } });
}
