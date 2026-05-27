/**
 * Global API URL Helper to support separate deployments
 * (e.g., frontend on Firebase Hosting and backend on Render / Railway / Cloud Run)
 */

const API_BASE = (((import.meta as any).env?.VITE_API_BASE_URL || "") as string).replace(/\/$/, "");

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}
