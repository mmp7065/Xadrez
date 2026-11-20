-- Secure game access and record player statistics.
drop policy if exists "Participants read moves" on public.game_moves;
create policy "Participants read moves" on public.game_moves for select to authenticated
using (exists (select 1 from public.game_players gp where gp.game_id=game_moves.game_id and gp.user_id=(select auth.uid())) or exists (select 1 from public.games g where g.id=game_moves.game_id and g.created_by=(select auth.uid())));
drop policy if exists "Participants insert moves" on public.game_moves;
create policy "Participants insert moves" on public.game_moves for insert to authenticated
with check (exists (select 1 from public.game_players gp where gp.game_id=game_moves.game_id and gp.user_id=(select auth.uid())) or exists (select 1 from public.games g where g.id=game_moves.game_id and g.created_by=(select auth.uid())));
drop policy if exists "Game creator adds players" on public.game_players;
create policy "Game creator adds players" on public.game_players for insert to authenticated
with check (exists (select 1 from public.games g where g.id=game_players.game_id and g.created_by=(select auth.uid())));
revoke all on function public.handle_new_user() from public, anon, authenticated;
create index if not exists game_invites_game_id_idx on public.game_invites(game_id);
create index if not exists game_invites_inviter_id_idx on public.game_invites(inviter_id);
create or replace function public.record_finished_game_stats()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare participant record; player_result text;
begin
 if new.status='completed' and old.status is distinct from new.status then
  for participant in select gp.user_id,gp.color from public.game_players gp where gp.game_id=new.id and gp.player_type='human' loop
   player_result:=case when new.result='draw' then 'draw' when (new.result='white_win' and participant.color='white') or (new.result='black_win' and participant.color='black') then 'win' when new.result in ('white_win','black_win') then 'loss' else null end;
   if player_result is not null then
    insert into public.player_stats(user_id,games_played,wins,losses,draws,updated_at) values(participant.user_id,1,case when player_result='win' then 1 else 0 end,case when player_result='loss' then 1 else 0 end,case when player_result='draw' then 1 else 0 end,now())
    on conflict(user_id) do update set games_played=public.player_stats.games_played+1,wins=public.player_stats.wins+excluded.wins,losses=public.player_stats.losses+excluded.losses,draws=public.player_stats.draws+excluded.draws,updated_at=now();
    update public.game_players set result=player_result where game_id=new.id and user_id=participant.user_id;
   end if;
  end loop;
 end if;
 return new;
end;
$$;
revoke all on function public.record_finished_game_stats() from public, anon, authenticated;
drop trigger if exists on_game_finished_stats on public.games;
create trigger on_game_finished_stats after update of status on public.games for each row execute function public.record_finished_game_stats();
