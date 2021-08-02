import { h, createRef, Fragment, Component } from 'preact';
import './styles/pdfView.css'
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"
import AnnotationLayer from "./annotation.js"
import Chat from "./chat.js"
import AnnotationListing from "./annotationListing.js"
import QueryParameters from './queryParams.js'
import Client from './client.js'
import Navbar from "./navbar.js"
import { eventVersion, pdfStateType, spaceChild, spaceParent, lastViewed } from "./constants.js"
import Modal from "./modal.js"
import Toast from "./toast.js"
import * as Icons from "./icons.js"
import UserColor from "./userColors.js"

export default class PdfView extends Component {
  static PDFStore = {}
  // we store downloaded PDFs here in order to avoid excessive downloads.
  // Could alternatively use localstorage or some such eventually. We don't
  // use preact state since changes here aren't relevent to UI.

  constructor(props) {
    super(props)
    this.state = {
      roomId: null,
      focus: null,
      totalPages: null,
      navHeight: 75,
      panelVisible: false,
      hasSelection: false,
      annotationsVisible: true,
      annotationContents: [],
      filteredAnnotationContents: [],
      annotationFilter: "",
      loadingStatus: "loading...",
      pdfWidthPx: null,
      pdfHeightPx: null,
      pdfFitRatio: 1,
      zoomFactor: 1,
      modalContent: null,
      hideButtons: false // this is for hiding the buttons, but only applies if the buttons overlap the chatbox
    }
    this.prevScrollTop = 0
    this.checkForSelection = this.checkForSelection.bind(this)
    this.handleKeydown = this.handleKeydown.bind(this)
    this.handleAccountData = this.handleAccountData.bind(this)
    this.handleStateUpdate = this.handleStateUpdate.bind(this)
    this.userColor = new UserColor(Client.client.getUserId())
    // need the `bind` here in order to pass a named function into the event
    // listener with the proper `this` reference
  }

  componentDidMount() {
    document.addEventListener("selectionchange", this.checkForSelection)
    document.addEventListener('keydown', this.handleKeydown)
    this.handleStateUpdate()
    Client.client.on("RoomState.events", this.handleStateUpdate)
    Client.client.on("Room.accountData", this.handleAccountData)
  }

  componentWillUnmount() {
    document.removeEventListener("selectionchange", this.checkForSelection)
    document.removeEventListener('keydown', this.handleKeydown)
    Client.client.off("RoomState.events", this.handleStateUpdate)
    Client.client.off("Room.accountData", this.handleAccountData)
  }

  handleStateUpdate = _ => {
    const theRoom = Client.client.getRoom(this.state.roomId)
    if (theRoom) {
      const annotationContents = theRoom.getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
        .map(ev => {
          const content = ev.getContent()
          content.timestamp = ev.getTs()
          return content
        })
        .filter(content => content[eventVersion] && content[eventVersion].activityStatus === "open")
      this.setState({annotationContents, filteredAnnotationContents: this.filterAnnotations(this.state.annotationFilter, annotationContents)})
    } else setTimeout(this.handleStateUpdate, 500) // keep polling until the room is available
  }

  handlePointerDown = e => {
    this.pointerCache.push(e)
    if (this.pointerCache.length === 2) {
      this.initialDistance = Math.abs(this.pointerCache[0].clientX - this.pointerCache[1].clientX)
      this.initialZoom = this.state.zoomFactor
      this.setState({pinching: true})
    }
  }

  handlePointerUp = e => {
    this.pointerCache = this.pointerCache.filter(pointerEv => pointerEv.pointerId !== e.pointerId)
    if (this.state.pinching && this.pointerCache.length !== 2) this.setState({pinching: false})
  }

  handlePointerMove = e => {
    // update cache
    this.pointerCache.forEach((pointerEvent, index) => {
      if (e.pointerId === pointerEvent.pointerId) this.pointerCache[index] = e
    })
    // if two fingers are down, see if we're pinching
    if (this.pointerCache.length === 2) {
      const touchDistance = Math.abs(this.pointerCache[0].clientX - this.pointerCache[1].clientX)
      this.setZoom(this.initialZoom * (touchDistance / this.initialDistance))
    }
  }

  handleWidgetScroll = e => {
    if (this.prevScrollTop > e.target.scrollTop) this.setState({hideButtons: true})
    if (this.prevScrollTop < e.target.scrollTop) this.setState({hideButtons: false})
    this.prevScrollTop = e.target.scrollTop
  }

  handleAccountData = (e, room) => {
    if (room.roomId === this.state.roomId && this.props.pageFocused && e.getType() === lastViewed) {
      const theContent = e.getContent()
      if (theContent.page !== this.props.pageFocused && theContent.deviceId !== Client.deviceId) {
        this.populateToast(
          <Fragment>
            <h3 id="toast-header">Hey!</h3>
            <div>Another device is viewing a different page.</div>
            <div style="margin-top:10px">
              <button
                onclick={_ => {
                  this.props.pushHistory({pageFocused: theContent.page})
                  this.populateToast(null)
                }}
                class="styled-button">
                Jump to there →
              </button>
            </div>
          </Fragment>
        )
      }
    }
  }

  annotationLayer = createRef()

  annotationLayerWrapper = createRef()

  documentView = createRef()

  contentContainer = createRef()

  pointerCache = []

  setNavHeight = px => this.setState({ navHeight: px })

  setId = id => {
    // sets the roomId after loading a PDF, and also tries to use that information to update the focus.
    this.setState({roomId: id}, _ => QueryParameters.get("focus")
      ? this.focusByRoomId(QueryParameters.get("focus"))
      : null)
  }

  setPdfWidthPx = pdfWidthPx => this.setState({pdfWidthPx})

  setPdfFitRatio = pdfFitRatio => this.setState({pdfFitRatio})

  setPdfHeightPx = pdfHeightPx => this.setState({pdfHeightPx})

  // XXX : will need to debounce eventually
  setAnnotationFilter = annotationFilter => this.setState(oldState => {
    return {
      annotationFilter,
      filteredAnnotationContents: this.filterAnnotations(annotationFilter, oldState.annotationContents)
    }
  })

  setTotalPages = totalPages => this.setState({totalPages})

  setPdfLoadingStatus = loadingStatus => this.setState({loadingStatus})

  clearFocus = _ => this.setState({focus: null})

  toggleAnnotations = _ => this.setState(oldState => {
    return { annotationsVisible: !oldState.annotationsVisible }
  })

  emptyModal = _ => this.setState({ modalContent: null })

  populateModal = s => this.setState({ modalContent: s })

  emptyToast = _ => this.setState({ toastContent: null })

  populateToast = s => this.setState({ toastContent: s })

  setZoom = zoomFactor => {
    if (zoomFactor < 1) this.setState({zoomFactor: 1})
    else {
      zoomFactor = Math.min(zoomFactor, 5)
      const unscaledInternalOffsetX = (this.contentContainer.current.clientWidth / 2)
      const scaledInternalOffsetX = ((this.contentContainer.current.clientWidth / 2) / this.state.zoomFactor) * zoomFactor
      const scaledLeft = (this.contentContainer.current.scrollLeft / this.state.zoomFactor) * zoomFactor
      const unscaledInternalOffsetY = (this.contentContainer.current.clientHeight / 2)
      const scaledInternalOffsetY = ((this.contentContainer.current.clientHeight / 2) / this.state.zoomFactor) * zoomFactor
      const scaledTop = (this.contentContainer.current.scrollTop / this.state.zoomFactor) * zoomFactor
      const newX = scaledLeft + scaledInternalOffsetX - unscaledInternalOffsetX
      const newY = scaledTop + scaledInternalOffsetY - unscaledInternalOffsetY
      this.contentContainer.current.scrollTo(newX, newY)
      this.setState({zoomFactor})
    }
  }

  focusByRoomId = roomId => {
    const theRoom = Client.client.getRoom(this.state.roomId) // the roomId here is for the PDF
    const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theAnnotation = theRoomState.getStateEvents(spaceChild, roomId)
    if (theAnnotation) {
      QueryParameters.set("focus", roomId)
      this.setState({
        focus: theAnnotation.getContent()[eventVersion],
        panelVisible: true
      })
    }
  }

  togglePanel = () => this.setState({panelVisible: !this.state.panelVisible})

  checkForSelection () {
    if (this.selectionTimeout) clearTimeout(this.selectionTimeout)
    const hasSelection = !window.getSelection().isCollapsed &&
                       this.documentView.current.contains(window.getSelection().getRangeAt(0).endContainer) &&
                       this.documentView.current.contains(window.getSelection().getRangeAt(0).startContainer)
    this.selectionTimeout = setTimeout(200, this.setState({hasSelection}))
    // timeout to avoid excessive rerendering
  }

  handleKeydown = e => {
    if (e.altKey && e.key === 'a') this.openAnnotation()
    if (e.altKey && e.key === 'r') this.closeAnnotation()
    if (e.altKey && e.key === 'v') this.toggleAnnotations()
    if (e.ctrlKey || e.altKey || e.metaKey) return // Don't catch browser shortcuts
    if (e.key === '+') this.setZoom(this.state.zoomFactor + 0.1)
    if (e.key === '=') this.setZoom(this.state.zoomFactor + 0.1)
    if (e.key === '-') this.setZoom(this.state.zoomFactor - 0.1)
    if (e.key === "Esc" || e.key === "Escape") this.props.pushHistory({pdfFocused: null, pageFocused: null});
    if (e.key === 'h') {
      this.props.pushHistory({pageFocused: 1 }, _ => {
        this.contentContainer.current.scrollTop = 0
      })
    }
    if (e.key === 'j' || e.key === "ArrowRight") {
      if (this.props.pageFocused < this.state.totalPages) {
        this.props.pushHistory({ pageFocused: this.props.pageFocused + 1 }, _ => {
          this.contentContainer.current.scrollTop = 0
        })
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault() // block default scrolling behavior
      this.contentContainer.current.scroll({
        top: this.contentContainer.current.scrollTop - 100,
        left: this.contentContainer.current.scrollLeft
      })
    }
    if (e.key === "ArrowDown") {
      e.preventDefault() // block default scrolling behavior
      this.contentContainer.current.scroll({
        top: this.contentContainer.current.scrollTop + 100,
        left: this.contentContainer.current.scrollLeft
      })
    }
    if (e.key === 'k' || e.key === "ArrowLeft") {
      if (this.props.pageFocused > 1) {
        this.props.pushHistory({pageFocused: this.props.pageFocused - 1}, _ => {
          this.contentContainer.current.scrollTop = this.contentContainer.current.scrollHeight
        })
      }
    }
    if (e.key === 'l') {
      this.props.pushHistory({pageFocused: this.state.totalPages}, _ => {
        this.contentContainer.current.scrollTop = 0
      })
    }
  }

  openAnnotation = _ => {
    this.setState({ annotationsVisible: true })
    const theSelection = window.getSelection()
    if (theSelection.isCollapsed) return
    const theRange = theSelection.getRangeAt(0)
    const theSelectedText = theSelection.toString()
    const theDomain = Client.client.getDomain()

    const boundingClientRect = Layout.rectRelativeTo( this.annotationLayerWrapper.current
      , theRange.getBoundingClientRect()
      , this.state.pdfFitRatio * this.state.zoomFactor
    )
    const clientRects = Array.from(theRange.getClientRects())
      .map(rect => Layout.rectRelativeTo(this.annotationLayerWrapper.current, rect, this.state.pdfFitRatio * this.state.zoomFactor))
      // TODO: room creation is a bit slow, might want to rework this slightly for responsiveness
      //
      // TODO: we should set room_alias_name, name, and topic in the options
      // object, in a useful way based on the selection
    Client.client.createRoom({
      visibility: "public",
      initial_state: [{
        type: "m.room.join_rules",
        state_key: "",
        content: {join_rule: "public"}
      }]
    }).then(roominfo => {
      // set child event in pdfRoom State
      theSelection.removeAllRanges()
      const childContent = {
        via: [theDomain],
        [eventVersion]: {
          pageNumber: this.props.pageFocused,
          activityStatus: "open",
          boundingClientRect: JSON.stringify(boundingClientRect),
          clientRects: JSON.stringify(clientRects),
          roomId: roominfo.room_id,
          creator: Client.client.getUserId(),
          selectedText: theSelectedText
        }
      }
      Client.client.sendStateEvent(this.state.roomId, spaceChild, childContent, roominfo.room_id)
        .catch(e => alert(e))
      // set parent event in child room state XXX: should possibly incorporate into creation state
      Client.client.sendStateEvent(roominfo.room_id, spaceParent, { via: [theDomain] }, this.state.roomId)
        .catch(e => alert(e))
      this.setFocus(childContent[eventVersion])
      this.setState({ panelVisible: true })
    })
  }

  closeAnnotation = _ => {
    const theDomain = Client.client.getDomain()
    if (confirm('Are you sure you want to close this annotation?')) {
      const theContent = {
        via: [theDomain],
        [eventVersion]: {
          pageNumber: this.state.focus.pageNumber,
          activityStatus: "closed",
          clientRects: this.state.focus.clientRects,
          creator: this.state.focus.creator
        }
      }
      Client.client.sendStateEvent(this.state.roomId, spaceChild, theContent, this.state.focus.roomId)
      this.setState({focus: null})
      QueryParameters.delete("focus")
      QueryParameters.replaceHistory({
        pdfFocused: this.props.pdfFocused,
        pageFocused: this.props.pageFocused
      })
    } else {
      return false;
    }
  }

  setFocus = (content) => {
    QueryParameters.set("focus", content.roomId)
    QueryParameters.replaceHistory({
      pdfFocused: this.props.pdfFocused,
      pageFocused: this.props.pageFocused,
      annotationFocused: content.roomId
    })
    this.setState({focus: content})
  }

  getLoadingStatus() {
    if (this.state.pdfHeightPx) return null
    if (typeof this.state.loadingStatus === "string") {
      return <div id="document-view-loading">{this.state.loadingStatus}</div>
    }
    if (typeof this.state.loadingStatus === "number") {
      return <div id="document-view-loading">Downloading Pdf...
          <progress class="styled-progress" max="1" value={this.state.loadingStatus} />
        </div>
    }
  }

  filterAnnotations = (search, annotations) => {
    const searchText = []
    const searchMembers = []
    const searchWords = search.split(" ")
    for (const word of searchWords) {
      if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else searchText.push(word)
    }
    return annotations.filter(content => {
      return searchText.every(frag => content[eventVersion].selectedText.toLowerCase().includes(frag.toLowerCase())) &&
        searchMembers.every(member => content[eventVersion].creator.toLowerCase().includes(member.toLowerCase()))
    })
  }

  render(props, state) {
    const dynamicDocumentStyle = {
      "--pdfZoomFactor": state.zoomFactor,
      "--navHeight": `${state.navHeight}px`,
      "--pdfFitRatio": state.pdfFitRatio,
      "--pdfWidthPx": `${state.pdfWidthPx}px`,
      "--pdfHeightPx": `${state.pdfHeightPx}px`,
      "--sidePanelVisible": state.panelVisible ? 1 : 0,
      "--selectColor": this.userColor.solid,
      "touch-action": this.state.pinching ? "none" : null
    }
    const hideUntilWidthAvailable = {
      visibility: state.pdfHeightPx ? null : "hidden"
    }
    const theRoom = Client.client.getRoom(state.roomId)
    return (
      <div style={dynamicDocumentStyle}
        id="content-container"
        ref={this.contentContainer}
        onPointerDown={this.handlePointerDown}
        onPointerUp={this.handlePointerUp}
        onPointerCancel={this.handlePointerUp}
        onPointerLeave={this.handlePointerUp}
        onPointerMove={this.handlePointerMove}>
        <Modal modalVisible={!!state.modalContent} hideModal={this.emptyModal}>{state.modalContent}</Modal>
        <Toast toastVisible={!!state.toastContent} hideToast={this.emptyToast}>{state.toastContent}</Toast>
        {this.getLoadingStatus()}
        <div style={hideUntilWidthAvailable} ref={this.documentView} id="document-view">
          <div id="document-wrapper">
            <PdfCanvas setPdfWidthPx={this.setPdfWidthPx}
              setPdfHeightPx={this.setPdfHeightPx}
              setPdfFitRatio={this.setPdfFitRatio}
              annotationLayer={this.annotationLayer}
              pdfFocused={props.pdfFocused}
              pageFocused={props.pageFocused}
              initFocus={this.initFocus}
              setId={this.setId}
              setTotalPages={this.setTotalPages}
              setPdfLoadingStatus={this.setPdfLoadingStatus}
            />
            {state.annotationsVisible
              ? <AnnotationLayer ref={this.annotationLayer}
                  annotationLayer={this.annotationLayer}
                  annotationLayerWrapper={this.annotationLayerWrapper}
                  zoomFactor={state.zoomFactor}
                  page={props.pageFocused}
                  roomId={state.roomId}
                  setFocus={this.setFocus}
                  focus={state.focus} />
              : null
            }
          </div>
        </div>
        <div id="sidepanel">
          {state.focus
            ? <Chat class="panel-widget-1"
                pushHistory={props.pushHistory}
                setFocus={this.setFocus}
                handleWidgetScroll={this.handleWidgetScroll}
                focus={state.focus} />
            : null
          }
          <AnnotationListing
              roomId={state.roomId}
              class={state.focus ? "panel-widget-2" : "panel-widget-1"}
              focus={state.focus}
              setAnnotationFilter={this.setAnnotationFilter}
              annotationFilter={state.annotationFilter}
              annotationContents={state.annotationContents}
              filteredAnnotationContents={state.filteredAnnotationContents}
              handleWidgetScroll={this.handleWidgetScroll}
              focusByRoomId={this.focusByRoomId}
              pushHistory={props.pushHistory}
              room={theRoom}
            />
        </div>
        <Navbar selected={state.hasSelection}
          addann={this.openAnnotation}
          closeann={this.closeAnnotation}
          page={props.pageFocused}
          total={state.totalPages}
          focus={state.focus}
          roomId={state.roomId}
          container={this.contentContainer}
          setNavHeight={this.setNavHeight}
          populateModal={this.populateModal}
          annotationsVisible={state.annotationsVisible}
          toggleAnnotations={this.toggleAnnotations}
          pdfWidthPx={state.pdfWidthPx}
          pushHistory={props.pushHistory}
          setZoom={this.setZoom}
          zoomFactor={state.zoomFactor} />
        <div data-hide-buttons={state.hideButtons} id="pdf-panel-button-wrapper">
          {(state.panelVisible && state.focus)
            ? <button title="focus annotation list" id="show-annotations" onclick={this.clearFocus}>
              {Icons.list}
            </button>
            : null
          }
          <button title="toggle sidebar" id="panel-toggle" onclick={this.togglePanel}>
            {state.panelVisible ? Icons.close : Icons.menu }
          </button>
        </div>
      </div>
    )
  }
}

class PdfCanvas extends Component {
  constructor(props) {
    super(props)
    this.canvasRefreshAt = Date.now()
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
      )
    }
  }

  shouldComponentUpdate(nextProps) {
    if (!this.hasRendered || (this.props.pageFocused !== nextProps.pageFocused)) {
      this.canvasRefreshAt = Date.now()
    }
  }

  componentDidMount() {
    this.fetchPdf(this.props.pdfFocused)
    // fetch will fail if the initial sync isn't complete, but that should be handled by the splash page
    this.textLayer.current.addEventListener('click', e => {
      e.preventDefault() // this should prevent touch-to-search on mobile chrome
      const mouseEvent = new MouseEvent(e.type, e)
      document.elementsFromPoint(e.clientX, e.clientY).forEach(elt => {
        if (elt.hasAttribute("data-annotation")) elt.dispatchEvent(mouseEvent)
      })
    })
  }

  textLayer = createRef()

  canvas = createRef()

  async fetchPdf (alias) {
    const theId = await Client.client.getRoomIdForAlias(alias)
    await Client.client.joinRoom(theId.room_id)
    this.props.setId(theId.room_id)
    const theRoom = await Client.client.getRoomWithState(theId.room_id)
    const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const pdfIdentifier = theRoomState.getStateEvents(pdfStateType, "").getContent().mxc
    const pdfPath = Client.client.getHttpUriForMxcFromHS(pdfIdentifier)
    this.setState({pdfIdentifier})
    if (!PdfView.PDFStore[pdfIdentifier]) {
      await window.fetch(pdfPath)
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
        .then(array => {
          PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(array).promise
        })
    } else { console.log(`found pdf for ${theRoom.name} in store` ) }
    PdfView.PDFStore[pdfIdentifier]
      .then(pdf => this.props.setTotalPages(pdf.numPages))
      .then(this.resolveFetch)
  }

  // because rendering is async, we need a way to cancel pending render tasks and
  // to make sure that pending drawPdf calls don't proceed. That's what this function does.
  grabControl() {
    const controlToken = {}
    this.controlToken = controlToken
    // we spawn a new control token - this is just an empty object, the
    // important thing is that it's a *new* empty object, since previous
    // drawPdf calls will check to see if the control token is the same as
    // the one that they were spawned with
    try { this.pendingRender.cancel() } catch (err) { console.log(err) }
    try { this.pendingTextRender.cancel() } catch (err) { console.log(err) }
    // now that we're sure we won't spawn any unintended renders, we cancel
    // any pending renders
    this.textLayer.current.innerHTML = ''
    // and we clear the textlayer.
    return controlToken
  }

  async drawPdf (control) {
    // since we've started rendering, we want to block subsequent render attempts
    this.hasRendered = true
    const theCanvas = this.canvas.current
    await this.hasFetched
    this.props.setPdfLoadingStatus("Rendering PDF")
    const pdf = await PdfView.PDFStore[this.state.pdfIdentifier]

    // exit early if someone else has grabbed control
    if (control !== this.controlToken) return
    // Fetch the first page
    const page = await pdf.getPage(this.props.pageFocused || 1)
    console.log('Page loaded');

    const scale = 3
    const viewport = page.getViewport({scale});

    // Prepare canvas using PDF page dimensions
    theCanvas.height = viewport.height;
    theCanvas.width = viewport.width;

    // pass scaled height in px upwards for css variables

    const pdfWidthPx = Math.min((viewport.width * 1.5) / scale, window.innerWidth)
    const pdfHeightPx = (pdfWidthPx / viewport.width) * viewport.height
    this.props.setPdfWidthPx(pdfWidthPx)
    this.props.setPdfFitRatio(Math.min(1, window.innerWidth / ((viewport.width * 1.5) / scale)))
    this.props.setPdfHeightPx(pdfHeightPx)

    // Render PDF page into canvas context
    const canvasContext = theCanvas.getContext('2d')

    const renderContext = {
      canvasContext,
      viewport
    };

    if (control !== this.controlToken) return
    this.pendingRender = page.render(renderContext);

    await this.pendingRender.promise
    console.log('Page rendered');
    const text = await page.getTextContent();

    if (control !== this.controlToken) return
    // insert the pdf text into the text layer
    this.pendingTextRender = PDFJS.renderTextLayer({
      textContent: text,
      container: this.textLayer.current,
      viewport: page.getViewport({scale: 1.5}),
      textDivs: []
    })
  }

  render(props) {
    return (
      <Fragment>
        <canvas key={this.canvasRefreshAt} ref={this.canvas} data-page={props.pageFocused} id="pdf-canvas" />
        <div style="z-index:3" ref={this.textLayer} id="text-layer" />
      </Fragment>
    )
  }
}
