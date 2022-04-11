import { h, createRef, Fragment, Component } from 'preact';
import Router from 'preact-router';
import './styles/pdfView.css'
import './styles/content-container.css'
import * as Matrix from "matrix-js-sdk"
import Chat from "./chat.js"
import RoomIcon from "./roomIcon.js"
import AnnotationListing from "./annotationListing.js"
import SearchResults from "./searchResults.js"
import PdfContent from "./pdfContent.js"
import History from './history.js'
import Client from './client.js'
import Navbar from "./navbar.js"
import { spaceChild, spaceParent, lastViewed } from "./constants.js"
import Location from './utils/location.js'
import SyncIndicator from './syncIndicator.js'
import Toast from "./toast.js"
import MediaModal from "./mediaModal.js"
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
      filteredAnnotationContents: [],
      pindropMode: null,
      annotationFilter: maybeState ? maybeState.searchString : "",
      searchString: "",
      loadingStatus: "loading...",
      contentWidthPx: null,
      contentHeightPx: null,
      zoomFactor: null,
      pinching: false
    }
    this.annotationChildEvents = {}
    this.annotationParentEvents = {}
    this.prevScrollTop = 0
    this.checkForSelection = this.checkForSelection.bind(this)
    this.handleKeydown = this.handleKeydown.bind(this)
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
    this.initializeAnnotations()
    Client.client.on("RoomState.events", this.handleStateUpdate)
    Client.client.on("Room.accountData", this.handleAccountData)
  }

  componentWillUnmount() {
    document.removeEventListener("selectionchange", this.checkForSelection)
    document.removeEventListener('keydown', this.handleKeydown)
    Client.client.off("RoomState.events", this.handleStateUpdate)
    Client.client.off("Room.accountData", this.handleAccountData)
  }

  handleStateUpdate = e => {
    if ((e.getRoomId() === this.state.roomId && e.getType() === spaceChild) ||
      (e.getStateKey() === this.state.roomId && e.getType() === spaceParent)) {
      this.updateAnnotation(new Location(e))
    }
  }

  handleAccountData = (e, room) => {
    if (room.roomId === this.state.roomId && this.props.pageFocused && e.getType() === lastViewed) {
      const theContent = e.getContent()
      if (theContent.page !== this.props.pageFocused && theContent.deviceId !== Client.deviceId) {
        Toast.set(
          <Fragment>
            <h3 id="toast-header">Hey!</h3>
            <div>Another device is viewing a different page.</div>
            <div style="margin-top:10px">
              <button
                onclick={_ => {
                  History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${theContent.page}/`)
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

  documentView = createRef()

  contentContainer = createRef()

  content = createRef()

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
      document.addEventListener("click", this.content.current.releasePin)
    }, 200)
  }

  setContentDimensions = (contentHeightPx, contentWidthPx) => {
    const width = document.body.clientWidth
    const height = document.body.clientHeight - this.state.navHeight - 10
    const heightratio = height / contentHeightPx
    const widthratio = width / contentWidthPx
    const zoomFactor = this.state.zoomFactor || Math.max(Math.min(heightratio, widthratio, 5), 1)
    this.setState({contentHeightPx, contentWidthPx, zoomFactor})
  }

  setPdfText = pdfText => { this.pdfText = pdfText }

  // XXX : may need to debounce eventually
  setAnnotationFilter = annotationFilter => this.setState({
    annotationFilter,
    filteredAnnotationContents: this.filterAnnotations(annotationFilter, this.annotationChildEvents)
  })

  setTotalPages = totalPages => this.setState({totalPages})

  setLoadingStatus = loadingStatus => this.setState({loadingStatus})

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
      History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${focus.getPageIndex() || this.getPage()}/${roomId}`)
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

  hideChat = _ => this.setState({chatVisible: false})

  showChat = _ => {
    const narrow = document.body.offsetWidth <= 768
    if (narrow) this.setState({listingVisible: false, chatVisible: true})
    else this.setState({chatVisible: true})
  }

  toggleChat = _ => this.setState(oldState => {
    if (oldState.chatVisible) this.hideChat()
    else this.showChat()
  })

  setPindropMode = mode => this.setState({pindropMode: mode})

  hideListing = _ => this.setState({listingVisible: false})

  showListing = _ => {
    const narrow = document.body.offsetWidth <= 768
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
    const hasSelection = this.content.current.hasSelection()
    this.selectionTimeout = setTimeout(200, this.setState({hasSelection}))
    // timeout to avoid excessive rerendering
  }

  handleRouteChange = _ => {
    // sets the last viewed page for later retrieval
    if (!this.props.pageFocused || !this.props.resourceAlias || !this.state.roomId) return
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
  }

  openAnnotation = _ => {
    this.setState({ annotationsVisible: true })
    if (this.state.pindropMode?.x) this.content.current.commitPin(this.state.pindropMode.x, this.state.pindropMode.y, this.state.pindropMode.page)
    else this.content.current.commitHighlight()
  }

  closeAnnotation = _ => {
    const isCreator = Client.client.getUserId() === this.state.focus.getCreator()
    const isMod = this.state.room.getMember(Client.client.getUserId()).powerLevel >= 50
    if (!confirm('Are you sure you want to close this annotation?')) return
    if (!isCreator && !isMod) {
      alert("Only moderators can close annotations that they didn't create")
      return
    }
    const discussionId = this.state.focus.getChild()
    const resourceId = this.state.roomId
    Client.client.sendStateEvent(resourceId, spaceChild, {}, discussionId)
    Client.client.sendStateEvent(discussionId, spaceParent, {}, resourceId)
      .catch(e => {
        switch (e) {
          case "M_FORBIDDEN" : {
            Toast.set(<Fragment>
              <div>Annotation still visible to creator</div>
              <div style="margin-top:10px">
                Because you're not a moderator for that annotation you just
                deleted, it will remain visible to its creator and members,
                although it won't be visible to other viewers of this PDF.
              </div>
            </Fragment>)
            break
          }
          default : console.log(e)
        }
      })
    this.unsetFocus()
  }

  unsetFocus = _ => {
    // XXX breaking this up into two updates makes the animation work properly.
    // If you replace the element AND unset chat visibility in one update, then
    // the annotation panel jumps to the left
    this.setState({secondaryFocus: null, focus: null}, _ => this.setState({chatVisible: false}))
    History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${this.props.pageFocused}/`)
  }

  setFocus = focus => {
    History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${this.props.pageFocused}/${focus.getChild()}/`)
    this.setState({secondaryFocus: null, focus, chatVisible: true })
  }

  refreshFocus = _ => {
    const theRoomState = this.state.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theAnnotation = theRoomState.getStateEvents(spaceChild, this.props.roomFocused)
    if (theAnnotation) this.setState({ focus: new Location(theAnnotation) })
  }

  setSecondaryFocus = secondaryFocus => this.setState({ secondaryFocus })

  getLoadingStatus() {
    if (this.state.contentHeightPx) return null
    if (typeof this.state.loadingStatus === "string") {
      return <div id="document-view-loading">{this.state.loadingStatus}</div>
    }
    if (typeof this.state.loadingStatus === "number") {
      return <div id="document-view-loading">Downloading Pdf...
          <progress class="styled-progress" max="1" value={this.state.loadingStatus} />
        </div>
    }
  }

  updateAnnotation = loc => {
    let eventStore
    if (loc.getOrientation() === "child") eventStore = this.annotationChildEvents
    else if (loc.getOrientation() === "parent") eventStore = this.annotationParentEvents
    this.setState(oldState => {
      const filteredLoc = this.filterAnnotations(oldState.annotationFilter, {null: loc})
      const isInsertable = this.insertable(loc)
      if (isInsertable) eventStore[loc.getChild()] = loc
      else delete eventStore[loc.getChild()]
      let filteredAnnotationContents = oldState.filteredAnnotationContents
      if (filteredLoc.length > 0 && isInsertable) { // if it passes the filter
        // check if it's already there, and either replace (where appropriate) or insert it
        const idx = filteredAnnotationContents.findIndex(annot => annot.getChild() === loc.getChild())
        if (idx > -1) {
          // we don't replace children with parents - children are higher priority
          if (filteredAnnotationContents[idx].getOrientation() === "parent") filteredAnnotationContents[idx] = loc
          if (loc.getOrientation() === "child") filteredAnnotationContents[idx] = loc
        } else filteredAnnotationContents.push(filteredLoc[0])
      } else { // if it doesn't pass, check if it's already there
        const idx = filteredAnnotationContents.findIndex(annot => annot.getChild() === loc.getChild())
        if (idx > -1 && filteredAnnotationContents[idx].getOrientation() === loc.getOrientation()) {
          // if it is there, replace with an appropriate fallback, or just remove it,
          switch (loc.getOrientation()) {
            case "child" : {
              // If there's a fallback parent available, use that
              const maybeParent = this.annotationParentEvents[loc.getChild()]
              if (maybeParent) filteredAnnotationContents[idx] = maybeParent
              else filteredAnnotationContents = filteredAnnotationContents.filter(annot => annot.getChild() !== loc.getChild())
              break
            }
            case "parent" : {
              // If there's a fallback child available, use that
              const maybeChild = this.annotationChildEvents[loc.getChild()]
              if (maybeChild) filteredAnnotationContents[idx] = maybeChild
              else filteredAnnotationContents = filteredAnnotationContents.filter(annot => annot.getChild() !== loc.getChild())
              break
            }
          }
        }
      }
      return {filteredAnnotationContents}
    })
  }

  insertable(loc) {
    return loc.isValid() &&
      // we infer that you are a member if you have unread. TODO Should do this more directly.
      (!loc.isPrivate() || loc.getUnread() !== "All") &&
      ( loc.getStatus() !== "pending" ||
        ( loc.getStatus() === "pending" && loc.getCreator() === Client.client.getUserId())
      )
  }

  initializeAnnotations = _ => {
    if (this.state.room) {
      const allParents = Client.client.getVisibleRooms()
        .map(room => room.getLiveTimeline())
        .map(timeline => timeline.getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceParent))
      for (const parent of [].concat(...allParents)) {
        if (parent.getStateKey() === this.state.roomId) {
          if (parent.getTs() < 1648936377334) continue // don't load old parents, for legacy compatibility
          const loc = new Location(parent)
          if (this.insertable(loc)) this.annotationParentEvents[loc.getChild()] = loc
        }
      }
      const locations = this.state.room.getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
        .map(ev => new Location(ev))
        .filter(this.insertable)
      for (const loc of locations) this.annotationChildEvents[loc.getChild()] = loc
      const mergedLocations = Object.assign({}, this.annotationParentEvents, this.annotationChildEvents)
      this.setState({filteredAnnotationContents: this.filterAnnotations(this.state.annotationFilter, mergedLocations)})
    } else setTimeout(this.initializeAnnotations, 500) // keep polling until the room is available
  }

  filterAnnotations = (search, annotations) => {
    const locations = Object.values(annotations)
    const searchText = []
    const searchMembers = []
    const searchFlags = []
    const searchWords = search.split(" ")
    for (const word of searchWords) {
      if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else if (word.slice(0, 1) === '~') searchFlags.push(word.slice(1))
      else searchText.push(word)
    }
    return locations.filter(loc => {
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
      "--contentWidthPx": `${state.contentWidthPx}px`,
      "--contentHeightPx": `${state.contentHeightPx}px`,
      "--sidePanelVisible": state.panelVisible ? 1 : 0,
      "--chatVisible": state.chatVisible ? 1 : 0,
      "--listingVisible": state.listingVisible ? 1 : 0,
      "--chatFocused": state.focus ? 1 : 0,
      "--selectColor": this.userColor.solid,
      "touch-action": this.state.pinching ? "none" : null
    }
    const hideUntilWidthAvailable = {
      visibility: state.contentHeightPx ? null : "hidden"
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
      <MediaModal />
      <Router onChange={this.handleRouteChange} />
      {this.getLoadingStatus()}
      <div style={hideUntilWidthAvailable} ref={this.documentView} id="document-view">
        <PdfContent
          annotationsVisible={state.annotationsVisible}
          filteredAnnotationContents={state.filteredAnnotationContents}
          ref={this.content}
          focus={state.focus}
          pageFocused={this.getPage()}
          totalPages={state.totalPages}
          resourceAlias={props.resourceAlias}
          pindropMode={state.pindropMode}
          setPindropMode={this.setPindropMode}
          room={state.room}
          roomId={state.roomId}
          searchString={state.searchString}
          secondaryFocus={state.secondaryFocus}
          setFocus={this.setFocus}
          setResource={this.setResource}
          setContentDimensions={this.setContentDimensions}
          setPdfLoadingStatus={this.setLoadingStatus}
          setPdfText={this.setPdfText}
          setTotalPages={this.setTotalPages}
          showChat={this.showChat}
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
              resourceId={state.roomId}
              resourceAlias={props.resourceAlias}
              pageFocused={this.getPage()}
              hasSelection={state.hasSelection}
              generateLocation={this.content.current.generateLocation}
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
              resourceAlias={props.resourceAlias}
              roomFocused={props.roomFocused}
            />
          : <AnnotationListing
              roomId={state.roomId}
              class="panel-widget-2"
              focus={state.focus}
              setAnnotationFilter={this.setAnnotationFilter}
              annotationFilter={state.annotationFilter}
              annotationContents={Object.assign({}, this.annotationParentEvents, this.annotationChildEvents)}
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
            <button data-active={state.chatVisible} disabled={!state.focus} id="show-chat" onclick={this.toggleChat}>
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
        hasAnnotations={state.filteredAnnotationContents.length > 0}
        pageFocused={this.getPage()}
        resourceAlias={props.resourceAlias}
        total={state.totalPages}
        focus={state.focus}
        roomId={state.roomId}
        room={state.room}
        content={this.content}
        contentContainer={this.contentContainer}
        resourceAlias={this.props.resourceAlias}
        nextPage={this.nextPage}
        prevPage={this.prevPage}
        searchString={state.searchString}
        contentWidthPx={state.contentWidthPx}
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
