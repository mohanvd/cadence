export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast${toast.fading ? ' toast--fading' : ''}`}>
      {toast.message}
    </div>
  );
}
