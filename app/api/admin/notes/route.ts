import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { loadStore } from "../../_lib/local-store";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const store = await loadStore();
  const notes = store.notes.map((note) => {
    const owner = store.users.find((item) => item.id === note.userId);
    return { ...note, username: owner?.username ?? "unknown", displayName: owner?.displayName ?? "알 수 없음" };
  }).sort((a, b) => b.readDate.localeCompare(a.readDate) || b.id - a.id);
  return Response.json({ notes });
}
