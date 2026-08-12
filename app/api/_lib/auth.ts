import { loadStore, mutateStore, nextId } from "./local-store";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "user" | "admin";
};

const COOKIE_NAME = "pagelog_session";
const ITERATIONS = 120_000;
const SESSION_DAYS = 7;

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return `${ITERATIONS}:${bytesToBase64(salt)}:${bytesToBase64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [iterationValue, saltValue, expectedValue] = encoded.split(":");
  if (!iterationValue || !saltValue || !expectedValue) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltValue), iterations: Number(iterationValue) }, key, 256));
  const expected = base64ToBytes(expectedValue);
  if (derived.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < derived.length; index++) mismatch |= derived[index] ^ expected[index];
  return mismatch === 0;
}

export async function seedDemoUsers() {
  await mutateStore(async (store) => {
    if (store.users.some((user) => user.username === "reader")) return;
    const [readerHash, adminHash] = await Promise.all([hashPassword("reader1234"), hashPassword("admin1234")]);
    const createdAt = new Date().toISOString();
    store.users.push(
      { id: nextId(store.users), username: "reader", displayName: "책벌레 김독자", passwordHash: readerHash, role: "user", createdAt },
      { id: nextId([...store.users, { id: 1 }]), username: "admin", displayName: "운영 관리자", passwordHash: adminHash, role: "admin", createdAt },
    );
  });
}

export async function createSession(userId: number) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await mutateStore((store) => {
    store.sessions = store.sessions.filter((session) => session.expiresAt > new Date().toISOString());
    store.sessions.push({ tokenHash, userId, expiresAt: expiresAt.toISOString(), createdAt: new Date().toISOString() });
  });
  return {
    token,
    cookie: `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
  };
}

function readToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) ?? null;
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const token = readToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const store = await loadStore();
  const session = store.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date().toISOString());
  const user = session ? store.users.find((item) => item.id === session.userId) : null;
  return user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null;
}

export async function deleteSession(request: Request) {
  const token = readToken(request);
  if (token) {
    const tokenHash = await sha256(token);
    await mutateStore((store) => { store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash); });
  }
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function unauthorized() {
  return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
}
