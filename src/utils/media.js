import extractPngChunks from "png-chunks-extract"

// The below is based on https://github.com/matrix-org/matrix-react-sdk/blob/develop/src/ContentMessages.tsx

// scraped out of a macOS hidpi (5660ppm) screenshot png
//                  5669 px (x-axis)      , 5669 px (y-axis)      , per metre
const PHYS_HIDPI = [0x00, 0x00, 0x16, 0x25, 0x00, 0x00, 0x16, 0x25, 0x01]

const MAX_WIDTH = 800
const MAX_HEIGHT = 600

export function createThumbnail( element, inputWidth, inputHeight, mimeType) {
  return new Promise((resolve) => {
    let targetWidth = inputWidth
    let targetHeight = inputHeight
    if (targetHeight > MAX_HEIGHT) {
      targetWidth = Math.floor(targetWidth * (MAX_HEIGHT / targetHeight))
      targetHeight = MAX_HEIGHT
    }
    if (targetWidth > MAX_WIDTH) {
      targetHeight = Math.floor(targetHeight * (MAX_WIDTH / targetWidth))
      targetWidth = MAX_WIDTH
    }

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    canvas.getContext("2d").drawImage(element, 0, 0, targetWidth, targetHeight)
    canvas.toBlob((thumbnail) => {
      resolve({
        info: {
          thumbnail_info: {
            w: targetWidth,
            h: targetHeight,
            mimetype: thumbnail.type,
            size: thumbnail.size
          },
          w: inputWidth,
          h: inputHeight
        },
        thumbnail
      })
    }, mimeType)
  })
}

export async function loadImageElement(imageFile) {
  // Load the file into an html element
  const img = document.createElement("img")
  const objectUrl = URL.createObjectURL(imageFile)
  const imgPromise = new Promise((resolve, reject) => {
    img.onload = _ => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = e => reject(e)
  })
  img.src = objectUrl

  // check for hi-dpi PNGs and fudge display resolution as needed.
  // this is mainly needed for macOS screencaps
  let parsePromise
  if (imageFile.type === "image/png") {
    // in practice macOS happens to order the chunks so they fall in
    // the first 0x1000 bytes (thanks to a massive ICC header).
    // Thus we could slice the file down to only sniff the first 0x1000
    // bytes (but this makes extractPngChunks choke on the corrupt file)
    const headers = imageFile // .slice(0, 0x1000)
    parsePromise = readFileAsArrayBuffer(headers).then(arrayBuffer => {
      const buffer = new Uint8Array(arrayBuffer)
      const chunks = extractPngChunks(buffer)
      for (const chunk of chunks) {
        if (chunk.name === 'pHYs') {
          if (chunk.data.byteLength !== PHYS_HIDPI.length) return
          return chunk.data.every((val, i) => val === PHYS_HIDPI[i])
        }
      }
      return false
    })
  }

  const [hidpi] = await Promise.all([parsePromise, imgPromise])
  const width = hidpi ? (img.width >> 1) : img.width
  const height = hidpi ? (img.height >> 1) : img.height
  return {width, height, img}
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = e => reject(e)
    reader.readAsArrayBuffer(file)
  })
}

export function loadVideoElement(videoFile) {
  return new Promise((resolve, reject) => {
    // Load the file into an html element
    const video = document.createElement("video")
    const theUrl = URL.createObjectURL(videoFile)
    video.src = theUrl
    // Once ready, returns its size
    // Wait until we have enough data to thumbnail the first frame.
    video.onloadeddata = _ => {
      URL.revokeObjectURL(theUrl)
      resolve(video)
    }
    // XXX: this was previously using FileReader and a data URL, but an
    // apparent bug in firefox 98 seems to prevent FileReader-generated data
    // urls from being used with video elements
    video.onerror = e => reject(e)
  })
}
