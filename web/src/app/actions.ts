"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess, INSTITUTION_COOKIE } from "@/lib/access";

// Troca a instituição em uso no painel (só entre as que o usuário é membro).
export async function selectInstitution(formData: FormData) {
  const id = String(formData.get("institution_id") ?? "");
  const access = await getAccess();
  if (!access?.memberships.some((m) => m.institution_id === id)) return;
  (await cookies()).set(INSTITUTION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/painel");
}
