/** Browsers may throw while accessing the storage property, before any read or write. */
export function browserStorage(host: { readonly localStorage?: Storage } = globalThis): Storage | undefined {
  try {
    return host.localStorage;
  } catch {
    return undefined;
  }
}
