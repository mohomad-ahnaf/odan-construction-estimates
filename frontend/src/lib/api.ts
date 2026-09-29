let csrfToken = "";
export function setCsrf(token: string) {
  csrfToken = token;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new ApiError(response.status, error.message ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new ApiError(response.status, error.message ?? "Request failed");
  }
  return response.blob();
}
export const money = (value: number | string, currency: string) => {
  const formatter = new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const decimal = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal);
  if (!match) return formatter.format(Number(value));

  // Amounts returned by the API are decimal strings. Keep their fractional
  // digits out of Number so large LKR totals do not lose cents in the UI.
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return formatter
    .formatToParts(BigInt(match[1]))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
};
