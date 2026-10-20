import { describe, expect, it } from "vitest";
import { type Lead, formatDate, queue } from "./leads";

const now = new Date("2026-10-20T15:00:00Z");
const today = formatDate(now);
const yesterday = formatDate(new Date("2026-10-19T15:00:00Z"));

function lead(overrides: Partial<Lead>): Lead {
  return {
    row: 2, name: "Ana", phone: "11987654321", e164: "+5511987654321",
    status: "", date: "", note: "", recording: "", sdr: "", attempts: 0,
    ...overrides,
  };
}

describe("queue", () => {
  it("inclui leads novos e tentativas de outro dia", () => {
    const leads = [
      lead({ row: 2 }),
      lead({ row: 3, status: "Não atendeu", date: yesterday, attempts: 1 }),
    ];
    expect(queue(leads, 3, now).map((l) => l.row)).toEqual([2, 3]);
  });

  it("deixa fora quem já foi tentado hoje, finalizado, inválido ou no limite", () => {
    const leads = [
      lead({ row: 2, status: "Não atendeu", date: today, attempts: 1 }),
      lead({ row: 3, status: "Reunião marcada", date: yesterday, attempts: 1 }),
      lead({ row: 4, e164: null }),
      lead({ row: 5, status: "Caixa postal", date: yesterday, attempts: 3 }),
      lead({ row: 6, status: "Não ligar mais", date: yesterday, attempts: 1 }),
    ];
    expect(queue(leads, 3, now)).toEqual([]);
  });
});
