import { NextResponse } from "next/server";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };

  if (!password || password !== DEMO_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("demo_auth", DEMO_PASSWORD, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
