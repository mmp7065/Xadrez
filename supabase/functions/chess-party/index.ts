import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { Chess } from "npm:chess.js@1.4.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
async function requireUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Faça login para usar as festas.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sua sessão expirou. Entre novamente.");
  return data.user;
}
async function notifyParty(partyId: string, event: string, extra: Record<string, unknown> = {}) {
  const channel = admin.channel("party:" + partyId, { config: { private: true } });
  try { await channel.send({ type: "broadcast", event: "party_event", payload: { event, ...extra, at: Date.now() } }); }
  finally { await admin.removeChannel(channel); }
}

type AbilityMap = { white: Record<string,string>; black: Record<string,string> };
function visualMapFromFen(fen: string): Record<string,string> {
  const ranks = fen.split(" ")[0].split("/"), out: Record<string,string> = {};
  for (let r=0;r<8;r++) { let file=0; for (const ch of ranks[r]) { if (/^[1-8]$/.test(ch)) file += Number(ch); else { out[String.fromCharCode(97+file)+(8-r)] = ch.toLowerCase(); file++; } } }
  return out;
}
function encodeFenBoard(cells: string[][]): string {
  return cells.map(row => { let s="",empty=0; for (const p of row) { if (!p) empty++; else { if (empty) s+=empty; s+=p; empty=0; } } if (empty) s+=empty; return s; }).join("/");
}
function mapEngineFen(fen: string, abilities: AbilityMap, visual: Record<string,string>): string {
  const parts=fen.split(" "), rows=parts[0].split("/"), board:string[][]=[];
  for(let r=0;r<8;r++){const row:string[]=[];for(const ch of rows[r]){if(/^[1-8]$/.test(ch))for(let n=0;n<Number(ch);n++)row.push("");else row.push(ch);}board.push(row);}
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(!p)continue;const sq=String.fromCharCode(97+c)+(8-r),side=p===p.toUpperCase()?"white":"black",visualType=visual[sq]||p.toLowerCase(),ability=abilities?.[side]?.[visualType]||visualType;board[r][c]=side==="white"?ability.toUpperCase():ability;}
  parts[0]=encodeFenBoard(board);return parts.join(" ");
}
function applyVisualMove(visual: Record<string,string>, from: string, to: string, move: any): Record<string,string> {
  const next={...visual},moving=next[from]||move.piece||"p";delete next[from];
  if(move.flags?.includes("e"))delete next[to[0]+from[1]];
  if(move.flags?.includes("k")||move.flags?.includes("q")){
    const rank=from[1],rookFrom=move.flags.includes("k")?"h"+rank:"a"+rank,rookTo=move.flags.includes("k")?"f"+rank:"d"+rank;
    if(next[rookFrom]){next[rookTo]=next[rookFrom];delete next[rookFrom];}else next[rookTo]="r";
  }
  next[to]=move.promotion||moving;return next;
}

async function partyState(partyId: string) {
  const { data: party, error } = await admin.from("chess_parties").select("*").eq("id", partyId).single();
  if (error || !party) throw new Error("Festa não encontrada.");
  const { data: members } = await admin.from("chess_party_members").select("user_id,role,color_preference,assigned_color,joined_at,last_seen_at").eq("party_id", partyId).order("joined_at");
  const ids = (members || []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,username,display_name,avatar_url,rating,country_code").in("id", ids) : { data: [] };
  const roster = (members || []).map((m) => ({ ...m, profile: (profiles || []).find((p) => p.id === m.user_id) || null }));
  let game = null, moves: unknown[] = [];
  if (party.game_id) {
    const { data } = await admin.from("games").select("id,status,result,termination,time_control_seconds,initial_fen,final_fen,pgn,move_count,created_at").eq("id", party.game_id).maybeSingle();
    game = data;
    // Estado CHEAT é pequeno e carregado junto da festa; evita consultas por casa/lance.
    const { data: cheatState } = await admin.from("chess_party_cheat_state").select("piece_abilities,visual_positions,game_id,updated_at").eq("party_id",partyId).maybeSingle();
    const initialFen=String(game?.final_fen||game?.initial_fen||"");
    const validCheatState=cheatState?.game_id===party.game_id?cheatState:null;
    const visualPositions=validCheatState?.visual_positions && Object.keys(validCheatState.visual_positions).length ? validCheatState.visual_positions : visualMapFromFen(initialFen);
    game = game ? { ...game, piece_abilities: validCheatState?.piece_abilities || {white:{},black:{}}, visual_positions: visualPositions } : game;
    // Histórico é carregado separadamente; não buscar todos os lances a cada atualização.
    moves = [];
  }
  return { party, members: roster, game, moves };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "create") {
      const rawSeconds = Number(body.timeControlSeconds);
      const seconds = Number.isFinite(rawSeconds) ? Math.max(0, Math.min(86400, rawSeconds)) : 600;
      const preference = ["white", "black", "random"].includes(body.colorPreference) ? body.colorPreference : "random";
      let party = null, lastError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await admin.from("chess_parties").insert({
          code: makeCode(), host_user_id: user.id, time_control_seconds: seconds, color_preference: preference,
        }).select("*").single();
        if (!error) { party = data; break; }
        lastError = error;
      }
      if (!party) throw new Error(lastError?.message || "Não foi possível criar o código da festa.");
      const { error } = await admin.from("chess_party_members").insert({ party_id: party.id, user_id: user.id, role: "host", color_preference: preference });
      if (error) throw error;
      return json(await partyState(party.id));
    }
    if (action === "join") {
      const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("Digite um código de festa válido com 6 caracteres.");
      const { data: party, error } = await admin.from("chess_parties").select("*").eq("code", code).maybeSingle();
      if (error || !party || party.expires_at < new Date().toISOString()) throw new Error("Código inválido ou festa expirada.");
      if (party.status !== "waiting") throw new Error("Esta festa já começou ou foi encerrada.");
      const { data: existing } = await admin.from("chess_party_members").select("user_id").eq("party_id", party.id).eq("user_id", user.id).maybeSingle();
      if (!existing) {
        const { count } = await admin.from("chess_party_members").select("*", { count: "exact", head: true }).eq("party_id", party.id);
        if ((count || 0) >= 2) throw new Error("Esta festa já está cheia.");
        const preference = ["white", "black", "random"].includes(body.colorPreference) ? body.colorPreference : "random";
        const { error: joinError } = await admin.from("chess_party_members").insert({ party_id: party.id, user_id: user.id, role: "member", color_preference: preference });
        if (joinError) throw joinError;
      }
      return json(await partyState(party.id));
    }
    const partyId = String(body.partyId || "");
    if (!partyId) throw new Error("Festa não informada.");
    const { data: member } = await admin.from("chess_party_members").select("*").eq("party_id", partyId).eq("user_id", user.id).maybeSingle();
    if (!member) throw new Error("Você não participa desta festa.");
    if (action === "state") return json(await partyState(partyId));
    if (action === "configure") {
      const { data: party } = await admin.from("chess_parties").select("*").eq("id", partyId).single();
      if (party.host_user_id !== user.id) throw new Error("Somente o anfitrião pode alterar as configurações da festa.");
      if (party.status !== "waiting") throw new Error("As configurações só podem ser alteradas antes de começar a partida.");
      const rawSeconds = Number(body.timeControlSeconds);
      if (!Number.isFinite(rawSeconds) || rawSeconds < 0 || rawSeconds > 86400) throw new Error("Tempo de partida inválido.");
      const preference = ["white", "black", "random"].includes(body.colorPreference) ? body.colorPreference : "random";
      const { error: updateError } = await admin.from("chess_parties").update({ time_control_seconds: Math.floor(rawSeconds), color_preference: preference }).eq("id", partyId);
      if (updateError) throw updateError;
      const { error: memberError } = await admin.from("chess_party_members").update({ color_preference: preference }).eq("party_id", partyId).eq("user_id", user.id);
      if (memberError) throw memberError;
      const state = await partyState(partyId);
      await notifyParty(partyId, "settings_updated");
      return json(state);
    }
    if (action === "color") {
      if (member.role === "host") throw new Error("A preferência do anfitrião é definida ao criar a festa.");
      if ((await admin.from("chess_parties").select("status").eq("id", partyId).single()).data?.status !== "waiting") throw new Error("A partida já começou.");
      const pref = ["white", "black", "random"].includes(body.colorPreference) ? body.colorPreference : "random";
      const { error } = await admin.from("chess_party_members").update({ color_preference: pref }).eq("party_id", partyId).eq("user_id", user.id);
      if (error) throw error;
      const state = await partyState(partyId);
      await notifyParty(partyId, "settings_updated");
      return json(state);
    }
    if (action === "start") {
      const { data: party } = await admin.from("chess_parties").select("*").eq("id", partyId).single();
      if (party.host_user_id !== user.id) throw new Error("Somente o anfitrião pode iniciar a partida.");
      if (party.status !== "waiting") throw new Error("Esta festa não está aguardando uma partida.");
      const { data: roster } = await admin.from("chess_party_members").select("*").eq("party_id", partyId);
      if (!roster || roster.length !== 2) throw new Error("São necessários dois jogadores para começar.");
      const host = roster.find((m) => m.role === "host")!;
      const guest = roster.find((m) => m.role !== "host")!;
      let hostColor: "white" | "black";
      if (host.color_preference === "white") hostColor = "white";
      else if (host.color_preference === "black") hostColor = "black";
      else if (guest.color_preference === "white") hostColor = "black";
      else if (guest.color_preference === "black") hostColor = "white";
      else hostColor = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "white" : "black";
      const guestColor = hostColor === "white" ? "black" : "white";
      const { data: game, error: gameError } = await admin.from("games").insert({
        created_by: user.id, mode: "online", status: "in_progress",
        time_control_seconds: party.time_control_seconds, party_id: partyId,
        initial_fen: new Chess().fen(), final_fen: new Chess().fen(),
      }).select("id").single();
      if (gameError) throw gameError;
      const { error: playersError } = await admin.from("game_players").insert([
        { game_id: game.id, user_id: host.user_id, color: hostColor, player_type: "human" },
        { game_id: game.id, user_id: guest.user_id, color: guestColor, player_type: "human" },
      ]);
      if (playersError) throw playersError;
      await admin.from("chess_party_members").update({ assigned_color: hostColor }).eq("party_id", partyId).eq("user_id", host.user_id);
      await admin.from("chess_party_members").update({ assigned_color: guestColor }).eq("party_id", partyId).eq("user_id", guest.user_id);
      const { error: updateError } = await admin.from("chess_parties").update({ status: "in_game", game_id: game.id }).eq("id", partyId);
      if (updateError) throw updateError;
      return json(await partyState(partyId));
    }
    if (action === "rematch") {
      const { data: party } = await admin.from("chess_parties").select("*").eq("id", partyId).single();
      if (!party || party.status !== "finished" || !party.game_id) throw new Error("A revanche só pode ser solicitada após o fim da partida.");
      const { data: players } = await admin.from("game_players").select("user_id,color,player_type").eq("game_id", party.game_id).order("color");
      const { count: activeMembers } = await admin.from("chess_party_members").select("user_id", { count: "exact", head: true }).eq("party_id", partyId);
      if (activeMembers !== 2 || !players || players.length !== 2 || !players.some((p) => p.user_id === user.id)) throw new Error("Os dois jogadores precisam continuar na festa para pedir revanche.");
      let { data: request } = await admin.from("chess_party_rematches").select("*").eq("party_id", partyId).eq("previous_game_id", party.game_id).maybeSingle();
      if (!request) {
        const { data: inserted, error } = await admin.from("chess_party_rematches").insert({ party_id: partyId, previous_game_id: party.game_id, requested_by: user.id, status: "pending" }).select("*").single();
        if (error) throw error;
        request = inserted;
      } else if (request.status === "cancelled") {
        const { data: reopened, error } = await admin.from("chess_party_rematches").update({ requested_by: user.id, accepted_by: null, new_game_id: null, status: "pending", updated_at: new Date().toISOString() }).eq("id", request.id).eq("status", "cancelled").select("*").single();
        if (error) throw error;
        request = reopened;
      } else if (request.status === "started" && request.new_game_id) {
        return json({ status: "started", ...(await partyState(partyId)) });
      } else if (request.requested_by !== user.id) {
        throw new Error("Seu adversário já enviou um pedido. Aceite ou recuse a notificação.");
      }
      await notifyParty(partyId, "rematch_requested", { requestedBy: user.id, requestId: request.id });
      return json({ status: "pending", requestedBy: user.id, requestId: request.id });
    }
    if (action === "rematch_decline") {
      const { data: party } = await admin.from("chess_parties").select("game_id,status").eq("id", partyId).single();
      if (!party || party.status !== "finished" || !party.game_id) throw new Error("Esta partida não está aguardando revanche.");
      const { data: request } = await admin.from("chess_party_rematches").select("*").eq("party_id", partyId).eq("previous_game_id", party.game_id).eq("status", "pending").maybeSingle();
      if (!request || request.requested_by === user.id) throw new Error("Não existe um pedido de revanche do adversário para recusar.");
      const { error } = await admin.from("chess_party_rematches").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", request.id).eq("status", "pending");
      if (error) throw error;
      await notifyParty(partyId, "rematch_declined", { requestedBy: request.requested_by, declinedBy: user.id });
      return json({ status: "cancelled" });
    }
    if (action === "rematch_accept") {
      const { data: party } = await admin.from("chess_parties").select("*").eq("id", partyId).single();
      if (!party || party.status !== "finished" || !party.game_id) throw new Error("Esta partida não está aguardando revanche.");
      const { data: request } = await admin.from("chess_party_rematches").select("*").eq("party_id", partyId).eq("previous_game_id", party.game_id).eq("status", "pending").maybeSingle();
      if (!request || request.requested_by === user.id) throw new Error("Não existe um pedido de revanche pendente do adversário.");
      const { data: players } = await admin.from("game_players").select("user_id,color,player_type").eq("game_id", party.game_id).order("color");
      const { count: activeMembers } = await admin.from("chess_party_members").select("user_id", { count: "exact", head: true }).eq("party_id", partyId);
      if (activeMembers !== 2 || !players || players.length !== 2 || !players.some((p) => p.user_id === user.id)) throw new Error("Os dois jogadores precisam continuar na festa.");
      const { data: newGame, error: gameError } = await admin.from("games").insert({
        created_by: party.host_user_id, mode: "online", status: "in_progress", time_control_seconds: party.time_control_seconds, party_id: partyId,
        initial_fen: new Chess().fen(), final_fen: new Chess().fen(), move_count: 0
      }).select("id").single();
      if (gameError) throw gameError;
      const { error: playersError } = await admin.from("game_players").insert(players.map((p) => ({ game_id: newGame.id, user_id: p.user_id, color: p.color, player_type: p.player_type || "human" })));
      if (playersError) throw playersError;
      const { data: claimed, error: claimError } = await admin.from("chess_party_rematches").update({ accepted_by: user.id, status: "started", new_game_id: newGame.id, updated_at: new Date().toISOString() }).eq("id", request.id).eq("status", "pending").select("id").maybeSingle();
      if (claimError || !claimed) throw new Error("Este pedido já foi respondido. Atualize a festa.");
      const { data: updatedParty, error: partyError } = await admin.from("chess_parties").update({ game_id: newGame.id, status: "in_game" }).eq("id", partyId).eq("status", "finished").select("id").maybeSingle();
      if (partyError || !updatedParty) throw new Error("Não foi possível abrir a revanche. Atualize a festa.");
      await admin.from("chess_party_members").update({ assigned_color: null }).eq("party_id", partyId);
      for (const p of players) await admin.from("chess_party_members").update({ assigned_color: p.color }).eq("party_id", partyId).eq("user_id", p.user_id);
      const state = await partyState(partyId);
      await notifyParty(partyId, "rematch_started", { gameId: newGame.id });
      return json({ status: "started", ...state });
    }
    if (action === "exit_finished") {
      const { data: party } = await admin.from("chess_parties").select("status").eq("id", partyId).single();
      if (!party || party.status !== "finished") throw new Error("A festa ainda não terminou.");
      await admin.from("chess_party_members").delete().eq("party_id", partyId).eq("user_id", user.id);
      await notifyParty(partyId, "player_left", { userId: user.id });
      return json({ ok: true });
    }
    if (action === "set_ability") {
      const { data: party } = await admin.from("chess_parties").select("game_id,status,host_user_id").eq("id", partyId).single();
      if (!party?.game_id || party.status !== "in_game") throw new Error("A troca de função só funciona durante uma partida ativa.");
      if (party.host_user_id !== user.id || member.role !== "host") throw new Error("Somente o anfitrião pode alterar as habilidades.");
      const { data: seat } = await admin.from("chess_party_members").select("assigned_color").eq("party_id",partyId).eq("user_id",user.id).single();
      const targetColor=String(body.targetColor||"");
      const sourcePiece=String(body.sourcePiece||""), abilityPiece=String(body.abilityPiece||"");
      if (!["white","black"].includes(targetColor) || targetColor !== seat?.assigned_color) throw new Error("Você só pode alterar as peças da sua própria equipe.");
      if (!["p","n","b","r","q"].includes(sourcePiece) || !["p","n","b","r","q"].includes(abilityPiece)) throw new Error("Escolha peão, cavalo, bispo, torre ou dama. O rei mantém regras próprias de segurança e não pode ter a habilidade alterada.");
      const { data: row, error: readError } = await admin.from("games").select("id,final_fen,initial_fen").eq("id",party.game_id).single();
      if(readError||!row)throw new Error("Não foi possível carregar o tabuleiro.");
      const currentFen=String(row.final_fen||row.initial_fen),{data:existing}=await admin.from("chess_party_cheat_state").select("*").eq("party_id",partyId).maybeSingle();
      const validExisting=existing?.game_id===party.game_id?existing:null;
      const visual=validExisting?.visual_positions&&Object.keys(validExisting.visual_positions).length?validExisting.visual_positions:visualMapFromFen(currentFen);
      const abilities:AbilityMap=validExisting?.piece_abilities||{white:{},black:{}};
      const nextAbilities:AbilityMap={white:{...(abilities.white||{})},black:{...(abilities.black||{})}};
      if(abilityPiece===sourcePiece)delete nextAbilities[targetColor][sourcePiece];else nextAbilities[targetColor][sourcePiece]=abilityPiece;
      const nextFen=mapEngineFen(currentFen,nextAbilities,visual);
      const {error:updateError}=await admin.from("games").update({final_fen:nextFen}).eq("id",party.game_id);
      if(updateError)throw updateError;
      const now=new Date().toISOString();
      const statePayload={party_id:partyId,game_id:party.game_id,piece_abilities:nextAbilities,visual_positions:visual,created_by:user.id,updated_by:user.id,updated_at:now};
      const {error:stateError}=await admin.from("chess_party_cheat_state").upsert(statePayload,{onConflict:"party_id"});
      if(stateError)throw stateError;
      const {error:logError}=await admin.from("chess_party_cheat_actions").insert({party_id:partyId,game_id:party.game_id,actor_user_id:user.id,action_type:"change_ability",target_color:targetColor,source_piece:sourcePiece,ability_piece:abilityPiece,payload:{reset:abilityPiece===sourcePiece}});
      if(logError)throw logError;
      await notifyParty(partyId,"abilities_updated",{gameId:party.game_id,fen:nextFen,pieceAbilities:nextAbilities,visualPositions:visual,targetColor,sourcePiece,abilityPiece});
      return {ok:true,fen:nextFen,pieceAbilities:nextAbilities,visualPositions:visual,targetColor,sourcePiece,abilityPiece};
    }
    if (action === "god_edit") {
      const { data: party } = await admin.from("chess_parties").select("game_id,status,host_user_id").eq("id", partyId).single();
      if (!party?.game_id || party.status !== "in_game") throw new Error("O Modo Deus só funciona durante uma partida ativa.");
      if (party.host_user_id !== user.id || member.role !== "host") throw new Error("Somente o anfitrião pode usar o Modo Deus.");
      const square=String(body.square||""),color=String(body.color||""),type=String(body.pieceType||""),editAction=String(body.editAction||"replace");
      if(editAction!=="replace")throw new Error("Troca de função deve usar a ferramenta específica de habilidades.");
      if(!/^[a-h][1-8]$/.test(square)||!["w","b"].includes(color)||!["p","n","b","r","q","k"].includes(type))throw new Error("Peça ou casa inválida.");
      const {data:row,error:readError}=await admin.from("games").select("id,final_fen,initial_fen").eq("id",party.game_id).single();
      if(readError||!row)throw new Error("Não foi possível carregar o tabuleiro.");
      const currentFen=String(row.final_fen||row.initial_fen),{data:existing}=await admin.from("chess_party_cheat_state").select("*").eq("party_id",partyId).maybeSingle();
      const abilities:AbilityMap=existing?.game_id===party.game_id?(existing.piece_abilities||{white:{},black:{}}):{white:{},black:{}};
      const visual=existing?.game_id===party.game_id&&existing.visual_positions&&Object.keys(existing.visual_positions).length?existing.visual_positions:visualMapFromFen(currentFen);
      const visualFen=mapEngineFen(currentFen,{white:{},black:{}},visual),parts=visualFen.split(" "),rows=parts[0].split("/");
      const rankIndex=8-Number(square[1]),fileIndex=square.charCodeAt(0)-97;
      const decode=(rank:string)=>{const out:string[]=[];for(const ch of rank){if(/^[1-8]$/.test(ch))for(let n=0;n<Number(ch);n++)out.push("");else out.push(ch);}return out;};
      const board=rows.map(decode);
      if(board.length!==8||board.some(r=>r.length!==8))throw new Error("Estrutura do tabuleiro inválida.");
      if(type==="k")for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(board[r][c]===(color==="w"?"K":"k"))board[r][c]="";
      board[rankIndex][fileIndex]=color==="w"?type.toUpperCase():type;
      const encode=(cells:string[])=>{let out="",empty=0;for(const cell of cells){if(!cell)empty++;else{if(empty)out+=empty;out+=cell;empty=0;}}if(empty)out+=empty;return out;};
      parts[0]=board.map(encode).join("/");
      const nextVisualFen=parts.join(" "),nextVisual={...visual,[square]:type};
      const nextFen=mapEngineFen(nextVisualFen,abilities,nextVisual);
      const {error:updateError}=await admin.from("games").update({final_fen:nextFen}).eq("id",party.game_id);
      if(updateError)throw updateError;
      const {error:stateError}=await admin.from("chess_party_cheat_state").upsert({party_id:partyId,game_id:party.game_id,piece_abilities:abilities,visual_positions:nextVisual,created_by:user.id,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"party_id"});
      if(stateError)throw stateError;
      const {error:logError}=await admin.from("chess_party_cheat_actions").insert({party_id:partyId,game_id:party.game_id,actor_user_id:user.id,action_type:"create_piece",target_color:color==="w"?"white":"black",ability_piece:type,square,payload:{visual_piece:type}});
      if(logError)throw logError;
      await notifyParty(partyId,"board_overridden",{gameId:party.game_id,fen:nextFen,square,color,pieceType:type,visualPositions:nextVisual,pieceAbilities:abilities,changedBy:user.id});
      return {ok:true,fen:nextFen,visualPositions:nextVisual,pieceAbilities:abilities};
    }
    if (action === "move") {
      const { data: party } = await admin.from("chess_parties").select("game_id,status").eq("id", partyId).single();
      if (!party?.game_id || party.status !== "in_game") throw new Error("A partida não está ativa.");
      const { data: gameRow } = await admin.from("games").select("id,initial_fen,final_fen,move_count,time_control_seconds").eq("id", party.game_id).single();
      const { data: seat } = await admin.from("game_players").select("color").eq("game_id", party.game_id).eq("user_id", user.id).maybeSingle();
      if (!seat) throw new Error("Você não está nesta partida.");
      const expectedFen = gameRow.final_fen || gameRow.initial_fen;
      const chess = new Chess(expectedFen);
      const color = chess.turn() === "w" ? "white" : "black";
      if (seat.color !== color) throw new Error("Ainda não é sua vez.");
      const from = String(body.from || ""), to = String(body.to || "");
      if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) throw new Error("Movimento inválido.");
      const result = chess.move({ from, to, promotion: body.promotion || "q" });
      if (!result) throw new Error("Esse movimento não é permitido.");
      const {data:cheatState}=await admin.from("chess_party_cheat_state").select("piece_abilities,visual_positions,game_id").eq("party_id",partyId).maybeSingle();
      const validCheatState=cheatState?.game_id===party.game_id?cheatState:null;
      const visualBefore=validCheatState?.visual_positions&&Object.keys(validCheatState.visual_positions).length?validCheatState.visual_positions:visualMapFromFen(expectedFen);
      const visualAfter=applyVisualMove(visualBefore,from,to,result);
      const abilities:AbilityMap=validCheatState?.piece_abilities||{white:{},black:{}};
      const ply = (gameRow.move_count || 0) + 1;
      const { error: commitError } = await admin.rpc("commit_party_move", {
        p_party_id: partyId, p_game_id: party.game_id, p_user_id: user.id,
        p_expected_fen: expectedFen, p_fen_after: chess.fen(), p_san: result.san,
        p_uci: result.from + result.to + (result.promotion || ""), p_ply: ply,
        p_color: color, p_clock_remaining_seconds: Math.max(0, Number(body.clockRemainingSeconds) || 0),
      });
      if (commitError) throw new Error(commitError.message.includes("POSITION_OUTDATED") ? "A posição mudou. Sincronizando a partida…" : commitError.message);
      const {error:visualError}=await admin.from("chess_party_cheat_state").upsert({party_id:partyId,game_id:party.game_id,piece_abilities:abilities,visual_positions:visualAfter,created_by:user.id,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"party_id"});
      if(visualError)throw visualError;
      if (chess.isGameOver()) {
        let resultCode = "draw", termination = "draw";
        if (chess.isCheckmate()) { resultCode = color === "white" ? "white_win" : "black_win"; termination = "checkmate"; }
        else if (chess.isStalemate()) termination = "stalemate";
        else if (chess.isThreefoldRepetition()) termination = "threefold_repetition";
        else if (chess.isInsufficientMaterial()) termination = "insufficient_material";
        await admin.from("games").update({ status: "completed", result: resultCode, termination, finished_at: new Date().toISOString(), pgn: chess.pgn() }).eq("id", party.game_id);
        await admin.from("chess_parties").update({ status: "finished" }).eq("id", partyId);
      }
      const finished = chess.isGameOver();
      await notifyParty(partyId, "move_committed", {
        gameId: party.game_id, fen: chess.fen(), from, to, san: result.san, ply, color, visualPositions: visualAfter, pieceAbilities: abilities,
        status: finished ? "finished" : "in_game", promotion: result.promotion || null,
        result: finished ? (chess.isCheckmate() ? (color === "white" ? "white_win" : "black_win") : "draw") : null,
        termination: finished ? (chess.isCheckmate() ? "checkmate" : chess.isStalemate() ? "stalemate" : "draw") : null,
        clockRemainingSeconds: Math.max(0, Number(body.clockRemainingSeconds) || 0),
      });
      if (finished) await notifyParty(partyId, "game_finished", {
        gameId: party.game_id,
        result: chess.isCheckmate() ? (color === "white" ? "white_win" : "black_win") : "draw",
        termination: chess.isCheckmate() ? "checkmate" : chess.isStalemate() ? "stalemate" : "draw",
        fen: chess.fen()
      });
      return json({
        move: { from, to, san: result.san, fen: chess.fen(), ply, color, visualPositions: visualAfter, pieceAbilities: abilities },
        game: { id: party.game_id, status: finished ? "completed" : "in_progress", result: finished ? (chess.isCheckmate() ? (color === "white" ? "white_win" : "black_win") : "draw") : null, time_control_seconds: gameRow.time_control_seconds },
      });
    }
    if (action === "leave") {
      const { data: party } = await admin.from("chess_parties").select("status,host_user_id").eq("id", partyId).single();
      if (party.status !== "waiting") throw new Error("A partida já começou. Use Desistir na tela da partida.");
      await admin.from("chess_party_members").delete().eq("party_id", partyId).eq("user_id", user.id);
      if (party.host_user_id === user.id) await admin.from("chess_parties").update({ status: "cancelled" }).eq("id", partyId);
      return json({ ok: true });
    }
    throw new Error("Ação desconhecida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return json({ error: message }, 400);
  }
});
