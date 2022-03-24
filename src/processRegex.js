import { latexDisplayToReplacement, latexInlineToReplacement } from './latex.js'
import Client from './client.js'

const escapedDollar = /\\\$/
const latexInlineRegex = /\$(([^$]|\\\\$)*)\$/
const latexDisplayRegex = /\$\$(([^$]|\\\\$)*)\$\$/
const mentionRegex = /@\S*:\S*/

export function processRegex(string) {
  const theRegex = new RegExp(`${escapedDollar.source}|${latexDisplayRegex.source}|${latexInlineRegex.source}|${mentionRegex.source}`, "gm")
  return string.replaceAll(theRegex, matchDispatch)
}

function mentionToReplacement(match) {
  const user = Client.client.getUser(match)
  if (!user) return match
  const replacement = document.createElement('a')
  replacement.href = `https://matrix.to/#/${user.userId}`
  replacement.innerText = user.displayName || user.userId
  return replacement.outerHTML
}

function matchDispatch(match) {
  // we need to start from te beginning again and transform the first capture group we encounter
  // we need to use fresh RegExp to strip the global flag
  if (latexDisplayRegex.test(match)) return latexDisplayToReplacement(match.match(latexDisplayRegex)[1])
  if (latexInlineRegex.test(match)) return latexInlineToReplacement(match.match(latexInlineRegex)[1])
  if (mentionRegex.test(match)) return mentionToReplacement(match)
  if (escapedDollar.test(match)) return "$"
}
