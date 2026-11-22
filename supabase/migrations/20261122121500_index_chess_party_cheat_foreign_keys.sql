create index if not exists chess_party_cheat_actions_actor_idx on public.chess_party_cheat_actions(actor_user_id);
create index if not exists chess_party_cheat_state_created_by_idx on public.chess_party_cheat_state(created_by);
create index if not exists chess_party_cheat_state_updated_by_idx on public.chess_party_cheat_state(updated_by);