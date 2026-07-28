// lib/setup-field-helpers.ts
// Tiny type-coercing accessors for reading fields off a generated Money
// Making `setup` object (method_setups.setup, parsed JSON of whatever shape
// Claude returned) -- shared between SetupOverlay and SkinArmorRender so
// both read the same fields the same way.
export const st = (v: any): string => typeof v === 'string' ? v : ''
export const nm = (v: any): number => typeof v === 'number' ? v : 0
export const bl = (v: any): boolean => typeof v === 'boolean' ? v : false
export const ar = (v: any): string[] => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
