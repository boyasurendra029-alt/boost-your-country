// Vercel serverless function: reads a YouTube live chat so friends only need to paste their live link.
// Default: YouTube's public live-chat endpoint (no API key, no quota).
// Optional fallback: set env var YT_API_KEY in Vercel to also use the official YouTube Data API.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' };

function pickCont(lc) {
  const c = (lc.continuations || [])[0] || {};
  const d = c.invalidationContinuationData || c.timedContinuationData || c.reloadContinuationData || {};
  return { c: d.continuation, wait: d.timeoutMs };
}

function textOf(r) {
  return ((r.message && r.message.runs) || [])
    .map((x) => x.text || (x.emoji && !x.emoji.isCustomEmoji ? x.emoji.emojiId || '' : ''))
    .join('');
}

async function init(v) {
  const r = await fetch('https://www.youtube.com/live_chat?is_popout=1&v=' + v, { headers: H });
  const html = await r.text();
  const m = html.match(/window\["ytInitialData"\]\s*=\s*(\{.+?\});\s*<\/script>/s) ||
            html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) throw new Error('Could not open the chat. Is the stream live and chat turned on?');
  const data = JSON.parse(m[1]);
  const lc = data.contents && data.contents.liveChatRenderer;
  if (!lc) throw new Error('No live chat found for this video.');
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const cv = (html.match(/"clientVersion":"([^"]+)"/) || [])[1] || '2.20240601.00.00';
  const { c, wait } = pickCont(lc);
  if (!key || !c) throw new Error('Chat is not readable right now.');
  return { m: 'i', c, k: key, cv, wait };
}

async function poll(s) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=' + s.k + '&prettyPrint=false', {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: s.cv, hl: 'en', gl: 'US' } },
      continuation: s.c,
    }),
  });
  if (!r.ok) throw new Error('YouTube replied ' + r.status);
  const j = await r.json();
  const lc = j.continuationContents && j.continuationContents.liveChatContinuation;
  if (!lc) throw new Error('The live chat has ended.');
  const msgs = [];
  for (const a of lc.actions || []) {
    const it = a.addChatItemAction && a.addChatItemAction.item;
    if (!it) continue;
    const t = it.liveChatTextMessageRenderer, p = it.liveChatPaidMessageRenderer;
    const x = t || p;
    if (!x) continue;
    const th = (x.authorPhoto && x.authorPhoto.thumbnails) || [];
    msgs.push({
      id: x.id,
      a: ((x.authorName && x.authorName.simpleText) || 'viewer').replace(/^@/, ''),
      t: textOf(x),
      ph: th.length ? th[th.length - 1].url : '',
      paid: p ? (p.purchaseAmountText && p.purchaseAmountText.simpleText) || '1' : '',
    });
  }
  const { c, wait } = pickCont(lc);
  return { s: { ...s, c: c || s.c }, msgs, wait };
}

// ---- optional official API fallback ----
async function initApi(v) {
  const key = process.env.YT_API_KEY;
  const j = await (await fetch('https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=' + v + '&key=' + key)).json();
  const id = j.items && j.items[0] && j.items[0].liveStreamingDetails && j.items[0].liveStreamingDetails.activeLiveChatId;
  if (!id) throw new Error('No active live chat found for this video.');
  return { m: 'a', id, pt: '' };
}
async function pollApi(s) {
  const key = process.env.YT_API_KEY;
  const u = 'https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=' + s.id +
    '&part=snippet,authorDetails&maxResults=200&key=' + key + (s.pt ? '&pageToken=' + s.pt : '');
  const j = await (await fetch(u)).json();
  if (j.error) throw new Error(j.error.message);
  const msgs = (j.items || []).map((i) => ({
    id: i.id,
    a: (i.authorDetails.displayName || 'viewer').replace(/^@/, ''),
    t: i.snippet.displayMessage || '',
    ph: i.authorDetails.profileImageUrl || '',
    paid: i.snippet.superChatDetails ? i.snippet.superChatDetails.amountDisplayString || '1' : '',
  }));
  return { s: { ...s, pt: j.nextPageToken }, msgs, wait: j.pollingIntervalMillis || 5000 };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (!b.s) {
      const v = /^[\w-]{11}$/.test(b.v || '') ? b.v : null;
      if (!v) return res.status(200).json({ e: 'That does not look like a YouTube video link.' });
      let s;
      try { s = await init(v); }
      catch (e) { if (process.env.YT_API_KEY) s = await initApi(v); else throw e; }
      return res.status(200).json({ s, msgs: [], wait: 1500 });
    }
    const out = b.s.m === 'a' ? await pollApi(b.s) : await poll(b.s);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ e: String(e.message || e) });
  }
};
