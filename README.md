# Chess Arena ♟️

Plataforma web de xadrez em português, publicada pelo GitHub Pages e conectada ao Supabase.

## Funcionalidades implementadas nesta primeira evolução
- Tabuleiro com regras legais usando chess.js.
- Modo local para dois jogadores no mesmo dispositivo.
- Bot local com busca minimax e níveis iniciante, médio e difícil.
- Cadastro, login, logout e recuperação de senha via Supabase Auth.
- Persistência de partidas e lances para usuários autenticados.
- Histórico com PGN e abertura da posição salva.
- Painel de perfil com estatísticas derivadas das partidas concluídas.
- Modo Deus mantido como ferramenta experimental.

## Stack
- HTML, CSS e JavaScript.
- chess.js 0.10.3.
- Supabase JS v2, Auth e Postgres com RLS.
- GitHub Actions + GitHub Pages.

## Segurança
O cliente usa somente a URL e a chave publishable do Supabase. Nunca colocar service_role ou chaves secretas no HTML. RLS limita os registros por usuário; lances não podem ser consultados usando uma participação de outra partida. Rating oficial e estatísticas competitivas ainda não são calculados no servidor.

## Próximas etapas
Multiplayer em tempo real, matchmaking, convites validados, ELO calculado no servidor, motor de xadrez de nível competitivo, análise de precisão, torneios e replay com navegação lance a lance.

## Publicação
Qualquer push para main aciona o workflow de GitHub Pages.
