import "server-only";

import { GoogleGenAI } from "@google/genai";

import { getServerEnv } from "@/env/server";

let cachedClient: GoogleGenAI | null = null;
let cachedGroundingClient: GoogleGenAI | null = null;

export function isVertexConfigured(): boolean {
  return Boolean(getServerEnv().GCP_PROJECT_ID?.trim());
}

export function getVertexClient(): GoogleGenAI {
  const env = getServerEnv();
  const project = env.GCP_PROJECT_ID?.trim();
  if (!project) {
    throw new Error("VERTEX_NOT_CONFIGURED");
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new GoogleGenAI({
    vertexai: true,
    project,
    location: env.GCP_LOCATION,
  });

  return cachedClient;
}

/** Google Search Grounding is more reliable on the global endpoint. */
export function getVertexGroundingClient(): GoogleGenAI {
  const env = getServerEnv();
  const project = env.GCP_PROJECT_ID?.trim();
  if (!project) {
    throw new Error("VERTEX_NOT_CONFIGURED");
  }

  if (cachedGroundingClient) {
    return cachedGroundingClient;
  }

  cachedGroundingClient = new GoogleGenAI({
    vertexai: true,
    project,
    location: env.VERTEX_GROUNDING_LOCATION,
  });

  return cachedGroundingClient;
}

export function getVertexModel(): string {
  return getServerEnv().VERTEX_MODEL;
}

export function getVertexGroundingModel(): string {
  return getServerEnv().VERTEX_GROUNDING_MODEL;
}
