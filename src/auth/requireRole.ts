// src/auth/requireRole.ts
import { OrgRole } from "../context/OrgContext";

/**
 * ZETRA DORA v1 Role Guard Layer
 * - Centralized role enforcement
 * - UI + Logic safety
 * - Does NOT replace DB RLS (DB is source of truth)
 */

export function requireOwner(role: OrgRole | null) {
  if (role !== "owner") {
    throw new Error("Owner access required");
  }
}

export function requireAdminOrOwner(role: OrgRole | null) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Admin or Owner access required");
  }
}

export function requireStaff(role: OrgRole | null) {
  if (role !== "owner" && role !== "admin" && role !== "staff") {
    throw new Error("Staff access required");
  }
}