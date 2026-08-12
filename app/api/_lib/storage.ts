import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadStore, mutateStore, nextId, type LocalNote, type LocalUser } from "./local-store";

export type StoredUser = LocalUser;
export type StoredNote = LocalNote & { imageUrl?: string };
export type AdminNote = StoredNote & { username: string; displayName: string };

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: "user" | "admin";
  created_at: string;
};

type NoteRow = {
  id: number;
  user_id: number;
  book_title: string;
  author: string;
  read_date: string;
  rating: number;
  memo: string;
  created_at: string;
};

let cachedSupabase: SupabaseClient | null = null;
const NOTE_IMAGE_BUCKET = "pagelog-images";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url && !serverKey) return null;
  if (!url || !serverKey) throw new Error("SUPABASE_URL과 SUPABASE_SECRET_KEY를 모두 설정해야 합니다.");
  if (serverKey.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SECRET_KEY에 공개용 sb_publishable 키를 사용할 수 없습니다. Supabase의 sb_secret 키를 설정해 주세요.");
  }
  if (!serverKey.startsWith("sb_secret_") && !serverKey.startsWith("eyJ")) {
    throw new Error("Supabase 서버 키 형식이 올바르지 않습니다. sb_secret 키 또는 기존 service_role JWT가 필요합니다.");
  }
  cachedSupabase ??= createClient(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cachedSupabase;
}

function assertSupabase<T>(error: { message: string } | null, data: T, operation: string): T {
  if (error) throw new Error(`Supabase ${operation} 실패: ${error.message}`);
  return data;
}

function toUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

function toNote(row: NoteRow): StoredNote {
  return {
    id: row.id,
    userId: row.user_id,
    bookTitle: row.book_title,
    author: row.author,
    readDate: row.read_date,
    rating: row.rating,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

async function attachImageUrls(notes: StoredNote[], supabase: SupabaseClient): Promise<StoredNote[]> {
  if (!notes.length) return notes;
  const { data: files, error } = await supabase.storage.from(NOTE_IMAGE_BUCKET).list("notes", { limit: 1000 });
  if (error) return notes;
  const fileById = new Map<number, string>();
  for (const file of files ?? []) {
    const id = Number(file.name.split(".")[0]);
    if (Number.isInteger(id)) fileById.set(id, file.name);
  }
  return notes.map((note) => {
    const filename = fileById.get(note.id);
    if (!filename) return note;
    const { data } = supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(`notes/${filename}`);
    return { ...note, imageUrl: data.publicUrl };
  });
}

async function ensureImageBucket(supabase: SupabaseClient) {
  const { data } = await supabase.storage.getBucket(NOTE_IMAGE_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(NOTE_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: 6 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new Error(`Supabase 이미지 버킷 생성 실패: ${error.message}`);
  }
}

export async function saveNoteImage(noteId: number, bytes: Uint8Array, mimeType: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("이미지 저장에는 Supabase 설정이 필요합니다.");
  await ensureImageBucket(supabase);
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  const path = `notes/${noteId}.${extension}`;
  const { error } = await supabase.storage.from(NOTE_IMAGE_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`Supabase 이미지 저장 실패: ${error.message}`);
  return supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function storageMode() {
  return getSupabase() ? "supabase" : "local";
}

export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const supabase = getSupabase();
  if (!supabase) return (await loadStore()).users.find((user) => user.username === username) ?? null;
  const { data, error } = await supabase.from("pagelog_users").select("id,username,display_name,password_hash,role,created_at").eq("username", username).maybeSingle();
  const row = assertSupabase(error, data as UserRow | null, "사용자 조회");
  return row ? toUser(row) : null;
}

export async function ensureUsers(users: Array<Omit<StoredUser, "id" | "createdAt">>) {
  const supabase = getSupabase();
  if (!supabase) {
    await mutateStore((store) => {
      for (const user of users) {
        if (!store.users.some((item) => item.username === user.username)) {
          store.users.push({ ...user, id: nextId(store.users), createdAt: new Date().toISOString() });
        }
      }
    });
    return;
  }
  const rows = users.map((user) => ({ username: user.username, display_name: user.displayName, password_hash: user.passwordHash, role: user.role }));
  const { error } = await supabase.from("pagelog_users").upsert(rows, { onConflict: "username", ignoreDuplicates: true });
  assertSupabase(error, null, "초기 사용자 저장");
}

export async function saveSession(tokenHash: string, userId: number, expiresAt: string) {
  const supabase = getSupabase();
  if (!supabase) {
    await mutateStore((store) => {
      const now = new Date().toISOString();
      store.sessions = store.sessions.filter((session) => session.expiresAt > now);
      store.sessions.push({ tokenHash, userId, expiresAt, createdAt: now });
    });
    return;
  }
  const { error } = await supabase.from("pagelog_sessions").insert({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt });
  assertSupabase(error, null, "세션 저장");
}

export async function findUserBySession(tokenHash: string): Promise<StoredUser | null> {
  const supabase = getSupabase();
  if (!supabase) {
    const store = await loadStore();
    const session = store.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date().toISOString());
    return session ? store.users.find((item) => item.id === session.userId) ?? null : null;
  }
  const { data: session, error: sessionError } = await supabase.from("pagelog_sessions").select("user_id").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  const sessionRow = assertSupabase(sessionError, session as { user_id: number } | null, "세션 조회");
  if (!sessionRow) return null;
  const { data: user, error: userError } = await supabase.from("pagelog_users").select("id,username,display_name,password_hash,role,created_at").eq("id", sessionRow.user_id).maybeSingle();
  const userRow = assertSupabase(userError, user as UserRow | null, "세션 사용자 조회");
  return userRow ? toUser(userRow) : null;
}

export async function removeSession(tokenHash: string) {
  const supabase = getSupabase();
  if (!supabase) {
    await mutateStore((store) => { store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash); });
    return;
  }
  const { error } = await supabase.from("pagelog_sessions").delete().eq("token_hash", tokenHash);
  assertSupabase(error, null, "세션 삭제");
}

export async function listNotesForUser(userId: number): Promise<StoredNote[]> {
  const supabase = getSupabase();
  if (!supabase) return (await loadStore()).notes.filter((note) => note.userId === userId).sort((a, b) => b.readDate.localeCompare(a.readDate) || b.id - a.id);
  const { data, error } = await supabase.from("pagelog_notes").select("id,user_id,book_title,author,read_date,rating,memo,created_at").eq("user_id", userId).order("read_date", { ascending: false }).order("id", { ascending: false });
  return attachImageUrls(assertSupabase(error, data as NoteRow[], "독서 기록 조회").map(toNote), supabase);
}

export async function insertNote(note: Omit<StoredNote, "id" | "createdAt">): Promise<StoredNote> {
  const supabase = getSupabase();
  if (!supabase) {
    return mutateStore((store) => {
      const created = { ...note, id: nextId(store.notes), createdAt: new Date().toISOString() };
      store.notes.push(created);
      return created;
    });
  }
  const { data, error } = await supabase.from("pagelog_notes").insert({ user_id: note.userId, book_title: note.bookTitle, author: note.author, read_date: note.readDate, rating: note.rating, memo: note.memo }).select("id,user_id,book_title,author,read_date,rating,memo,created_at").single();
  return toNote(assertSupabase(error, data as NoteRow, "독서 기록 저장"));
}

export async function removeNote(id: number, userId: number) {
  const supabase = getSupabase();
  if (!supabase) {
    return mutateStore((store) => {
      const previousLength = store.notes.length;
      store.notes = store.notes.filter((note) => note.id !== id || note.userId !== userId);
      return previousLength !== store.notes.length;
    });
  }
  const { data, error } = await supabase.from("pagelog_notes").delete().eq("id", id).eq("user_id", userId).select("id");
  const deleted = assertSupabase(error, data as Array<{ id: number }>, "독서 기록 삭제").length > 0;
  if (deleted) {
    await supabase.storage.from(NOTE_IMAGE_BUCKET).remove([`notes/${id}.webp`, `notes/${id}.png`, `notes/${id}.jpg`]);
  }
  return deleted;
}

export async function listAllNotes(): Promise<AdminNote[]> {
  const supabase = getSupabase();
  if (!supabase) {
    const store = await loadStore();
    return store.notes.map((note) => {
      const owner = store.users.find((item) => item.id === note.userId);
      return { ...note, username: owner?.username ?? "unknown", displayName: owner?.displayName ?? "알 수 없음" };
    }).sort((a, b) => b.readDate.localeCompare(a.readDate) || b.id - a.id);
  }
  const { data: notes, error: notesError } = await supabase.from("pagelog_notes").select("id,user_id,book_title,author,read_date,rating,memo,created_at").order("read_date", { ascending: false }).order("id", { ascending: false });
  const noteRows = assertSupabase(notesError, notes as NoteRow[], "관리자 기록 조회");
  const userIds = [...new Set(noteRows.map((note) => note.user_id))];
  if (!userIds.length) return [];
  const { data: users, error: usersError } = await supabase.from("pagelog_users").select("id,username,display_name,password_hash,role,created_at").in("id", userIds);
  const userMap = new Map(assertSupabase(usersError, users as UserRow[], "관리자 사용자 조회").map((user) => [user.id, user]));
  const result = noteRows.map((row) => {
    const note = toNote(row);
    const owner = userMap.get(row.user_id);
    return { ...note, username: owner?.username ?? "unknown", displayName: owner?.display_name ?? "알 수 없음" };
  });
  return attachImageUrls(result, supabase) as Promise<AdminNote[]>;
}
