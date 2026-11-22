import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * Модальные окна админки вместо window.confirm / window.prompt.
 * Использование:
 *   const dialog = useAdminDialog();
 *   if (!(await dialog.confirm('Закрыть голосование?'))) return;
 *   const values = await dialog.form({ title: '...', fields: [...] });
 *   ...
 *   return <>{dialog.element}...</>;
 */

export type DialogField =
  | { type: 'text' | 'textarea'; name: string; label: string; initial?: string; required?: boolean; maxLength?: number; placeholder?: string }
  | { type: 'select'; name: string; label: string; options: string[]; initial?: string }
  | { type: 'checkbox'; name: string; label: string; initial?: boolean };

export type DialogOptions = {
  title: string;
  message?: string;
  fields?: DialogField[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type DialogValues = Record<string, string>;

type PendingDialog = DialogOptions & { resolve: (values: DialogValues | null) => void };

function initialValues(fields: DialogField[] = []): DialogValues {
  return Object.fromEntries(fields.map(field => [
    field.name,
    field.type === 'checkbox'
      ? (field.initial ? '1' : '0')
      : field.type === 'select'
        ? field.initial ?? field.options[0] ?? ''
        : field.initial ?? '',
  ]));
}

function AdminDialogView({ dialog, onClose }: { dialog: PendingDialog; onClose: (values: DialogValues | null) => void }) {
  const [values, setValues] = useState<DialogValues>(() => initialValues(dialog.fields));
  const panelRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, textarea, select') ?? panel?.querySelector<HTMLElement>('button[type="submit"]');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(null); return; }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('input, textarea, select, button')].filter(item => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
    const missing = (dialog.fields ?? []).some(field => (field.type === 'text' || field.type === 'textarea') && field.required && !trimmed[field.name]);
    if (missing) return;
    onClose(trimmed);
  };

  const set = (name: string, value: string) => setValues(current => ({ ...current, [name]: value }));

  return (
    <div className="admin-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(null); }}>
      <form
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        ref={panelRef}
        onSubmit={submit}
      >
        <h2 id="admin-dialog-title">{dialog.title}</h2>
        {dialog.message && <p>{dialog.message}</p>}
        {(dialog.fields ?? []).map(field => {
          const id = `admin-dialog-${field.name}`;
          if (field.type === 'checkbox') {
            return (
              <label className="admin-dialog-check" key={field.name} htmlFor={id}>
                <input id={id} type="checkbox" checked={values[field.name] === '1'} onChange={event => set(field.name, event.target.checked ? '1' : '0')} />
                {field.label}
              </label>
            );
          }
          return (
            <label className="admin-dialog-field" key={field.name} htmlFor={id}>
              <span>{field.label}</span>
              {field.type === 'select' ? (
                <select id={id} value={values[field.name]} onChange={event => set(field.name, event.target.value)}>
                  {field.options.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea id={id} value={values[field.name]} onChange={event => set(field.name, event.target.value)} required={field.required} maxLength={field.maxLength ?? 500} placeholder={field.placeholder} rows={3} />
              ) : (
                <input id={id} value={values[field.name]} onChange={event => set(field.name, event.target.value)} required={field.required} maxLength={field.maxLength ?? 200} placeholder={field.placeholder} autoComplete="off" />
              )}
            </label>
          );
        })}
        <div className="admin-dialog-actions">
          <button type="button" onClick={() => onClose(null)}>{dialog.cancelLabel ?? 'Отмена'}</button>
          <button type="submit" className={dialog.danger ? 'danger' : 'primary'}>{dialog.confirmLabel ?? 'Подтвердить'}</button>
        </div>
      </form>
    </div>
  );
}

export function useAdminDialog() {
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const dialogRef = useRef<PendingDialog | null>(null);
  dialogRef.current = dialog;

  // Если панель размонтирована при открытом окне — считаем это отменой.
  useEffect(() => () => dialogRef.current?.resolve(null), []);

  const form = useCallback((options: DialogOptions) => new Promise<DialogValues | null>(resolve => {
    dialogRef.current?.resolve(null);
    setDialog({ ...options, resolve });
  }), []);

  const confirm = useCallback(async (message: string, options: Partial<DialogOptions> = {}) =>
    (await form({ title: options.title ?? 'Подтвердите действие', message, ...options, fields: [] })) !== null, [form]);

  const prompt = useCallback(async (label: string, initial = '', options: Partial<DialogOptions> = {}) => {
    const values = await form({
      title: options.title ?? label,
      ...options,
      fields: [{ type: 'textarea', name: 'value', label, initial, required: true }],
    });
    return values ? values.value : null;
  }, [form]);

  const close = useCallback((values: DialogValues | null) => {
    const current = dialogRef.current;
    setDialog(null);
    current?.resolve(values);
  }, []);

  const element = dialog ? createPortal(<AdminDialogView key={dialog.title + (dialog.message ?? '')} dialog={dialog} onClose={close} />, document.body) : null;

  return { element, form, confirm, prompt };
}
