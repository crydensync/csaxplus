/**
 * What the console can honestly say about an operator, from what it knows.
 *
 * The console knows one thing about the account: the address it was signed in
 * with. It has no display name, because the API's user record carries neither a
 * name nor a profile, so it does not invent one. `name` is the address and the
 * avatar chip is a single letter derived from it.
 *
 * One letter rather than the prototype's letter pair: a pair reads as initials of
 * a name, and turning `ops@example.invalid` into "OE" would be presenting a guess
 * as the operator's name.
 */

const FALLBACK_INITIAL = "?";

/** The first letter or digit of the address, upper-cased. */
export function initialsFromLabel(label: string): string {
  const at = label.indexOf("@");
  const local = at === -1 ? label : label.slice(0, at);

  for (const character of local) {
    if (/[a-z0-9]/i.test(character)) return character.toUpperCase();
  }
  return FALLBACK_INITIAL;
}
