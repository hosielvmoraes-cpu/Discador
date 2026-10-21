import { describe, expect, it } from "vitest";
import { fillTemplate, toE164, whatsappLink } from "./phone";

describe("toE164", () => {
  it.each([
    ["(11) 98765-4321", "+5511987654321"],
    ["11987654321", "+5511987654321"],
    ["+55 21 3456-7890", "+552134567890"],
    ["55 11 98765 4321", "+5511987654321"],
  ])("normaliza %s", (raw, expected) => {
    expect(toE164(raw)).toBe(expected);
  });

  it("rejeita números inválidos", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("123")).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("monta o link com a mensagem", () => {
    expect(whatsappLink("+5511987654321", "Olá Ana")).toBe("https://wa.me/5511987654321?text=Ol%C3%A1%20Ana");
  });
});

describe("fillTemplate", () => {
  it("substitui as variáveis", () => {
    expect(fillTemplate("Olá {nome}, aqui é {sdr}", { nome: "Ana", sdr: "Bia" })).toBe("Olá Ana, aqui é Bia");
  });
});
