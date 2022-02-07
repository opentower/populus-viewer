export function toWords(s) {
  const words = []
  const regex = /[^\s"]+|"([^"]*)"/gi
  let match
  do {
    match = regex.exec(s)
    if (match != null) words.push(match[1] ? match[1] : match[0])
  } while (match != null)
  return words
}
