// Mirror of api/src/utils/canonicalJson.js — keep the two identical.
// Deterministic JSON (RFC 8785 JSON Canonicalization Scheme, "JCS") for hashing and signing.
// Object members are sorted by key (UTF-16 code-unit order, which is what Array#sort does for
// strings), no insignificant whitespace, strings and numbers serialised exactly as ECMAScript
// JSON.stringify does — which is what JCS specifies. Two semantically identical records
// therefore always produce the same bytes regardless of property insertion order.

export function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalize: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    // Like JSON.stringify, undefined/functions inside arrays become null.
    return `[${value.map((v) => (v === undefined || typeof v === "function" ? "null" : canonicalize(v))).join(",")}]`;
  }
  if (typeof value === "object") {
    if (typeof value.toJSON === "function") return canonicalize(value.toJSON());
    const members = Object.keys(value)
      .filter((k) => value[k] !== undefined && typeof value[k] !== "function")
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`canonicalize: unsupported type ${typeof value}`);
}
