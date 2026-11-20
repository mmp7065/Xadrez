
(() => {
 const boardEl=document.getElementById('board'), statusEl=document.getElementById('status'), movesEl=document.getElementById('moves');
 const glyph={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟︎'};
 const supabase=window.supabase.createClient('https://vjpuosimrigajgikapsu.supabase.co','sb_publishable_gzBQNqRvBm8OCjXSU-BQMQ_zoaCgs9t');
 let user=null,savedGameId=null,saveQueue=Promise.resolve(),isBotThinking=false,authMode='login';
 let game=null,selected=null,legal=[],illegal=[],flipped=false,started=false,clockTimer=null,whiteTime=600,blackTime=600,clockOn=false,godMode=false,premove=null,premoveDraft=null;
 const files='abcdefgh';
 const pieceName={p:'peão',n:'cavalo',b:'bispo',r:'torre',q:'dama',k:'rei'};
 function init(){
  savedGameId=null;isBotThinking=false;premove=null;premoveDraft=null;document.getElementById('premove-hint').hidden=true;
  document.body.classList.remove('playing');if(typeof Chess==='undefined'){statusEl.innerHTML='Não foi possível carregar o mecanismo de regras. Verifique a conexão com a internet e recarregue a página.';return;}
  game=new Chess();whiteTime=blackTime=Number(document.getElementById('time-control').value)||0;started=false;selected=null;legal=[];illegal=[];clockOn=false;godMode=false;
  document.getElementById('god-toggle').classList.remove('active');document.getElementById('god-toggle').textContent='✦ MODO DEUS: DESATIVADO';
  clearInterval(clockTimer);render();updateClocks();setStatus('Escolha o tempo e clique em “Começar Partida”. Modo local: duas pessoas podem jogar neste computador.');
 }
 function setStatus(message,type=''){
  statusEl.textContent=message;statusEl.className='status'+(type?' '+type:'');
 }
 function kingSquare(color){
  const rows=game.board();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=rows[r][c];if(p&&p.type==='k'&&p.color===color)return files[c]+(8-r);}
  return null;
 }
 function pseudoTargets(from){
  const p=game.get(from);if(!p)return [];
  const f=files.indexOf(from[0]),r=Number(from[1])-1,dirs=[];
  const add=(x,y)=>{if(x<0||x>7||y<0||y>7)return false;const to=files[x]+(y+1),target=game.get(to);if(target&&target.color===p.color)return false;if(target&&target.type==='k')return false;return to;};
  const out=[];
  const push=(x,y,slide=false)=>{while(true){const to=add(x,y);if(!to)break;out.push(to);if(game.get(to)||!slide)break;x+=slide?x:0;y+=slide?y:0;}};
  if(p.type==='n'){
   for(const [dx,dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]){const to=add(f+dx,r+dy);if(to)out.push(to);}
  } else if(p.type==='k'){
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy){const to=add(f+dx,r+dy);if(to)out.push(to);}
  } else if(p.type==='p'){
   const dir=p.color==='w'?1:-1,one=add(f,r+dir);
   if(one&&!game.get(one)){out.push(one);const startRank=p.color==='w'?1:6,two=add(f,r+2*dir);if(r===startRank&&two&&!game.get(two))out.push(two);}
   for(const dx of [-1,1]){const to=add(f+dx,r+dir);if(to&&game.get(to))out.push(to);}
   // En passant is a legal move in chess.js; include it if the engine lists it.
   game.moves({square:from,verbose:true}).filter(m=>m.flags.includes('e')).forEach(m=>{if(!out.includes(m.to))out.push(m.to);});
  } else {
   const vectors=[];
   if(p.type==='b'||p.type==='q')vectors.push([1,1],[1,-1],[-1,1],[-1,-1]);
   if(p.type==='r'||p.type==='q')vectors.push([1,0],[-1,0],[0,1],[0,-1]);
   for(const [dx,dy] of vectors){let x=f+dx,y=r+dy;while(x>=0&&x<8&&y>=0&&y<8){const to=add(x,y);if(!to)break;out.push(to);if(game.get(to))break;x+=dx;y+=dy;}}
  }
  return [...new Set(out)];
 }
 function refreshMoves(){
  legal=selected?game.moves({square:selected,verbose:true}):[];
  illegal=[];
  if(selected){const legalTo=new Set(legal.map(m=>m.to));illegal=pseudoTargets(selected).filter(to=>!legalTo.has(to));}
 }
 function render(){
  boardEl.innerHTML='';
  const ranks=flipped?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],cols=flipped?[...'hgfedcba']:[...'abcdefgh'];
  const check=game.in_check(),checkedKing=check?kingSquare(game.turn()):null;
  const history=game.history({verbose:true}),last=history[history.length-1];
  ranks.forEach((rank,ri)=>cols.forEach((file,ci)=>{
   const sq=file+rank,piece=game.get(sq),el=document.createElement('button');
   el.className='square '+(((files.indexOf(file)+(8-rank))%2===0)?'light':'dark');
   if(last&&(last.to===sq||last.from===sq))el.classList.add('last');
   if(selected===sq)el.classList.add('selected');if(premove&&premove.to===sq)el.classList.add('premove-target');
   if(check&&checkedKing===sq)el.classList.add('in-check');
   if(ri===0){const c=document.createElement('span');c.className='coord rank';c.textContent=rank;el.append(c);}
   if(ri===7){const c=document.createElement('span');c.className='coord file';c.textContent=file;el.append(c);}
   if(piece){const span=document.createElement('span');span.className='piece '+(piece.color==='w'?'white':'black');span.textContent=glyph[piece.color+piece.type];el.append(span);}
   if(legal.some(m=>m.to===sq)){const mark=document.createElement('span');mark.className=piece?'capture-mark':'dot';el.append(mark);}
   else if(illegal.includes(sq)){const mark=document.createElement('span');mark.className=piece?'capture-mark illegal-capture':'dot illegal-dot';el.append(mark);}
   el.addEventListener('click',()=>clickSquare(sq));boardEl.append(el);
  }));
  renderMoves();document.getElementById('move-count').textContent=game.history().length;
  const over=game.game_over();
  if(over){
   if(game.in_checkmate()){setStatus('XEQUE-MATE! '+(game.turn()==='w'?'As pretas':'As brancas')+' venceram.','mate');}
   else if(game.in_stalemate())setStatus('Empate por afogamento.','');
   else if(game.in_draw())setStatus('Partida empatada.','');
   else setStatus('Partida encerrada.','');
  } else if(game.in_check())setStatus('XEQUE! O rei das '+(game.turn()==='w'?'brancas':'pretas')+' está ameaçado. Proteja o rei!','check');
  else if(started)setStatus('Vez das '+(game.turn()==='w'?'brancas':'pretas')+'.');
 }
 function renderMoves(){
  const h=game.history();if(!h.length){movesEl.innerHTML='<span style="color:#999">Os lances aparecerão aqui.</span>';return;}
  let out='';for(let i=0;i<h.length;i+=2)out+=`<div class="move-row"><span>${i/2+1}.</span><span>${h[i]||''}</span><span>${h[i+1]||''}</span></div>`;movesEl.innerHTML=out;
 }
 function clickSquare(sq){
  if(!started||game.game_over())return;if(godMode){summonPiece(sq);return;}
  const piece=game.get(sq),mode=document.getElementById('game-mode').value;
  const isMyTurn=mode==='computer'?game.turn()==='w':true;
  if(mode==='computer'&&(game.turn()==='b'||isBotThinking))return;
  if(mode==='local'&&game.turn()!==(piece?.color||game.turn())){
   if(premoveDraft){const from=premoveDraft,to=sq,candidates=pseudoTargets(from);if(candidates.includes(to)){premove={from,to,color:game.get(from)?.color};premoveDraft=null;selected=null;legal=[];illegal=[];document.getElementById('premove-hint').hidden=false;setStatus('Pré-move preparado. Ele será executado automaticamente se continuar legal.');render();return;}premoveDraft=null;selected=null;legal=[];illegal=[];render();return;}
   if(piece&&piece.color!==game.turn()){premoveDraft=sq;selected=sq;setStatus('Escolha a casa de destino para preparar o pré-move.');render();return;}
   selected=null;legal=[];illegal=[];render();return;
  }
  if(selected&&legal.some(m=>m.to===sq)){const opts=legal.filter(m=>m.to===sq);if(opts.some(m=>m.promotion)){showPromotion(opts);return;}makeMove({from:selected,to:sq});return;}
  if(selected&&illegal.includes(sq)){const moving=game.get(selected);setStatus('Movimento bloqueado: '+pieceName[moving.type]+' cravado(a) ou este lance deixaria seu rei em xeque.','check');return;}
  if(piece&&piece.color===game.turn()){selected=sq;refreshMoves();}
  else {selected=null;legal=[];illegal=[];}
  render();
 }
 function showPromotion(opts){
  const wrap=document.getElementById('promotion'),box=document.getElementById('promo-options');box.innerHTML='';
  ['q','r','b','n'].forEach(t=>{const b=document.createElement('button');b.textContent=glyph[game.turn()+t];b.onclick=()=>{wrap.classList.remove('show');makeMove({from:selected,to:opts[0].to,promotion:t});};box.append(b);});
  wrap.classList.add('show');
 }
 async function makeMove(move){
  const result=game.move(move);if(!result)return;selected=null;legal=[];illegal=[];render();
  await persistLastMove(result);
  if(game.game_over()){await finishSavedGame();return;}
  if(clockOn)startClock();
  if(premove&&premove.color===game.turn()){const pm=premove;premove=null;document.getElementById('premove-hint').hidden=true;const valid=game.moves({square:pm.from,verbose:true}).find(m=>m.to===pm.to);if(valid){setStatus('Pré-move executado.');setTimeout(()=>makeMove({from:pm.from,to:pm.to,promotion:valid.promotion||undefined}),80);return;}else setStatus('Pré-move cancelado: a jogada deixou de ser legal.');}if(document.getElementById('game-mode').value==='computer'&&game.turn()==='b')setTimeout(botMove,220);
 }
 function evaluatePosition(){
  const values={p:100,n:320,b:335,r:500,q:900,k:20000};let score=0;
  const board=game.board();for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(!p)continue;let v=values[p.type];
   if(p.type==='p')v+=p.color==='w'?(6-r)*7:r*7;
   if(p.type==='n'||p.type==='b')v+=12-(Math.abs(3.5-c)+Math.abs(3.5-r))*4;
   score+=p.color==='w'?v:-v;
  }return score;
 }
 function searchBot(depth,alpha,beta,maximizing){
  if(depth===0||game.game_over())return evaluatePosition();
  const moves=game.moves({verbose:true});if(maximizing){let best=-Infinity;for(const m of moves){game.move(m);best=Math.max(best,searchBot(depth-1,alpha,beta,false));game.undo();alpha=Math.max(alpha,best);if(beta<=alpha)break;}return best;}
  let best=Infinity;for(const m of moves){game.move(m);best=Math.min(best,searchBot(depth-1,alpha,beta,true));game.undo();beta=Math.min(beta,best);if(beta<=alpha)break;}return best;
 }
 async function botMove(){
  if(!started||game.game_over()||game.turn()!=='b'||isBotThinking)return;isBotThinking=true;setStatus('O computador está pensando…');
  const depth=Number(document.getElementById('bot-level').value)||2,moves=game.moves({verbose:true});let best=null,bestScore=Infinity;
  for(const m of moves){game.move(m);const score=searchBot(depth-1,-Infinity,Infinity,true);game.undo();if(score<bestScore){bestScore=score;best=m;}}
  isBotThinking=false;if(best)await makeMove({from:best.from,to:best.to,promotion:best.promotion});
 }
 async function persistLastMove(move){
  if(!savedGameId||!user)return;const history=game.history({verbose:true}),last=history[history.length-1];
  saveQueue=saveQueue.then(async()=>{
   const {error}=await supabase.from('game_moves').insert({game_id:savedGameId,ply:history.length,color:last.color==='w'?'white':'black',san:last.san,uci:last.from+last.to+(last.promotion||''),fen_after:game.fen(),clock_remaining_seconds:last.color==='w'?whiteTime:blackTime});
   if(error){console.error(error);document.getElementById('cloud-status').textContent='Falha ao salvar lance';return;}
   await supabase.from('games').update({move_count:history.length,final_fen:game.fen(),pgn:game.pgn()}).eq('id',savedGameId);
  });await saveQueue;
 }
 async function abandonSavedGame(){if(savedGameId&&user){await saveQueue;await supabase.from('games').update({status:'abandoned',result:'abandoned',termination:'restart',finished_at:new Date().toISOString(),final_fen:game.fen(),pgn:game.pgn(),move_count:game.history().length}).eq('id',savedGameId);loadHistory();}savedGameId=null;}
 async function createSavedGame(){
  savedGameId=null;if(!user)return;const mode=document.getElementById('game-mode').value;
  const seconds=Number(document.getElementById('time-control').value)||0;
  const {data,error}=await supabase.from('games').insert({created_by:user.id,mode,status:'in_progress',time_control_seconds:seconds,initial_fen:game.fen()}).select('id').single();
  if(error){console.error(error);document.getElementById('cloud-status').textContent='Não foi possível salvar';return;}
  savedGameId=data.id;const {error:pe}=await supabase.from('game_players').insert({game_id:savedGameId,user_id:user.id,color:'white',player_type:'human'});
  if(pe)console.warn(pe);document.getElementById('cloud-status').textContent='☁ Partida salva na nuvem';
 }
 async function finishSavedGame(){
  if(!savedGameId||!user)return;let result='draw',termination='draw';
  if(game.in_checkmate()){result=game.turn()==='w'?'black_win':'white_win';termination='checkmate';}
  else if(game.in_stalemate())termination='stalemate';else if(game.in_draw())termination='draw';
  const {error}=await supabase.from('games').update({status:'completed',result,termination,final_fen:game.fen(),pgn:game.pgn(),move_count:game.history().length,finished_at:new Date().toISOString()}).eq('id',savedGameId);
  if(error)console.error(error);else{document.getElementById('cloud-status').textContent='☁ Resultado salvo';loadHistory();loadProfile();}
 }
 async function loadHistory(){
  const list=document.getElementById('history-list'),hint=document.getElementById('history-hint');if(!user){hint.textContent='Entre na sua conta para ver suas partidas salvas.';list.innerHTML='';return;}
  hint.textContent='Carregando suas partidas…';const {data,error}=await supabase.from('games').select('id,mode,status,result,termination,time_control_seconds,move_count,created_at,pgn,initial_fen').eq('created_by',user.id).order('created_at',{ascending:false}).limit(30);
  if(error){hint.textContent='Não foi possível carregar o histórico: '+error.message;return;}hint.textContent=data.length+' partidas encontradas.';
  list.innerHTML=data.length?data.map(g=>`<div class="history-item"><strong>${g.mode==='computer'?'🤖 Contra o computador':'♟ Partida local'} · ${g.status==='completed'?'Finalizada':'Em andamento'}</strong><span>${new Date(g.created_at).toLocaleString('pt-BR')} · ${g.move_count} lances · ${g.result||'Sem resultado'}</span><br><button class="small" data-pgn="${encodeURIComponent(g.pgn||'')}">Copiar PGN</button><button class="small" data-replay="${g.id}" data-fen="${encodeURIComponent(g.initial_fen||'')}">Abrir tabuleiro</button></div>`).join(''):'<p class="subtext">Você ainda não tem partidas salvas. Entre em uma partida para começar seu histórico.</p>';
  list.querySelectorAll('[data-pgn]').forEach(b=>b.onclick=()=>{const pgn=decodeURIComponent(b.dataset.pgn);if(!pgn)return alert('Esta partida ainda não possui lances.');navigator.clipboard?.writeText(pgn);alert('PGN copiado para a área de transferência.');});
  list.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>replayGame(b.dataset.replay,decodeURIComponent(b.dataset.fen)));
 }
 async function replayGame(id,fen){
  const {data,error}=await supabase.from('game_moves').select('san').eq('game_id',id).order('ply',{ascending:true});
  if(error){alert('Não foi possível abrir a partida: '+error.message);return;}
  const replay=new Chess(fen||undefined);for(const m of (data||[])){if(!replay.move(m.san)){alert('O histórico contém um lance inválido e não pode ser reproduzido.');return;}}
  game=replay;savedGameId=null;started=false;selected=null;legal=[];illegal=[];godMode=false;document.body.classList.add('playing');clearInterval(clockTimer);render();setStatus('Replay carregado: '+(data?.length||0)+' lances. Use Desfazer para percorrer a partida para trás.');document.querySelector('[data-tab="new"]').click();
 }
 async function loadProfile(){
  const view=document.getElementById('profile-view');if(!user){view.innerHTML='<p class="subtext">Entre para ver seu perfil e estatísticas.</p>';return;}
  const [{data:profile},{data:games}]=await Promise.all([supabase.from('profiles').select('display_name,username,rating,country_code').eq('id',user.id).maybeSingle(),supabase.from('games').select('result,status').eq('created_by',user.id)]);
  const completed=(games||[]).filter(g=>g.status==='completed'&&g.result);const st={games_played:completed.length,wins:completed.filter(g=>g.result==='white_win').length,losses:completed.filter(g=>g.result==='black_win').length,draws:completed.filter(g=>g.result==='draw').length};view.innerHTML=`<h3>${escapeHtml(profile?.display_name||user.email||'Jogador')}</h3><p class="subtext">@${escapeHtml(profile?.username||'jogador')} · Rating inicial ${profile?.rating||800}</p><div class="profile-grid"><div class="profile-stat"><b>${st.games_played}</b><span>PARTIDAS</span></div><div class="profile-stat"><b>${st.wins}</b><span>VITÓRIAS</span></div><div class="profile-stat"><b>${st.losses}</b><span>DERROTAS</span></div><div class="profile-stat"><b>${st.draws}</b><span>EMPATES</span></div></div>`;
 }
 function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 async function refreshAccount(){
  const {data}=await supabase.auth.getSession();user=data.session?.user||null;
  document.getElementById('account-label').textContent=user?(user.user_metadata?.display_name||user.email):'Visitante';
  document.getElementById('account-open').textContent=user?'Minha conta / Sair':'Entrar / Criar conta';
  loadHistory();loadProfile();
 }
 function showAuth(){document.getElementById('auth-modal').classList.add('show');}
 function hideAuth(){document.getElementById('auth-modal').classList.remove('show');}
 function setAuthMode(mode){authMode=mode;document.getElementById('auth-title').textContent=mode==='signup'?'Criar sua conta':mode==='login'?'Entrar no Chess Arena':mode==='newpassword'?'Definir nova senha':'Recuperar senha';document.getElementById('auth-name').parentElement.style.display=mode==='signup'?'block':'none';document.getElementById('auth-email').parentElement.style.display=mode==='newpassword'?'none':'block';document.getElementById('auth-email').required=mode!=='newpassword';document.getElementById('auth-password').parentElement.style.display=mode==='reset'?'none':'block';document.getElementById('auth-password').required=mode!=='reset';document.getElementById('auth-submit').textContent=mode==='signup'?'Criar conta':mode==='login'?'Entrar':mode==='newpassword'?'Salvar nova senha':'Enviar link de recuperação';document.getElementById('auth-toggle').textContent=mode==='signup'?'Já tenho conta':'Criar conta / Entrar';document.getElementById('auth-message').textContent='';}
 document.getElementById('account-open').onclick=async()=>{if(user){if(confirm('Deseja sair da sua conta?')){await supabase.auth.signOut();await refreshAccount();}return;}setAuthMode('login');showAuth();};
 document.getElementById('auth-close').onclick=hideAuth;
 document.getElementById('auth-toggle').onclick=()=>setAuthMode(authMode==='login'?'signup':'login');
 document.getElementById('auth-reset').onclick=()=>setAuthMode('reset');
 document.getElementById('auth-form').onsubmit=async e=>{e.preventDefault();const email=document.getElementById('auth-email').value.trim(),password=document.getElementById('auth-password').value,name=document.getElementById('auth-name').value.trim(),msg=document.getElementById('auth-message');msg.textContent='Aguarde…';let res;
  if(authMode==='signup')res=await supabase.auth.signUp({email,password,options:{data:{display_name:name||email.split('@')[0]}}});
  else if(authMode==='login')res=await supabase.auth.signInWithPassword({email,password});
  else if(authMode==='reset')res=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  else if(authMode==='newpassword')res=await supabase.auth.updateUser({password});
  if(res.error){msg.textContent=res.error.message;return;}if(authMode==='signup'&&!res.data.session){msg.textContent='Cadastro criado! Verifique seu e-mail para confirmar a conta.';return;}if(authMode==='reset'){msg.textContent='Se o e-mail estiver cadastrado, enviaremos um link de recuperação.';return;}if(authMode==='newpassword'){msg.textContent='Senha alterada com sucesso!';setTimeout(hideAuth,900);return;}msg.textContent='Conta conectada!';await refreshAccount();setTimeout(hideAuth,650);
 };
 supabase.auth.onAuthStateChange((event,session)=>{user=session?.user||null;document.getElementById('account-label').textContent=user?(user.user_metadata?.display_name||user.email):'Visitante';document.getElementById('account-open').textContent=user?'Minha conta / Sair':'Entrar / Criar conta';document.getElementById('public-user-label').textContent=user?'Bem-vindo de volta':'Jogue gratuitamente';if(user){document.getElementById('public-home').hidden=true;document.getElementById('player-home').hidden=false;refreshDashboard();}else{document.getElementById('player-home').hidden=true;if(!document.body.classList.contains('in-game'))document.getElementById('public-home').hidden=false;}if(event==='PASSWORD_RECOVERY'){setAuthMode('newpassword');showAuth();document.getElementById('auth-message').textContent='Defina sua nova senha.';}});

 function summonPiece(square){
  const color=document.getElementById('god-color').value,type=document.getElementById('god-piece').value;
  const piece=game.get(square);if(piece)game.remove(square);
  if(type==='k'){
   const oldKing=kingSquare(color);if(oldKing)game.remove(oldKing);
  }
  const ok=game.put({type,color},square);
  if(!ok){
   if(piece)game.put(piece,square);
   setStatus('Não foi possível colocar essa peça nessa casa. Tente outra posição.','check');return;
  }
  selected=null;legal=[];illegal=[];started=true;document.body.classList.add('playing');
  setStatus(glyph[color+type]+' '+pieceName[type].toUpperCase()+' invocado(a) em '+square.toUpperCase()+'. Modo Deus ativo.');
  render();
 }
 function startClock(){
  clearInterval(clockTimer);clockTimer=setInterval(()=>{
   if(game.turn()==='w')whiteTime--;else blackTime--;updateClocks();
   if(whiteTime<=0||blackTime<=0){clearInterval(clockTimer);setStatus('Tempo esgotado!');started=false;if(savedGameId&&user){const result=whiteTime<=0?'black_win':'white_win';supabase.from('games').update({status:'completed',result,termination:'timeout',finished_at:new Date().toISOString(),final_fen:game.fen(),pgn:game.pgn(),move_count:game.history().length}).eq('id',savedGameId).then(()=>{loadHistory();loadProfile();});}}
  },1000);
 }
 function updateClocks(){document.getElementById('white-clock').textContent=format(whiteTime);document.getElementById('black-clock').textContent=format(blackTime);}
 function format(t){if(!t)return '∞';return Math.floor(Math.max(0,t)/60)+':'+String(Math.max(0,t)%60).padStart(2,'0');}
 document.getElementById('start-btn').onclick=async()=>{await abandonSavedGame();init();if(!game)return;started=true;document.body.classList.add('playing');clockOn=whiteTime>0;setStatus(document.getElementById('game-mode').value==='computer'?'Partida contra o computador iniciada. Você joga com as brancas.':'Partida local iniciada — brancas jogam primeiro.');if(clockOn)startClock();await createSavedGame();};
 document.getElementById('reset-btn').onclick=async()=>{await abandonSavedGame();init();};
 document.getElementById('cancel-premove').onclick=()=>{premove=null;premoveDraft=null;selected=null;document.getElementById('premove-hint').hidden=true;render();setStatus('Pré-move cancelado.');};
 document.getElementById('undo-btn').onclick=()=>{if(!game||!game.history().length)return;game.undo();started=true;document.body.classList.add('playing');selected=null;legal=[];illegal=[];render();};
 document.getElementById('flip-btn').onclick=()=>{flipped=!flipped;render();};
 document.getElementById('god-toggle').onclick=()=>{
  godMode=!godMode;selected=null;legal=[];illegal=[];
  const b=document.getElementById('god-toggle');b.classList.toggle('active',godMode);
  b.textContent=godMode?'✦ MODO DEUS: ATIVADO':'✦ MODO DEUS: DESATIVADO';
  document.getElementById('god-hint').textContent=godMode?'Clique em qualquer casa para invocar a peça escolhida. A peça existente será substituída.':'Ative o Modo Deus e clique em qualquer casa para colocar a peça escolhida. A peça que já estiver na casa será substituída.';
  if(godMode){started=true;document.body.classList.add('playing');setStatus('Modo Deus ativado. Escolha cor e peça e clique em uma casa do tabuleiro.');}
  else setStatus('Modo Deus desativado. As regras normais de xadrez voltaram.');
  render();
 };
 document.getElementById('custom-btn').onclick=()=>setStatus('Desafio personalizado: use o Modo Deus para montar posições e cenários personalizados.');
 document.getElementById('friend-btn').onclick=()=>setStatus('Jogar com um amigo: por enquanto, compartilhe o mesmo computador e alternem os lances. Convites online serão uma etapa futura.');
 document.getElementById('tournament-btn').onclick=()=>setStatus('Torneios ainda não estão disponíveis neste protótipo.');
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');['new','games','players'].forEach(t=>document.getElementById(t+'-panel').hidden=t!==b.dataset.tab);if(b.dataset.tab==='games')loadHistory();if(b.dataset.tab==='players')loadProfile();});
 ['back-new','back-new2'].forEach(id=>document.getElementById(id).onclick=()=>document.querySelector('[data-tab="new"]').click());
 document.getElementById('history-refresh').onclick=loadHistory;document.getElementById('profile-refresh').onclick=loadProfile;

 function showGame(){document.body.classList.add('in-game');document.querySelectorAll('.site-shell').forEach(x=>x.hidden=true);document.getElementById('game-app').style.display='grid';}
 function showPlayerView(view){document.body.classList.remove('in-game');document.getElementById('public-home').hidden=true;document.getElementById('player-home').hidden=false;document.getElementById('game-app').style.display='none';document.querySelectorAll('.dashboard-view').forEach(x=>x.hidden=true);const target=document.getElementById(view+'-view');if(target)target.hidden=false;document.querySelectorAll('.side-link[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));if(view==='history'){loadHistory();document.getElementById('dashboard-history-full').innerHTML=document.getElementById('history-list').innerHTML;}if(view==='profile'){loadProfile().then(()=>document.getElementById('dashboard-profile').innerHTML=document.getElementById('profile-view').innerHTML);}if(view==='dashboard')refreshDashboard();}
 function refreshDashboard(){if(!user)return;const name=user.user_metadata?.display_name||user.email?.split('@')[0]||'jogador';document.getElementById('dashboard-greeting').textContent='Olá, '+name+'!';supabase.from('games').select('id,mode,status,result,move_count,created_at').eq('created_by',user.id).order('created_at',{ascending:false}).limit(5).then(({data,error})=>{const box=document.getElementById('dashboard-history');if(error){box.textContent='Não foi possível carregar o histórico.';return;}box.innerHTML=data?.length?data.map(g=>'<div class="history-item"><strong>'+(g.mode==='computer'?'🤖 Contra o bot':'♟ Partida local')+'</strong><span>'+new Date(g.created_at).toLocaleDateString('pt-BR')+' · '+g.move_count+' lances</span></div>').join(''):'<p class="subtext">Sem partidas por enquanto. Sua primeira partida começa agora!</p>';const done=(data||[]).filter(g=>g.status==='completed');document.getElementById('dashboard-stats').innerHTML='<div class="profile-grid"><div class="profile-stat"><b>'+done.length+'</b><span>PARTIDAS RECENTES</span></div><div class="profile-stat"><b>'+(data||[]).reduce((a,g)=>a+(g.move_count||0),0)+'</b><span>LANCES REGISTRADOS</span></div></div>';});}
 function openGame(mode){document.getElementById('game-mode').value=mode;document.getElementById('time-control').value=document.getElementById('dashboard-time')?.value||'600';showGame();document.getElementById('start-btn').click();}
 document.getElementById('public-login').onclick=()=>{setAuthMode('login');showAuth();};
 document.getElementById('public-signup').onclick=()=>{setAuthMode('signup');showAuth();};
 document.getElementById('hero-play').onclick=()=>{if(user)showPlayerView('dashboard');else{setAuthMode('signup');showAuth();}};
 document.getElementById('bottom-signup').onclick=()=>{setAuthMode('signup');showAuth();};
 document.getElementById('hero-learn').onclick=()=>document.querySelector('.feature-strip').scrollIntoView({behavior:'smooth'});
 document.getElementById('dashboard-start').onclick=()=>openGame('computer');
 document.getElementById('dashboard-bot').onclick=()=>openGame('computer');
 document.getElementById('dashboard-local').onclick=()=>openGame('local');
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showPlayerView(b.dataset.view)));
 document.getElementById('sidebar-logout').onclick=async()=>{await supabase.auth.signOut();document.getElementById('player-home').hidden=true;document.getElementById('public-home').hidden=false;};
 document.getElementById('dashboard-account').onclick=()=>showPlayerView('profile');
 document.getElementById('back-dashboard').onclick=()=>{clearInterval(clockTimer);document.body.classList.remove('in-game');document.getElementById('game-app').style.display='none';document.getElementById('player-home').hidden=!user;document.getElementById('public-home').hidden=!!user;if(user)showPlayerView('dashboard');};
 
 refreshAccount();init();
})();
