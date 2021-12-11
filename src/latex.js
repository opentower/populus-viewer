import katex from 'katex'

export function latexInlineToReplacement(match) {
  const replacement = document.createElement('span')
  replacement.dataset.mxMaths = match
  replacement.innerText = match
  return replacement.outerHTML
}

export function latexDisplayToReplacement(match) {
  const replacement = document.createElement('div')
  replacement.dataset.mxMaths = match
  replacement.innerText = match
  return replacement.outerHTML
}

export function renderLatexInElement(element) {
  if (element) {
    const latexArray = Array.from(element.querySelectorAll("[data-mx-maths]"))
    latexArray.forEach(elt => {
      if (elt.tagName === "DIV") katex.render(elt.dataset.mxMaths, elt, {displayMode: true, throwOnError: false})
      else katex.render(elt.dataset.mxMaths, elt, {throwOnError: false})
    })
  }
}
