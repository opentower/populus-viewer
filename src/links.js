import History from './history.js'

export function processLinks(elt) {
  if (elt) {
    const linkArray = Array.from(elt.querySelectorAll("a[href]"))
    linkArray
      .filter(link => new URL(link.getAttribute("href")).pathname === window.location.pathname)
      .forEach(link => {
        const hash = new URL(link.getAttribute("href")).hash
        link.addEventListener("click", e => {
          e.preventDefault()
          History.push(hash.slice(1))
        })
      })
  }
}
