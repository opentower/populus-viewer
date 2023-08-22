import { h, createRef, Fragment, Component } from 'preact';
import PdfPage from './pdfPage.js'
import Resource from "./utils/resource.js"
import Client from './client.js'
import Toast from "./toast.js"
import Location from './utils/location.js'
import * as PDFJS from "pdfjs-dist/webpack"
import History from './history.js'
import { lastViewed } from "./constants.js"

export default class PdfContent extends Component {
  
  // we store downloaded PDFs here in order to avoid excessive downloads.
  // Could alternatively use localstorage or some such eventually. We don't
  // use preact state since changes here aren't relevent to UI.
  static PDFStore = {}

  // we expose this method so that we can unformly sanatize position-strings
  // before passing them to components that expect timestamps
  static positionToPage(pos, room) {
    const tryLastPosition = room?.getAccountData(lastViewed)?.getContent().position
    const tryParse = parseInt(pos, 10)
    // need isInteger because 0 is falsey
    return Number.isInteger(tryParse)
      ? tryParse 
      : Number.isInteger(tryLastPosition)
      ? tryLastPosition
      : 1
  }

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

  componentDidUpdate(prevProps) {
    if (this.props.resourceLength !== prevProps.resourceLength || // on length becoming known
      prevProps.pageFocused !== this.props.pageFocused // on page focus changing
    ) {
      if (this.props.pageFocused < 1 || this.props.pageFocused > this.props.resourceLength) this.handleBadPage()
      else {
        this.updateSavedLocation()
        if (this.props.pageFocused > prevProps.pageFocused) this.props.contentContainer.current.scrollTop = 0
        else if (this.props.pageFocused < prevProps.pageFocused) this.props.contentContainer.current.scrollTop = this.props.contentContainer.current.scrollHeight
      }
    }
  }

  updateSavedLocation = _ => {
    // we only save if you've stopped zipping around for more than a second
    clearTimeout(this.saveLocationTimeout)
    this.saveLocationTimeout = setTimeout(_ => {
        Client.client.setRoomAccountData(this.props.room.roomId, lastViewed, {
          deviceId: Client.deviceId,
          position: this.props.pageFocused
        })
    }, 1500)
  }

  handleBadPage = _ => {
    if (this.props.resourceLength) {
      console.log("fired")
      const newPage = this.props.pageFocused < this.props.resourceLength ? 1 : this.props.resourceLength
      History.replace(`/${encodeURIComponent(this.props.resourceAlias)}` + 
        `/${newPage}` + 
        `${this.props.roomFocused ? `/${this.props.roomFocused}` : ""}` +
        `${this.props.eventFocused ? `/${this.props.eventFocused}` : ""}`
      )
    }
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
      <h3 id="toast-header">Не вдалося завантажити PDF-файл...</h3>
      <div>Спробував отримати: </div>
      <pre>{this.props.resourceAlias}</pre>
      <div>Ось повідомлення про помилку:</div>
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

  zoomMin = 1

  zoomMax = 5

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
        filteredAnnotationContents={props.filteredAnnotationContents}
        focus={props.focus}
        pageFocused={props.pageFocused}
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
        setPdfDimensions={this.setMainPageDimensions}
        setPdfLoadingStatus={props.setPdfLoadingStatus}
        zoomFactor={props.zoomFactor}
      />
      {secondaryPageVisible
        ? <PdfPage
          filteredAnnotationContents={props.filteredAnnotationContents}
          focus={props.focus}
          fixedSide={secondaryPageVisible ? "right" : null}
          hasFetched={this.hasFetched}
          pdfPromise={state.pdfPromise}
          pageFocused={props.pageFocused + 1}
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
          zoomFactor={props.zoomFactor}
        />
        : null
      }
    </div>
  }
}
