import {
  comprasalAvailableProcessSchema,
  isComprasalIsoDateTime,
  type ComprasalAvailableProcessRecord,
} from "./available-schemas";
import { normalizeComprasalSearchText } from "./available-search";

export type ComprasalAvailableProcess = {
  id: number;
  externalId: string;
  title: string;
  code: string;
  version: number;
  institution: string;
  currentState: string;
  processState: string;
  contractingMethod: string;
  contractingMethodCode: string;
  currentStage: {
    id: number;
    name: string;
    startsAt: string;
    endsAt: string;
  };
  publishedAt: string | null;
  publicationStage: {
    id: number;
    name: string;
    startsAt: string;
    endsAt: string;
  } | null;
  deadlineAt: string;
  activityNames: string[];
  rawData: Record<string, unknown>;
};

const PUBLICATION_STAGE_NAME = "publicacion de convocatoria en comprasal";

function findPublicationStage(
  process: ComprasalAvailableProcessRecord,
): ComprasalAvailableProcess["publicationStage"] {
  const publicationStage = process.etapas.find(
    (stage) =>
      normalizeComprasalSearchText(stage.nombre) === PUBLICATION_STAGE_NAME,
  );
  return publicationStage
    ? {
        id: publicationStage.id,
        name: publicationStage.nombre,
        startsAt: publicationStage.fecha_hora_inicio,
        endsAt: publicationStage.fecha_hora_fin,
      }
    : null;
}

export function normalizeComprasalAvailableProcess(
  row: unknown,
): ComprasalAvailableProcess | null {
  const parsed = comprasalAvailableProcessSchema.safeParse(row);
  if (!parsed.success) {
    return null;
  }

  const process = parsed.data;
  const currentStage = process.EtapaPorProcesos[0];
  if (
    !currentStage ||
    !isComprasalIsoDateTime(currentStage.fecha_hora_inicio) ||
    !isComprasalIsoDateTime(currentStage.fecha_hora_fin)
  ) {
    return null;
  }

  const publicationStage = findPublicationStage(process);
  return {
    id: process.id,
    externalId: `available:${process.id}`,
    title: process.nombre_proceso,
    code: process.codigo_proceso,
    version: process.version,
    institution: process.institucion,
    currentState: process.estado_actual,
    processState: process.estado_proceso,
    contractingMethod: process.forma_contratacion,
    contractingMethodCode: process.codigo_forma_contratacion,
    currentStage: {
      id: currentStage.id,
      name: currentStage.nombre,
      startsAt: currentStage.fecha_hora_inicio,
      endsAt: currentStage.fecha_hora_fin,
    },
    publishedAt: publicationStage?.startsAt ?? null,
    publicationStage,
    deadlineAt: currentStage.fecha_hora_fin,
    activityNames: process.actividades.map((activity) => activity.a.nombre),
    rawData: process as Record<string, unknown>,
  };
}
