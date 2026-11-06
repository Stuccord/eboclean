import type { NextRequest, NextResponse } from "next/server";
import { accounts } from "./db";
import { cookieOpts, sign, verify } from "./signing";

// Signed session cookie. The user id comes only from a verified sign-in code.
const SESSION_COOKIE = "cs_session";
const SESSION_DAYS = 60;

export interface Session {
  uid: string;
  email: string;
  exp: number;
  /** Which account backend issued this session (demo "local" or "supabase"). */
  b?: string;
}

function backendKind() {
  try {
    return accounts().kind;
  } catch {
    return "none";
  }
}

export function getSession(req: NextRequest): Session | null {
  const s = verify<Session>(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s || s.exp < Date.now()) return null;
  // A demo-account session isn't valid once real accounts (Supabase) are switched on, and vice versa.
  if ((s.b ?? "local") !== backendKind()) return null;
  return s;
}

export function setSession(res: NextResponse, user: { id: string; email: string }) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  res.cookies.set(SESSION_COOKIE, sign({ uid: user.id, email: user.email, exp, b: backendKind() }), cookieOpts(SESSION_DAYS * 86_400));
}

export function clearSession(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
