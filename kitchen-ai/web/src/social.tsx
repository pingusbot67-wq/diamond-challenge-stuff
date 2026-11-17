// Community feed, posting, and recipe import screens.
import { Fragment, h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { minutesLabel } from '../../src/lib/format.ts';
import { aiMessage, importRecipe } from './ai.ts';
import { REPORTS_TO_HIDE, cleanHandle, isClean, loadFeed, publish, report, saveSocial, setLiked, unpublish, type FeedState, type Post } from './community.ts';
import type { Recipe, WebProfile } from './runtime.ts';
import { Banner, Btn, Chip, Dish, Empty, Field, Loading } from './ui.tsx';

void Fragment;

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const Heart = ({ on }: { on: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
  </svg>
);

const FILTERS: [string, string, (r: Recipe) => boolean][] = [
  ['protein', '30g+ protein', (r) => r.macros.protein_g >= 30],
  ['light', 'Under 500 kcal', (r) => r.macros.kcal < 500],
  ['quick', '20 min or less', (r) => r.minutes <= 20],
  ['glp1', 'GLP-1 friendly', (r) => r.glp1_friendly],
];

export function Feed({ savedIds, onOpen, onCook, onToggleSave }: { savedIds: Set<string>; onOpen: (r: Recipe) => void; onCook: (r: Recipe) => void; onToggleSave: (r: Recipe) => Promise<void> }) {
  const [state, setState] = useState<FeedState | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'all' | 'following'>('all');
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [filters, setFilters] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = () => {
    setError(false);
    loadFeed().then(setState).catch(() => setError(true));
  };
  useEffect(load, []);

  const posts = useMemo(() => {
    if (!state) return [];
    const blocked = new Set(state.social.blocked);
    const following = new Set(state.social.following);
    return state.posts
      .filter((p) => !p.reported && p.reports < REPORTS_TO_HIDE && !blocked.has(p.uid))
      .filter((p) => tab === 'all' || following.has(p.uid))
      .filter((p) => filters.every((f) => FILTERS.find(([id]) => id === f)![2](p.recipe)))
      .sort((a, b) => (sort === 'popular' ? b.likes - a.likes || b.at - a.at : b.at - a.at));
  }, [state, tab, sort, filters]);

  if (error) return <div class="content"><Banner tone="danger">The feed didn’t load. Check your connection.</Banner><Btn kind="secondary" size="md" onClick={load}>Try again</Btn></div>;
  if (!state) return <div class="content"><Loading title="Loading the feed…" /></div>;

  const patch = (key: string, f: (p: Post) => Post) => setState((s) => (s ? { ...s, posts: s.posts.map((p) => (p.key === key ? f(p) : p)) } : s));
  const fail = () => setNote('That didn’t save. Check your connection and try again.');

  const like = (p: Post) => {
    if (!state.online) return setNote('Likes need your Claude account storage, which isn’t available in this view.');
    patch(p.key, (x) => ({ ...x, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) }));
    setLiked(p.key, !p.liked).catch(() => (patch(p.key, () => p), fail()));
  };
  const setSocial = (next: FeedState['social']) => {
    const prev = state.social;
    setState((s) => (s ? { ...s, social: next } : s));
    saveSocial(next).catch(() => (setState((s) => (s ? { ...s, social: prev } : s)), fail()));
  };
  const follow = (p: Post) => {
    const on = state.social.following.includes(p.uid);
    setSocial({ ...state.social, following: on ? state.social.following.filter((x) => x !== p.uid) : [...state.social.following, p.uid] });
  };

  return (
    <div class="content stack-lg">
      <div class="page-head">
        <h1 class="h-display">The <em>feed.</em></h1>
        <p class="soft">What people are cooking right now.</p>
      </div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'all'} class={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>For you</button>
        <button type="button" role="tab" aria-selected={tab === 'following'} class={tab === 'following' ? 'on' : ''} onClick={() => setTab('following')}>Following</button>
      </div>
      <div class="chips scroll-x">
        <Chip label={sort === 'new' ? 'Newest' : 'Most liked'} on onClick={() => setSort(sort === 'new' ? 'popular' : 'new')} />
        {FILTERS.map(([id, label]) => (
          <Chip key={id} label={label} on={filters.includes(id)} onClick={() => setFilters(filters.includes(id) ? filters.filter((x) => x !== id) : [...filters, id])} />
        ))}
      </div>
      {note ? <Banner tone="warn">{note}</Banner> : null}
      {!state.online ? <Banner>You’re seeing Test Kitchen recipes. Posting and likes need your Claude account storage.</Banner> : null}

      {posts.length === 0 ? (
        tab === 'following' ? (
          <Empty icon="👀" title="Nobody here yet" body="Follow a cook from the For you tab and their posts will show up here." action={{ label: 'Browse For you', onClick: () => setTab('all') }} />
        ) : (
          <Empty icon="🍳" title="Nothing matches" body="Try removing a filter." action={{ label: 'Clear filters', onClick: () => setFilters([]) }} />
        )
      ) : (
        <div class="feed">
          {posts.map((p, i) => {
            const r = p.recipe;
            const following = state.social.following.includes(p.uid);
            const saved = savedIds.has(r.id);
            return (
              <article key={p.key} class="post rise" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}>
                <header class="post-head">
                  <span class={`avatar${p.house ? ' house' : ''}`} aria-hidden="true">{p.handle[0]?.toUpperCase()}</span>
                  <span class="post-who">
                    <span class="body-strong">@{p.handle}</span>
                    <span class="caption faint">{p.house ? 'Kitchen AI test kitchen' : p.mine ? `You · ${ago(p.at)}` : ago(p.at)}</span>
                  </span>
                  {!p.mine && state.online ? (
                    <button type="button" class={`follow${following ? ' on' : ''}`} aria-pressed={following} onClick={() => follow(p)}>{following ? 'Following' : 'Follow'}</button>
                  ) : null}
                  {!p.house && !p.mine && state.online ? (
                    <button type="button" class="more" aria-label="More options" aria-expanded={menu === p.key} onClick={() => setMenu(menu === p.key ? null : p.key)}>⋯</button>
                  ) : null}
                </header>
                {menu === p.key ? (
                  <div class="post-menu">
                    <Btn kind="secondary" size="md" onClick={() => {
                      setMenu(null);
                      patch(p.key, (x) => ({ ...x, reported: true }));
                      report(p.key).catch(fail);
                      setNote('Thanks. You won’t see that post again, and we’ll review it.');
                    }}>Report post</Btn>
                    <Btn kind="secondary" size="md" onClick={() => {
                      setMenu(null);
                      setSocial({ following: state.social.following.filter((x) => x !== p.uid), blocked: [...state.social.blocked, p.uid] });
                      setNote(`You blocked @${p.handle}.`);
                    }}>Block @{p.handle}</Btn>
                  </div>
                ) : null}
                <button type="button" class="post-main" onClick={() => onOpen(r)} aria-label={`Open ${r.title}`}>
                  <div class="post-art"><Dish r={r} animated={i < 3} /></div>
                  <span class="post-title">{r.title}</span>
                  <span class="post-stats num">
                    <b>{r.macros.protein_g}g</b> protein<i>·</i>{r.macros.kcal} kcal<i>·</i>{minutesLabel(r.minutes)}
                  </span>
                </button>
                {p.caption ? <p class="post-caption">{p.caption}</p> : null}
                {r.credit?.name || r.credit?.url ? <p class="caption faint">Recipe credit: {r.credit.name ?? 'original creator'}</p> : null}
                <footer class="post-actions">
                  <button type="button" class={`act${p.liked ? ' on' : ''}`} aria-pressed={p.liked} aria-label={p.liked ? 'Unlike' : 'Like'} onClick={() => like(p)}>
                    <Heart on={p.liked} />
                    <span class="num">{p.likes}</span>
                  </button>
                  <button type="button" class={`act${saved ? ' on' : ''}`} aria-pressed={saved} onClick={() => onToggleSave(r).catch(fail)}>{saved ? 'Saved' : 'Save'}</button>
                  <Btn size="md" onClick={() => onCook(r)}>Cook this</Btn>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── post a recipe ─────────────────────────
export function PublishPanel({ r }: { r: Recipe }) {
  const [state, setState] = useState<FeedState | null>(null);
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [caption, setCaption] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    loadFeed().then((s) => (setState(s), setHandle(s.myHandle ?? ''))).catch(() => {});
  }, []);
  if (!state || r.origin === 'house') return null;
  const posted = state.posts.some((p) => p.mine && p.recipe.id === r.id);

  async function post() {
    setMsg(null);
    const hnd = cleanHandle(handle);
    if (hnd.length < 3) return setMsg({ tone: 'danger', text: 'Pick a handle with at least 3 letters or numbers.' });
    if (!isClean(hnd) || !isClean(caption) || !isClean(r.title)) return setMsg({ tone: 'danger', text: 'Please keep the handle, caption and title friendly.' });
    if (state!.posts.some((p) => !p.mine && !p.house && p.handle === hnd) || hnd === 'testkitchen' || hnd === 'kitchenai') return setMsg({ tone: 'danger', text: 'That handle is taken. Try another.' });
    if (!agree) return setMsg({ tone: 'danger', text: 'Please agree to the community rules first.' });
    setBusy(true);
    try {
      await publish(r, caption.trim(), hnd);
      setState(await loadFeed());
      setOpen(false);
      setMsg({ tone: 'ok', text: 'Posted. Find it in the Community tab.' });
    } catch {
      setMsg({ tone: 'danger', text: 'That didn’t post. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  if (!state.online || !state.canPost) return <Banner>Posting to the community isn’t available in this view.</Banner>;
  return (
    <section class="card stack-md" aria-label="Community">
      {posted ? (
        <>
          <p class="body-strong">This recipe is on the community feed.</p>
          <Btn kind="secondary" size="md" busy={busy} onClick={async () => {
            setBusy(true);
            await unpublish(r.id).catch(() => {});
            setState(await loadFeed().catch(() => state));
            setBusy(false);
            setMsg({ tone: 'ok', text: 'Removed from the feed.' });
          }}>Remove my post</Btn>
        </>
      ) : !open ? (
        <>
          <p class="body-strong">Made it? Share it.</p>
          <p class="caption soft">Post this recipe to the community feed so other people can cook it.</p>
          <Btn kind="secondary" size="md" onClick={() => setOpen(true)}>Post to community</Btn>
        </>
      ) : (
        <>
          <Field id="handle" label="Your handle" value={handle} onInput={(v) => setHandle(cleanHandle(v))} placeholder="proteinqueen" />
          <Field id="caption" label="Caption (optional)" value={caption} onInput={(v) => setCaption(v.slice(0, 200))} placeholder="Tastes better than takeout." />
          {r.credit?.name || r.credit?.url ? <p class="caption soft">Credit to {r.credit.name ?? 'the original creator'} is shown on the post.</p> : null}
          <label class="check" for="agree">
            <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree((e.target as HTMLInputElement).checked)} />
            <span class="caption">I agree to the community rules: post only your own cooking or credited recipes, and nothing hateful, unsafe or spammy. Posts can be reported and removed.</span>
          </label>
          <div class="row-2">
            <Btn kind="secondary" size="md" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn size="md" busy={busy} onClick={post}>Post</Btn>
          </div>
        </>
      )}
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
    </section>
  );
}

// ───────────────────────── import a recipe ─────────────────────────
export function ImportScreen({ p, aiOk, onDone }: { p: WebProfile; aiOk: boolean | null; onDone: (r: Recipe) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    if (text.trim().length < 40) return setError('Paste the recipe text first: the caption, transcript, or ingredients and steps.');
    if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) return setError('That link doesn’t look right. It should start with https://');
    setBusy(true);
    try {
      onDone(await importRecipe(text, { name, url }, p));
    } catch (e) {
      setError(aiMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <div class="content"><Loading title="Building your walkthrough…" sub="Reading the recipe, working out the macros, adding timers and safe temperatures." /></div>;
  return (
    <>
      <div class="content stack-xl">
        <div class="page-head">
          <h1 class="h-display">Import a <em>recipe.</em></h1>
          <p class="soft">Paste a recipe from a video caption, a transcript, or any website. You’ll get a step-by-step walkthrough with real macros.</p>
        </div>
        <label class="field" for="import-text">
          <span class="field-label">Recipe text</span>
          <textarea id="import-text" class="textarea" rows={8} value={text} placeholder="Paste the caption, transcript, or ingredients and steps here…" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        </label>
        <Field id="import-url" label="Link to the original (optional)" value={url} onInput={setUrl} placeholder="https://www.tiktok.com/@…" inputMode="text" />
        <Field id="import-name" label="Creator (optional)" value={name} onInput={setName} placeholder="@creator" />
        <Banner>We can’t open videos from here yet, so we read the text you paste. The creator’s name and link stay on the recipe as credit.</Banner>
        {aiOk === false ? <Banner tone="warn">Importing works when this page is open on claude.ai while you’re signed in.</Banner> : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
      <div class="footer-bar">
        <Btn full disabled={aiOk === false} onClick={run}>Build my walkthrough</Btn>
      </div>
    </>
  );
}
