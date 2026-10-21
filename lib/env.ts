export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function baseUrl(): string {
  return env("PUBLIC_BASE_URL").replace(/\/+$/, "");
}
