import type { Api, Experiments, InterveneResponse, Model, Scenario, SimulateResponse } from "./types";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().then((j) => j.detail, () => null);
    throw new Error(typeof detail === "string" ? detail : `Request to ${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api: Api = {
  model: () => request<Model>("/api/model"),
  scenarios: () => request<{ scenarios: Scenario[] }>("/api/scenarios").then((r) => r.scenarios),
  simulate: (scenario, seed, steps) => request<SimulateResponse>("/api/simulate", { scenario, seed, steps }),
  intervene: (scenario, seed, steps, intervention) =>
    request<InterveneResponse>("/api/intervene", { scenario, seed, steps, intervention }),
  experiments: () => request<{ results: Experiments }>("/api/experiments", {}).then((r) => r.results),
};
