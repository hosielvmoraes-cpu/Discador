import { describe, expect, it } from "vitest";
import { type Contact, linkRecordings } from "./storage";

const t = (hhmm: string) => `2026-10-21T${hhmm}:00.000Z`;

function contact(name: string, calledAt: string | undefined, at: string): Contact {
  return { at, date: "", name, phone: "+5551990000001", status: "Não atendeu", note: "", sdr: "Ana", calledAt };
}

describe("linkRecordings", () => {
  it("liga cada contato à primeira gravação livre da sua janela", () => {
    const contacts = [contact("A", t("14:00"), t("14:05")), contact("B", t("14:06"), t("14:09")), contact("C", undefined, t("14:10"))];
    const recordings = [
      { uri: "content://2", name: "b.m4a", addedAt: Date.parse(t("14:08")) },
      { uri: "content://1", name: "a.m4a", addedAt: Date.parse(t("14:04")) },
      { uri: "content://0", name: "antiga.m4a", addedAt: Date.parse(t("13:00")) },
    ];
    const linked = linkRecordings(contacts, recordings)!;
    expect(linked.map((c) => c.recording?.name)).toEqual(["a.m4a", "b.m4a", undefined]);
  });

  it("não reutiliza gravação já ligada e devolve null sem mudanças", () => {
    const first = { ...contact("A", t("14:00"), t("14:05")), recording: { uri: "content://1", name: "a.m4a" } };
    const second = contact("B", t("14:01"), t("14:06"));
    expect(linkRecordings([first, second], [{ uri: "content://1", name: "a.m4a", addedAt: Date.parse(t("14:04")) }])).toBeNull();
  });
});
