# Chess Arena ♟️

Plataforma web de xadrez em português, publicada pelo GitHub Pages e conectada ao Supabase.

## Funcionalidades integradas
- Tabuleiro com regras legais usando chess.js.
- Modo local para dois jogadores no mesmo dispositivo.
- Bot local com busca minimax e níveis de dificuldade.
- Cadastro, login, logout e recuperação de senha via Supabase Auth.
- Persistência de partidas e lances para usuários autenticados.
- Histórico de partidas e painel básico de estatísticas.
- Modo Deus mantido como ferramenta experimental.

## Stack
- HTML, CSS e JavaScript.
- chess.js 0.10.3.
- Supabase JS v2, Auth e Postgres com RLS.
- GitHub Actions + GitHub Pages.

## Segurança
A URL e a chave publishable são públicas por definição e usadas no cliente web. Nunca adicionar service_role ou chaves secretas ao HTML.

## Limitações atuais
O bot usa busca minimax leve no navegador; ainda não é um motor de nível competitivo. Multiplayer em tempo real, matchmaking, torneios, ELO confiável, análise de precisão e replay interativo ainda precisam ser implementados. Partidas no Modo Deus não devem ser consideradas competitivas.

## Publicação
Qualquer push para main aciona o workflow de GitHub Pages.
