import { createContext, use, useState, type FormEvent, type ReactNode } from 'react';
import { useToast } from '../context/toast';

export type FormValues = Record<string, string>;

interface FormState {
  busy: boolean;
  error: string;
}
const FormContext = createContext<FormState>({ busy: false, error: '' });

interface Props {
  /** Gets the form's fields, the form element, and the value of the button pressed. */
  onSubmit(values: FormValues, form: HTMLFormElement, button?: string): Promise<unknown> | unknown;
  className?: string;
  id?: string;
  children: ReactNode;
  /** Show errors as a toast instead of the form's <FormError>. */
  toastErrors?: boolean;
}

// Handles the busy state and errors every form needs, so pages only say what submitting does.
export function Form({ onSubmit, className, id, children, toastErrors = false }: Props) {
  const [state, setState] = useState<FormState>({ busy: false, error: '' });
  const toast = useToast();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value || undefined;
    setState({ busy: true, error: '' });
    try {
      await onSubmit(Object.fromEntries(new FormData(form)) as FormValues, form, button);
      setState({ busy: false, error: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (toastErrors) toast(message, true);
      setState({ busy: false, error: toastErrors ? '' : message });
    }
  }

  return (
    <form className={className} id={id} onSubmit={submit} noValidate={false}>
      <FormContext value={state}>{children}</FormContext>
    </form>
  );
}

export function FormError() {
  const { error } = use(FormContext);
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

/** A submit button that shows a spinner while the form is working. */
export function Submit({ className = 'btn primary', children, value }: { className?: string; children: ReactNode; value?: string }) {
  const { busy } = use(FormContext);
  return (
    <button className={`${className} ${busy ? 'busy' : ''}`} type="submit" disabled={busy} value={value}>
      {children}
    </button>
  );
}

/** A password input with a Show/Hide toggle. */
export function PasswordField({ name, autoComplete, minLength }: { name: string; autoComplete: string; minLength?: number }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="password">
      <input type={shown ? 'text' : 'password'} name={name} required autoComplete={autoComplete} minLength={minLength} />
      <button className="plain" type="button" onClick={() => setShown(!shown)}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
