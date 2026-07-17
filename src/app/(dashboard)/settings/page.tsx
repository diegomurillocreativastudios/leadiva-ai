import { PageHeader } from "@/components/shared/page-header";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardDescription,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { OnboardingForm } from "@/features/auth/components/onboarding-form";
import { requireSession } from "@/server/auth/session";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Ajustes"
        description={`${session.user.name} · ${session.user.email} · ${session.user.role}`}
      />

      <SkeuCard>
        <SkeuCardHeader>
          <SkeuCardTitle>Perfil</SkeuCardTitle>
          <SkeuCardDescription>
            Datos de sesión actuales. El rol se gestiona en el servidor.
          </SkeuCardDescription>
        </SkeuCardHeader>
        <SkeuCardContent className="space-y-2 text-sm">
          <p>
            <span className="text-text-secondary">Nombre: </span>
            {session.user.name}
          </p>
          <p>
            <span className="text-text-secondary">Correo: </span>
            {session.user.email}
          </p>
          <p>
            <span className="text-text-secondary">Rol: </span>
            {session.user.role}
          </p>
        </SkeuCardContent>
      </SkeuCard>

      <OnboardingForm initialCategories={session.user.interestCategories} />
    </div>
  );
}
