let renewing: Promise<void> | null = null;
export async function fetchMedia(url: string, signal?: AbortSignal) {
  let response = await fetch(url, { signal, credentials: 'same-origin' });
  if (url.startsWith('/__nas/') && response.status === 403) {
    renewing ??= fetch('/', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw Error('Could not renew the NAS connection.');
      })
      .finally(() => {
        renewing = null;
      });
    await renewing;
    response = await fetch(url, {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  }
  if (!response.ok) {
    let message = '';
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error || '';
    } catch {}
    throw Error(message || `Media request failed (HTTP ${response.status}).`);
  }
  const type = response.headers.get('content-type') || '';
  if (url.startsWith('/__nas/') && !/^(image|video)\//i.test(type))
    throw Error(
      'The NAS returned a page instead of media. Reload the viewer and try again.',
    );
  return response;
}
