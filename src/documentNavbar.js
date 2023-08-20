import { h, createRef, Component } from 'preact';
import * as Icons from './icons.js';
import * as Matrix from "matrix-js-sdk"
import Location from "./utils/location.js"
import ToolTip from "./utils/tooltip.js"
import { UserColor } from "./utils/colors.js"
import './styles/navbar.css';
import History from './history.js'
import Resource from "./utils/resource.js"
import Client from './client.js'
import Modal from './modal.js'
import ManageMembership from './manageMembership.js'

export default class DocumentNavbar extends Component {
  constructor(props) {
    super(props);
    // Could add a listener to update this live
    const roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.canAnnotate = roomState.maySendStateEvent(Matrix.EventType.SpaceChild, Client.client.getUserId())
    this.state = {
      value: props.pageFocused,
      pageViewVisible: false,
      moreOptionsVisible: false,
      pageFocused: false,
    };
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeydown)
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeydown)
  }

  handleKeydown = e => {
    if (e.shiftKey) return // don't capture shift-modified arrow keys, these change the text selection
    if (e.key === 'j' || e.key === "ArrowRight") {
      e.preventDefault() // block default scrolling behavior
      this.nextPage()
    }
    if (e.key === 'k' || e.key === "ArrowLeft") {
      e.preventDefault() // block default scrolling behavior
      this.prevPage()
    }
    if (e.key === "ArrowUp") {
      e.preventDefault() // block default scrolling behavior
      this.props.contentContainer.current.scroll({
        top: this.props.contentContainer.current.scrollTop - 100,
        left: this.props.contentContainer.current.scrollLeft
      })
    }
    if (e.key === "ArrowDown") {
      e.preventDefault() // block default scrolling behavior
      this.props.contentContainer.current.scroll({
        top: this.props.contentContainer.current.scrollTop + 100,
        left: this.props.contentContainer.current.scrollLeft
      })
    }
  }

  pageTotal = createRef()

  pageInput = createRef()

  bottomWrapper = createRef()

  toolTipOffset = [0, 30]

  handleInput = e => {
    if (/^[0-9]*$/.test(e.target.value)) this.setState({value: e.target.value})
    else this.setState({ value: "" })
  }

  prevPage = _ => {
    const sparePages = this.props.content.current.state.showSecondary ? 1 : 0
    if (this.props.pageFocused > 1) {
      History.push(`/${encodeURIComponent(this.props.resourceAlias)}` + 
        `/${Math.max(1, this.props.pageFocused - (1 + sparePages))}` + 
        `${this.props.roomFocused ? "/" + this.props.roomFocused : ""}` +
        `${this.props.eventFocused ? "/" + this.props.eventFocused : ""}`
      )
    }
  }

  nextPage = _ => {
    const sparePages = this.props.content.current.state.showSecondary ? 1 : 0
    if (this.props.pageFocused + sparePages < this.props.total) {
      History.push(`/${encodeURIComponent(this.props.resourceAlias)}` + 
        `/${Math.max(1, this.props.pageFocused + (1 + sparePages))}` + 
        `${this.props.roomFocused ? "/" + this.props.roomFocused : ""}` +
        `${this.props.eventFocused ? "/" + this.props.eventFocused : ""}`
      )
    }
  }

  handlePageFocus = _ => this.setState({ pageFocused: true, value: "" })

  handlePageBlur = _ => this.setState({ pageFocused: false, value: this.props.pageFocused })

  handleSubmit = ev => {
    ev.preventDefault();
    const currentPage = Number.isNaN(parseInt(this.state.value, 10)) ? 1 : parseInt(this.state.value, 10)
    if (currentPage > 0 && currentPage <= this.props.total) History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${currentPage}/`)
    else alert("Поза зоною дії");
  }

  handleClick = e => History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${parseInt(e.target.value, 10)}`)

  togglePageNav = _ => this.setState({pageViewVisible: !this.state.pageViewVisible})

  toggleMoreOptions = _ => {
    if (this.state.moreOptionsVisible) this.props.setNavHeight(75)
    else this.props.setNavHeight(150)
    this.setState(oldState => { return {moreOptionsVisible: !oldState.moreOptionsVisible} })
  }

  mainMenu = _ => History.push("/")

  download = _ => {
    if (confirm("Ви хочете завантажити файл, який ви анотуєте?")) {
      const file = new Resource(this.props.room)
      window.open(file.httpUrl)
    }
  }

  openMembership = _ => Modal.set(<ManageMembership room={this.props.room} />, "Управління доступом", `для ${this.props.room.name}`)

  zoomOut = _ => this.props.setZoom(zoomFactor => zoomFactor - 0.1)

  zoomIn = _ => this.props.setZoom(zoomFactor => zoomFactor + 0.1)

  componentDidUpdate() {
    if (this.pageInput.current) this.pageInput.current.style.width = `${this.pageTotal.current.scrollWidth}px`
  }

  render(props, state) {
    if (props.contentWidthPx) { // don't render until width is set
      return <nav id="page-nav">
          <Pages total={props.total}
            handleClick={this.handleClick}
            room={props.room}
            currentPageElement={this.currentPageElement}
            visibility={state.pageViewVisible}
            typing={state.typing}
            current={props.pageFocused} />
        <div id="nav-background" />
        <div class="nav-button-wrapper top-wrapper">
          <ToolTip content="В головне меню (ESC)" offset={this.toolTipOffset}>
            <button onclick={this.mainMenu}>{Icons.home}</button>
          </ToolTip>
          <ToolTip content="Додати анотацію (Alt + a)" offset={this.toolTipOffset} >
            <button disabled={this.canAnnotate && (props.hasSelection || props.pindropMode?.x) ? null : "disabled"}
              onclick={props.openAnnotation}>{Icons.addAnnotation}
            </button>
          </ToolTip>
          <ToolTip content="До попередньої анотації (Alt + Shift + Tab)" offset={this.toolTipOffset}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusPrev}>{Icons.chevronsLeft}
            </button>
          </ToolTip>
          <ToolTip content="На попередню сторінку (k, ←)" offset={this.toolTipOffset}>
            <button disabled={props.pageFocused > 1 ? null : "disabled"}
              onclick={this.prevPage}>{Icons.chevronLeft}
            </button>
          </ToolTip>
          <form class="nav-position" onSubmit={this.handleSubmit}>
            <ToolTip content="Show page navigationПоказати навігацію" offset={this.toolTipOffset}>
              <button type="button"
                class={state.pageViewVisible ? "nav-toggled" : null}
                onclick={this.togglePageNav}>{Icons.page}
              </button>
            </ToolTip>
            <input type="text"
              id="nav-page-input"
              ref={this.pageInput}
              value={state.pageFocused ? state.value : props.pageFocused}
              onblur={this.handlePageBlur}
              onfocus={this.handlePageFocus}
              oninput={this.handleInput} />
            <span>/</span>
            <span ref={this.pageTotal} id="nav-total-pages">{props.total}</span>
          </form>
          <ToolTip content="На наступну сторінку (j, →)" offset={this.toolTipOffset}>
            <button disabled={props.total > props.pageFocused ? null : "disabled"} 
              onclick={this.nextPage}>{Icons.chevronRight}
            </button>
          </ToolTip>
          <ToolTip content="До наступної анотації (Alt + Tab)" offset={[0, 30]}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusNext}>{Icons.chevronsRight}
            </button>
          </ToolTip>
          <ToolTip content="Видалити анотацію (Alt + r)" offset={this.toolTipOffset}>
            <button disabled={this.canAnnotate && props.focus && !props.hasSelection ? null : "disabled"}
              onclick={props.closeAnnotation}>{Icons.removeAnnotation}
            </button>
          </ToolTip>
          <ToolTip content="Більше варіантів" offset={this.toolTipOffset}>
            <button onClick={this.toggleMoreOptions}>{Icons.moreVertical}</button>
          </ToolTip>
        </div>
        <div inert={!state.moreOptionsVisible} ref={this.bottomWrapper} class="nav-button-wrapper bottom-wrapper">
          <ToolTip content="Керуємо доступом" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.openMembership}>{Icons.userPlus}
            </button>
          </ToolTip>
          <ToolTip content="Завантажити PDF" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.download}>{Icons.download} </button>
          </ToolTip>
          <ToolTip content="Зменшити (-)" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.zoomOut}>{Icons.zoomout}</button>
          </ToolTip>
          <ToolTip content="Збільшити (+)" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.zoomIn}>{Icons.zoomin}</button>
          </ToolTip>
          <ToolTip content="Перемикання видимості анотацій (Alt + v)" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={props.toggleAnnotations}>{props.annotationsVisible ? Icons.eyeOff : Icons.eye}</button>
          </ToolTip>
          <ToolTip content="Додати пін" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={props.startPindrop}>{Icons.pin}</button>
          </ToolTip>
          <ToolTip content="Переключити до двостороннього перегляду" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={props.content.current?.toggleSecondary}>{Icons.columns}</button>
          </ToolTip>
          <ToolTip content="Пошук всередині PDF" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={props.showSearch}>{Icons.search}</button>
          </ToolTip>
        </div>
      </nav>
    }
  }
}

class Pages extends Component {
  constructor(props) {
    super(props);
    this.state = { typing: {} };
    this.handleTypingNotifications = this.handleTypingNotification.bind(this)
  }

  componentDidUpdate() {
    this.currentPageElement.current?.scrollIntoView({inline: "center"})
  }

  componentDidMount() {
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentWillUnmount() {
    Client.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  handleTypingNotification = (ev, member) => {
    const theRoomState = Client.client.getRoom(this.props.room?.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(Matrix.EventType.SpaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const location = new Location(theChildRelation)
        const typingKey = location.location
        return {typing: { ...prevState.typing, [typingKey]: ev.getContent().user_ids}}
      })
    }
  }

  currentPageElement = createRef()

  render(props, state) {
    const pagenos = Array.from({length: props.total}, (_, index) => index + 1);
    const pages = pagenos.map(page => {
      let theClass, theUserColor
      if (state.typing[page] && state.typing[page][0]) {
        theClass = "typing"
        theUserColor = new UserColor(state.typing[page][0])
      }
      return <button value={page}
        key={page}
        class={theClass}
        tabIndex={props.visibility ? 0 : -1}
        style={theUserColor?.styleVariables}
        onclick={props.handleClick}>{page}</button>
    });
    pages[props.current - 1] = <button ref={this.currentPageElement} tabIndex={props.visibility ? 0 : -1} class="currentpage">{props.current}</button>
    return <div class={props.visibility ? null : "nav-hidden"} id="nav-pages">
        {pages}
      </div>
  }
}
