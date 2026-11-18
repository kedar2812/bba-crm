import type { CSSProperties } from 'react'

/*
 * The public site's look: a shopfront signboard. Black condensed lettering on marigold
 * is the look of a bazaar signboard, and also BBA's own black-and-gold.
 * One family throughout: Anek Gujarati (Ek Type), condensed for the sign, normal for reading.
 */
export const FAMILY = "'Anek Gujarati Variable', system-ui, sans-serif"
export const SIGN: CSSProperties = { fontFamily: FAMILY, fontStretch: '75%', fontWeight: 800 }
export const HEAD: CSSProperties = { fontFamily: FAMILY, fontStretch: '88%', fontWeight: 700, letterSpacing: '-0.015em' }

export const GOLD = '#E0A82E'
export const LEDGER = '#F3E6C8'
export const GOLD_INK = '#7A5500'
