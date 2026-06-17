import { auth } from "@/lib/auth";

export async function getUserFromHeaders(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

export async function requireUser(headers: Headers) {
  const user = await getUserFromHeaders(headers);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}
