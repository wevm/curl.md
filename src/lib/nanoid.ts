import { customAlphabet } from 'nanoid'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const defaultSize = 12

export const generate = customAlphabet(alphabet, defaultSize)
