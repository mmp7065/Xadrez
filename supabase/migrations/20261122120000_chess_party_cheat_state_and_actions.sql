create table if not exists public.chess_party_cheat_state (
  party_id uuid primary key references public.chess_parties(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  piece_abilities jsonb not null default '{"white":{},"black":{}}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chess_party_cheat_state_abilities_object check (jsonb_typeof(piece_abilities) = 'object')
);

create index if not exists chess_party_cheat_state_game_id_idx
  on public.chess_party_cheat_state(game_id);

create table if not exists public.chess_party_cheat_actions (
  id bigint generated always as identity primary key,
  party_id uuid not null references public.chess_parties(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action_type text not null check (action_type in ('create_piece','change_ability','remove_piece','reset_abilities')),
  target_color text check (target_color in ('white','black')),
  source_piece text check (source_piece in ('p','n','b','r','q','k')),
  ability_piece text check (ability_piece in ('p','n','b','r','q','k')),
  square text check (square is null or square ~ '^[a-h][1-8]$'),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chess_party_cheat_actions_party_created_idx
  on public.chess_party_cheat_actions(party_id, created_at desc);
create index if not exists chess_party_cheat_actions_game_idx
  on public.chess_party_cheat_actions(game_id, id);

alter table public.chess_party_cheat_state enable row level security;
alter table public.chess_party_cheat_actions enable row level security;

grant select on public.chess_party_cheat_state to authenticated;
grant insert, update on public.chess_party_cheat_state to authenticated;
grant select on public.chess_party_cheat_actions to authenticated;
grant insert on public.chess_party_cheat_actions to authenticated;
grant usage, select on sequence public.chess_party_cheat_actions_id_seq to authenticated;

drop policy if exists "Party members read cheat state" on public.chess_party_cheat_state;
create policy "Party members read cheat state"
on public.chess_party_cheat_state for select to authenticated
using (exists (
  select 1 from public.chess_party_members m
  where m.party_id = chess_party_cheat_state.party_id
    and m.user_id = (select auth.uid())
));

drop policy if exists "Party host inserts cheat state" on public.chess_party_cheat_state;
create policy "Party host inserts cheat state"
on public.chess_party_cheat_state for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1 from public.chess_party_members m
    where m.party_id = chess_party_cheat_state.party_id
      and m.user_id = (select auth.uid())
      and m.role = 'host'
  )
);

drop policy if exists "Party host updates cheat state" on public.chess_party_cheat_state;
create policy "Party host updates cheat state"
on public.chess_party_cheat_state for update to authenticated
using (exists (
  select 1 from public.chess_party_members m
  where m.party_id = chess_party_cheat_state.party_id
    and m.user_id = (select auth.uid())
    and m.role = 'host'
))
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.chess_party_members m
    where m.party_id = chess_party_cheat_state.party_id
      and m.user_id = (select auth.uid())
      and m.role = 'host'
  )
);

drop policy if exists "Party members read cheat actions" on public.chess_party_cheat_actions;
create policy "Party members read cheat actions"
on public.chess_party_cheat_actions for select to authenticated
using (exists (
  select 1 from public.chess_party_members m
  where m.party_id = chess_party_cheat_actions.party_id
    and m.user_id = (select auth.uid())
));

drop policy if exists "Party host records cheat actions" on public.chess_party_cheat_actions;
create policy "Party host records cheat actions"
on public.chess_party_cheat_actions for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and exists (
    select 1 from public.chess_party_members m
    where m.party_id = chess_party_cheat_actions.party_id
      and m.user_id = (select auth.uid())
      and m.role = 'host'
  )
);

comment on table public.chess_party_cheat_state is 'Persisted per-party cheat configuration. Piece appearance remains separate from movement ability.';
comment on column public.chess_party_cheat_state.piece_abilities is 'JSON object keyed by side (white/black), then visual piece type (p,n,b,r,q,k), mapped to movement ability type.';
comment on table public.chess_party_cheat_actions is 'Auditable event log for host-only cheat tools such as piece creation and side-specific ability changes.';
