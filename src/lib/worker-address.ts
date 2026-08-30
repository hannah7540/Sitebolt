/** Structured residential address fields stored on workers. */
export type WorkerResidentialAddress = {
  address_line_1?: string | null;
  address_line_2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
};

function trimOrEmpty(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = trimOrEmpty(value);
  return trimmed || null;
}

/** Format structured address parts into a single display line. */
export function formatWorkerResidentialAddress(
  address: WorkerResidentialAddress | null | undefined
): string {
  if (!address) return "";
  const line1 = trimOrEmpty(address.address_line_1);
  const line2 = trimOrEmpty(address.address_line_2);
  const suburb = trimOrEmpty(address.suburb);
  const state = trimOrEmpty(address.state);
  const postcode = trimOrEmpty(address.postcode);

  const locality = [suburb, state, postcode].filter(Boolean).join(" ");
  return [line1, line2, locality].filter(Boolean).join(", ");
}

/** Normalize address fields for worker create/update payloads. */
export function normalizeWorkerResidentialAddress(
  address: WorkerResidentialAddress | null | undefined
): {
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  postcode: string | null;
} {
  return {
    address_line_1: trimOrNull(address?.address_line_1),
    address_line_2: trimOrNull(address?.address_line_2),
    suburb: trimOrNull(address?.suburb),
    postcode: trimOrNull(address?.postcode),
  };
}
