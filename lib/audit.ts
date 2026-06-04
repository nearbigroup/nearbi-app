import { supabase } from './supabase';

export interface AuditLogPayload {
  action: string;
  table_name: string;
  record_id?: string | null;
  old_value?: any;
  new_value?: any;
  performed_by: string;
  performed_by_role: string;
  reason?: string | null;
}

export async function createAuditLog(payload: AuditLogPayload) {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        action: payload.action,
        table_name: payload.table_name,
        record_id: payload.record_id || null,
        old_value: payload.old_value || null,
        new_value: payload.new_value || null,
        performed_by: payload.performed_by,
        performed_by_role: payload.performed_by_role,
        reason: payload.reason || null,
      });
    
    if (error) {
      console.error('Failed to insert audit log:', error);
    }
  } catch (err) {
    console.error('Error in createAuditLog:', err);
  }
}
