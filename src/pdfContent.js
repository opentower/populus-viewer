import { h, createRef, Fragment, Component } from 'preact';
import PdfPage from './pdfPage.js'
import Resource from "./utils/resource.js"
import Toast from "./toast.js"
import Location from './utils/location.js'
import * as PDFJS from "pdfjs-dist/webpack"
import History from './history.js'

export default class PdfContent extends Component {
  static PDFStore = {}
  // we store downloaded PDFs here in order to avoid excessive downloads.
  // Could alternatively use localstorage or some such eventually. We don't
  // use preact state since changes here aren't relevent to UI.

  constructor(props) {
    super(props)
    this.state = {
      showSecondary: false,
      mainPageWidthPx: null,
      mainPageHeightPx: null,
      secondaryPageWidthPx: null,
      secondaryPageHeightPx: null
    }
    this.hasFetched = new Promise((resolve, reject) => {
      this.resolveFetch = resolve
      this.rejectFetch = reject
    })
  }

  componentDidMount() { 
    this.fetchPdf()
    // fetch will fail if the initial sync isn't complete, but that should be handled by the splash page
  }

  mainPage = createRef()

  secondaryPage = createRef()

  getSecondaryHeight = _ => this.state.showSecondary
    ? (this.state.secondaryPageHeightPx || 0)
    : 0

  getSecondaryWidth = _ => this.state.showSecondary
    ? (this.state.secondaryPageWidthPx || 0)
    : 0

  setMainPageDimensions = (mainPageHeightPx, mainPageWidthPx) => {
    this.setState({mainPageHeightPx, mainPageWidthPx}, this.refreshDimensions)
  }

  setSecondaryPageDimensions = (secondaryPageHeightPx, secondaryPageWidthPx) => {
    this.setState({secondaryPageHeightPx, secondaryPageWidthPx}, this.refreshDimensions)
  }

  refreshDimensions = _ => this.props.setContentDimensions(
    Math.max(this.state.mainPageHeightPx, this.getSecondaryHeight()),
    this.state.mainPageWidthPx + this.getSecondaryWidth()
  )

  toggleSecondary = _ => {
    this.setState(oldState => { return {showSecondary: !oldState.showSecondary} },
      this.refreshDimensions
    )
  }

  catchFetchPdfError = e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">Couldn't fetch the PDF...</h3>
      <div>Tried to fetch: </div>
      <pre>{this.props.resourceAlias}</pre>
      <div>Here's the error message:</div>
      <pre>{e.message}</pre>
    </Fragment>)
    History.push('/')
    this.errorCondition = true
  }

  async fetchPdf () {
    const thePdf = new Resource(this.props.room)
    if (!PdfContent.PDFStore[thePdf.url]) {
      PdfContent.PDFStore[thePdf.url] = window.fetch(thePdf.httpUrl)
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
        .catch(this.catchFetchPdfError)
    } else { console.log(`found pdf for ${this.props.room.name} in store` ) }
    if (this.errorCondition) return
    this.setState({
      pdfPromise: PdfContent.PDFStore[thePdf.url]
    }, _ => PdfContent.PDFStore[thePdf.url] // we resolve fetch in the callback here to guarantee that the pdf promise is available before we try to draw anything
      .then(pdf => this.props.setTotalPages(pdf.numPages))
      .then(this.resolveFetch)
      .then(this.gatherText)
    ) 
  }

  gatherText = async  _ => {
    if (this.props.setPdfText) {
      const pdf = await this.state.pdfPromise
      const pdfText = {}
      for (let i = 1; i < pdf.numPages + 1; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        pdfText[i] = content.items.map(item => item.str).join(" ")
      }
      this.props.setPdfText(pdfText)
    }
  }

  releasePin = e => {
    let page
    if (this.mainPage.current.isTarget(e)) page = "primary"
    else if (this.secondaryPage?.current?.isTarget(e)) page = "secondary"
    else {
      document.removeEventListener("click", this.releasePin)
      this.props.setPindropMode(null)
      return
    }
    const theX = e.altKey
      ? Math.round((e.offsetX - 14) / 14) * 14
      : e.offsetX - 14
    const theY = e.altKey
      ? Math.round((e.offsetY - 14) / 14) * 14
      : e.offsetY - 14
    this.props.setPindropMode({x: theX, y: theY, page})
  }

  commitHighlight = _ => {
    let thePage
    if (this.mainPage.current.hasSelection()) thePage = this.mainPage.current
    else if (this.secondaryPage?.current?.hasSelection()) thePage = this.secondaryPage.current
    else return
    thePage.commitHighlight()
      .then(fakeEvent => {
        this.props.setFocus(new Location(fakeEvent))
        this.props.showChat()
      }).catch(e => alert(e))
  }

  commitPin = (theX, theY, thePage) => {
    if (thePage === "primary") thePage = this.mainPage.current
    else if (thePage === "secondary") thePage = this.secondaryPage.current
    else return
    thePage.commitPin(theX, theY)
      .then(fakeEvent => {
        this.props.setFocus(new Location(fakeEvent))
        this.props.showChat()
      }).catch(e => alert(e))
    document.removeEventListener("click", this.releasePin)
    this.props.setPindropMode(null)
  }

  generateLocation = _ => {
    const theSelection = window.getSelection()
    if (theSelection.isCollapsed) return
    if (this.mainPage.current.hasSelection()) return this.mainPage.current.generateLocation(theSelection)
    if (this.secondaryPage?.current?.hasSelection()) return this.secondaryPage?.current?.generateLocation(theSelection)
  }

  hasSelection = _ => {
    return this.mainPage.current.hasSelection() || this.secondaryPage?.current?.hasSelection()
  }

  render(props, state) {
    const secondaryPageVisible = state.showSecondary && props.pageFocused < props.totalPages
    const primaryPindrop = props.pindropMode?.page === "primary" ? props.pindropMode : null
    const secondaryPindrop = props.pindropMode?.page === "secondary" ? props.pindropMode : null
    const hideUntilWidthAvailable = { visibility: state.mainPageHeightPx ? null : "hidden" }
    return <div style={hideUntilWidthAvailable} id="document-view">
      <PdfPage
        annotationsVisible={props.annotationsVisible}
        filteredAnnotationContents={props.filteredAnnotationContents}
        focus={props.focus}
        pageFocused={props.pageFocused}
        resourceAlias={props.resourceAlias}
        pdfHeightPx={state.mainPageHeightPx}
        pdfWidthPx={state.mainPageWidthPx}
        fixedSide={secondaryPageVisible ? "left" : null}
        hasFetched={this.hasFetched}
        pdfPromise={state.pdfPromise}
        pindropMode={primaryPindrop}
        ref={this.mainPage}
        room={props.room}
        searchString={props.searchString}
        secondaryFocus={props.secondaryFocus}
        setFocus={props.setFocus}
        setResource={props.setResource}
        setPdfDimensions={this.setMainPageDimensions}
        setPdfLoadingStatus={props.setPdfLoadingStatus}
        setPdfText={props.setPdfText}
        setTotalPages={props.setTotalPages}
        zoomFactor={props.zoomFactor}
      />
      {secondaryPageVisible
        ? <PdfPage
          annotationsVisible={props.annotationsVisible}
          filteredAnnotationContents={props.filteredAnnotationContents}
          focus={props.focus}
          fixedSide={secondaryPageVisible ? "right" : null}
          hasFetched={this.hasFetched}
          pdfPromise={state.pdfPromise}
          pageFocused={props.pageFocused + 1}
          resourceAlias={props.resourceAlias}
          pdfHeightPx={state.secondaryPageHeightPx}
          pdfWidthPx={state.secondaryPageWidthPx}
          pindropMode={secondaryPindrop}
          ref={this.secondaryPage}
          room={props.room}
          searchString={props.searchString}
          secondaryFocus={props.secondaryFocus}
          setFocus={props.setFocus}
          setPdfDimensions={this.setSecondaryPageDimensions}
          setPdfLoadingStatus={props.setPdfLoadingStatus}
          setTotalPages={props.setTotalPages}
          zoomFactor={props.zoomFactor}
        />
        : null
      }
    </div>
  }
}
