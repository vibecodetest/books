import { env } from "cloudflare:workers";
import { getCurrentUser, unauthorized } from "../_lib/auth";

type NoteInput = { bookTitle?: string; author?: string; readDate?: string; rating?: string | number; memo?: string };

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const result = await env.DB.prepare(`SELECT id, user_id AS userId, book_title AS bookTitle, author, read_date AS readDate, rating, memo, created_at AS createdAt FROM notes WHERE user_id = ? ORDER BY read_date DESC, id DESC`).bind(user.id).all();
  return Response.json({ notes: result.results });
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "user") return Response.json({ error: "사용자 계정에서만 기록할 수 있습니다." }, { status: 403 });
  const payload = await request.json() as NoteInput;
  const bookTitle = payload.bookTitle?.trim() ?? "";
  const author = payload.author?.trim() ?? "";
  const readDate = payload.readDate?.trim() ?? "";
  const memo = payload.memo?.trim() ?? "";
  const rating = Number(payload.rating);
  if (!bookTitle || !author || !/^\d{4}-\d{2}-\d{2}$/.test(readDate) || !memo || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "모든 항목을 올바르게 입력해 주세요." }, { status: 400 });
  }
  if (bookTitle.length > 120 || author.length > 80 || memo.length > 1000) return Response.json({ error: "입력 가능한 글자 수를 초과했습니다." }, { status: 400 });
  const note = await env.DB.prepare(`INSERT INTO notes (user_id, book_title, author, read_date, rating, memo) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, user_id AS userId, book_title AS bookTitle, author, read_date AS readDate, rating, memo, created_at AS createdAt`).bind(user.id, bookTitle, author, readDate, rating, memo).first();
  return Response.json({ note }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "올바르지 않은 기록입니다." }, { status: 400 });
  const result = await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return result.meta.changes ? Response.json({ ok: true }) : Response.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
}
