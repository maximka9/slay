function partsAt(value: Date | string | number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

export function utcToZonedInput(value: string | null | undefined, timeZone: string) {
  if (!value) return '';
  try {
    const parts = partsAt(value, timeZone);
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
  } catch { return value.slice(0, 16); }
}

export function zonedInputToUtc(value: FormDataEntryValue | null, timeZone: string) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Некорректные дата и время.');
  const wanted = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let guess = wanted;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = partsAt(guess, timeZone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    guess += wanted - actualUtc;
  }
  return new Date(guess).toISOString();
}
