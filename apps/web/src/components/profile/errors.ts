import type { ProfileCopy } from '../../lib/copy/profile.ts';
import type { FieldError } from './fields.ts';

/** The visible message of a field error, in the page's language (rows of link lists say which row). */
export function errorText(copy: ProfileCopy, error: FieldError | null | undefined): string | null {
  if (!error) return null;
  const e = copy.errors;
  let text: string;
  switch (error.code) {
    case 'required':
      text = e.required;
      break;
    case 'tooLong':
      text = e.tooLong(error.max ?? 0);
      break;
    case 'url':
      text = e.url;
      break;
    case 'date':
      text = e.date;
      break;
    case 'email':
      text = e.email;
      break;
    case 'choice':
      text = e.choice;
      break;
    case 'int':
      text = e.int(error.min ?? 0, error.max ?? 0);
      break;
    case 'tooMany':
      text = e.tooMany(error.max ?? 0);
      break;
    case 'lineTooLong':
      text = e.lineTooLong(error.max ?? 0);
      break;
    default:
      text = error.message ? `${e.server} (${error.message})` : e.server;
  }
  return error.row === undefined ? text : `${e.row(error.row + 1)}${text}`;
}
