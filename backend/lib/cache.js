const store = new Map();

export function getCached(key, ttlMs, loader) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) {
    return Promise.resolve(hit.value);
  }
  return Promise.resolve(loader()).then((value) => {
    store.set(key, { value, at: Date.now() });
    return value;
  });
}

export function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
