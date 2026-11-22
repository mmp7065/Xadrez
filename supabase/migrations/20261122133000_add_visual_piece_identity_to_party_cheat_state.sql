alter table public.chess_party_cheat_state
  add column if not exists visual_positions jsonb not null default '{}'::jsonb;
alter table public.chess_party_cheat_state
  drop constraint if exists chess_party_cheat_state_visual_positions_object;
alter table public.chess_party_cheat_state
  add constraint chess_party_cheat_state_visual_positions_object
  check (jsonb_typeof(visual_positions) = 'object');
comment on column public.chess_party_cheat_state.visual_positions is
  'Visual piece identity by square (a1-h8); keeps displayed piece separate from engine movement type.';
