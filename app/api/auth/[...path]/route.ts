import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

type AuthRouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: AuthRouteContext) {
  return getAuth().handler().GET(request, context);
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  return getAuth().handler().POST(request, context);
}
