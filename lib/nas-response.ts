export async function readNasResponse<T extends object>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `The local NAS service returned an unexpected response (HTTP ${response.status}). Reload the viewer and try again.`,
    );
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      'The local NAS service returned incomplete connection data. Reload the viewer and try again.',
    );
  }
  const error =
    'error' in data && typeof data.error === 'string' ? data.error : '';
  if (!response.ok || error) {
    throw new Error(
      error ||
        `The NAS request failed (HTTP ${response.status}). Please try again.`,
    );
  }
  return data as T;
}
