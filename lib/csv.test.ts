import { describe, expect, it } from "vitest";
import { importLeads, parseCsv } from "./csv";

// Mesmo formato do export de perdas do Stronilead (BOM, ; e CRLF), com dados fictícios.
const STRONILEAD = "﻿Nome;WhatsApp;Responsável do aluno;Telefone do responsável;CPF;Motivo;Etapa;Data da perda;Dias desde a perda;Origem;Consultor\r\n"
  + "Maria Teste;(51) 9 9000-0001;;;123.456.789-00;Mora longe;Em conversa;13/10/2026;7;Tráfego pago;Ana\r\n"
  + "João Teste;;Carla Teste;(51) 99000-0002;;Bloqueou;Negociação;07/10/2026;13;Indicação;Bia\r\n"
  + "Sem Telefone;;;;;Falta de interesse;Ligação;05/10/2026;15;Orgânico;Ana\r\n";

describe("parseCsv", () => {
  it("lida com aspas, vírgula como separador e linhas vazias", () => {
    expect(parseCsv('nome,telefone\n"Silva, Ana","(11) 9 8765-4321"\n\n')).toEqual([
      ["nome", "telefone"],
      ["Silva, Ana", "(11) 9 8765-4321"],
    ]);
  });
});

describe("importLeads", () => {
  const leads = importLeads(STRONILEAD);

  it("usa o WhatsApp e, sem ele, o telefone do responsável", () => {
    expect(leads.map((l) => [l.name, l.e164])).toEqual([
      ["Maria Teste", "+5551990000001"],
      ["João Teste", "+5551990000002"],
      ["Sem Telefone", null],
    ]);
  });

  it("mostra as demais colunas, sem CPF", () => {
    expect(leads[0].details).toEqual([
      ["Motivo", "Mora longe"],
      ["Etapa", "Em conversa"],
      ["Data da perda", "13/10/2026"],
      ["Dias desde a perda", "7"],
      ["Origem", "Tráfego pago"],
      ["Consultor", "Ana"],
    ]);
    expect(leads[1].details).toContainEqual(["Responsável do aluno", "Carla Teste"]);
  });
});
