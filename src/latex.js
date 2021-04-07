const latexInlineRegex = /\$(([^$]|\\\\$)*)\$/gm
const latexDisplayRegex = /\$\$(([^$]|\\\\$)*)\$\$/gm

function latexInlineToReplacement(match) {
    var replacement = document.createElement('span')
    replacement.dataset.mxMaths = match
    replacement.innerText = match
    return replacement.outerHTML
}

function latexDisplayToReplacement(match) {
    var replacement = document.createElement('div')
    replacement.dataset.mxMaths = match
    replacement.innerText = match
    return replacement.outerHTML
}

export function addLatex(string) {
    return string.replace(latexDisplayRegex, (m,match) => latexDisplayToReplacement(match))
                 .replace(latexInlineRegex, (m,match) => latexInlineToReplacement(match))
}
