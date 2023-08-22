import { h, Component, createRef, Fragment } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { renderLatexInElement } from './latex.js'
import { processLinks } from './links.js'
import { mscMarkupMsgKey } from "./constants.js"
import Client from './client.js'
import MemberPill from './memberPill.js'
import { UserColor } from './utils/colors.js'
import SearchBar from './search.js'
import { DisplayContent } from './message.js'
import LocationPreview from './locationPreview.js'
import * as Icons from './icons.js'
import * as PopupMenu from './popUpMenu.js'

export default class AnnotationListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      typing: {},
      sort: "Activity",
      sortOrder: 1,
      searchFocus: false
    }
    this.handleTypingNotification = this.handleTypingNotification.bind(this)
  }

  componentDidMount () {
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
    document.addEventListener('keydown', this.handleKeydown)
  }

  componentWillUnmount () {
    Client.client.off("RoomMember.typing", this.handleTypingNotification)
    document.removeEventListener('keydown', this.handleKeydown)
  }

  handleTypingNotification = (event, member) => {
    const theRoomState = Client.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(Matrix.EventType.SpaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const myId = Client.client.getUserId()
        const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
        return {typing: { ...prevState.typing, [member.roomId]: typingOtherThanMe}}
      })
    }
  }

  handleKeydown = e => {
    if (e.altKey && !e.shiftKey && e.key === 'Tab') this.props.focusNext()
    if (e.altKey && e.shiftKey && e.key === 'Tab') this.props.focusPrev()
  }

  setFocus = searchFocus => this.setState({searchFocus})

  searchInput = createRef()

  getSortFunc() {
    switch (this.state.sort) {
      case 'Page': return this.byPage
      case 'Activity': return this.byActivity
      case 'Creation': return this.byCreation
    }
  }

  byCreation = (a, b) => {
    if (a.event.getTs() > b.event.getTs()) return -1
    if (a.event.getTs() < b.event.getTs()) return 1
    return 0
  }

  byPage = (a, b) => {
    if (a.getPageIndex() > b.getPageIndex()) return 1
    if (a.getPageIndex() < b.getPageIndex()) return -1
    return 0
  }

  byActivity = (a, b) => {
    const room1 = Client.client.getRoom(a.getChild())
    const room2 = Client.client.getRoom(b.getChild())
    // XXX might not be a member of both rooms, hence unable to get timestamps
    if (room1 && room2) {
      const ts1 = room1.getLastActiveTimestamp()
      const ts2 = room2.getLastActiveTimestamp()
      if (ts1 > ts2) return -1
      else if (ts1 < ts2) return 1
      return 0
    }
    if (room1) return -1
    if (room2) return 1
    return 0
    // should warn that unjoined rooms are last
  }

  sortByActivity = _ => {
    const initialSort = this.state.sort
    if (initialSort === "Activity") this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })
    else this.setState({ sort: "Activity" })
  }

  sortByPage = _ => {
    const initialSort = this.state.sort
    if (initialSort === "Page") this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })
    else this.setState({ sort: "Page" })
  }

  sortByCreation = _ => {
    const initialSort = this.state.sort
    if (initialSort === "Creation") this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })
    else this.setState({ sort: "Creation" })
  }

  flipSort = _ => this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })

  flags = [
    { keyword: "me", description: "my annotations" },
    { keyword: "hour", description: "annotations from the last hour" },
    { keyword: "day", description: "annotations from the last day" },
    { keyword: "week", description: "annotations from the last week" },
    { keyword: "unread", description: "unread annotations" },
    { keyword: "question", description: "annotations asking questions" }
  ]

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.roomId} {...props} />,
    "~": props => <PopupMenu.Flags flags={this.flags} {...props} />
  }

  render (props, state) {
    const theAnnotations = []
    const initialDate = Date.now()
    let currentDate = initialDate
    let thePage = 1
    let looped = false
    for (const loc of props.filteredAnnotationContents.sort(this.getSortFunc())) {
      let divider
      if (looped) {
        switch (state.sort) {
          case "Page" : {
            if (thePage < loc.getPageIndex()) {
              const newPage = loc.getPageIndex()
              divider = <div class="annotation-listing-divider">
                <span>Сторінка {state.sortOrder === 1 ? newPage : thePage}</span>
              </div>
              thePage = newPage
            } else divider = <div class="annotation-listing-divider" />
            break
          }
          case "Activity" : {
            const room = Client.client.getRoom(loc.getChild())
            if (room && state.sortOrder === 1) { // TODO handle times for reverse sort
              const age = initialDate - room.getLastActiveTimestamp()
              const dateDelta = currentDate - room.getLastActiveTimestamp()
              if (age < 300000 && dateDelta > 60000) {
                currentDate = room.getLastActiveTimestamp()
                const minutes = Math.floor(age / 60000)
                const plural = minutes === 1 ? "" : "s"
                divider = <div class="annotation-listing-divider">
                  <span>{`${minutes} minute${plural} ago`}</span>
                </div>
              } else if (age < 3600000 && dateDelta > 600000) {
                currentDate = room.getLastActiveTimestamp()
                const minutes = Math.floor(age / 60000)
                const plural = minutes === 1 ? "" : "s"
                divider = <div class="annotation-listing-divider">
                  <span>{`${minutes} minute${plural} ago`}</span>
                </div>
              } else if (age < 86400000 && dateDelta > 3600000) {
                currentDate = room.getLastActiveTimestamp()
                const hours = Math.floor(age / 3600000)
                const plural = hours === 1 ? "" : "s"
                divider = <div class="annotation-listing-divider">
                  <span>{`${hours} hour${plural} ago`}</span>
                </div>
              } else if (dateDelta > 86400000) {
                currentDate = room.getLastActiveTimestamp()
                const dateObject = new Date(currentDate)
                divider = <div class="annotation-listing-divider">
                  <span>{`on ${dateObject.toLocaleDateString('en-US', {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}`}</span></div>
              } else divider = <div class="annotation-listing-divider" />
              break
            }
          }
          case "Creation" : {
            if (state.sortOrder === 1) { // TODO handle times for reverse sort
              const age = initialDate - loc.event.getTs()
              const dateDelta = currentDate - loc.event.getTs()
              if (age < 300000 && dateDelta > 60000) {
                currentDate = loc.event.getTs()
                const minutes = Math.floor(age / 60000)
                const plural = minutes === 1 ? "" : "s"
                divider = <div class="annotation-listing-divider">
                  <span>{`${minutes} minute${plural} ago`}</span>
                </div>
              } else if (age < 3600000 && dateDelta > 600000) {
                currentDate = loc.event.getTs()
                const minutes = Math.floor(age / 60000)
                const plural = minutes === 1 ? "" : "s"
                divider = <div class="annotation-listing-divider">
                  <span>{`${minutes} minute${plural} ago`}</span>
                </div>
              } else if (age < 86400000 && dateDelta > 3600000) {
                currentDate = loc.event.getTs()
                const hours = Math.floor(age / 3600000)
                const plural = hours === 1 ? "" : "s"
                divider = <div class="annotation-listing-divider">
                  <span>{`${hours} hour${plural} ago`}</span>
                </div>
              } else if (dateDelta > 86400000) {
                currentDate = loc.event.getTs()
                const dateObject = new Date(currentDate)
                divider = <div class="annotation-listing-divider">
                  <span>{`on ${dateObject.toLocaleDateString('en-US', {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}`}</span></div>
              } else divider = <div class="annotation-listing-divider" />
              break
            }
          }
          default : divider = <div class="annotation-listing-divider" />
        }
      } else looped = true
      theAnnotations.push(divider)
      theAnnotations.push(
        <AnnotationListingEntry
            key={loc.getChild()}
            typing={state.typing[loc.getChild()]}
            resource={props.resource}
            annotationLocation={loc}
            focusByRoomId={props.focusByRoomId}
            focus={props.focus}
            parentRoom={props.room}
        />
      )
    }
    return <div id="annotation-panel" class={props.class}>
              <div id="annotation-entries-wrapper"
                tabindex="-1">
                <div id="annotation-controls">
                  <button class="small-icon"
                    style="cursor: pointer"
                    onClick={this.flipSort}>
                    {state.sortOrder === 1
                      ? Icons.sortDesc
                      : Icons.sortAsc
                    }
                  </button>
                  <button data-current-button={state.sort === "Activity"}
                    onClick={this.sortByActivity}
                    class="styled-button">Зміни</button>
                  <button data-current-button={state.sort === "Creation"}
                    onClick={this.sortByCreation}
                    class="styled-button">Створення</button>
                  {props.mimetype === "application/pdf" 
                    ? <button data-current-button={state.sort === "Page"}
                        onClick={this.sortByPage}
                        class="styled-button">Сторінка</button>
                    : null
                  }
                </div>
                {Object.values(props.annotationContents).length === 0
                    ? <div class="empty-marker"><b>Немає анотацій до записів</b></div>
                    : props.filteredAnnotationContents.length === 0
                      ? <div class="empty-marker"><b>Немає анотацій, що відповідають пошуку</b></div>
                      : state.sortOrder === 1 ? theAnnotations : theAnnotations.reverse()
                  }
              </div>
              <div id="annotation-panel-button-wrapper" data-mode={state.searchFocus ? "search" : "navigation"}>
                <PopupMenu.Menu
                  textValue={props.annotationFilter}
                  textarea={this.searchInput}
                  actions={this.popupActions}
                  setTextValue={props.setAnnotationFilter}
                />
                <SearchBar
                  hint="/"
                  searchInput={this.searchInput}
                  search={props.annotationFilter}
                  setSearch={props.setAnnotationFilter}
                  setFocus={this.setFocus} />
              </div>
            </div>
  }
}

class AnnotationListingEntry extends Component {
  constructor(props) {
    super(props)
    this.state = {
      topic: props.annotationLocation.getText()
    }
  }

  componentDidMount () {
    renderLatexInElement(this.comment.current)
    Client.client.on("Room.timeline", this.handleTimeline)
    Client.client.on("Room.accountData", this.handleTimeline)
    processLinks(this.comment.current)
    this.setTopic()
  }

  componentWillUnmount () {
    Client.client.off("Room.timeline", this.handleTimeline)
    Client.client.off("Room.accountData", this.handleTimeline)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.focus?.getChild() !== this.props.annotationLocation.getChild() &&
      this.props.focus?.getChild() === this.props.annotationLocation.getChild()) {
      this.entry.current.scrollIntoView()
    }
  }

  handleTimeline = (_event, room) => {
    if (room.roomId === this.room?.roomId) this.setState({})
  }

  comment = createRef()

  entry = createRef()

  async setTopic() {
    this.room = await Client.client.getRoomWithState(this.props.annotationLocation.getChild())
    this.setState({
      topic: this.room.getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS)
        .getStateEvents("m.room.topic", "")
        ?.getContent().topic || this.props.annotationLocation.getText()
    })
  }

  handleClick = _ => {
    this.props.focusByRoomId(this.props.annotationLocation.getChild())
  }

  creator = this.props.parentRoom.getMember(this.props.annotationLocation.getCreator())

  userColor = new UserColor(this.creator.userId)

  render(props, state) {
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    const focused = props.focus?.getChild() === props.annotationLocation.getChild()
    return <div style={this.userColor.styleVariables}
      data-annotation-entry-typing={typing}
      data-annotation-entry-focused={focused}
      ref={this.entry}
      onclick={this.handleClick}
      class="annotation-listing-entry">
      <LocationPreview 
        showPosition={true}
        resource={props.resource}
        location={props.annotationLocation}
      />
      <AnnotationListingComment
        creator={this.creator}
        unread={props.annotationLocation.getUnread()}
        commentRef={this.comment}
        annotationLocation={props.annotationLocation}
      />
    </div>
  }
}

function AnnotationListingComment(props) {
  const content = props.annotationLocation.getRootContent()
  if (content) {
    let body
    switch (content.msgtype) {
      case "m.text" : body = DisplayContent({content}); break
      case "m.notice" : body = <div class="annotation-listing-fallback"><p>Відправив повідомлення</p></div>; break
      case "m.image" : body = <div class="annotation-listing-fallback"><p>Відправив файл</p></div>; break
      case "m.video" : body = <div class="annotation-listing-fallback"><p>Відправив відео</p></div>; break
      case "m.audio" : body = <div class="annotation-listing-fallback"><p>Відправив аудіозапис</p></div>; break
      case "m.emote" : {
        if (content[mscMarkupMsgKey]) body = <div class="annotation-listing-fallback"><p>Sent an annotation</p></div>
        else body = <div class="annotation-listing-fallback"><p>Відправив повідомлення</p></div>
        break
      }
      default :
        body = <div class="annotation-listing-fallback"><p>Відправив повідомлення</p></div>
    }
    return <Fragment>
      <div
        ref={props.commentRef}
        class={props.unread
          ? "annotation-listing-comment-unread"
          : "annotation-listing-comment"}
      > {body} </div>
      <div class="annotation-listing-info">
        <div class="annotation-listing-features">
          {props.annotationLocation.isQuestion() ? Icons.question: null}
          {props.annotationLocation.isPrivate() ? Icons.lock : null}
          {props.annotationLocation.getOrientation() === "parent" ? Icons.eyeOff : null}
        </div>
        <div class="annotation-listing-creator"><MemberPill member={props.creator} /></div>
      </div>
    </Fragment>
  } else if (props.annotationLocation.getStatus() === "pending") {
    return <div class="annotation-listing-pending">чекаємо на ваш коментар... </div>
  }
}
