-- Tighten access controls after the first playable release.
drop trigger if exists on_game_finished_stats on public.games;
drop function if exists public.record_finished_game_stats();

revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, country_code) on public.profiles to authenticated;
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Creators read their games" on public.games;
create policy "Creators read their games" on public.games for select to authenticated using (created_by = (select auth.uid()));
drop policy if exists "Authenticated users create games" on public.games;
create policy "Authenticated users create games" on public.games for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "Creator updates own games" on public.games;
create policy "Creator updates own games" on public.games for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

drop policy if exists "Players read own participation" on public.game_players;
create policy "Players read own participation" on public.game_players for select to authenticated using (user_id = (select auth.uid()) or exists (select 1 from public.games g where g.id = game_players.game_id and g.created_by = (select auth.uid())));
drop policy if exists "Players update own participation" on public.game_players;
revoke update on public.game_players from authenticated;

drop policy if exists "Users see own friendship requests" on public.friendships;
create policy "Users see own friendship requests" on public.friendships for select to authenticated using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
drop policy if exists "Users send friendship requests" on public.friendships;
create policy "Users send friendship requests" on public.friendships for insert to authenticated with check (requester_id = (select auth.uid()) and requester_id <> addressee_id);
drop policy if exists "Recipients update friendship requests" on public.friendships;
revoke update on public.friendships from authenticated;
drop policy if exists "Users delete own friendship requests" on public.friendships;
create policy "Users delete own friendship requests" on public.friendships for delete to authenticated using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "Invite participants read invites" on public.game_invites;
create policy "Invite participants read invites" on public.game_invites for select to authenticated using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));
drop policy if exists "Users create invites" on public.game_invites;
create policy "Users create invites" on public.game_invites for insert to authenticated with check (inviter_id = (select auth.uid()));
drop policy if exists "Invite recipients update invites" on public.game_invites;
revoke update on public.game_invites from authenticated;

drop policy if exists "Users read own stats" on public.player_stats;
create policy "Users read own stats" on public.player_stats for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users read own settings" on public.player_settings;
create policy "Users read own settings" on public.player_settings for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users update own settings" on public.player_settings;
create policy "Users update own settings" on public.player_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
