import { redirect } from "next/navigation";

// A página inicial pública (landing) vem depois; por enquanto, vai para o login/área do usuário.
export default function Home() {
  redirect("/inicio");
}
