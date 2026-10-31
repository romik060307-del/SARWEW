#!/usr/bin/env node
/** Static verification for the OHLI Social Android source. No server/account required. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}
function checkCssBraces(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let quote = null, escaped = false;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') stack.push(i);
    else if (ch === '}') {
      if (!stack.length) return false;
      stack.pop();
    }
  }
  return stack.length === 0 && quote === null;
}

const js = read('app/src/main/assets/ohli-social.js');
new vm.Script(js, {filename: 'ohli-social.js'});
check(true, 'JavaScript OHLI Social dapat diparse');

const html = read('app/src/main/assets/index.html');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]).filter((s) => s.trim());
for (let i = 0; i < inlineScripts.length; i += 1) new vm.Script(inlineScripts[i], {filename: `index-inline-${i + 1}.js`});
check(inlineScripts.length > 0, `${inlineScripts.length} skrip inline HTML dapat diparse`);
check(checkCssBraces(read('app/src/main/assets/ohli-social.css')), 'Kurung blok CSS seimbang');

const java = read('app/src/main/java/com/rk/server/ServerService.java');
for (const [needle, message] of [
  ['/api/activity/history', 'endpoint riwayat server tersedia'],
  ['/api/social/users', 'endpoint penemuan akun Social terpisah dari Chat tersedia'],
  ['private void getChatUsers', 'endpoint daftar Chat memakai serializer nomor privat'],
  ['private void getSocialUsers', 'endpoint daftar Social memakai ID publik'],
  ['boolean allowed=u!=null', 'pencarian nomor menggunakan hasil izin akses'],
  ['&&canDirectMessage(me.optString("phone"),phone)', 'pencarian nomor tidak mengungkap akun yang melarang DM'],
  ['ohli-activity-history.json', 'riwayat memiliki penyimpanan server'],
  ['/api/status/collections', 'endpoint koleksi Story tersedia'],
  ['/api/status/delete', 'penghapusan Story milik sendiri tersedia'],
  ['/api/groups/delete', 'penghapusan grup oleh pemilik tersedia'],
  ['/api/channels/delete', 'penghapusan Channel oleh pemilik tersedia'],
  ['ohli-story-collections.json', 'pin/arsip Story memiliki penyimpanan server'],
  ['/api/messages/once/open', 'endpoint klaim teks sekali lihat tersedia'],
  ['viewOnceSessionKey', 'media 1× memiliki kunci sesi server'],
  ['if(!onceSessionKey.matches("[a-fA-F0-9]{32}"))', 'media 1× menolak permintaan tanpa kunci sesi'],
  ['safe.put("text","")', 'isi teks 1× disamarkan dari daftar chat penerima'],
  ['r.put("phone",id)', 'API Social mengganti nomor dengan ID publik stabil'],
  ['/api/groups/vote', 'endpoint pemungutan suara grup tersedia'],
  ['/api/channels/react', 'endpoint reaksi Channel tersedia'],
  ['canDirectMessage(sender,recipient)', 'aturan DM diperiksa di server saat pengiriman'],
]) {
  if (!message) continue;
  check(java.includes(needle), message);
}
const postSerializer = java.slice(java.indexOf('private JSONObject publicPost'), java.indexOf('private double socialPostRank'));
check(postSerializer.includes('p.put("author",authorUser==null?"":socialId(authorUser))'), 'nomor penulis postingan tidak bocor bahkan kepada pemiliknya');
check(postSerializer.includes('sc.put("phone",cu==null?"":socialId(cu))') && postSerializer.includes('sl.put("phone",lu==null?"":socialId(lu))') && postSerializer.includes('sr.put("phone",ru==null?"":socialId(ru))'), 'nomor pemberi komentar, like, dan repost disamarkan');
check(java.includes('row.put("repostedBy",repostUser==null?"":socialId(repostUser))'), 'penanda repost tidak mengembalikan nomor akun sendiri');
check(java.includes('safeComment.put("phone",socialId(me))') && java.includes('p.put("authorName",authorUser.optString("name","Pengguna OHLI"))') && java.includes('else{p.put("authorName","Pengguna OHLI");}'), 'respons komentar dan nama penulis Social disanitasi');
check(java.includes('publicStatus.put("phone",socialId(me))') && java.includes('safeHighlight.put("owner",socialId(me))'), 'respons publik pembuatan Story dan Sorotan tidak membocorkan nomor');
const channelSerializer = java.slice(java.indexOf('private JSONObject publicChannelPost'), java.indexOf('private void getChannelPosts'));
check(channelSerializer.includes('p.put("author",author==null?"":socialId(author))') && channelSerializer.includes('sr.put("phone",ru==null?"":socialId(ru))'), 'nomor penulis dan pemberi reaksi Channel selalu disamarkan');
check(java.includes('safe.put("sender",senderUser==null?"":socialId(senderUser))') && java.includes('safe.put("name",senderUser==null?"Pengguna OHLI":senderUser.optString("name","Pengguna OHLI"))'), 'respons Grup menampilkan ID sosial dan nama aman');
const statusSerializer = java.slice(java.indexOf('private void getStatuses'), java.indexOf('private void getImage'));
check(statusSerializer.includes('safe.put("phone",statusOwner==null?"":socialId(statusOwner))') && statusSerializer.includes('sl.put("phone",lu==null?"":socialId(lu))'), 'nomor pemilik dan pemberi like Story Social selalu disamarkan');
const socialUi = read('app/src/main/assets/ohli-social.js');
check(socialUi.includes("rt.request('/api/social/users')") && !socialUi.includes("rt.request('/api/users')"), 'UI Social tidak lagi meminta daftar nomor telepon Chat');
check(socialUi.includes('(s.isMine||s.phone===me.phone)') && socialUi.includes("var freshStories=await rt.request('/api/status?surface=social')"), 'UI Story mengenali Story sendiri tanpa mengandalkan nomor telepon');
check(socialUi.includes('isMine:items.some(function(s){return s.isMine===true;})') && socialUi.includes('isMine = !!p.isMine || p.author === me.phone') && socialUi.includes('var allowed=!!c.isMine||!!p.isMine'), 'UI feed, Story, dan komentar memakai penanda isMine saat nomor disamarkan');
const onceOpen = java.slice(java.indexOf('private void openViewOnceMessage'), java.indexOf('private void markMessagesRead'));
check(onceOpen.includes('viewOnceOpenedAt') && onceOpen.includes('410'), 'klaim kedua teks 1× ditolak server');
const media = java.slice(java.indexOf('private void getMedia'), java.indexOf('private void getImage'));
check(media.includes('viewOnceSessionKey') && media.includes('10L*60L*1000L') && media.includes('Cache-Control: no-store'), 'media 1× mendukung Range untuk sesi yang sama dan no-store');
const poll = java.slice(java.indexOf('private void voteGroupPoll'), java.indexOf('private JSONObject publicChannelPost'));
check(poll.indexOf('if(!validOption)') < poll.indexOf('option.put("votes",next)'), 'poll memvalidasi opsi sebelum mengubah suara');
const channelReact = java.slice(java.indexOf('private void toggleChannelReaction'), java.indexOf('private void createChannelPost'));
check(channelReact.includes('!\"public\".equals(channel.optString(\"privacy\"') && channelReact.includes('followers'), 'reaksi Channel memeriksa akses Channel privat');

const gradle = read('app/build.gradle');
check(gradle.includes("versionCode 23") && gradle.includes("versionName '3.2.0'"), 'identitas build Android sesuai v3.2.0');
const smoke = read('tools/smoke-test.mjs');
for (const [needle, message] of [
  ["'/api/social/users'", 'tes integrasi memeriksa direktori Social tanpa nomor'],
  ["'/api/activity/history'", 'tes integrasi memeriksa riwayat lintas sesi'],
  ["'/api/status/collections'", 'tes integrasi memeriksa pin dan arsip Story'],
  ["'/api/messages/once/open'", 'tes integrasi memeriksa klaim View Once dari sesi kedua'],
  ["'/api/groups/vote'", 'tes integrasi memeriksa polling grup'],
  ["'/api/channels/react'", 'tes integrasi memeriksa reaksi Channel'],
  ["'/api/groups/delete'", 'tes integrasi membersihkan grup uji'],
  ["'/api/channels/delete'", 'tes integrasi membersihkan Channel uji'],
]) check(smoke.includes(needle), message);
const workflow = read('.github/workflows/build-apk.yml');
check(workflow.includes('OHLI-Social-Source-v3.2.0.zip'), 'workflow GitHub Actions memprioritaskan arsip v3.2.0');
console.log(`\nLulus ${passed} pemeriksaan statis. Ini bukan pengganti build APK atau tes runtime pada dua perangkat.`);
