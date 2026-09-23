import type { Category } from '../data/types';

export type Need = 'required' | 'optional' | 'hidden';

export interface IdentifierNeeds {
  serial: Need; serialLabel: string; serialHint?: string;
  imei: Need; imeiLabel: string;
  sim: Need; simLabel: string; simHint?: string;
  /** Whether the asset can be enrolled in Mobile Device Management. */
  mdm: Need;
  /** Identification only: no asset name, procurement or specification block (a SIM connection has none of them). */
  identityOnly: boolean;
}

const DEFAULTS: IdentifierNeeds = {
  serial: 'required', serialLabel: 'Serial Number', serialHint: 'Checked for duplicates',
  imei: 'hidden', imeiLabel: 'IMEI Number',
  sim: 'hidden', simLabel: 'SIM Number',
  mdm: 'hidden',
  identityOnly: false,
};

/**
 * Which identifiers a category actually has, so the registration form asks for those and no others.
 * Categories are master data, so a profile is matched on the code first and then on a word in the
 * name; anything unrecognised falls back to "serial number only".
 */
export function identifierNeeds(cat?: Pick<Category, 'code' | 'name'>): IdentifierNeeds {
  const code = (cat?.code ?? '').toUpperCase();
  const name = (cat?.name ?? '').toLowerCase();
  const word = (...w: string[]) => w.some(x => new RegExp(`\b${x}`).test(name));

  // A SIM card is identified by its own number; the printed ICCID is its serial.
  if (code === 'SIM' || word('sim')) return {
    ...DEFAULTS,
    sim: 'required', simLabel: 'SIM Number (mobile number)', simHint: 'The number on the connection — checked for duplicates',
    serial: 'optional', serialLabel: 'ICCID / Serial Number', serialHint: 'The long number printed on the SIM (optional)',
    identityOnly: true,
  };
  // Phones always carry an IMEI, and may be registered with a SIM already fitted.
  if (['MOB', 'PHN'].includes(code) || word('mobile', 'phone', 'handset')) return {
    ...DEFAULTS, imei: 'required', sim: 'optional', simHint: 'Only if a SIM is issued with the handset', mdm: 'optional',
  };
  // Anything else that can take a mobile connection: asked for, never demanded.
  if (['TAB', 'GPS', 'CAM', 'RTR', 'DNG'].includes(code) || word('tablet', 'gps', 'tracker', 'camera', 'router', 'dongle', 'modem', 'watch'))
    return { ...DEFAULTS, imei: 'optional', sim: 'optional', simHint: 'Only if a SIM is fitted', mdm: 'optional' };

  return DEFAULTS;   // laptops, furniture, tools … serial number only
}

export const needsField = (n: Need) => n !== 'hidden';
