import { PlaceholderArea } from "@/components/app/placeholder-area";

export const metadata = { title: "Sem acesso" };

export default function NoAccessPage() {
  return (
    <PlaceholderArea
      title="Conta sem vínculo"
      description="Sua conta ainda não está vinculada a nenhuma instituição. Fale com quem enviou o seu convite."
    />
  );
}
