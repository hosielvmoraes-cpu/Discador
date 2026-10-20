import { describe, expect, it } from "vitest";
import { type Lead, type PhoneHistory, formatDate, queue } from "./leads";

const now = new Date("2026-10-20T15:00:00Z");
const today = formatDate(now);
const yesterday = formatDate(new Date("2026-10-19T15:00:00Z"));

function lead(id: number, e164: string | null): Lead {
  return { id, name: `Lead ${id}`, phone: e164 ?? "123", e164, details: [] };
}

function past(lastStatus: string, lastDate: string, attempts = 1): PhoneHistory {
  return { attempts, lastStatus, lastDate, lastNote: "" };
}

describe("queue", () => {
  it("inclui leads novos e novas tentativas de outro dia", () => {
    const leads = [lead(0, "+5551900000001"), lead(1, "+5551900000002")];
    const history = { "+5551900000002": past("Não atendeu", yesterday) };
    expect(queue(leads, history, 3, now).map((l) => l.id)).toEqual([0, 1]);
  });

  it("deixa fora contatados hoje, encerrados, inválidos, no limite e repetidos", () => {
    const leads = [
      lead(0, "+5551900000001"),
      lead(1, "+5551900000002"),
      lead(2, null),
      lead(3, "+5551900000003"),
      lead(4, "+5551900000004"),
      lead(5, "+5551900000005"),
      lead(6, "+5551900000005"),
    ];
    const history = {
      "+5551900000001": past("Não atendeu", today),
      "+5551900000002": past("Reunião marcada", yesterday),
      "+5551900000003": past("Caixa postal", yesterday, 3),
      "+5551900000004": past("Não ligar mais", yesterday),
    };
    expect(queue(leads, history, 3, now).map((l) => l.id)).toEqual([5]);
  });
});
