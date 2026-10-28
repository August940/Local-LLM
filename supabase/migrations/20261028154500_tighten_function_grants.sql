-- handle_new_user is only meant to run from the auth.users trigger, and
-- queue_position only for signed-in users (it returns nothing for others' jobs).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.queue_position(uuid) from public, anon;
grant execute on function public.queue_position(uuid) to authenticated;
