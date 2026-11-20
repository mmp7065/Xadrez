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


## Festas privadas e partidas online
- Criação de salas privadas com código curto de 6 caracteres.
- Entrada por código ou link compartilhável.
- Lobby com anfitrião, convidado, preferências de cor e presença em tempo real.
- Início da partida pelo anfitrião quando há dois jogadores.
- Partidas online sincronizadas via Supabase Realtime Broadcast/Presence.
- Movimentos validados no servidor com chess.js e gravados em `game_moves`.
- O banco aplica controle otimista de posição (FEN esperado) para impedir dois lances concorrentes na mesma posição.
- Edge Function `chess-party` autentica o JWT do usuário e executa as ações privilegiadas no servidor.

### Recursos de infraestrutura
- Tabelas `chess_parties` e `chess_party_members`, com RLS.
- Políticas de autorização para canais privados Realtime por membro da festa.
- Função SQL `commit_party_move` com execução reservada ao papel `service_role`.
- Trigger de banco que limita cada festa a dois participantes, inclusive sob tentativas simultâneas de entrada.

### Como testar
1. Entre no Chess Arena em duas contas diferentes (ou dois navegadores).
2. No painel, abra **Festas** e crie uma festa.
3. Copie o código de seis caracteres e envie ao outro jogador.
4. Na segunda conta, abra **Festas**, digite o código e entre.
5. O anfitrião inicia; cada jogador move somente as peças da sua cor.
