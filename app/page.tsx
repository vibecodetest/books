"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SessionUser = { id: number; username: string; displayName: string; role: "user" | "admin" };
type Note = {
  id: number;
  userId: number;
  username?: string;
  displayName?: string;
  bookTitle: string;
  author: string;
  readDate: string;
  rating: number;
  memo: string;
  createdAt: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const loadNotes = useCallback(async (current: SessionUser) => {
    const endpoint = current.role === "admin" ? "/api/admin/notes" : "/api/notes";
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.ok) setNotes((await response.json()).notes);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const current = (await response.json()).user as SessionUser;
        setUser(current);
        await loadNotes(current);
      })
      .finally(() => setLoading(false));
  }, [loadNotes]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "로그인에 실패했습니다.");
    } else {
      setUser(data.user);
      await loadNotes(data.user);
    }
    setSubmitting(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setNotes([]);
    setMessage("");
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(values)),
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error ?? "기록을 저장하지 못했습니다.");
    else {
      setNotes((current) => [data.note, ...current]);
      form.reset();
      const dateInput = form.elements.namedItem("readDate") as HTMLInputElement;
      dateInput.value = today();
      setMessage("독서 기록을 저장했습니다.");
    }
    setSubmitting(false);
  }

  async function removeNote(id: number) {
    if (!window.confirm("이 독서 기록을 삭제할까요?")) return;
    const response = await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    if (response.ok) setNotes((current) => current.filter((note) => note.id !== id));
  }

  const visibleNotes = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return notes;
    return notes.filter((note) =>
      [note.bookTitle, note.author, note.memo, note.displayName, note.username]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(keyword)),
    );
  }, [notes, query]);

  if (loading) return <main className="center-screen"><div className="loader" aria-label="불러오는 중" /></main>;

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-intro">
          <div className="brand-mark">頁</div>
          <p className="eyebrow">나의 독서 기록</p>
          <h1>책의 여운을<br />짧게 남겨보세요.</h1>
          <p className="intro-copy">읽은 날의 생각은 금방 흐려집니다. 한 권, 한 문장씩 가볍게 쌓아두세요.</p>
          <div className="quote-card"><span>“</span><p>오늘 읽은 페이지가<br />내일의 나를 만듭니다.</p></div>
        </section>
        <section className="login-panel">
          <form className="login-form" onSubmit={login}>
            <div className="mini-logo"><span>頁</span> 페이지로그</div>
            <div>
              <p className="eyebrow">WELCOME BACK</p>
              <h2>다시 만나 반가워요</h2>
              <p className="muted">계정에 로그인해 독서 기록을 이어가세요.</p>
            </div>
            <label>아이디<input name="username" autoComplete="username" placeholder="아이디를 입력하세요" required autoFocus /></label>
            <label>비밀번호<input name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력하세요" required /></label>
            {message && <p className="error" role="alert">{message}</p>}
            <button className="primary" disabled={submitting}>{submitting ? "로그인 중..." : "로그인"}</button>
            <div className="demo-box">
              <strong>체험 계정</strong>
              <span>사용자: <code>reader / reader1234</code></span>
              <span>관리자: <code>admin / admin1234</code></span>
            </div>
          </form>
        </section>
      </main>
    );
  }

  const average = notes.length ? (notes.reduce((sum, note) => sum + note.rating, 0) / notes.length).toFixed(1) : "0.0";
  const memberCount = new Set(notes.map((note) => note.userId)).size;

  return (
    <main className="app-shell">
      <header>
        <div className="logo"><span>頁</span><div>페이지로그<small>READING JOURNAL</small></div></div>
        <div className="account"><div className="avatar">{user.displayName.slice(0, 1)}</div><div><strong>{user.displayName}</strong><small>{user.role === "admin" ? "관리자" : "독서가"}</small></div><button className="text-button" onClick={logout}>로그아웃</button></div>
      </header>

      <section className="hero-row">
        <div><p className="eyebrow">{user.role === "admin" ? "ADMIN OVERVIEW" : "MY READING JOURNAL"}</p><h1>{user.role === "admin" ? "독서 기록 관리" : `${user.displayName}님의 서재`}</h1><p>{user.role === "admin" ? "사용자들이 남긴 독서의 흔적을 한눈에 확인하세요." : "오늘의 책에서 마음에 남은 생각을 기록해 보세요."}</p></div>
        <div className="stats">
          <div><strong>{notes.length}</strong><span>전체 기록</span></div>
          <div><strong>{average}</strong><span>평균 평점</span></div>
          {user.role === "admin" && <div><strong>{memberCount}</strong><span>참여 사용자</span></div>}
        </div>
      </section>

      {user.role === "user" && (
        <section className="note-composer">
          <div className="section-heading"><span className="section-icon">＋</span><div><h2>새 독서 기록</h2><p>부담 없이, 지금 떠오르는 생각을 남겨보세요.</p></div></div>
          <form onSubmit={addNote}>
            <div className="form-grid">
              <label>책 제목<input name="bookTitle" placeholder="어떤 책을 읽으셨나요?" required /></label>
              <label>저자<input name="author" placeholder="저자 이름" required /></label>
              <label>읽은 날짜<input name="readDate" type="date" defaultValue={today()} required /></label>
              <label>나의 평점<select name="rating" defaultValue="5"><option value="5">★★★★★ 아주 좋아요</option><option value="4">★★★★☆ 좋아요</option><option value="3">★★★☆☆ 보통이에요</option><option value="2">★★☆☆☆ 아쉬워요</option><option value="1">★☆☆☆☆ 별로예요</option></select></label>
            </div>
            <label>기억하고 싶은 내용<textarea name="memo" rows={4} maxLength={1000} placeholder="인상 깊었던 문장, 새롭게 알게 된 점, 나의 생각을 자유롭게 적어보세요." required /></label>
            <div className="form-footer"><p className={message.includes("못") ? "error" : "success"}>{message}</p><button className="primary compact" disabled={submitting}>{submitting ? "저장 중..." : "기록 저장하기"}</button></div>
          </form>
        </section>
      )}

      <section className="records">
        <div className="records-head"><div><h2>{user.role === "admin" ? "모든 사용자의 기록" : "나의 독서 기록"}</h2><p>총 {notes.length}개의 기록이 있어요.</p></div><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={user.role === "admin" ? "책, 저자, 사용자 검색" : "책 또는 저자 검색"} /></label></div>
        {visibleNotes.length === 0 ? (
          <div className="empty"><div>⌑</div><h3>{query ? "검색 결과가 없습니다" : "아직 기록이 없습니다"}</h3><p>{query ? "다른 검색어로 찾아보세요." : "첫 번째 독서 기록을 남겨보세요."}</p></div>
        ) : (
          <div className="note-list">
            {visibleNotes.map((note) => (
              <article className="note-card" key={note.id}>
                <div className="book-spine"><span>{note.bookTitle.slice(0, 1)}</span></div>
                <div className="note-body">
                  {user.role === "admin" && <div className="author-chip"><span>{note.displayName?.slice(0, 1)}</span>{note.displayName} <small>@{note.username}</small></div>}
                  <div className="note-title"><div><h3>{note.bookTitle}</h3><p>{note.author}</p></div><span className="stars">{"★".repeat(note.rating)}<i>{"★".repeat(5 - note.rating)}</i></span></div>
                  <p className="memo">{note.memo}</p>
                  <div className="note-meta"><time>{note.readDate.replaceAll("-", ". ")}</time>{user.role === "user" && <button onClick={() => removeNote(note.id)}>삭제</button>}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer>페이지로그 · 읽고, 생각하고, 기록하는 습관</footer>
    </main>
  );
}
