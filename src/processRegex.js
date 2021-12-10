import { latexDisplayToReplacement, latexInlineToReplacement } from './latex.js'

const latexInlineRegex = /\$(([^$]|\\\\$)*)\$/
const latexDisplayRegex = /\$\$(([^$]|\\\\$)*)\$\$/

export function processRegex(string) {
  const theRegex = new RegExp(`${latexDisplayRegex.source}|${latexInlineRegex.source}`, "gm")
  return string.replaceAll(theRegex, matchDispatch)
}

function matchDispatch(match) {
  // we need to start from te beginning again and transform the first capture group we encounter
  // we need to use fresh RegExp to strip the global flag
  if (latexDisplayRegex.test(match)) return latexDisplayToReplacement(match.match(latexDisplayRegex)[1])
  if (latexInlineRegex.test(match)) return latexInlineToReplacement(match.match(latexInlineRegex)[1])
}
