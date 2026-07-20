import { describe, expect, it } from "vitest";

import fixture from "./fixtures/process-detail-135317.sanitized.json";
import {
  ComprasalProcessDetailContractError,
  deriveComprasalPipTemporalStatus,
  normalizeComprasalRemotePip,
  normalizeComprasalStoredCurrentStages,
  normalizeComprasalStoredEtapas,
  normalizeComprasalStoredPip,
  parseComprasalProcessDetailPayload,
} from "./pip-normalize";

const NOW = new Date("2026-07-19T12:00:00.000Z");

function storedStage(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    nombre: "Recepción de ofertas",
    fecha_hora_inicio: "2026-07-20T14:00:00.000Z",
    fecha_hora_fin: "2026-07-20T16:00:00.000Z",
    ...overrides,
  };
}

describe("COMPRASAL PIP normalization", () => {
  it("parses and normalizes the sanitized real process-detail payload", () => {
    const snapshot = parseComprasalProcessDetailPayload(fixture);
    expect(snapshot).toMatchObject({ processId: 135317 });
    expect(snapshot?.stages).toHaveLength(15);
    if (!snapshot) throw new Error("fixture must produce a snapshot");

    const pip = normalizeComprasalRemotePip({
      snapshot: { ...snapshot, fetchedAt: NOW.toISOString() },
      now: NOW,
    });
    expect(pip.source).toBe("REMOTE_DETAIL");
    expect(pip.offerDeadlineAt).toBe("2026-07-24T20:00:00.000Z");
    expect(pip.stages[0]?.name).toBe("Emisión de adendas");
    expect(pip.stages.at(-1)).toMatchObject({
      name: "Solicitud de contratación",
      temporalStatus: "UNKNOWN",
    });
  });

  it("normalizes rawData.etapas as the stored fallback", () => {
    const stages = normalizeComprasalStoredEtapas({
      rawData: { etapas: [storedStage()] },
      now: NOW,
    });
    expect(stages).toEqual([
      expect.objectContaining({
        id: "10",
        name: "Recepción de ofertas",
        order: 1,
        officialDurationDays: null,
        temporalStatus: "UPCOMING",
      }),
    ]);
  });

  it("normalizes rawData.EtapaPorProcesos independently", () => {
    const stages = normalizeComprasalStoredCurrentStages({
      rawData: { EtapaPorProcesos: [storedStage({ id: 11 })] },
      now: NOW,
    });
    expect(stages?.[0]).toMatchObject({ id: "11", order: 1 });
  });

  it("sorts unordered stages by start date rather than alphabetically", () => {
    const pip = normalizeComprasalStoredPip({
      rawData: {
        etapas: [
          storedStage({
            id: 2,
            nombre: "A etapa posterior",
            fecha_hora_inicio: "2026-07-22T14:00:00.000Z",
          }),
          storedStage({
            id: 1,
            nombre: "Z etapa anterior",
            fecha_hora_inicio: "2026-07-20T14:00:00.000Z",
          }),
        ],
      },
      now: NOW,
    });
    expect(pip?.stages.map((stage) => stage.name)).toEqual([
      "Z etapa anterior",
      "A etapa posterior",
    ]);
  });

  it("deduplicates by ID and keeps the more complete row", () => {
    const pip = normalizeComprasalStoredPip({
      rawData: {
        etapas: [
          storedStage({
            id: 10,
            fecha_hora_inicio: null,
            fecha_hora_fin: null,
          }),
          storedStage({ id: 10 }),
        ],
        EtapaPorProcesos: [storedStage({ id: 10 })],
      },
      now: NOW,
    });
    expect(pip?.stages).toHaveLength(1);
    expect(pip?.stages[0]?.startsAt).toBe("2026-07-20T14:00:00.000Z");
  });

  it("keeps a stage without dates and marks it UNKNOWN", () => {
    const pip = normalizeComprasalStoredPip({
      rawData: {
        etapas: [
          storedStage({ fecha_hora_inicio: null, fecha_hora_fin: null }),
        ],
      },
      now: NOW,
    });
    expect(pip?.stages[0]).toMatchObject({
      startsAt: null,
      endsAt: null,
      temporalStatus: "UNKNOWN",
    });
  });

  it("preserves UTC and explicit-offset timestamps", () => {
    const offset = "2026-07-20T10:00:00-06:00";
    const pip = normalizeComprasalStoredPip({
      rawData: {
        etapas: [storedStage({ fecha_hora_inicio: offset })],
      },
      now: NOW,
    });
    expect(pip?.stages[0]?.startsAt).toBe(offset);
    expect(pip?.stages[0]?.endsAt).toBe("2026-07-20T16:00:00.000Z");
  });

  it("rejects timestamps without a timezone", () => {
    expect(
      normalizeComprasalStoredEtapas({
        rawData: {
          etapas: [
            storedStage({ fecha_hora_inicio: "2026-07-20T10:00:00" }),
          ],
        },
        now: NOW,
      }),
    ).toBeNull();
    expect(() =>
      parseComprasalProcessDetailPayload({
        data: {
          id: 135317,
          EtapaPorProcesos: [
            storedStage({ fecha_hora_inicio: "2026-07-20T10:00:00" }),
          ],
        },
        message: "ok",
      }),
    ).toThrow(ComprasalProcessDetailContractError);
  });

  it("derives COMPLETED, CURRENT, UPCOMING and UNKNOWN from dates", () => {
    expect(
      deriveComprasalPipTemporalStatus({
        startsAt: "2026-07-18T10:00:00.000Z",
        endsAt: "2026-07-19T11:59:59.000Z",
        now: NOW,
      }),
    ).toBe("COMPLETED");
    expect(
      deriveComprasalPipTemporalStatus({
        startsAt: "2026-07-19T10:00:00.000Z",
        endsAt: "2026-07-19T12:00:00.000Z",
        now: NOW,
      }),
    ).toBe("CURRENT");
    expect(
      deriveComprasalPipTemporalStatus({
        startsAt: "2026-07-19T12:00:01.000Z",
        endsAt: "2026-07-20T12:00:00.000Z",
        now: NOW,
      }),
    ).toBe("UPCOMING");
    expect(
      deriveComprasalPipTemporalStatus({
        startsAt: null,
        endsAt: null,
        now: NOW,
      }),
    ).toBe("UNKNOWN");
  });

  it("supports a valid empty remote stage array", () => {
    expect(
      parseComprasalProcessDetailPayload({
        data: { id: 135317, EtapaPorProcesos: [] },
        message: "ok",
      }),
    ).toMatchObject({ processId: 135317, stages: [] });
  });
});
