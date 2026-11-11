// Hold a background slot through download, decode and first-frame preparation,
// not merely until the request has been dispatched.
export function createPreloadQueue(gap = 500) {
  const jobs: Array<{ start: (release: () => void) => void }> = [];
  let active: (typeof jobs)[number] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function pump() {
    if (active || timer) return;
    const job = jobs.shift();
    if (!job) return;
    active = job;
    job.start(() => release(job));
  }
  function release(job: (typeof jobs)[number]) {
    if (active !== job) return;
    active = undefined;
    timer = setTimeout(() => {
      timer = undefined;
      pump();
    }, gap);
  }
  return (start: (release: () => void) => void) => {
    const job = { start };
    jobs.push(job);
    pump();
    return () => {
      const index = jobs.indexOf(job);
      if (index !== -1) jobs.splice(index, 1);
      release(job);
    };
  };
}
export const queuePreload = createPreloadQueue();
