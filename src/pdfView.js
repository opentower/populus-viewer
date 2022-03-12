import { h, createRef, Fragment, Component } from 'preact';
import Router from 'preact-router';
import './styles/pdfView.css'
import './styles/content-container.css'
import * as Matrix from "matrix-js-sdk"
import { unionRects } from "./utils/layout.js"
import Chat from "./chat.js"
import RoomIcon from "./roomIcon.js"
import AnnotationListing from "./annotationListing.js"
import SearchResults from "./searchResults.js"
import PdfPage from "./pdfPage.js"
import History from './history.js'
import Client from './client.js'
import Navbar from "./navbar.js"
import QuadPoints from "./utils/quadPoints.js"
import { mscLocation, mscPdfText, mscPdfHighlight, populusHighlight, spaceChild, spaceParent, lastViewed } from "./constants.js"
import Location from './utils/location.js'
import { textFromPdfSelection, rectsFromPdfSelection } from './utils/selection.js'
import SyncIndicator from './syncIndicator.js'
import Toast from "./toast.js"
import { onlineOrAlert } from "./utils/alerts.js"
import ToolTip from "./utils/tooltip.js"
import * as Icons from "./icons.js"
import { UserColor } from "./utils/colors.js"

export default class PdfView extends Component {
  constructor(props) {
    super(props)
    const maybeState = History.history.location.state
    this.state = {
      roomId: null,
      focus: null,
      secondaryFocus: null, // for temporarily focusing an extra location
      totalPages: null,
      navHeight: 75,
      panelVisible: false,
      chatVisible: false,
      listingType: null,
      listingVisible: maybeState ? !!maybeState.searchString : false,
      hasSelection: false,
      annotationsVisible: true,
      annotationContents: [],
      filteredAnnotationContents: [],
      pindropMode: null,
      annotationFilter: maybeState ? maybeState.searchString : "",
      searchString: "",
      loadingStatus: "loading...",
      pdfWidthPx: null,
      pdfHeightPx: null,
      pdfFitRatio: 1,
      zoomFactor: null,
      pinching: false
    }

    this.pdfScale = 3
    // single source of truth for PDF scale, pdfcanvas w/h are pdf dimensions (in userspace units) times scale
    this.prevScrollTop = 0
    this.checkForSelection = this.checkForSelection.bind(this)
    this.handleKeydown = this.handleKeydown.bind(this)
    this.handleTimeline = this.handleTimeline.bind(this)
    this.handleAccountData = this.handleAccountData.bind(this)
    this.handleStateUpdate = this.handleStateUpdate.bind(this)
    this.userColor = new UserColor(Client.client.getUserId())
    // need the `bind` here in order to pass a named function into the event
    // listener with the proper `this` reference
  }

  getPage() { return parseInt(this.props.pageFocused, 10) || 1 }

  componentDidMount() {
    document.addEventListener("selectionchange", this.checkForSelection)
    document.addEventListener('keydown', this.handleKeydown)
    this.updateAnnotations()
    Client.client.on("Room.timeline", this.handleTimeline)
    Client.client.on("RoomState.events", this.handleStateUpdate)
    Client.client.on("Room.accountData", this.handleAccountData)
  }

  componentWillUnmount() {
    document.removeEventListener("selectionchange", this.checkForSelection)
    document.removeEventListener('keydown', this.handleKeydown)
    Client.client.off("Room.timeline", this.handleTimeline)
    Client.client.off("RoomState.events", this.handleStateUpdate)
    Client.client.off("Room.accountData", this.handleAccountData)
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.state.roomId && e.getType() === spaceChild) {
      this.updateAnnotations()
    }
  }

  handleTimeline (_event, room) {
    const childIds = this.state.annotationContents.map(loc => loc.getChild())
    if (room?.roomId in childIds) this.updateAnnotations()
  }

  handleAccountData = (e, room) => {
    const childIds = this.state.annotationContents.map(loc => loc.getChild())
    if (room?.roomId in childIds) this.updateAnnotations()
    else if (room.roomId === this.state.roomId && this.props.pageFocused && e.getType() === lastViewed) {
      const theContent = e.getContent()
      if (theContent.page !== this.props.pageFocused && theContent.deviceId !== Client.deviceId) {
        Toast.set(
          <Fragment>
            <h3 id="toast-header">Hey!</h3>
            <div>Another device is viewing a different page.</div>
            <div style="margin-top:10px">
              <button
                onclick={_ => {
                  History.push(`/${encodeURIComponent(this.props.pdfFocused)}/${theContent.page}/`)
                  Toast.set(null)
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
      this.setZoom(_ => this.initialZoom * (touchDistance / this.initialDistance))
    }
  }

  annotationLayer = createRef()

  textLayer = createRef()

  annotationLayerWrapper = createRef()

  documentView = createRef()

  contentContainer = createRef()

  pointerCache = []

  setNavHeight = px => this.setState({ navHeight: px })

  setResource = room => {
    this.setState({room, roomId: room.roomId}, _ => this.props.roomFocused
      ? this.focusByRoomId(this.props.roomFocused)
      : null)
  }

  startPindrop = _ => {
    setTimeout(_ => {
      this.setState({pindropMode: {}})
      document.addEventListener("click", this.releasePin)
    }, 200)
  }

  releasePin = e => {
    if (e.target === this.annotationLayer.current.base) {
      const theX = e.altKey
        ? Math.round((e.offsetX - 14) / 14) * 14
        : e.offsetX - 14
      const theY = e.altKey
        ? Math.round((e.offsetY - 14) / 14) * 14
        : e.offsetY - 14
      this.setState({pindropMode: {x: theX, y: theY} })
    } else {
      document.removeEventListener("click", this.releasePin)
      this.setState({pindropMode: null })
    }
  }

  commitPin = (theX, theY) => {
    if (!onlineOrAlert()) return
    const theDomain = Client.client.getDomain()
    const newY = this.annotationLayerWrapper.current.scrollHeight - theY
    const locationData = {
      [mscPdfText]: {
        page_index: this.getPage(),
        rect: {
          left: theX,
          right: theX + 10,
          top: newY,
          bottom: newY - 10
        },
        name: "Comment",
        contents: "" // highlight contents, per PDF spec. TODO Fill this with the first chat message text, or fallback text
      },
      [populusHighlight]: {
        activityStatus: "pending",
        creator: Client.client.getUserId()
      }
    }
    if (this.state.pindropMode?.x) {
      Client.client.createRoom({
        visibility: "public",
        name: `pindrop on page ${this.getPage()}`,
        initial_state: [{
          type: "m.room.join_rules",
          state_key: "",
          content: {join_rule: "public"}
        },
        {
          type: spaceParent, // we indicate that the current room is the parent
          content: {
            via: [theDomain],
            [mscLocation]: locationData
          },
          state_key: this.state.roomId
        }
        ]
      }).then(roominfo => {
        // set child event in pdfRoom State
        const childContent = {
          via: [theDomain],
          [mscLocation]: locationData
        }
        const fakeEvent = new Matrix.MatrixEvent({
          type: "m.space.child",
          origin_server_ts: new Date().getTime(),
          room_id: this.state.roomId,
          sender: Client.client.getUserId(),
          state_key: roominfo.room_id,
          content: childContent
        })
        this.setFocus(new Location(fakeEvent))
        this.setState({ chatVisible: true })
        document.removeEventListener("click", this.releasePin)
        this.setState({pindropMode: null })
        return Client.client
          .sendStateEvent(this.state.roomId, spaceChild, childContent, roominfo.room_id)
          .then(_ => roominfo)
      }).catch(e => alert(e))
    }
  }

  quadsFromPdfSelection = sel => {
    const clientRects = rectsFromPdfSelection(sel, this.annotationLayerWrapper.current, this.state.pdfFitRatio * this.state.zoomFactor)
    const boundingClientRect = unionRects(clientRects)
    const clientQuads = clientRects.map(rect => QuadPoints.fromRectIn(rect, this.annotationLayerWrapper.current))
    const boundingQuad = QuadPoints.fromRectIn(boundingClientRect, this.annotationLayerWrapper.current)
    return {clientQuads, boundingQuad}
  }

  commitHighlight = _ => {
    if (!onlineOrAlert()) return
    const theSelection = window.getSelection()
    if (theSelection.isCollapsed) return
    const theSelectedText = textFromPdfSelection(theSelection)
    const { clientQuads, boundingQuad } = this.quadsFromPdfSelection(theSelection)
    // ↑ We've set the dimensions of the text layer in such a way that it's 72dpi, scaled up with a CSS transform.
    // So we can omit the DPI parameter here.
    const theDomain = Client.client.getDomain()
    const locationData = {
      [mscPdfHighlight]: {
        page_index: this.getPage(),
        rect: boundingQuad.getBoundingRect(),
        quad_points: clientQuads.map(quad => quad.getArray()),
        contents: "", // highlight contents, per PDF spec. Fill this with the first chat message text, or fallback text
        text_content: theSelectedText // the actual highlighted text
      },
      [populusHighlight]: {
        activityStatus: "pending",
        creator: Client.client.getUserId()
      }
    }
    // TODO: we should set room_alias_name and name, in a useful way based on the selection
    Client.client.createRoom({
      visibility: "public",
      name: `highlighted passage on page ${this.getPage()}`,
      topic: theSelectedText,
      initial_state: [{
        type: "m.room.join_rules",
        state_key: "",
        content: {join_rule: "public"}
      },
      {
        type: spaceParent, // we indicate that the current room is the parent
        content: { via: [theDomain], [mscLocation]: locationData },
        state_key: this.state.roomId
      }
      ]
    }).then(roominfo => {
      // set child event in pdfRoom State
      theSelection.removeAllRanges()
      const childContent = { via: [theDomain], [mscLocation]: locationData }
      // We focus on a new fake placeholder event to insert the highlight immediately
      const fakeEvent = new Matrix.MatrixEvent({
        type: "m.space.child",
        origin_server_ts: new Date().getTime(),
        room_id: this.state.roomId,
        sender: Client.client.getUserId(),
        state_key: roominfo.room_id,
        content: childContent
      })
      this.setFocus(new Location(fakeEvent))
      this.setState({ chatVisible: true })
      return Client.client.sendStateEvent(this.state.roomId, spaceChild, childContent, roominfo.room_id)
    }).catch(e => alert(e))
  }

  setPdfDimensions = (pdfHeightPx, pdfWidthPx) => {
    const width = document.body.clientWidth
    const height = document.body.clientHeight - this.state.navHeight - 10
    const heightratio = height / pdfHeightPx
    const widthratio = width / pdfWidthPx
    const zoomFactor = this.state.zoomFactor || Math.max(Math.min(heightratio, widthratio, 5), 1)
    this.setState({pdfHeightPx, pdfWidthPx, zoomFactor})
  }

  setPdfFitRatio = pdfFitRatio => this.setState({pdfFitRatio})

  setPdfText = pdfText => { this.pdfText = pdfText }

  // XXX : will need to debounce eventually
  setAnnotationFilter = annotationFilter => this.setState(oldState => {
    return {
      annotationFilter,
      filteredAnnotationContents: this.filterAnnotations(annotationFilter, oldState.annotationContents)
    }
  })

  setTotalPages = totalPages => this.setState({totalPages})

  setPdfLoadingStatus = loadingStatus => this.setState({loadingStatus})

  setSearch = searchString => this.setState({searchString})

  showSearch = _ => {
    this.setState({ listingType: "search" })
    this.showListing()
  }

  endSearch = _ => this.setState({listingType: null})

  toggleAnnotations = _ => this.setState(oldState => {
    return { annotationsVisible: !oldState.annotationsVisible }
  })

  setZoom = zoomFunction => {
    let zoomFactor = zoomFunction(this.state.zoomFactor)
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
    const theRoomState = this.state.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theAnnotation = theRoomState.getStateEvents(spaceChild, roomId)
    if (theAnnotation) {
      const focus = new Location(theAnnotation)
      History.push(`/${encodeURIComponent(this.props.pdfFocused)}/${focus.getPageIndex() || this.getPage()}/${roomId}`)
      const listingVisible = document.body.offsetWidth <= 600 ? false : this.state.listingVisible
      this.setState({ focus, secondaryFocus: null, chatVisible: true, listingVisible })
    }
  }

  focusNextInArray = array => {
    let reachedFocus = !this.state.focus
    if (!array) return
    for (const annot of array) {
      const theId = annot.getChild()
      if (reachedFocus) {
        this.focusByRoomId(theId)
        return
      }
      reachedFocus = this.state.focus.getChild() === theId
    }
    this.focusByRoomId(array[0].getChild())
  }

  focusNext = _ => {
    this.focusNextInArray(this.state.filteredAnnotationContents)
  }

  focusPrev = _ => {
    const clone = [... this.state.filteredAnnotationContents]
    this.focusNextInArray(clone.reverse())
  }

  prevPage = _ => {
    if (this.getPage() > 1) {
      History.push(`/${encodeURIComponent(this.props.pdfFocused)}/${this.getPage() - 1}/`)
      this.contentContainer.current.scrollTop = this.contentContainer.current.scrollHeight
    }
  }

  nextPage = _ => {
    if (this.getPage() < this.state.totalPages) {
      History.push(`/${encodeURIComponent(this.props.pdfFocused)}/${this.getPage() + 1}/`)
      this.contentContainer.current.scrollTop = 0
    }
  }

  hideChat = _ => this.setState({chatVisible: false})

  showChat = _ => {
    const narrow = document.body.offsetWidth <= 600
    if (narrow) this.setState({listingVisible: false, chatVisible: true})
    else this.setState({chatVisible: true})
  }

  toggleChat = _ => this.setState(oldState => {
    if (oldState.chatVisible) this.hideChat()
    else this.showChat()
  })

  hideListing = _ => this.setState({listingVisible: false})

  showListing = _ => {
    const narrow = document.body.offsetWidth <= 600
    if (narrow) this.setState({listingVisible: true, chatVisible: false})
    else this.setState({listingVisible: true})
  }

  toggleListing = _ => this.setState(oldState => {
    if (oldState.listingVisible) this.hideListing()
    else this.showListing()
  })

  openSidebar = _ => this.setState(_ => {
    if (this.focus) return {chatVisible: true}
    return {listingVisible: true}
  })

  checkForSelection () {
    if (this.selectionTimeout) clearTimeout(this.selectionTimeout)
    const hasSelection = !window.getSelection().isCollapsed &&
                       this.textLayer.current.contains(window.getSelection().getRangeAt(0).endContainer) &&
                       this.textLayer.current.contains(window.getSelection().getRangeAt(0).startContainer)
    this.selectionTimeout = setTimeout(200, this.setState({hasSelection}))
    // timeout to avoid excessive rerendering
  }

  handleRouteChange = _ => {
    // sets the last viewed page for later retrieval
    if (!this.props.pageFocused || !this.props.pdfFocused || !this.state.roomId) return
    Client.client.setRoomAccountData(this.state.roomId, lastViewed, {
      deviceId: Client.deviceId,
      ...(parseInt(this.props.pageFocused, 10) && { page: this.props.pageFocused })
    })
    this.refreshFocus()
  }

  handleKeydown = e => {
    if (e.altKey && e.key === 'a') this.openAnnotation()
    if (e.altKey && e.key === 'r') this.closeAnnotation()
    if (e.altKey && e.key === 'v') this.toggleAnnotations()
    if (e.altKey && e.key === "/") this.showSearch()
    if (e.ctrlKey || e.altKey || e.metaKey) return // Don't catch browser shortcuts
    if (e.key === '+' || e.key === '=') this.setZoom(zoomFactor => zoomFactor + 0.1)
    if (e.key === '-') this.setZoom(zoomFactor => zoomFactor - 0.1)
    if (e.key === "Esc" || e.key === "Escape") History.push("/")
    if (e.shiftKey) return // don't capture shift-modified arrow keys, these change the text selection
    if (e.key === 'j' || e.key === "ArrowRight") this.nextPage()
    if (e.key === 'k' || e.key === "ArrowLeft") this.prevPage()
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
  }

  openAnnotation = _ => {
    this.setState({ annotationsVisible: true })
    if (this.state.pindropMode?.x) this.commitPin(this.state.pindropMode.x, this.state.pindropMode.y)
    else this.commitHighlight()
  }

  closeAnnotation = _ => {
    const isCreator = Client.client.getUserId() === this.state.focus.getCreator()
    const isMod = this.state.room.getMember(Client.client.getUserId()).powerLevel >= 50
    if (!confirm('Are you sure you want to close this annotation?')) return
    if (!isCreator && !isMod) {
      alert("Only moderators can close annotations that they didn't create")
      return
    }
    Client.client.sendStateEvent(this.state.roomId, spaceChild, {}, this.state.focus.getChild())
    this.unsetFocus()
  }

  unsetFocus = _ => {
    // XXX breaking this up into two updates makes the animation work properly.
    // If you replace the element AND unset chat visibility in one update, then
    // the annotation panel jumps to the left
    this.setState({secondaryFocus: null, focus: null}, _ => this.setState({chatVisible: false}))
    History.push(`/${encodeURIComponent(this.props.pdfFocused)}/${this.props.pageFocused}/`)
  }

  setFocus = focus => {
    History.push(`/${encodeURIComponent(this.props.pdfFocused)}/${this.props.pageFocused}/${focus.getChild()}/`)
    this.setState({secondaryFocus: null, focus, chatVisible: true })
  }

  refreshFocus = _ => {
    const theRoomState = this.state.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theAnnotation = theRoomState.getStateEvents(spaceChild, this.props.roomFocused)
    if (theAnnotation) this.setState({ focus: new Location(theAnnotation) })
  }

  setSecondaryFocus = secondaryFocus => this.setState({ secondaryFocus })

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

  updateAnnotations = _ => {
    if (this.state.room) {
      const annotationContents = this.state.room.getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
        .map(ev => new Location(ev))
        .filter(loc => loc.isValid() &&
          // we infer that you are a member if you have unread. TODO Should do this more directly.
          (!loc.isPrivate() || loc.getUnread() !== "All") &&
          ( loc.getStatus() !== "pending" ||
            ( loc.getStatus() === "pending" && loc.getCreator() === Client.client.getUserId())
          )
        )
      this.setState({annotationContents, filteredAnnotationContents: this.filterAnnotations(this.state.annotationFilter, annotationContents)})
    } else setTimeout(this.updateAnnotations, 500) // keep polling until the room is available
  }

  filterAnnotations = (search, annotations) => {
    const searchText = []
    const searchMembers = []
    const searchFlags = []
    const searchWords = search.split(" ")
    for (const word of searchWords) {
      if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else if (word.slice(0, 1) === '~') searchFlags.push(word.slice(1))
      else searchText.push(word)
    }
    return annotations.filter(loc => {
      let flagged = true
      if (searchFlags.includes("me")) { flagged = flagged && loc.getCreator() === Client.client.getUserId() }
      if (searchFlags.includes("hour")) { flagged = flagged && (loc.event.getTs() > (Date.now() - 3600000)) }
      if (searchFlags.includes("day")) { flagged = flagged && (loc.event.getTs() > (Date.now() - 86400000)) }
      if (searchFlags.includes("week")) { flagged = flagged && (loc.event.getTs() > (Date.now() - 604800000)) }
      if (searchFlags.includes("unread")) { flagged = flagged && loc.getUnread() }
      const membered = searchMembers.length
        ? searchMembers.some(member => loc.getCreator().toLowerCase().includes(member.toLowerCase()))
        : true
      return membered && flagged && searchText.every(term =>
        (!loc.getText() && !loc.getRootContent()) ||
        loc.getText()?.toLowerCase().includes(term.toLowerCase()) ||
        loc.getRootContent()?.body.toLowerCase().includes(term.toLowerCase()))
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
      "--chatVisible": state.chatVisible ? 1 : 0,
      "--listingVisible": state.listingVisible ? 1 : 0,
      "--chatFocused": state.focus ? 1 : 0,
      "--selectColor": this.userColor.solid,
      "touch-action": this.state.pinching ? "none" : null
    }
    const hideUntilWidthAvailable = {
      visibility: state.pdfHeightPx ? null : "hidden"
    }
    return <div
      style={dynamicDocumentStyle}
      id="content-container"
      ref={this.contentContainer}
      onPointerDown={this.handlePointerDown}
      onPointerUp={this.handlePointerUp}
      onPointerCancel={this.handlePointerUp}
      onPointerLeave={this.handlePointerUp}
      data-pindrop-mode={state.pindropMode
        ? (state.pindropMode?.x && "placed") || "unplaced"
        : false
      }
      onPointerMove={this.handlePointerMove}>
      <Router onChange={this.handleRouteChange} />
      {this.getLoadingStatus()}
      <div style={hideUntilWidthAvailable} ref={this.documentView} id="document-view">
        <PdfPage
          annotationLayer={this.annotationLayer}
          annotationLayerWrapper={this.annotationLayerWrapper}
          annotationsVisible={state.annotationsVisible}
          filteredAnnotationContents={state.filteredAnnotationContents}
          focus={state.focus}
          initFocus={this.initFocus}
          pageFocused={this.getPage()}
          pdfFocused={props.pdfFocused}
          pdfHeightAdjustedPx={state.pdfHeightPx / state.pdfFitRatio}
          pdfScale={this.pdfScale}
          pdfWidthAdjustedPx={state.pdfWidthPx / state.pdfFitRatio}
          pindropMode={state.pindropMode}
          roomId={state.roomId}
          searchString={state.searchString}
          secondaryFocus={state.secondaryFocus}
          setFocus={this.setFocus}
          setResource={this.setResource}
          setPdfDimensions={this.setPdfDimensions}
          setPdfFitRatio={this.setPdfFitRatio}
          setPdfLoadingStatus={this.setPdfLoadingStatus}
          setPdfText={this.setPdfText}
          setPdfWidthPx={this.setPdfWidthPx}
          setTotalPages={this.setTotalPages}
          textLayer={this.textLayer}
          zoomFactor={state.zoomFactor}
        />
      </div>
      <div id="sidepanel">
        <PanelHandle visible={state.chatVisible} id="panel-handle-1" offsetVar="--dragOffset-1" contentContainer={this.contentContainer} />
        {state.focus
          ? <Chat class="panel-widget-1"
              setFocus={this.setFocus}
              setSecondaryFocus={this.setSecondaryFocus}
              unsetFocus={this.unsetFocus}
              pdfId={state.roomId}
              pdfFocused={props.pdfFocused}
              pageFocused={this.getPage()}
              hasSelection={state.hasSelection}
              quadsFromPdfSelection={this.quadsFromPdfSelection}
              secondaryFocus={state.secondaryFocus}
              focus={state.focus} />
          : <div class="panel-widget-1" />
        }
        <PanelHandle visible={state.listingVisible} id="panel-handle-2" offsetVar="--dragOffset-2" contentContainer={this.contentContainer} />
        { state.listingType === "search"
          ? <SearchResults
              class="panel-widget-2"
              searchString={state.searchString}
              setSearch={this.setSearch}
              endSearch={this.endSearch}
              hideListing={this.hideListing}
              pdfText={this.pdfText}
              pdfFocused={props.pdfFocused}
              roomFocused={props.roomFocused}
            />
          : <AnnotationListing
              roomId={state.roomId}
              class="panel-widget-2"
              focus={state.focus}
              setAnnotationFilter={this.setAnnotationFilter}
              annotationFilter={state.annotationFilter}
              annotationContents={state.annotationContents}
              filteredAnnotationContents={state.filteredAnnotationContents}
              focusByRoomId={this.focusByRoomId}
              focusNext={this.focusNext}
              focusPrev={this.focusPrev}
              room={state.room}
            />
          }
        <div class="panel-widget-controls">
          {state.room ? <RoomIcon roomId={state.roomId} size={42} name={state.room.name} avatarUrl={state.room.getMxcAvatarUrl()} /> : null }
          <hr />
          <ToolTip placement="left" content="Show chat">
            <button data-active={state.chatVisible} disabled={!state.focus} id="show-annotations" onclick={this.toggleChat}>
              {Icons.annotation}
            </button>
          </ToolTip>
          <ToolTip placement="left" content="Show annotation list">
            <button data-active={state.listingVisible} id="show-annotations" onclick={this.toggleListing}>
              {Icons.list}
            </button>
          </ToolTip>
        </div>
      </div>
      <Navbar hasSelection={state.hasSelection}
        openAnnotation={this.openAnnotation}
        closeAnnotation={this.closeAnnotation}
        hasAnnotations={this.state.filteredAnnotationContents.length > 0}
        pageFocused={this.getPage()}
        pdfFocused={props.pdfFocused}
        total={state.totalPages}
        focus={state.focus}
        roomId={state.roomId}
        room={state.room}
        focusNext={this.focusNext}
        focusPrev={this.focusPrev}
        nextPage={this.nextPage}
        prevPage={this.prevPage}
        searchString={state.searchString}
        pdfWidthPx={state.pdfWidthPx}
        annotationsVisible={state.annotationsVisible}
        toggleAnnotations={this.toggleAnnotations}
        setNavHeight={this.setNavHeight}
        showSearch={this.showSearch}
        startPindrop={this.startPindrop}
        pindropMode={state.pindropMode}
        setZoom={this.setZoom} />
      <div id="pdf-mobile-buttons">
        <button title="open options" id="panel-toggle" onclick={this.openSidebar}>
          {state.chatVisible || state.listingVisible ? null : Icons.menu }
        </button>
      </div>
      <SyncIndicator />
    </div>
  }
}

class PanelHandle extends Component {
  dragOffset = 0

  handleMouseMove = e => {
    if (e.clientX < 20 || this.startingClientX - e.clientX < 0) return
    this.dragOffset = this.startingClientX - e.clientX
    this.props.contentContainer.current.style.setProperty(this.props.offsetVar, `${this.dragOffset}px`)
  }

  startDrag = e => {
    this.props.contentContainer.current.style.setProperty('--transitionSizing', "unset")
    this.props.contentContainer.current.setPointerCapture(e.pointerId)
    this.startingClientX = e.clientX + this.dragOffset
    this.props.contentContainer.current.addEventListener('pointermove', this.handleMouseMove)
    this.props.contentContainer.current.addEventListener('pointerup', _ => {
      this.props.contentContainer.current.style.removeProperty('--transitionSizing')
      this.props.contentContainer.current.releasePointerCapture(e.pointerId)
      this.props.contentContainer.current.removeEventListener('pointermove', this.handleMouseMove)
    })
  }

  render(props) {
    if (props.visible) return <div id={props.id} onpointerdown={this.startDrag} class="panel-handle">⋮</div>
  }
}
