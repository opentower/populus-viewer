import { h, createRef, Fragment, Component } from 'preact';
import './styles/pdfView.css'
import * as PDFJS from "pdfjs-dist/webpack"
import Client from './client.js'
import Toast from "./toast.js"
import History from './history.js'
import Resource from "./utils/resource.js"
import './styles/text-layer.css'

export default class PdfCanvas extends Component {
  static PDFStore = {}
  // we store downloaded PDFs here in order to avoid excessive downloads.
  // Could alternatively use localstorage or some such eventually. We don't
  // use preact state since changes here aren't relevent to UI.

  constructor(props) {
    super(props)
    this.pendingRender = null
    this.pendingTextRender = null
    this.hasRendered = false // we allow one initial render, but then require a page change for a redraw
    this.hasFetched = new Promise((resolve, reject) => {
      this.resolveFetch = resolve
      this.rejectFetch = reject
    })
  }

  componentDidUpdate(prevProps) {
    if (!this.hasRendered || (prevProps.pageFocused !== this.props.pageFocused)) {
      const control = this.grabControl()
      this.drawPdf(control).then(_ =>
      // need to do this to take into account positioning changes caused by rescaling
        this.props.annotationLayer.current.forceUpdate()
      ).then(_ => this.highlightText(this.props.searchString))
    }
    if (prevProps.searchString !== this.props.searchString) {
      this.highlightText(this.props.searchString)
    }
  }

  componentDidMount() {
    this.fetchPdf(`#${this.props.pdfFocused}`)
    // fetch will fail if the initial sync isn't complete, but that should be handled by the splash page
    this.props.textLayer.current.addEventListener('click', e => {
      e.preventDefault() // this should prevent touch-to-search on mobile chrome
      const mouseEvent = new MouseEvent(e.type, e)
      document.elementsFromPoint(e.clientX, e.clientY).forEach(elt => {
        if (elt.hasAttribute("data-annotation")) elt.dispatchEvent(mouseEvent)
      })
    })
  }

  canvas = createRef()

  catchFetchPdfError = alias => e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">Couldn't fetch the PDF...</h3>
      <div>Tried to fetch: </div>
      <pre>{alias}</pre>
      <div>Here's the error message:</div>
      <pre>{e.message}</pre>
      </Fragment>
    )
    History.push('/')
    this.errorCondition = true
  }

  async fetchPdf (alias) {
    const {room_id, servers} = await Client.client.getRoomIdForAlias(alias).catch(this.catchFetchPdfError(alias))
    if (this.errorCondition) return
    await Client.client.joinRoom(room_id, { viaServers: servers }).catch(this.catchFetchPdfError(alias))
    if (this.errorCondition) return
    const theRoom = await Client.client.getRoomWithState(room_id).catch(this.catchFetchPdfError(alias))
    if (this.errorCondition) return
    const thePdf = new Resource(theRoom)
    this.props.setResource(theRoom)
    this.setState({pdfIdentifier: thePdf.url})
    if (!PdfCanvas.PDFStore[thePdf.url]) {
      PdfCanvas.PDFStore[thePdf.url] = window.fetch(thePdf.httpUrl)
        .then(async response => {
          const theClone = response.clone()
          const contentLength = +response.headers.get('Content-Length')
          const reader = response.body.getReader()
          let accumulator = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) { break }
            accumulator = accumulator + value.length
            this.props.setPdfLoadingStatus(accumulator / contentLength)
          }
          return theClone.arrayBuffer()
        })
        .then(array => PDFJS.getDocument(array).promise)
        .catch(this.catchFetchPdfError(alias))
    } else { console.log(`found pdf for ${theRoom.name} in store` ) }
    if (this.errorCondition) return
    PdfCanvas.PDFStore[thePdf.url]
      .then(pdf => this.props.setTotalPages(pdf.numPages))
      .then(this.resolveFetch)
      .then(this.gatherText(thePdf.url))
  }

  async gatherText(pdfIdentifier) {
    const pdf = await PdfCanvas.PDFStore[pdfIdentifier]
    this.pdfText = {}
    for (let i = 1; i < pdf.numPages + 1; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      this.pdfText[i] = content.items.map(item => item.str).join(" ")
    }
    this.props.setPdfText(this.pdfText)
  }

  // because rendering is async, we need a way to cancel pending render tasks and
  // to make sure that pending drawPdf calls don't proceed. That's what this function does.
  grabControl() {
    const controlToken = {}
    // we spawn a new control token - this is just an empty object, the
    // important thing is that it's a *new* empty object, since previous
    // drawPdf calls will check to see if the control token is the same as
    // the one that they were spawned with
    this.controlToken = controlToken
    // now that we're sure we won't spawn any unintended renders, we cancel
    // any pending renders
    try { this.pendingRender.cancel() } catch (err) { console.log(err) }
    try { this.pendingTextRender.cancel() } catch (err) { console.log(err) }
    // and we clear the textlayer.
    this.cleanText = ""
    this.props.textLayer.current.innerHTML = ''
    return controlToken
  }

  async drawPdf (control) {
    // since we've started rendering, we want to block subsequent render attempts
    this.hasRendered = true
    const theCanvas = this.canvas.current
    await this.hasFetched
    this.props.setPdfLoadingStatus("Rendering PDF")
    const pdf = await PdfCanvas.PDFStore[this.state.pdfIdentifier]

    // exit early if someone else has grabbed control
    if (control !== this.controlToken) return
    // Fetch the first page
    const page = await pdf.getPage(parseInt(this.props.pageFocused, 10) || 1).catch(console.log)
    console.log('Page loaded');

    const scale = this.props.pdfScale
    const viewport = page.getViewport({scale});

    // Prepare canvas using PDF page dimensions
    //
    // These are PDF userspace units (aka "points", 72 per inch) times viewport scale
    theCanvas.height = viewport.height;
    theCanvas.width = viewport.width;

    // pass scaled height in px upwards for css variables
    const pdfWidthPx = Math.min(viewport.width / scale, window.innerWidth)
    const pdfHeightPx = (pdfWidthPx / viewport.width) * viewport.height
    this.props.setPdfDimensions(pdfHeightPx, pdfWidthPx)
    this.props.setPdfFitRatio(Math.min(1, window.innerWidth / (viewport.width / scale)))

    // Render PDF page into canvas context
    const canvasContext = theCanvas.getContext('2d')

    const renderContext = { canvasContext, viewport };

    if (control !== this.controlToken) return

    // clear canvas (prevents occasional flickering on firefox)
    canvasContext.clearRect(0, 0, theCanvas.width, theCanvas.height)
    this.pendingRender = page.render(renderContext);

    await this.pendingRender.promise.catch(err =>
      err.name === "RenderingCancelledException" ? console.log(err.message) : console.log(err)
    )
    console.log('Page rendered');
    const text = await page.getTextContent();

    if (control !== this.controlToken) return
    // insert the pdf text into the text layer
    this.pendingTextRender = PDFJS.renderTextLayer({
      textContent: text,
      container: this.props.textLayer.current,
      viewport: page.getViewport({scale: 1}),
      textDivs: []
    })
    this.pendingTextRender.promise.then(_ => { this.cleanText = this.props.textLayer.current.innerHTML })
  }

  async highlightText (word) {
    this.props.textLayer.current.innerHTML = this.cleanText
    if (word.length < 3) return
    const spans = this.props.textLayer.current.children
    // We strip out all non-alphanumerics, for fuzzy search
    const text = Array.from(spans).map(span => span.innerText).join("").replace(/[^a-zA-Z0-9]/gm, "").toLowerCase()
    word = word.replace(/[^a-zA-Z0-9]/gm, "").toLowerCase()
    let start = text.indexOf(word)
    let end = start + word.length
    let counter = 0
    let before = true
    let after = false
    for (const span of spans) {
      let prior = ""
      let pre = ""
      let within = ""
      let post = ""
      for (const letter of span.innerText) {
        if (counter === start) {
          before = false
        } else if (counter === end) {
          after = true
          start = text.indexOf(word, end)
          if (start >= 0) {
            prior += `${pre}<mark>${within}</mark>${post}`
            pre = ""
            within = ""
            post = ""
            end = start + word.length
            before = true
            after = false
          }
        }
        if (before) {
          pre += letter
        } else if (after) {
          post += letter
        } else {
          within += letter
        }
        if (letter.match(/[a-zA-Z0-9]/)) counter++
      }
      if (within !== "" ) {
        span.innerHTML = `${prior}${pre}<mark>${within}</mark>${post}`
      } else if (prior !== "") {
        span.innerHTML = `${prior}${pre}${within}${post}`
      }
    }
  }

  render(props) {
    return (
      <Fragment>
        <canvas ref={this.canvas} data-page={props.pageFocused} id="pdf-canvas" />
        <div style="z-index:3" ref={this.props.textLayer} id="text-layer" />
      </Fragment>
    )
  }
}
