import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/** Abre o discador do celular (tel:) ou o WhatsApp. No app, o Android entrega o link para o app certo. */
export function openExternal(url: string) {
  if (Capacitor.isNativePlatform() || url.startsWith("tel:")) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}

/** Salva o CSV e abre o menu de compartilhar do Android (Drive, WhatsApp, e-mail…). No navegador, baixa o arquivo. */
export async function shareCsv(fileName: string, content: string) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  await Share.share({ title: fileName, files: [uri], dialogTitle: "Salvar resultados" });
}
