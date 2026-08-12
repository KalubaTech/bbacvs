// Minimal client-side auth: JWT + user stored in localStorage.
const KEY = "bbacvs_auth";

export function setAuth(accessToken, user) {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify({ accessToken, user }));
  }
}
export function getAuth() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
export function getToken() {
  return getAuth()?.accessToken || null;
}
export function getUser() {
  return getAuth()?.user || null;
}
export function clearAuth() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
