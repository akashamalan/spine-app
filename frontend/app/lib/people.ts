/** Helpers for showing people without photos: initials on a tinted circle. */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable hue (0–359) for a name, so a person keeps their colour everywhere. */
export function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Background + text colours for an avatar; dark enough for white initials. */
export function avatarStyle(name: string): { background: string; color: string } {
  return { background: `hsl(${hueFor(name)} 50% 30%)`, color: "#fff" };
}
