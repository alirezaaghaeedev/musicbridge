export const randomId = () => crypto.randomUUID().replace(/-/g, "");
export async function hash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let delta = 0;
  for (let i = 0; i < x.length; i++) delta |= x[i]! ^ y[i]!;
  return delta === 0;
}
const bytes = (s: string) =>
  new Uint8Array(s.match(/../g)!.map((x) => parseInt(x, 16)));
async function key(hex: string) {
  return crypto.subtle.importKey("raw", bytes(hex), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(
  value: unknown,
  hex: string,
  user: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(user) },
    await key(hex),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `v1.${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(data)))}`;
}
export async function decrypt<T>(
  value: string,
  hex: string,
  user: string,
): Promise<T> {
  const [version, iv, data] = value.split(".");
  if (version !== "v1" || !iv || !data)
    throw new Error("Invalid encrypted envelope");
  const raw = (s: string) => Uint8Array.from(atob(s), (x) => x.charCodeAt(0));
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: raw(iv),
          additionalData: new TextEncoder().encode(user),
        },
        await key(hex),
        raw(data),
      ),
    ),
  ) as T;
}
export function playlistId(input: string): string {
  let id = input.trim();
  if (id.startsWith("https://")) {
    const url = new URL(id);
    if (
      url.hostname !== "open.spotify.com" ||
      url.username ||
      url.password ||
      url.port ||
      !/^\/playlist\/[A-Za-z0-9]{22}\/?$/.test(url.pathname)
    )
      throw new Error("Invalid playlist URL");
    id = url.pathname.split("/")[2]!;
  } else if (id.startsWith("spotify:playlist:")) id = id.slice(17);
  if (!/^[A-Za-z0-9]{22}$/.test(id))
    throw new Error("Invalid playlist identifier");
  return id;
}
