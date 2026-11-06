export class RequestError extends Error {
  constructor(message: string, public status: number, public retryAfter: number | null) {
    super(message);
    this.name = "RequestError";
  }
}
export function responseError(status: number, retry: string | null, payload: { error?: { message?: string } }) {
  const seconds = retry && /^[0-9]{1,6}$/.test(retry) ? Math.max(1, Number(retry)) : null;
  if (status === 429) return new RequestError(
    seconds ? `Too many requests. Please try again in ${seconds} seconds.` : "Too many requests. Please try again shortly.", status, seconds,
  );
  return new RequestError(payload.error?.message ?? "The request failed. Try again.", status, seconds);
}
export function retryQuery(failures: number, error: Error) {
  return !(error instanceof RequestError && [429, 503].includes(error.status)) && failures < 1;
}
