import { h, createRef, Fragment, Component } from 'preact';
import PdfPage from './pdfPage.js'
import Location from './utils/location.js'

export default class PdfContent extends Component {
  constructor(props) {
    super(props)
    this.state = {
      showSecondary: false,
      mainPageWidthPx: null,
      mainPageHeightPx: null,
      secondaryPageWidthPx: null,
      secondaryPageHeightPx: null
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
    console.log(thePage)
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

  generateLocation = sel => {
    if (this.mainPage.current.hasSelection()) return this.mainPage.current.generateLocation(sel)
    if (this.secondaryPage?.current?.hasSelection()) return this.secondaryPage?.current?.generateLocation(sel)
  }

  hasSelection = _ => {
    return this.mainPage.current.hasSelection() || this.secondaryPage?.current?.hasSelection()
  }

  render(props, state) {
    const secondaryPageVisible = state.showSecondary && props.pageFocused < props.totalPages
    const primaryPindrop = props.pindropMode?.page === "primary" ? props.pindropMode : null
    const secondaryPindrop = props.pindropMode?.page === "secondary" ? props.pindropMode : null
    return <Fragment>
      <PdfPage
        annotationsVisible={props.annotationsVisible}
        filteredAnnotationContents={props.filteredAnnotationContents}
        focus={props.focus}
        pageFocused={props.pageFocused}
        resourceAlias={props.resourceAlias}
        pdfHeightPx={state.mainPageHeightPx}
        pdfWidthPx={state.mainPageWidthPx}
        pindropMode={primaryPindrop}
        ref={this.mainPage}
        room={props.room}
        roomId={props.roomId}
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
          pageFocused={props.pageFocused + 1}
          resourceAlias={props.resourceAlias}
          pdfHeightPx={state.secondaryPageHeightPx}
          pdfWidthPx={state.secondaryPageWidthPx}
          pindropMode={secondaryPindrop}
          ref={this.secondaryPage}
          room={props.room}
          roomId={props.roomId}
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
    </Fragment>
  }
}
