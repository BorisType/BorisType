import { createHash } from "node:crypto";

export const npmRegistry = "https://registry.npmjs.org";
export const availabilityTimeout = 30 * 60_000;

export class RegistryError extends Error {
  constructor(message, { retryable = false, retryAfterMs = 0 } = {}) {
    super(message);
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

async function request(url, { timeoutMs = 30_000, ...options } = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))) });
  } catch (error) {
    throw new RegistryError(`Registry network error: ${error.message}`, { retryable: true });
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
    await response.body?.cancel();
    throw new RegistryError(`Registry HTTP ${response.status}`, {
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      retryAfterMs,
    });
  }
  return response;
}

export async function registryPackage(name, base = npmRegistry, timeoutMs = 30_000) {
  const response = await request(`${base}/${encodeURIComponent(name)}`, {
    timeoutMs,
    headers: { Accept: "application/vnd.npm.install-v1+json", "Cache-Control": "no-cache" },
  });
  if (!response) return undefined;
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new RegistryError(`Invalid registry metadata JSON for ${name}`);
    throw new RegistryError(`Metadata download interrupted: ${error.message}`, { retryable: true });
  }
  if (
    !data ||
    data.name !== name ||
    !data.versions ||
    typeof data.versions !== "object" ||
    Array.isArray(data.versions) ||
    !data["dist-tags"] ||
    typeof data["dist-tags"] !== "object" ||
    Array.isArray(data["dist-tags"])
  )
    throw new RegistryError(`Invalid registry metadata for ${name}`);
  return data;
}

// One deadline covers requests and delays; injectable time keeps delayed-registry regressions fast.
export async function waitForRegistry(
  probe,
  {
    timeoutMs = availabilityTimeout,
    intervalMs = 5000,
    now = Date.now,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onWait = () => {},
  } = {},
) {
  const deadline = now() + timeoutMs;
  const requestBudget = () => {
    const budget = deadline - now();
    if (budget <= 0) throw new RegistryError("Registry read deadline reached", { retryable: true });
    return Math.min(30_000, budget);
  };
  let delay = intervalMs;
  let lastError;
  while (now() < deadline) {
    let retryAfterMs = 0;
    try {
      const value = await probe(requestBudget(), requestBudget);
      if (value !== undefined) return value;
    } catch (error) {
      if (!error.retryable) throw error;
      lastError = error;
      retryAfterMs = error.retryAfterMs ?? 0;
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const pause = Math.min(remaining, Math.max(delay, retryAfterMs));
    onWait({ remainingMs: remaining, delayMs: pause, error: lastError?.message });
    await wait(pause);
    delay = Math.min(delay * 2, 30_000);
  }
  throw new Error(
    `Registry availability timed out; upload may already be accepted. Resume verification without uploading again.${lastError ? ` Last read: ${lastError.message}` : ""}`,
  );
}

export async function retryRegistryRead(read, options) {
  return (await waitForRegistry(async (remaining) => ({ value: await read(remaining) }), options)).value;
}

function tarballUrl(version, base) {
  const url = new URL(version.dist.tarball);
  if (url.origin !== new URL(base).origin || !["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new RegistryError("Unexpected registry tarball URL");
  return url;
}

export async function verifyPublication(target, bytes, { base = npmRegistry, ...timing } = {}) {
  const expected = createHash("sha512").update(bytes).digest("base64");
  return waitForRegistry(async (_initial, remaining) => {
    const metadata = await registryPackage(target.name, base, remaining());
    const version = metadata?.versions?.[target.version];
    if (!version) return undefined;
    if (version.dist?.integrity !== `sha512-${expected}`)
      throw new RegistryError(`Published ${target.name}@${target.version} has different or missing tarball integrity`);
    if (!version.dist.tarball) throw new RegistryError("Missing registry tarball URL");
    const response = await request(tarballUrl(version, base), { timeoutMs: remaining(), headers: { "Cache-Control": "no-cache" } });
    if (!response) return undefined;
    const hash = createHash("sha512");
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > bytes.length) throw new RegistryError("Published archive is larger than the reviewed archive");
        hash.update(chunk);
      }
    } catch (error) {
      if (error instanceof RegistryError) throw error;
      throw new RegistryError(`Archive download interrupted: ${error.message}`, { retryable: true });
    }
    if (size !== bytes.length || hash.digest("base64") !== expected)
      throw new RegistryError("Published archive bytes have different integrity");
    return version;
  }, timing);
}

export async function waitForDependencies(dependencies, { base = npmRegistry, ...timing } = {}) {
  if (!dependencies.length) return;
  await waitForRegistry(async (_initial, remaining) => {
    const states = await Promise.allSettled(
      dependencies.map(async ({ name, version }) => {
        const metadata = await registryPackage(name, base, remaining());
        const published = metadata?.versions?.[version];
        if (!published) return false;
        if (!published.dist?.integrity || !published.dist.tarball)
          throw new RegistryError(`Invalid dependency metadata for ${name}@${version}`);
        return Boolean(await request(tarballUrl(published, base), { method: "HEAD", timeoutMs: remaining() }));
      }),
    );
    const failures = states.filter((state) => state.status === "rejected").map((state) => state.reason);
    const terminal = failures.find((error) => !error.retryable);
    if (terminal) throw terminal;
    if (failures.length) {
      failures.sort((a, b) => (b.retryAfterMs ?? 0) - (a.retryAfterMs ?? 0));
      throw failures[0];
    }
    return states.every((state) => state.value) ? true : undefined;
  }, timing);
}
