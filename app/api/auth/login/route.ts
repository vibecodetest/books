import { createSession, seedDemoUsers, verifyPassword } from "../../_lib/auth";
import { loadStore } from "../../_lib/local-store";

export async function POST(request: Request) {
  const payload = await request.json() as { username?: string; password?: string };
  const username = payload.username?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";
  if (!username || !password) return Response.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });

  await seedDemoUsers();
  const user = (await loadStore()).users.find((item) => item.username === username);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const session = await createSession(user.id);
  const safeUser = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
  return Response.json({ user: safeUser }, { headers: { "Set-Cookie": session.cookie } });
}
