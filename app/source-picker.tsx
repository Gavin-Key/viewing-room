'use client';
import { useEffect, useState } from 'react';
import { readNasResponse } from '@/lib/nas-response';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { HardDrive, Monitor, Plus, X } from 'lucide-react';
export type Connection = {
  id: string;
  name: string;
  root: string;
  username: string;
  remembered: boolean;
  defaultPath?: string;
  isDefault?: boolean;
};
export function SourcePicker({
  open,
  onClose,
  onLocal,
  onNas,
}: {
  open: boolean;
  onClose: () => void;
  onLocal: () => void;
  onNas: (connection: Connection) => Promise<void>;
}) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    // Network shares are opt-in on the server; hidden until it reports them enabled.
    [sharesEnabled, setSharesEnabled] = useState(false);
  const [root, setRoot] = useState(''),
    [name, setName] = useState('My NAS'),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  useEffect(() => {
    if (open) {
      setError('');
      fetch('/__nas/connections')
        .then(async (r) => {
          // No entry server (e.g. `npm run dev`): treat shares as unavailable.
          if (!(r.headers.get('content-type') || '').includes('json'))
            return { connections: [], enabled: false };
          return readNasResponse<{
            connections: Connection[];
            enabled?: boolean;
          }>(r);
        })
        .then((data) => {
          if (!Array.isArray(data.connections))
            throw Error(
              'The NAS connection list is unavailable. Reload the viewer and try again.',
            );
          setSharesEnabled(data.enabled !== false);
          setConnections(data.connections);
        })
        .catch((e) => setError(e.message));
    }
  }, [open]);
  async function browse(c: Connection) {
    setBusy(true);
    setError('');
    try {
      await onNas(c);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open share');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/__nas/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, root, username, password }),
      });
      const data = await readNasResponse<{ connection: Connection }>(r);
      if (!data.connection?.id)
        throw Error('The NAS connection could not be saved. Please try again.');
      setConnections((cs) => [
        ...cs.filter((c) => c.id !== data.connection.id),
        data.connection,
      ]);
      setPassword('');
      setEditing(false);
      await onNas(data.connection);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save connection');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="spatial-menu source-dialog">
        <DialogTitle>Open Folder</DialogTitle>
        <DialogDescription>
          {sharesEnabled
            ? 'Choose this device or a saved NAS connection.'
            : 'Choose a folder on this device.'}
        </DialogDescription>
        <div className="source-list">
          <div className="source-row">
            <button
              disabled={busy}
              onClick={() => {
                onClose();
                onLocal();
              }}
            >
              <Monitor size={24} />
              <span>
                <strong>This device</strong>
                <small>Pick a folder; nothing is uploaded</small>
              </span>
            </button>
          </div>
          {connections.length > 0 && <h3>Saved connections</h3>}
          {connections.map((c) => (
            <div className="source-row" key={c.id}>
              <button disabled={busy} onClick={() => void browse(c)}>
                <HardDrive size={24} />
                <span>
                  <strong>
                    {c.name}
                    {c.isDefault ? ' (default)' : ''}
                  </strong>
                  <small>
                    {c.root}
                    {c.defaultPath ? ' / ' + c.defaultPath : ''}
                  </small>
                </span>
              </button>
              <button
                className="forget"
                aria-label={'Forget ' + c.name}
                disabled={busy}
                onClick={async () => {
                  try {
                    const r = await fetch(
                      '/__nas/connections?id=' + encodeURIComponent(c.id),
                      { method: 'DELETE' },
                    );
                    await readNasResponse(r);
                    setConnections((cs) => cs.filter((v) => v.id !== c.id));
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Could not forget connection.',
                    );
                  }
                }}
              >
                Forget
              </button>
            </div>
          ))}
        </div>
        {sharesEnabled && (
        <button
          className="source-add"
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
        >
          {editing ? <X size={20} /> : <Plus size={20} />}
          {editing ? 'Cancel new connection' : 'Add NAS connection'}
        </button>
        )}
        {sharesEnabled && editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="settings-grid"
          >
            <label>
              Connection name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              Share path
              <input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="\\NAS\Photos"
                required
              />
            </label>
            <label>
              Username (optional)
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Password (optional)
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p className="hint">
              Leave credentials blank to use Windows access on this PC. Saved
              passwords are encrypted by Windows on this PC.
            </p>
            <button className="primary" disabled={busy}>
              Connect and save
            </button>
          </form>
        )}
        {busy && <p role="status">Connecting...</p>}
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
