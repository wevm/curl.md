import { customAlphabet } from 'nanoid'

// NOTE: Do not change these values without first updating DB function
export const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
// https://zelark.github.io/nano-id-cc
export const defaultSize = 12

export const generate = customAlphabet(alphabet, defaultSize)
