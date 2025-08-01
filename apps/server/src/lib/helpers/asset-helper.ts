export function generateShortIdentifier() {
  const timestamp = Date.now().toString(36);
  const randomComponent = Math.random().toString(36).substring(2, 8);

  return `${randomComponent}${timestamp}`;
}
