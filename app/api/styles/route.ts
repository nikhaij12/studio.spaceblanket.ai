import { NextResponse } from "next/server";
import { listStyles } from "@/lib/styles";

export const dynamic = "force-dynamic";

/**
 * The looks you have saved. Studio-wide rather than per-project, because the
 * whole point of saving one is using it on different material.
 */
export async function GET() {
  return NextResponse.json({ styles: listStyles() });
}
