import { latexDisplayToReplacement, latexInlineToReplacement } from './latex.js'
import Client from './client.js'

const latexInlineRegex = /\$(([^$]|\\\\$)*)\$/
const latexDisplayRegex = /\$\$(([^$]|\\\\$)*)\$\$/
const mentionRegex = /@\S*:\S*/

export function processRegex(string) {
  const theRegex = new RegExp(`${latexDisplayRegex.source}|${latexInlineRegex.source}|${mentionRegex.source}`, "gm")
  return string.replaceAll(theRegex, matchDispatch)
}

function mentionToReplacement(match) {
  console.log(match)
  const user = Client.client.getUser(match)
  if (!user) return match
  const replacement = document.createElement('a')
  replacement.href = `https://matrix.to/#/${user.userId}`
  replacement.innerText = user.displayName || user.userId
  return replacement.outerHTML
}

function matchDispatch(match) {
  console.log(match)
  // we need to start from te beginning again and transform the first capture group we encounter
  // we need to use fresh RegExp to strip the global flag
  if (latexDisplayRegex.test(match)) return latexDisplayToReplacement(match.match(latexDisplayRegex)[1])
  if (latexInlineRegex.test(match)) return latexInlineToReplacement(match.match(latexInlineRegex)[1])
  if (mentionRegex.test(match)) return mentionToReplacement(match)
}
