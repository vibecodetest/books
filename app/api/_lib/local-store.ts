import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type LocalUser = {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  role: "user" | "admin";
  createdAt: string;
};

export type LocalSession = { tokenHash: string; userId: number; expiresAt: string; createdAt: string };

export type LocalNote = {
  id: number;
  userId: number;
  bookTitle: string;
  author: string;
  readDate: string;
  rating: number;
  memo: string;
  createdAt: string;
};

export type LocalStore = { users: LocalUser[]; sessions: LocalSession[]; notes: LocalNote[] };

const DATA_FILE = join(process.cwd(), ".local-data.json");
let mutationQueue: Promise<void> = Promise.resolve();

export async function loadStore(): Promise<LocalStore> {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8")) as LocalStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { users: [], sessions: [], notes: [] };
    throw error;
  }
}

export async function mutateStore<T>(change: (store: LocalStore) => T | Promise<T>): Promise<T> {
  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });

  mutationQueue = mutationQueue.then(async () => {
    try {
      const store = await loadStore();
      const changed = await change(store);
      await writeFile(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
      resolveResult(changed);
    } catch (error) {
      rejectResult(error);
    }
  });

  return result;
}

export function nextId(items: Array<{ id: number }>) {
  return items.reduce((largest, item) => Math.max(largest, item.id), 0) + 1;
}
