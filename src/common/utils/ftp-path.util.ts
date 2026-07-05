export function joinFtpPath(base: string, name: string): string {
  const b = base.replace(/\\/g, '/').replace(/\/+$/, '');
  const n = name.replace(/^\/+/, '');
  if (!b) {
    return n;
  }
  return `${b}/${n}`;
}
