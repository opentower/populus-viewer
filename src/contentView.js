import { h, createRef, Fragment, Component } from 'preact';
import './styles/pdfView.css'
import './styles/content-container.css'
import * as Matrix from "matrix-js-sdk"
import Chat from "./chat.js"
import RoomIcon from "./roomIcon.js"
import AnnotationListing from "./annotationListing.js"
import SearchResults from "./searchResults.js"
import PdfContent from "./pdfContent.js"
import MediaContent from "./mediaContent.js"
import ImageContent from "./imageContent.js"
import History from './history.js'
import Client from './client.js'
import DocumentNavbar from "./documentNavbar.js"
import MediaNavbar from "./mediaNavbar.js"
import ImageNavbar from "./imageNavbar.js"
import { lastViewed } from "./constants.js"
import Location from './utils/location.js'
import Resource from './utils/resource.js'
import SyncIndicator from './syncIndicator.js'
import Toast from "./toast.js"
import MediaModal from "./mediaModal.js"
import ToolTip from "./utils/tooltip.js"
import * as Icons from "./icons.js"
import { UserColor } from "./utils/colors.js"

export default class ContentView extends Component {
  constructor(props) {
    super(props)
    const maybeState = History.history.location.state
    this.state = {
      focus: null,
      secondaryFocus: null, // for temporarily focusing an extra location
      resourceLength: null,
      navHeight: 75,
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
    }
    this.annotationChildEvents = {}
    this.annotationParentEvents = {}
    this.prevScrollTop = 0
    this.userColor = new UserColor(Client.client.getUserId())
  }

  componentDidMount() {
    document.addEventListener("selectionchange", this.checkForSelection)
    document.addEventListener('keydown', this.handleKeydown)
    Client.client.on("RoomState.events", this.handleStateUpdate)
    Client.client.on("Room.accountData", this.handleAccountData)
    this.fetchResource()
  }

  componentWillUnmount() {
    document.removeEventListener("selectionchange", this.checkForSelection)
    document.removeEventListener('keydown', this.handleKeydown)
    Client.client.off("RoomState.events", this.handleStateUpdate)
    Client.client.off("Room.accountData", this.handleAccountData)
  }

  componentDidUpdate(prevProps, prevState) {
    // on change of resource, fetch new resource
    if (prevProps.resourceAlias !== this.props.resourceAlias) this.fetchResource()
    // on change of focused room, refresh relevant UI
    if (prevProps.roomFocused !== this.props.roomFocused) this.refreshFocus()
  }

  handleStateUpdate = e => {
    if (e.getStateKey() === this.state.room?.roomId && e.getType() === Matrix.EventType.SpaceParent) {
      this.updateAnnotation(new Location(e))
      if (e.getRoomId() === this.state.focus?.getChild()) this.refreshFocus()
    }
    if (e.getRoomId() === this.state.room?.roomId && e.getType() === Matrix.EventType.SpaceChild) {
      this.updateAnnotation(new Location(e))
      if (e.getStateKey() === this.state.focus?.getChild()) this.refreshFocus()
    }
  }

  handleAccountData = (e, room) => {
    if (room.roomId === this.state.room?.roomId && this.props.resourcePosition && e.getType() === lastViewed) {
      const theContent = e.getContent()
      const tryParse = parseInt(this.props.resourcePosition, 10)
      if (Number.isInteger(tryParse) && theContent.position !== tryParse && theContent.deviceId !== Client.deviceId) {
        Toast.set(
          <Fragment>
            <h3 id="toast-header">Hey!</h3>
            <div>На іншому пристрої триває перегляд іншого запису.</div>
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

  handleTouchStart = e => {
    this.contentContainer.current.dataset.touches = e.touches.length
    if (e.touches.length === 2) {
      // if two fingers are down, start a pinch
      this.initialDistance = Math.sqrt((e.touches[0].clientX - e.touches[1].clientX)**2 + (e.touches[0].clientY - e.touches[1].clientY)**2)
      this.initialZoom = this.state.zoomFactor
    }
  }

  handleTouchEnd = e => this.contentContainer.current.dataset.touches = e.touches.length


  handleTouchMove = e => {
    if (e.touches.length === 2) {
      // if two fingers are down, handle a pinch update
      const newDistance = Math.sqrt((e.touches[0].clientX - e.touches[1].clientX)**2 + (e.touches[0].clientY - e.touches[1].clientY)**2)
      this.setZoom(_ => this.initialZoom * ( newDistance / this.initialDistance))
    }
  }

  contentContainer = createRef()

  content = createRef()

  touchCache = []

  setNavHeight = px => this.setState({ navHeight: px })

  catchFetchResourceError = e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">Не вдалося отримати ресурс...</h3>
      <div>Намагалися отриматм: </div>
      <pre>{this.props.resourceAlias}</pre>
      <div>Сповіщення про помилку:</div>
      <pre>{e.message}</pre>
    </Fragment>)
    History.push('/')
    this.errorCondition = true
  }

  fetchResource = async _ => {
    await new Promise(res => this.setState({ room:null,
      mimetype:null,
      contentWidthPx: null,
      contentHeightPx: null,
      zoomFactor: null,
      resourceLength: null,
      loadingStatus: "завантаження...",
    }, res))
    const aliasResponse = await Client.client.getRoomIdForAlias(`#${this.props.resourceAlias}`).catch(this.catchFetchResourceError)
    if (this.errorCondition) return
    const {room_id, servers} = aliasResponse
    await Client.client.joinRoom(room_id, { viaServers: servers }).catch(this.catchFetchResourceError)
    if (this.errorCondition) return
    const room = await Client.client.getRoomWithState(room_id).catch(this.catchFetchResourceError)
    if (this.errorCondition) return
    const resource = new Resource(room)
    const mimetype = resource.mimetype
    this.setState({room, resource, mimetype}, _ => {
      this.initializeAnnotations() //careful, these need to be initialized before we can focus by roomId
      if (this.props.roomFocused) this.focusByRoomId(this.props.roomFocused, this.props.eventFocused)
    })
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

  setSearchText = searchText => { this.searchText = searchText }

  // XXX : may need to debounce eventually
  setAnnotationFilter = annotationFilter => {
    const mergedLocations = Object.assign({}, this.annotationParentEvents, this.annotationChildEvents)
    this.setState({
      annotationFilter,
      filteredAnnotationContents: this.filterAnnotations(annotationFilter, mergedLocations)
    })
  }

  setResourceLength = resourceLength => this.setState({resourceLength})

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

  setMobileButtonColor = mobileButtonColor => this.setState({mobileButtonColor})

  setZoom = zoomFunction => {
    let zoomFactor = zoomFunction(this.state.zoomFactor)
    if (zoomFactor < this.content.current.zoomMin) this.setState({zoomFactor: this.content.current.zoomMin})
    else {
      zoomFactor = Math.min(zoomFactor, this.content.current.zoomMax)
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

  focusByRoomId = (roomId, eventId) => {
    const mergedLocations = Object.assign({}, this.annotationParentEvents, this.annotationChildEvents)
    if (mergedLocations[roomId]) {
      const focus = mergedLocations[roomId]
      History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${focus.getResourcePosition()}/${roomId}${eventId ? "/" + eventId : ""}`)
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

  checkForSelection  = _ => {
    const hasSelection = !!(this.content.current?.hasSelection())
    if (this.state.hasSelection !== hasSelection) this.setState({hasSelection})
  }

  handleKeydown = e => {
    if (e.altKey && e.key === 'a') this.openAnnotation()
    if (e.altKey && e.key === 'r') this.closeAnnotation()
    if (e.altKey && e.key === 'v') this.toggleAnnotations()
    if (this.state.mimetype === "application/pdf" && e.altKey && e.key === "/") this.showSearch()
    if (e.ctrlKey || e.altKey || e.metaKey) return // Don't catch browser shortcuts
    if (e.key === '+' || e.key === '=') this.setZoom(zoomFactor => zoomFactor + 0.1)
    if (e.key === '-') this.setZoom(zoomFactor => zoomFactor - 0.1)
    if (e.key === "Esc" || e.key === "Escape") History.push("/")
  }

  openAnnotation = _ => {
    this.setState({ annotationsVisible: true })
    if (this.state.mimetype === "application/pdf") {
      if (this.state.pindropMode?.x) this.content.current.commitPin(this.state.pindropMode.x, this.state.pindropMode.y, this.state.pindropMode.page)
      else this.content.current.commitHighlight()
    } else if (this.state.mimetype?.match(/^audio|^video|^image/)) {
      this.content.current.commitRegion()
    }
  }

  closeAnnotation = _ => {
    const isCreator = Client.client.getUserId() === this.state.focus.getCreator()
    const isMod = this.state.room.getMember(Client.client.getUserId()).powerLevel >= 50
    if (!confirm('Ви впевнені, що хочете закрити цю анотацію?')) return
    if (!isCreator && !isMod) {
      alert("Тільки ведучий лікар можуе закрити анотації, яку він не створював")
      return
    }
    const discussionId = this.state.focus.getChild()
    const resourceId = this.state.room.roomId
    Client.client.sendStateEvent(resourceId, Matrix.EventType.SpaceChild, {}, discussionId)
    Client.client.sendStateEvent(discussionId, Matrix.EventType.SpaceParent, {}, resourceId)
      .catch(e => {
        switch (e) {
          case "M_FORBIDDEN" : {
            Toast.set(<Fragment>
              <div>Анотацію все ще видно автору</div>
              <div style="margin-top:10px">
                Оскільки ви не є модератором цієї анотації, яку ви щойно вилучили, вона буде вилучена, але не видалена: вона залишиться видимою для її автора і учасників обговорення, хоча і не буде видимою для інших.
              </div>
            </Fragment>)
            break
          }
          default : console.log(e)
        }
      })
    this.unsetFocus()
  }

  unsetFocus = opts => {
    // XXX breaking this up into two updates makes the animation work properly.
    // If you replace the element AND unset chat visibility in one update, then
    // the annotation panel jumps to the left
    this.setState({secondaryFocus: null, focus: null}, _ => this.setState({chatVisible: false}))
    if (opts?.replace) History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${this.props.resourcePosition}/`)
    else History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${this.props.resourcePosition}`)
  }

  setFocus = (focus, opts) => {
    if (opts?.replace) History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${opts?.holdPosition ? this.props.resourcePosition : focus.getResourcePosition()}/${focus.getChild()}/`)
    else History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${opts?.holdPosition ? this.props.resourcePosition : focus.getResourcePosition()}/${focus.getChild()}`)
    this.setState({secondaryFocus: null, focus, chatVisible: true })
  }

  refreshFocus = _ => {
    if (!this.state.room) return
    if (!this.props.roomFocused) this.unsetFocus({replace: true})
    else {
      const mergedLocations = Object.assign({}, this.annotationParentEvents, this.annotationChildEvents)
      const theAnnotation = mergedLocations[this.props.roomFocused]
      if (theAnnotation) this.setFocus(theAnnotation, {replace: true, holdPosition: true})
    }
  }

  setSecondaryFocus = secondaryFocus => this.setState({ secondaryFocus })

  getLoadingStatus() {
    if (this.state.contentHeightPx) return null
    if (typeof this.state.loadingStatus === "string") {
      return <div id="document-view-loading">{this.state.loadingStatus}</div>
    }
    if (typeof this.state.loadingStatus === "number") {
      return <div id="document-view-loading">
          <span>Завантажую...</span>
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
      let filteredAnnotationContents = [... oldState.filteredAnnotationContents]
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
      this.annotationParentEvents = {}
      this.annotationChildEvents = {}
      const allParents = Client.client.getVisibleRooms()
        .map(room => room.getLiveTimeline())
        .map(timeline => timeline.getState(Matrix.EventTimeline.FORWARDS).getStateEvents(Matrix.EventType.SpaceParent))
      for (const parent of [].concat(...allParents)) {
        if (parent.getStateKey() === this.state.room.roomId) {
          if (parent.getTs() < 1648936377334) continue // don't load old parents, for legacy compatibility
          const loc = new Location(parent)
          if (this.insertable(loc)) this.annotationParentEvents[loc.getChild()] = loc
        }
      }
      const locations = this.state.room.getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(Matrix.EventType.SpaceChild)
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
      if (searchFlags.includes("question")) { flagged = flagged && loc.isQuestion() }
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

  getContentComponent() {
    if (this.state.mimetype === "application/pdf") {
      const page = PdfContent.positionToPage(this.props.resourcePosition, this.state.room)
      if (this.props.resourcePosition != page) { //important to allow type coercion via `=!` here.
        History.replace(`/${encodeURIComponent(this.props.resourceAlias)}` + 
          `/${page}` + 
          `${this.props.roomFocused ? "/" + this.props.roomFocused : ""}` +
          `${this.props.eventFocused ? "/" + this.props.eventFocused : ""}`
        )
      }
      // TODO: Could DRY props here if the names were more uniform
      return <PdfContent
            filteredAnnotationContents={this.state.filteredAnnotationContents}
            ref={this.content}
            focus={this.state.focus}
            pageFocused={page}
            totalPages={this.state.resourceLength}
            key={this.props.resourceAlias} // tear this down when resource changes
            resourceAlias={this.props.resourceAlias}
            resourceLength={this.state.resourceLength}
            pindropMode={this.state.pindropMode}
            setPindropMode={this.setPindropMode}
            room={this.state.room}
            roomFocused={this.props.roomFocused}
            eventFocused={this.props.eventFocused}
            searchString={this.state.searchString}
            secondaryFocus={this.state.secondaryFocus}
            setFocus={this.setFocus}
            contentContainer={this.contentContainer}
            setContentDimensions={this.setContentDimensions}
            setPdfLoadingStatus={this.setLoadingStatus}
            setPdfText={this.setSearchText}
            setTotalPages={this.setResourceLength}
            showChat={this.showChat}
            zoomFactor={this.state.zoomFactor}
          />
    } else if (this.state.mimetype?.match(/^audio|^video/)) {
      const timestamp = MediaContent.positionToTimestamp(this.props.resourcePosition, this.state.room)
      if (this.props.resourcePosition != timestamp) { //important to allow type coercion via `=!` here.
        History.replace(`/${encodeURIComponent(this.props.resourceAlias)}` + 
          `/${timestamp}` + 
          `${this.props.roomFocused ? "/" + this.props.roomFocused : ""}` +
          `${this.props.eventFocused ? "/" + this.props.eventFocused : ""}`
        )
      }
      return <MediaContent 
            filteredAnnotationContents={this.state.filteredAnnotationContents}
            ref={this.content}
            key={this.props.resourceAlias} // tear this down when resource changes
            resourceAlias={this.props.resourceAlias}
            resource={this.state.resource}
            timeStamp={timestamp}
            room={this.state.room}
            roomFocused={this.props.roomFocused}
            eventFocused={this.props.eventFocused}
            secondaryFocus={this.state.secondaryFocus}
            mimetype={this.state.mimetype}
            setFocus={this.setFocus}
            setMobileButtonColor={this.setMobileButtonColor}
            unsetFocus={this.unsetFocus}
            focus={this.state.focus}
            showChat={this.showChat}
            setMediaDuration={this.setResourceLength}
            setContentDimensions={this.setContentDimensions}
            setMediaLoadingStatus={this.setLoadingStatus}
          />
    } else if (this.state.mimetype?.match(/^image/)) {
      return <ImageContent 
            filteredAnnotationContents={this.state.filteredAnnotationContents}
            ref={this.content}
            key={this.props.resourceAlias} // tear this down when resource changes
            resourceAlias={this.props.resourceAlias}
            resource={this.state.resource}
            room={this.state.room}
            roomFocused={this.props.roomFocused}
            eventFocused={this.props.eventFocused}
            secondaryFocus={this.state.secondaryFocus}
            mimetype={this.state.mimetype}
            setFocus={this.setFocus}
            setMobileButtonColor={this.setMobileButtonColor}
            unsetFocus={this.unsetFocus}
            focus={this.state.focus}
            showChat={this.showChat}
            setContentDimensions={this.setContentDimensions}
            contentContainer={this.contentContainer}
            contentHeightPx={this.state.contentHeightPx}
            contentWidthPx={this.state.contentWidthPx}
            setImageLoadingStatus={this.setLoadingStatus}
            zoomFactor={this.state.zoomFactor}
            setZoom={this.setZoom}
          />
    } else return null
  }

  getNavComponent() {
    if (this.state.mimetype === "application/pdf") {
      const page = PdfContent.positionToPage(this.props.resourcePosition, this.state.room)
      return <DocumentNavbar hasSelection={this.state.hasSelection}
        annotationsVisible={this.state.annotationsVisible}
        openAnnotation={this.openAnnotation}
        closeAnnotation={this.closeAnnotation}
        hasAnnotations={this.state.filteredAnnotationContents.length > 0}
        pageFocused={page}
        resourceAlias={this.props.resourceAlias}
        total={this.state.resourceLength}
        focus={this.state.focus}
        roomFocused={this.props.roomFocused}
        eventFocused={this.props.eventFocused}
        focusNext={this.focusNext}
        focusPrev={this.focusPrev}
        room={this.state.room}
        content={this.content}
        contentContainer={this.contentContainer}
        contentWidthPx={this.state.contentWidthPx}
        toggleAnnotations={this.toggleAnnotations}
        setNavHeight={this.setNavHeight}
        showSearch={this.showSearch}
        startPindrop={this.startPindrop}
        pindropMode={this.state.pindropMode}
        setZoom={this.setZoom} />
    } else if (this.state.mimetype?.match(/^audio|^video/)) {
      const timestamp = MediaContent.positionToTimestamp(this.props.resourcePosition, this.state.room)
      return <MediaNavbar hasSelection={this.state.hasSelection}
        annotationsVisible={this.state.annotationsVisible}
        openAnnotation={this.openAnnotation}
        closeAnnotation={this.closeAnnotation}
        hasAnnotations={this.state.filteredAnnotationContents.length > 0}
        timeStamp={timestamp}
        resourceAlias={this.props.resourceAlias}
        total={this.state.resourceLength}
        focus={this.state.focus}
        eventFocused={this.props.eventFocused}
        focusNext={this.focusNext}
        focusPrev={this.focusPrev}
        room={this.state.room}
        roomFocused={this.props.roomFocused}
        content={this.content}
        contentContainer={this.contentContainer}
        contentWidthPx={this.state.contentWidthPx}
        toggleAnnotations={this.toggleAnnotations}
        setNavHeight={this.setNavHeight}
        />
    } else if (this.state.mimetype?.match(/^image/)) {
      return <ImageNavbar hasSelection={this.state.hasSelection}
        annotationsVisible={this.state.annotationsVisible}
        openAnnotation={this.openAnnotation}
        closeAnnotation={this.closeAnnotation}
        hasAnnotations={this.state.filteredAnnotationContents.length > 0}
        resourceAlias={this.props.resourceAlias}
        total={this.state.resourceLength}
        focus={this.state.focus}
        eventFocused={this.props.eventFocused}
        focusNext={this.focusNext}
        focusPrev={this.focusPrev}
        room={this.state.room}
        roomFocused={this.props.roomFocused}
        content={this.content}
        contentContainer={this.contentContainer}
        contentWidthPx={this.state.contentWidthPx}
        toggleAnnotations={this.toggleAnnotations}
        setNavHeight={this.setNavHeight}
        setZoom={this.setZoom}
        />
    } else return null
  }

  render(props, state) {
    const dynamicDocumentStyle = {
      "--zoomFactor": state.zoomFactor,
      "--navHeight": `${state.navHeight}px`,
      "--contentWidthPx": `${state.contentWidthPx}px`,
      "--contentHeightPx": `${state.contentHeightPx}px`,
      "--chatVisible": state.chatVisible ? 1 : 0,
      "--listingVisible": state.listingVisible ? 1 : 0,
      "--chatFocused": state.focus ? 1 : 0,
      "--selectColor": this.userColor.solid,
      "--mobileButtonColor": state.mobileButtonColor,
    }
    return <div
      style={dynamicDocumentStyle}
      id="content-container"
      ref={this.contentContainer}
      onTouchStart={this.handleTouchStart}
      onTouchEnd={this.handleTouchEnd}
      onTouchMove={this.handleTouchMove}
      onTouchCancel={this.handleTouchEnd}
      data-annotations-hidden={!state.annotationsVisible}
      data-pindrop-mode={state.pindropMode
        ? (state.pindropMode?.x && "placed") || "unplaced"
        : false
      }
      onPointerMove={this.handlePointerMove}>
      <MediaModal />
      {this.getLoadingStatus()}
      {this.getContentComponent()}
      <div id="sidepanel">
        <PanelHandle visible={state.chatVisible} id="panel-handle-1" offsetVar="--dragOffset-1" contentContainer={this.contentContainer} />
        {state.focus
          ? <Chat class="panel-widget-1"
              setSecondaryFocus={this.setSecondaryFocus}
              unsetFocus={this.unsetFocus}
              resource={state.resource}
              resourceAlias={props.resourceAlias}
              eventFocused={props.eventFocused}
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
              pdfText={this.searchText}
              resourceAlias={props.resourceAlias}
              roomFocused={props.roomFocused}
            />
          : <AnnotationListing
              roomId={state.room?.roomId}
              class="panel-widget-2"
              focus={state.focus}
              mimetype={state.mimetype}
              setAnnotationFilter={this.setAnnotationFilter}
              annotationFilter={state.annotationFilter}
              annotationContents={Object.assign({}, this.annotationParentEvents, this.annotationChildEvents)}
              filteredAnnotationContents={state.filteredAnnotationContents}
              focusByRoomId={this.focusByRoomId}
              focusNext={this.focusNext}
              focusPrev={this.focusPrev}
              resource={this.state.resource}
              room={state.room}
            />
          }
        <div class="panel-widget-controls">
          {state.room ? <RoomIcon 
            roomId={state.room.roomId}
            size={42}
            topic={state.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
              .getStateEvents(Matrix.EventType.RoomTopic, "")?.getContent()?.topic}
            name={state.room.name}
            avatarUrl={state.room.getMxcAvatarUrl()} /> : null }
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
      {this.getNavComponent()}
      <div id="content-mobile-buttons">
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

  handlePointerMove = e => {
    if (e.clientX < 20 || this.startingClientX - e.clientX < 0) return
    this.dragOffset = this.startingClientX - e.clientX
    this.props.contentContainer.current.style.setProperty(this.props.offsetVar, `${this.dragOffset}px`)
  }

  startDrag = e => {
    this.props.contentContainer.current.style.setProperty('--transitionSizing', "unset")
    this.props.contentContainer.current.setPointerCapture(e.pointerId)
    this.startingClientX = e.clientX + this.dragOffset
    this.props.contentContainer.current.addEventListener('pointermove', this.handlePointerMove)
    this.props.contentContainer.current.addEventListener('pointerup', _ => {
      this.props.contentContainer.current.style.removeProperty('--transitionSizing')
      this.props.contentContainer.current.releasePointerCapture(e.pointerId)
      this.props.contentContainer.current.removeEventListener('pointermove', this.handlePointerMove)
    })
  }

  render(props) {
    if (props.visible) return <div id={props.id} onpointerdown={this.startDrag} class="panel-handle"><div>{Icons.handleVertical}</div></div>
  }
}
