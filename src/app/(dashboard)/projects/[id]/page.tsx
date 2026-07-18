import Link from "next/link";
import { notFound } from "next/navigation";

import { convertToLeadAction } from "@/features/auth/actions";
import { DiscardProjectForm } from "@/features/projects/discard-project-form";
import {
  ContractingSectorBadge,
  DuplicateBadge,
  ScoreBadge,
  SourceBadge,
  VerificationBadge,
  VigencyBadge,
} from "@/features/projects/project-badges";
import { buildProjectDetailViewModel } from "@/features/projects/project-detail-display";
import {
  ProjectDetailActions,
  ProjectSummaryCard,
} from "@/features/projects/project-detail-summary";
import { isGenericOrListingSourceUrl } from "@/lib/source-url-specificity";
import { requireSession } from "@/server/auth/session";
import { getSearchResultById } from "@/server/services/opportunity.service";
import {
  isSourceUrlValidated,
  validateSourceUrl,
} from "@/server/services/source-url-validation";

function resolveOfficialCandidateUrl(project: {
  sourceUrl: string;
  sourceResolvedUrl: string | null;
  sourceOriginalUrl: string | null;
}): string {
  return (
    project.sourceResolvedUrl?.trim() ||
    project.sourceOriginalUrl?.trim() ||
    project.sourceUrl
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();

  const { id } = await params;
  const project = await getSearchResultById(id);
  if (!project) {
    notFound();
  }

  const requiresGroundedVerification =
    project.sourceType === "PRIVATE_WEB" || project.sourceType === "LINKEDIN";
  const canConvert =
    project.verificationStatus !== "REJECTED" &&
    (!requiresGroundedVerification || project.verificationStatus === "VERIFIED");
  const alreadyLead = project.verificationStatus === "VERIFIED";
  const detailView = buildProjectDetailViewModel(project);

  const candidateUrl = resolveOfficialCandidateUrl(project);
  const isListingUrl = isGenericOrListingSourceUrl(candidateUrl);
  const cachedValidationOk = isSourceUrlValidated(project.rawData);
  const liveValidation =
    cachedValidationOk || isListingUrl
      ? null
      : await validateSourceUrl(candidateUrl);
  const reachable = cachedValidationOk || liveValidation?.ok === true;
  const specificEnough =
    !isListingUrl &&
    (project.sourceType === "COMPRASAL"
      ? project.sourceIsSpecific
      : !requiresGroundedVerification ||
        project.sourceIsSpecific ||
        project.verificationStatus !== "VERIFIED");
  const officialUrlOk = reachable && specificEnough;
  const officialHref =
    liveValidation?.ok === true ? liveValidation.finalUrl : candidateUrl;
  const officialFailureDetail = isListingUrl
    ? "La URL apunta a un índice o portal general, no a la convocatoria específica de este proyecto."
    : liveValidation && !liveValidation.ok
      ? liveValidation.detail
      : !specificEnough
        ? "La fuente aún no se validó como página específica de la oportunidad."
        : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex text-sm text-text-secondary underline-offset-2 hover:text-accent hover:underline"
        >
          ← Oportunidades
        </Link>

        <div className="space-y-2">
          <h1 className="font-heading text-balance text-2xl font-semibold leading-snug tracking-tight text-text-primary">
            {detailView.displayTitle}
          </h1>
          <p className="text-sm text-text-secondary">
            {project.organizationName ?? "Sin organización compradora"}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <SourceBadge sourceType={project.sourceType} />
          <ContractingSectorBadge
            sector={project.contractingSector}
            sourceType={project.sourceType}
          />
          <VerificationBadge status={project.verificationStatus} />
          <VigencyBadge vigency={project.vigency} />
          <ScoreBadge score={project.preliminaryScore} />
          <DuplicateBadge
            isPossibleDuplicate={project.isPossibleDuplicate}
            reason={project.duplicateReason}
          />
        </div>
      </header>

      {project.isPossibleDuplicate ? (
        <div className="rounded-md border border-status-evaluating/40 bg-accent-peach/40 px-4 py-3 text-sm text-status-evaluating">
          Posible duplicado:{" "}
          {project.duplicateReason ??
            "comparte señales con otro candidato del catálogo."}
        </div>
      ) : null}

      <ProjectSummaryCard
        highlights={detailView.highlights}
        fields={detailView.fields}
        narrative={detailView.narrative}
        discardReason={project.discardReason}
        officialUrlOk={officialUrlOk}
        officialHref={officialHref}
        officialFailureDetail={officialFailureDetail}
      >
        <ProjectDetailActions
          canConvert={canConvert}
          alreadyLead={alreadyLead}
          officialUrlOk={officialUrlOk}
          searchResultId={project.id}
          convertAction={convertToLeadAction}
        />
      </ProjectSummaryCard>

      {!officialUrlOk && canConvert && !alreadyLead ? (
        <p className="text-xs text-text-secondary">
          La conversión a Lead exige una convocatoria oficial específica y
          accesible.
        </p>
      ) : null}

      {canConvert && !alreadyLead ? (
        <DiscardProjectForm searchResultId={project.id} />
      ) : null}
    </div>
  );
}
