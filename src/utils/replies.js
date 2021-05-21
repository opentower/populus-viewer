import sanitizeHtml from 'sanitize-html'

export function isReply (content) {
  return !!(content['m.relates_to'] && content['m.relates_to']['m.in_reply_to'])
}

export function stripFallbackPlain (lines) {
  // Removes lines beginning with `> ` until you reach one that doesn't.
  while (lines.length && lines[0].startsWith('> ')) lines.shift()
  // Reply fallback has a blank line after it, so remove it to prevent leading newline
  if (lines[0] === '') lines.shift()
}

export function stripFallbackPlainString (string) {
  const lines = string.trim().split('\n')
  // Removes lines beginning with `> ` until you reach one that doesn't.
  while (lines.length && lines[0].startsWith('> ')) lines.shift()
  // Reply fallback has a blank line after it, so remove it to prevent leading newline
  if (lines[0] === '') lines.shift()
  return lines.join('\n')
}

export function generateFallbackPlain (event) {
  let lines
  const targetSender = event.getSender()
  switch (event.getContent().msgtype) {
    case "m.file": {
      lines = ["sent a file"]
      break;
    }
    case "m.audio": {
      lines = ["sent an audio file"]
      break;
    }
    case "m.video": {
      lines = ["sent a video"]
      break;
    }
    default: {
      const targetBody = event.getContent().body
      lines = targetBody.trim().split('\n')
      // strip previous fallback, if replying to a reply
      if (isReply(event.getContent())) stripFallbackPlain(lines)
    }
  }
  if (lines.length > 0) { lines[0] = `<${targetSender}> ${lines[0]}` }
  return `${lines.map((line) => `> ${line}`).join('\n')}\n\n`
}

export function generateFallbackHtml (event) {
  let replyHtml
  const targetSender = event.getSender()
  switch (event.getContent().msgtype) {
    case "m.file": {
      replyHtml = "sent a file"
      break;
    }
    case "m.audio": {
      replyHtml = "sent an audio file"
      break;
    }
    case "m.video": {
      replyHtml = "sent a video"
      break;
    }
    default: {
      const targetHTML = event.getContent().formatted_body || event.getContent().body.replace(/\n/g, '<br>')
      replyHtml = sanitizeHtml(targetHTML, stripReply)
    }
  }
  return (`<mx-reply><blockquote><a href="https://matrix.to/#/${event.getRoomId()}/${event.getId()}">In reply to</a>` +
        ` <a href="https://matrix.to/#/${targetSender}">${targetSender}</a>` +
        `<br>${replyHtml}</blockquote></mx-reply>`)
}

// based on https://github.com/matrix-org/matrix-react-sdk/blob/33e8edb3d508d6eefb354819ca693b7accc695e7/src/components/views/rooms/EditMessageComposer.js
export function getFallbackHtml (content) {
  const html = content.formatted_body
  if (!html) return ''
  const rootNode = new DOMParser().parseFromString(html, 'text/html').body
  const mxReply = rootNode.querySelector('mx-reply')
  return mxReply ? mxReply.outerHTML : ''
}

export function getFallbackPlain (content) {
  const body = content.body
  const lines = body.split('\n').map(l => l.trim())
  if (lines.length > 2 && lines[0].startsWith('> ') && lines[1].length === 0) {
    return `${lines[0]}\n\n`
  }
  return ''
}

export const stripReply = {
  allowedTags: false, // false means allow everything
  allowedAttributes: false,
  // we somehow can't allow all schemes, so we allow all that we
  // know of and mxc (for img tags)
  allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'magnet', 'mxc'],
  exclusiveFilter: (frame) => frame.tag === 'mx-reply'
}
