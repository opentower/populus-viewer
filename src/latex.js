import katex from 'katex'

const latexInlineRegex = /\$(([^$]|\\\\$)*)\$/gm
const latexDisplayRegex = /\$\$(([^$]|\\\\$)*)\$\$/gm

function latexInlineToReplacement(match) {
  const replacement = document.createElement('span')
  replacement.dataset.mxMaths = match
  replacement.innerText = match
  return replacement.outerHTML
}

function latexDisplayToReplacement(match) {
  const replacement = document.createElement('div')
  replacement.dataset.mxMaths = match
  replacement.innerText = match
  return replacement.outerHTML
}

export function addLatex(string) {
  return string.replace(latexDisplayRegex, (_, match) => latexDisplayToReplacement(match))
    .replace(latexInlineRegex, (_, match) => latexInlineToReplacement(match))
}

export function renderLatexInElement(element) {
  console.log(element)
  if (element) {
    const latexArray = Array.from(element.querySelectorAll("[data-mx-maths]"))
    latexArray.forEach(elt => {
      if (elt.tagName === "DIV") katex.render(elt.dataset.mxMaths, elt, {displayMode: true, throwOnError: false})
      else katex.render(elt.dataset.mxMaths, elt, {throwOnError: false})
    })
  }
}
