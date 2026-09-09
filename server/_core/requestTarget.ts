export function isMalformedRequestTarget(value: string): boolean {
  try {
    decodeURI(value);
    return false;
  } catch {
    return true;
  }
}
