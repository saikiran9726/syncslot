// SlotSync Audit Logger
// Records tamper-evident audit trails for configuration & operational mutations

import { generateUUID } from '../shared/idUtils';

export interface AuditParams {
  business_id: string;
  actor_user_id?: string;
  action: string;
  target_type: string;
  target_id: string;
  payload_json?: any;
}

export async function recordAuditLog(db: D1Database, params: AuditParams): Promise<void> {
  try {
    const id = generateUUID();
    const nowIso = new Date().toISOString();
    const payloadStr = params.payload_json !== undefined ? JSON.stringify(params.payload_json) : null;

    await db
      .prepare(
        `INSERT INTO audit_log (
          id, business_id, actor_user_id, action, target_type, target_id,
          payload_json, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        params.business_id,
        params.actor_user_id ?? null,
        params.action,
        params.target_type,
        params.target_id,
        payloadStr,
        nowIso
      )
      .run();
  } catch (err) {
    console.error('[AuditLog Error]: Failed to write audit entry', err);
  }
}
