import { expandModuleKeysForAccess } from "./app-config.js";

export function hasModuleAccess(userModules, moduleKey) {
  let modules = userModules;

  if (typeof modules === "string") {
    try {
      modules = JSON.parse(modules);
    } catch {
      modules = [];
    }
  }

  if (!Array.isArray(modules)) modules = [];
  return expandModuleKeysForAccess(modules).includes(moduleKey);
}

export function fmtMoney(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function fmt2(x) {
  return (Math.round((Number(x) || 0) * 100) / 100).toFixed(2);
}

export function normalizeCui(input = "") {
  return String(input).toUpperCase().replace(/^RO/, "").replace(/\D/g, "");
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function escapeHtml(x) {
  return String(x ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
