// for accumlation of date labels
export function dateReducer(array, milestone, mile) {
  const initialDate = Date.now()
  let currentDate = initialDate
  return array.reduce((accumulator, ev) => {
    const theMile = mile(ev)
    const age = initialDate - ev.getTs()
    const dateDelta = currentDate - ev.getTs()
    if (theMile) {
      let message
      if (age < 300000 && dateDelta > 60000) {
        currentDate = ev.getTs()
        const minutes = Math.floor(age / 60000)
        const plural = minutes === 1 ? "" : "s"
        message = `${minutes} minute${plural} ago`
      } else if (age < 3600000 && dateDelta > 600000) {
        currentDate = ev.getTs()
        const minutes = Math.floor(age / 60000)
        const plural = minutes === 1 ? "" : "s"
        message = `${minutes} minute${plural} ago`
      } else if (age < 86400000 && dateDelta > 3600000) {
        currentDate = ev.getTs()
        const hours = Math.floor(age / 3600000)
        const plural = hours === 1 ? "" : "s"
        message = `${hours} hour${plural} ago`
      } else if (dateDelta > 86400000) {
        currentDate = ev.getTs()
        const dateObject = new Date(currentDate)
        message = `on ${dateObject.toLocaleDateString('en-US', {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        })}`
      }
      if (message) accumulator.push(milestone(message))
      accumulator.push(theMile)
    }
    return accumulator
  }, [])
}

export function toClockTime(sec) {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}:${Math.floor((sec % 3600) / 60)}:${Math.floor(sec % 60)}`
  return `${Math.floor(sec / 60)}:${sec % 60 <= 9 ? 0 : ""}${Math.floor(sec % 60)}` 
}

