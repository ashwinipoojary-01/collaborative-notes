import Modal from './Modal';

const text = (html) => {
  const div = document.createElement('div');
  div.innerHTML = (html || '').replace(/<\/(p|h[1-6]|li|blockquote|pre)>/gi, '$&\n');
  return div.innerText || div.textContent || '';
};

export default function ConflictModal({ open, onClose, remote, local, onUseTheirs, onKeepMine }) {
  if (!remote) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Compare versions"
      footer={
        <>
          <button className="btn-secondary" onClick={onUseTheirs}>Use their version</button>
          <button className="btn-primary" onClick={onKeepMine}>Keep my version</button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        {remote.updatedBy?.name ? `${remote.updatedBy.name} saved` : 'Someone saved'} a newer version (v{remote.version}) while you had unsaved edits.
        Choose which version to keep — the other will be replaced. Copy anything you need first.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: 'Their version', data: remote },
          { label: 'Your version', data: local },
        ].map(({ label, data }) => (
          <div key={label} className="flex flex-col rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700">{label}</div>
            <div className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 text-sm">
              <p className="mb-2 font-semibold">{data.title || 'Untitled'}</p>
              <p className="text-slate-600 dark:text-slate-400">{text(data.content) || <em>Empty</em>}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
