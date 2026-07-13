import { supabase } from './supabase';

interface CreateNotificationParams {
  type:
    | 'late_fine'
    | 'ot_pending'
    | 'early_in_pending'
    | 'leave_request'
    | 'fine_confirmed'
    | 'ot_approved'
    | 'ot_rejected'
    | 'salary_confirmed'
    | 'absent_alert'
    | 'birthday'
    | 'duty_promotion';
  title: string;
  message: string;
  branchId: string | null;
  staffId: string | null;
  relatedId?: string | null;
  targetRole: 'admin' | 'ops_manager' | 'staff_executive' | 'all' | 'staff';
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    const { error } = await supabase.from('notifications').insert({
      type: params.type,
      title: params.title,
      message: params.message,
      branch_id: params.branchId,
      staff_id: params.staffId,
      related_id: params.relatedId || null,
      target_role: params.targetRole,
      is_read: false,
    });
    if (error) throw error;
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}
