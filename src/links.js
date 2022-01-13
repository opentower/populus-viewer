import History from './history.js'
import Client from './client.js'
import { UserColor } from './utils/colors.js'

export function processLinks(elt) {
  if (elt) {
    const linkArray = Array.from(elt.querySelectorAll("a[href]"))
    linkArray
      .forEach(link => {
        try {
          const url = new URL(link.getAttribute("href"))
          if (url.host === window.location.host && url.pathname === window.location.pathname) {
            const hash = new URL(link.getAttribute("href")).hash
            link.addEventListener("click", e => {
              e.preventDefault()
              History.push(hash.slice(1))
            })
          } else if (url.host === "matrix.to") {
            const user = Client.client.getUser(url.hash.slice(2))
            link.addEventListener("click", e => e.preventDefault()) // do nothing until we have DMS worked out
            if (user) {
              const colors = new UserColor(user.userId)
              link.style.setProperty('--user_dark', colors.dark)
            }
          }
        } catch (e) {}
      })
  }
}
