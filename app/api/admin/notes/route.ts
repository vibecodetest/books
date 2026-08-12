import { env } from "cloudflare:workers";
import { getCurrentUser, unauthorized } from "../../_lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const result = await env.DB.prepare(`
    SELECT n.id, n.user_id AS userId, u.username, u.display_name AS displayName,
      n.book_title AS bookTitle, n.author, n.read_date AS readDate, n.rating, n.memo, n.created_at AS createdAt
    FROM notes n JOIN users u ON u.id = n.user_id
    ORDER BY n.read_date DESC, n.id DESC
  `).all();
  return Response.json({ notes: result.results });
}
