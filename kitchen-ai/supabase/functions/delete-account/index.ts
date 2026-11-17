// POST {} -> { ok: true }. Permanently deletes the signed-in user's account (Apple requires in-app deletion).
// Their profile, saved recipes and meal logs are removed automatically (database "on delete cascade").
import { handle, json, requireUser, adminClient } from '../_shared/http.ts';
import { FriendlyError } from '../_shared/claude.ts';

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw new FriendlyError('delete_failed', 'We couldn’t delete your account right now. Please try again.', 500);
    return json({ ok: true });
  }),
);
