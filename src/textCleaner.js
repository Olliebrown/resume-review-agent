import fs from 'fs'

import en from 'dictionary-en'
import nspell from 'nspell'

// Regex to identify all non-letter characters (except hyphens)
const WORD_CHAR_REGEX = /[^a-zA-Z-]/g

// Initialize list of unknown words
const unknownWords = []

// Read in list of custom words for spell checking
const customWordsRaw = fs.readFileSync('./src/customWords.json', 'utf8')
const customWords = JSON.parse(customWordsRaw)

// Load the dictionary and prepare spellchecker
const spellCheck = nspell(en)
customWords.forEach(word => spellCheck.add(word))

export function basicTextCleaning (text) {
  // Convert all WS strings to a single space (except newlines)
  return text.replace(/[^\S\r\n]+/g, ' ')
    // Convert all comma WS comma to ', '
    .replace(/\s,\s/g, ', ')
    // Convert all period WS period to '.'
    .replace(/\s\.\s/g, '.')
    // Remove leading and trailing whitespace
    .trim()
}

// Split on either newline or carriage return
export function splitTextIntoLines (text) {
  return text.split(/[\r\n]/g)
}

export function splitLineIntoWords (line) {
  return line.trim().split(' ')
}

export function mergeMisspelledWords (words) {
  const newWords = [...words]
  for (let i = 0; i < newWords.length; i++) {
    if (newWords[i].length < 3 || !spellCheck.correct(newWords[i].replace(WORD_CHAR_REGEX, ''))) {
      // Does merging it with the next word fix it?
      if (i < newWords.length - 1 && spellCheck.correct((newWords[i] + newWords[i + 1]).replace(WORD_CHAR_REGEX, ''))) {
        newWords[i] = newWords[i] + newWords[i + 1]
        newWords.splice(i + 1, 1)
      }
    }
  }

  return newWords
}

export function misspellingAtLineBreak (line1, line2) {
  // Get last word of first line
  const lastWord = splitLineIntoWords(line1).pop()

  // Does line1 end with a misspelling?
  if (lastWord.length < 3 || !spellCheck.correct(lastWord.replace(WORD_CHAR_REGEX, ''))) {
    // Does merging with the first word of next line fix the misspelling?
    const firstWord = splitLineIntoWords(line2)[0]
    if (spellCheck.correct((lastWord + firstWord).replace(WORD_CHAR_REGEX, ''))) {
      return true
    }
  }

  // Don't merge
  return false
}

export function gatherUnknownWordsFromLine (line) {
  const words = splitLineIntoWords(line)
  for (let j = 0; j < words.length; j++) {
    const word = words[j].replace(WORD_CHAR_REGEX, '')
    if (word.length > 3 && !unknownWords.includes(word) && !spellCheck.correct(word)) {
      unknownWords.push(word)
    }
  }
}

export function outputUnknownWords (outputFunc = console.log) {
  if (unknownWords.length > 0) {
    outputFunc('Unknown words:', unknownWords.join(', '))
  }
}
