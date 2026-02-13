import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    date: "2026-02-12",
    rows: [
      { team: "Test Team A", teamId: "A", adjO: 110.2, adjD: 92.1, adjEM: 18.1 },
      { team: "Test Team B", teamId: "B", adjO: 104.5, adjD: 95.0, adjEM: 9.5 },
    ],
  });
}
