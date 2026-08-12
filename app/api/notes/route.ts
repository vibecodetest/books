import { getCurrentUser, unauthorized } from "../_lib/auth";
import { generateReadingImage, isGeminiImageEnabled } from "../_lib/gemini-image";
import { insertNote, listNotesForUser, removeNote, saveNoteImage } from "../_lib/storage";

type NoteInput = { bookTitle?: string; author?: string; readDate?: string; rating?: string | number; memo?: string };

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return unauthorized();
    return Response.json({ notes: await listNotesForUser(user.id) });
  } catch (error) {
    console.error("Notes read failed", error);
    return Response.json({ error: "독서 기록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
    const note = await insertNote({ userId: user.id, bookTitle, author, readDate, rating, memo });
    if (!isGeminiImageEnabled()) return Response.json({ note, imageStatus: "disabled" }, { status: 201 });
    try {
      const image = await generateReadingImage({ bookTitle, author, memo });
      const imageUrl = await saveNoteImage(note.id, image.bytes, image.mimeType);
      return Response.json({ note: { ...note, imageUrl }, imageStatus: "created" }, { status: 201 });
    } catch (imageError) {
      console.error("Note image generation failed", imageError);
      return Response.json({ note, imageStatus: "failed" }, { status: 201 });
    }
  } catch (error) {
    console.error("Note write failed", error);
    return Response.json({ error: "독서 기록을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return unauthorized();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "올바르지 않은 기록입니다." }, { status: 400 });
    const deleted = await removeNote(id, user.id);
    return deleted ? Response.json({ ok: true }) : Response.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
  } catch (error) {
    console.error("Note delete failed", error);
    return Response.json({ error: "독서 기록을 삭제하지 못했습니다." }, { status: 500 });
  }
}
