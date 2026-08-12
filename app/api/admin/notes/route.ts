import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { listAllNotes } from "../../_lib/storage";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    return Response.json({ notes: await listAllNotes() });
  } catch (error) {
    console.error("Admin notes read failed", error);
    return Response.json({ error: "관리자 기록을 불러오지 못했습니다." }, { status: 500 });
  }
}
