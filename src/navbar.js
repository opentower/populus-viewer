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
    this.state = {
      value: props.pageFocused,
      pageViewVisible: false,
      moreOptionsVisible: false,
      pageFocused: false,
      searchFocused: false
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
    if (e.key === 'j' || e.key === "ArrowRight") this.nextPage()
    if (e.key === 'k' || e.key === "ArrowLeft") this.prevPage()
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
      History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${Math.max(1, this.props.pageFocused - (1 + sparePages))}/`)
      this.props.contentContainer.current.scrollTop = this.props.contentContainer.current.scrollHeight
    }
  }

  nextPage = _ => {
    const sparePages = this.props.content.current.state.showSecondary ? 1 : 0
    if (this.props.pageFocused + sparePages < this.props.total) {
      History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${this.props.pageFocused + sparePages + 1}/`)
      this.props.contentContainer.current.scrollTop = 0
    }
  }

  handlePageFocus = _ => this.setState({ pageFocused: true, value: "" })

  handlePageBlur = _ => this.setState({ pageFocused: false, value: this.props.pageFocused })

  setSearchFocus = searchFocused => {
    if (searchFocused) {
      this.props.setNavHeight(150)
      this.setState({ searchFocused, moreOptionsVisible: true})
    } else this.setState({ searchFocused })
  }

  handleSubmit = ev => {
    ev.preventDefault();
    const currentPage = Number.isNaN(parseInt(this.state.value, 10)) ? 1 : parseInt(this.state.value, 10)
    if (currentPage > 0 && currentPage <= this.props.total) History.push(`/${encodeURIComponent(this.props.resourceAlias)}/${currentPage}/`)
    else alert("Out of range");
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
            roomId={props.roomId}
            currentPageElement={this.currentPageElement}
            visibility={state.pageViewVisible}
            typing={state.typing}
            current={props.pageFocused} />
        <div id="nav-background" />
        <div class="nav-button-wrapper top-wrapper">
          <ToolTip content="Go to main menu (ESC)" offset={this.toolTipOffset}>
            <button onclick={this.mainMenu}>{Icons.home}</button>
          </ToolTip>
          <ToolTip content="Add annotation (Alt + a)" offset={this.toolTipOffset} >
            <button disabled={(props.hasSelection || props.pindropMode?.x) ? null : "disabled"}
              onclick={props.openAnnotation}>{Icons.addAnnotation}
            </button>
          </ToolTip>
          <ToolTip content="Go to previous annotation (Alt + Shift + Tab)" offset={this.toolTipOffset}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusPrev}>{Icons.chevronsLeft}
            </button>
          </ToolTip>
          <ToolTip content="Go to previous page (k, ←)" offset={this.toolTipOffset}>
            <button disabled={props.pageFocused > 1 ? null : "disabled"}
              onclick={this.prevPage}>{Icons.chevronLeft}
            </button>
          </ToolTip>
          <form onSubmit={this.handleSubmit}>
            <ToolTip content="Show page navigation" offset={this.toolTipOffset}>
              <button class={state.pageViewVisible ? "nav-toggled" : null}
                onclick={this.togglePageNav}>{Icons.page}
              </button>
            </ToolTip>
            <input type="text"
              ref={this.pageInput}
              value={state.pageFocused ? state.value : props.pageFocused}
              onblur={this.handlePageBlur}
              onfocus={this.handlePageFocus}
              oninput={this.handleInput} />
            <span>/</span>
            <span ref={this.pageTotal} id="nav-total-pages">{props.total}</span>
          </form>
          <ToolTip content="Go to next page (j, →)" offset={this.toolTipOffset}>
            <button disabled={props.total > props.pageFocused ? null : "disabled"} 
              onclick={this.nextPage}>{Icons.chevronRight}
            </button>
          </ToolTip>
          <ToolTip content="Go to next annotation (Alt + Tab)" offset={[0, 30]}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusNext}>{Icons.chevronsRight}
            </button>
          </ToolTip>
          <ToolTip content="Remove annotation (Alt + r)" offset={this.toolTipOffset}>
            <button disabled={props.focus && !props.hasSelection ? null : "disabled"}
              onclick={props.closeAnnotation}>{Icons.removeAnnotation}
            </button>
          </ToolTip>
          <ToolTip content="More options" offset={this.toolTipOffset}>
            <button onClick={this.toggleMoreOptions}>{Icons.moreVertical}</button>
          </ToolTip>
        </div>
        <div ref={this.bottomWrapper} data-searchFocused={state.searchFocused} class="nav-button-wrapper bottom-wrapper">
          <ToolTip content="Manage membership" theme="bordered">
            <button onClick={this.openMembership}>{Icons.userPlus}
            </button>
          </ToolTip>
          <ToolTip content="Download PDF" theme="bordered">
            <button onClick={this.download}>{Icons.download} </button>
          </ToolTip>
          <ToolTip content="Zoom out (-)" theme="bordered">
            <button onClick={this.zoomOut}>{Icons.zoomout}</button>
          </ToolTip>
          <ToolTip content="Zoom in (+)" theme="bordered">
            <button onClick={this.zoomIn}>{Icons.zoomin}</button>
          </ToolTip>
          <ToolTip content="Toggle annotation visibility (Alt + v)" theme="bordered">
            <button onClick={props.toggleAnnotations}>{props.annotationsVisible ? Icons.eyeOff : Icons.eye}</button>
          </ToolTip>
          <ToolTip content="Add Pin" theme="bordered">
            <button  onClick={props.startPindrop}>{Icons.pin}</button>
          </ToolTip>
          <ToolTip content="Toggle Two-Up View" theme="bordered">
        <button onClick={props.content.current?.toggleSecondary}>{Icons.columns}</button>
          </ToolTip>
          <ToolTip content="Search Within PDF" theme="bordered">
            <button onClick={props.showSearch}>{Icons.search}</button>
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
    this.currentPageElement.current.scrollIntoView({inline: "center"})
  }

  componentDidMount() {
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentWillUnmount() {
    Client.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  handleTypingNotification = (ev, member) => {
    const theRoomState = Client.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
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
