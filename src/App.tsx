import { useEffect, useRef, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import { uploadData, getUrl } from 'aws-amplify/storage';
import { get } from 'aws-amplify/api';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import type { Schema } from '../amplify/data/resource';
import './App.css';

const client = generateClient<Schema>();
type Photo = Schema['Photo']['type'];

type ApiView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'profile'; email: string; groups: string[]; time: string }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string };

/* ---------- one polaroid ---------- */
function PhotoCard({ photo, index }: { photo: Photo; index: number }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let alive = true;
    getUrl({ path: photo.s3Key })
      .then((r) => {
        if (alive) setUrl(r.url.toString());
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [photo.s3Key]);

  const tilt = [-2.2, 1.6, -1, 2.4, -1.8, 1.1][index % 6];

  return (
    <figure
      className="polaroid"
      style={
        {
          '--tilt': `${tilt}deg`,
          '--delay': `${Math.min(index, 8) * 70}ms`,
        } as React.CSSProperties
      }
    >
      <div className="polaroid-photo">
        {url ? (
          <img src={url} alt={photo.caption ?? 'Uploaded photo'} />
        ) : (
          <div className="shimmer" />
        )}
      </div>
      <figcaption>{photo.caption ?? ''}</figcaption>
    </figure>
  );
}

/* ---------- signed-in screen ---------- */
function Gallery({ signOut }: { signOut?: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const [apiView, setApiView] = useState<ApiView>({ kind: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);

  // GraphQL (AppSync): live list of photos
  useEffect(() => {
    const sub = client.models.Photo.observeQuery().subscribe({
      next: ({ items }) =>
        setPhotos(
          [...items].sort((a, b) =>
            (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
          ),
        ),
      error: (e) => console.error(e),
    });
    return () => sub.unsubscribe();
  }, []);

  // Who am I + which Cognito groups am I in
  useEffect(() => {
    let alive = true;
    (async () => {
      const [attrs, session] = await Promise.all([
        fetchUserAttributes(),
        fetchAuthSession(),
      ]);
      if (!alive) return;
      setName(attrs.name ?? attrs.email ?? 'friend');
      const g = session.tokens?.idToken?.payload['cognito:groups'];
      setGroups(
        Array.isArray(g)
          ? g.map(String).filter((x) => x === 'Admins' || x === 'Users')
          : [],
      );
    })().catch(console.error);
    return () => {
      alive = false;
    };
  }, []);

  // S3 upload + save metadata through GraphQL
  async function uploadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setMessage('Please choose an image file (JPG, PNG, WebP or GIF).');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `pictures/${Date.now()}-${safe}`;
      await uploadData({
        path,
        data: file,
        options: { contentType: file.type },
      }).result;
      await client.models.Photo.create({
        s3Key: path,
        caption: caption.trim() || file.name.replace(/\.[^.]+$/, ''),
      });
      setCaption('');
      setMessage('Saved to your gallery.');
    } catch (err) {
      console.error(err);
      setMessage('Upload failed. Check your connection and try again.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // REST (API Gateway + Lambda) with the Cognito ID token
  async function callRest(route: 'stats' | 'admin') {
    setApiView({ kind: 'loading' });
    try {
      const token = (await fetchAuthSession()).tokens?.idToken?.toString();
      const res = await get({
        apiName: 'photoApi',
        path: route,
        options: { headers: { Authorization: token ?? '' } },
      }).response;
      const body = (await res.body.json()) as {
        email?: string;
        groups?: string;
        serverTime?: string;
      };
      const names = String(body.groups ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x === 'Admins' || x === 'Users');
      setApiView({
        kind: 'profile',
        email: body.email ?? '',
        groups: names,
        time: body.serverTime ?? '',
      });
    } catch (err) {
      const status = (err as { response?: { statusCode?: number } }).response
        ?.statusCode;
      if (status === 403) {
        setApiView({
          kind: 'denied',
          message:
            'This page is for admins only. Your account is in the Users group.',
        });
      } else {
        setApiView({
          kind: 'error',
          message: 'The API could not be reached. Try again in a moment.',
        });
      }
    }
  }

  const isAdmin = groups.includes('Admins');

  return (
    <main className="shell">
      <div className="blobs" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>

      <header className="top">
        <div>
          <h1 className="brand">Petal Gallery</h1>
          <p className="hello">
            Hi, {name || '…'}!{' '}
            {isAdmin ? 'You are an admin 👑' : 'Welcome back 🌷'}
          </p>
          <p className="chips">
            {groups.map((g) => (
              <span className="chip" key={g}>
                {g}
              </span>
            ))}
          </p>
        </div>
        <button className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <section
        className={`drop ${dragging ? 'is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void uploadFile(f);
        }}
      >
        <p className="drop-title">
          {busy ? 'Uploading your photo…' : 'Drop a photo here'}
        </p>
        <input
          className="caption"
          placeholder="Add a caption (optional)"
          value={caption}
          maxLength={80}
          onChange={(e) => setCaption(e.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
        <button
          className="btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Uploading…' : 'Choose a photo'}
        </button>
        <p className="msg" role="status">
          {message}
        </p>
      </section>

      {photos.length === 0 ? (
        <p className="empty">No photos yet. Upload your first one above.</p>
      ) : (
        <section className="grid">
          {photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i} />
          ))}
        </section>
      )}

      <section className="api">
        <h2>Secure API check</h2>
        <p>
          These buttons call the REST API, which only answers signed-in users.
        </p>
        <div className="row">
          <button className="btn small" onClick={() => void callRest('stats')}>
            My profile (/stats)
          </button>
          <button
            className="btn small ghost"
            onClick={() => void callRest('admin')}
          >
            Admin only (/admin)
          </button>
        </div>
        {apiView.kind !== 'idle' && (
          <div className={`api-result ${apiView.kind}`} role="status">
            {apiView.kind === 'loading' && <p>Asking the API…</p>}
            {apiView.kind === 'profile' && (
              <>
                <p className="api-title">The API recognised you 🌷</p>
                <dl>
                  <dt>Email</dt>
                  <dd>{apiView.email}</dd>
                  <dt>Groups</dt>
                  <dd>
                    {apiView.groups.length
                      ? apiView.groups.map((g) => (
                          <span className="chip" key={g}>
                            {g}
                          </span>
                        ))
                      : 'none'}
                  </dd>
                  <dt>Server time</dt>
                  <dd>{new Date(apiView.time).toLocaleString()}</dd>
                </dl>
              </>
            )}
            {apiView.kind === 'denied' && (
              <>
                <p className="api-title">Access denied 🔒</p>
                <p>{apiView.message}</p>
              </>
            )}
            {apiView.kind === 'error' && (
              <>
                <p className="api-title">Something went wrong</p>
                <p>{apiView.message}</p>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------- sign-in screen ---------- */
const authComponents = {
  Header() {
    return (
      <div className="auth-header">
        <span className="auth-flower" aria-hidden="true">
          🌸
        </span>
        <h1 className="brand">Petal Gallery</h1>
        <p>Sign in to collect your favourite moments.</p>
      </div>
    );
  },
};

export default function App() {
  return (
    <div className="auth-wrap">
      <div className="blobs" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>
      <Authenticator socialProviders={['google']} components={authComponents}>
        {({ signOut }) => <Gallery signOut={signOut} />}
      </Authenticator>
    </div>
  );
}
