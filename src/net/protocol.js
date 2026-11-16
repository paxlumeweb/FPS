// Network protocol reference. Messages are small JSON objects with a short type tag `t`.
// (R) = sent on the reliable channel, (U) = unreliable/unordered channel.
//
// client -> host
//   hello (R) {v, name, lo}            join request: protocol version, display name, loadout
//   c     (U) {c:[[q,b,f,s,yaw,pitch,sel],...], rt, pg}   input commands (+ recent ones again for loss
//                                      protection), the server time the client was rendering, its ping
//   lo    (R) {lo}                     loadout change (applies on next spawn)
//   team  (R) {team}                   team switch request (lobby only)
//   pi    (R) {c}                      ping (sent every second; also the keep-alive)
//   bye   (R) {}                       leaving (tab closed / left the room)
//   set   (R) {s}   go (R)   stop (R)  lobby settings / start match / end match   (host player only)
//
// host -> client
//   no      (R) {reason}               join refused          bye (R) {reason}  host closed the room
//   welcome (R) {id, code}
//   lobby   (R) {phase, settings, pl:[[id,name,team,bot,isHost],...]}
//   start   (R) {map, settings, ph, tm, cd, tl}   load the map and enter the match
//   s       (U) {n, tm, p:[[id,x,y,z,yaw,pitch,flags,hp,weapon],...], g:[[id,x,y,z],...],
//                y:[ackSeq, packedOwnState, hp, protection, respawnIn, spawnYaw]}   snapshot (30 Hz)
//   sc      (R) {teams, pl:[[id,k,d,a,score,tier,ping,hs],...], tl, ph, cd}        scores + clock
//   k (R) kill   h (R) hit confirm   d (R) damage taken   x (R) XP award   b (R) explosion
//   f (U) shot fired by someone else   m (U) melee swing   nb (U) grenade bounce
//   ph (R) phase change   end (R) match result   po (R) pong   tolobby (R) back to the lobby
export const PROTOCOL_DOC = true;
