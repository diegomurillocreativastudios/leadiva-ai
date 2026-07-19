import {
  comprasalAvailableProcessSchema,
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
  deadlineAt: string;
  activityNames: string[];
  rawData: Record<string, unknown>;
};

const PUBLICATION_STAGE_NAME = "publicacion de convocatoria en comprasal";

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function findPublishedAt(
  process: ComprasalAvailableProcessRecord,
): string | null {
  const publicationStage = process.etapas.find(
    (stage) =>
      normalizeComprasalSearchText(stage.nombre) === PUBLICATION_STAGE_NAME,
  );
  return publicationStage && isIsoDate(publicationStage.fecha_hora_inicio)
    ? publicationStage.fecha_hora_inicio
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
    !isIsoDate(currentStage.fecha_hora_inicio) ||
    !isIsoDate(currentStage.fecha_hora_fin)
  ) {
    return null;
  }

  return {
    id: process.id,
    externalId: String(process.id),
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
    publishedAt: findPublishedAt(process),
    deadlineAt: currentStage.fecha_hora_fin,
    activityNames: process.actividades.map((activity) => activity.a.nombre),
    rawData: process as Record<string, unknown>,
  };
}
