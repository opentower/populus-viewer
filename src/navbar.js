import { h, createRef, Component } from 'preact';
import * as Icons from './icons.js';
import * as Matrix from "matrix-js-sdk"
import SearchBar from './search.js'
import { UserColor } from "./utils/colors.js"
import './styles/navbar.css';
import { spaceChild, eventVersion } from "./constants.js"
import History from './history.js'
import Client from './client.js'
import Invite from './invite.js'

export default class Navbar extends Component {
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

  pageTotal = createRef()

  pageInput = createRef()

  bottomWrapper = createRef()

  handleInput = e => {
    if (/^[0-9]*$/.test(e.target.value)) this.setState({value: e.target.value})
    else this.setState({ value: "" })
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
    if (currentPage > 0 && currentPage <= this.props.total) History.push(`/${this.props.pdfFocused}/${currentPage}/`)
    else alert("Out of range");
  }

  handleClick = e => History.push(`/${this.props.pdfFocused}/${parseInt(e.target.value, 10)}`)

  togglePageNav = _ => this.setState({pageViewVisible: !this.state.pageViewVisible})

  toggleMoreOptions = _ => {
    if (this.state.moreOptionsVisible) this.props.setNavHeight(75)
    else this.props.setNavHeight(150)
    this.setState(oldState => { return {moreOptionsVisible: !oldState.moreOptionsVisible} })
  }

  mainMenu = _ => History.push("/")

  openInvite = _ => this.props.populateModal(
    <Invite populateModal={this.props.populateModal}
            roomId={this.props.roomId} />)

  zoomOut = _ => this.props.setZoom(this.props.zoomFactor - 0.1)

  zoomIn = _ => this.props.setZoom(this.props.zoomFactor + 0.1)

  searchPredicate = e => e.key === "/" && e.altKey

  componentDidUpdate() {
    if (this.pageInput.current) this.pageInput.current.style.width = `${this.pageTotal.current.scrollWidth}px`
  }

  render(props, state) {
    if (props.pdfWidthPx) { // don't render until width is set
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
          <button title="Go to main menu&#013;Shortcut: Esc" onclick={this.mainMenu}>{Icons.home}</button>
          <button title="Add annotation&#013;Shortcut: Alt + a "
            disabled={(props.selected || props.pindropMode?.x) ? null : "disabled"}
            onclick={props.openAnnotation}>{Icons.addAnnotation}</button>
          <button title="Go to previous annotation&#013;Shortcut: Alt + Shift + Tab" onclick={props.focusPrev}>{Icons.chevronsLeft}</button>
          <button title="Go to previous page&#013;Shortcuts: k, &larr;" disabled={props.pageFocused > 1 ? null : "disabled"} onclick={props.prevPage}>{Icons.chevronLeft}</button>
          <form onSubmit={this.handleSubmit}>
            <button onclick={this.togglePageNav} type="button" class={state.pageViewVisible ? "nav-toggled" : null} title="Show page navigation">{Icons.page}</button>
            <input type="text"
              ref={this.pageInput}
              value={state.pageFocused ? state.value : props.pageFocused}
              onblur={this.handlePageBlur}
              onfocus={this.handlePageFocus}
              oninput={this.handleInput} />
            <span>/</span>
            <span ref={this.pageTotal} id="nav-total-pages">{props.total}</span>
          </form>
          <button title="Go to next page&#013;Shortcuts: j, &rarr;" disabled={props.total > props.pageFocused ? null : "disabled"} onclick={props.nextPage}>{Icons.chevronRight}</button>
          <button title="Go to next annotation&#013;Shortcut: Alt + Tab" onclick={props.focusNext}>{Icons.chevronsRight}</button>
          <button title="Remove annotation&#013;Shortcut: Alt + r" disabled={props.focus && !props.selected ? null : "disabled"} onclick={props.closeAnnotation}>{Icons.removeAnnotation}</button>
          <button title="More options" onClick={this.toggleMoreOptions}>{Icons.moreVertical}</button>
        </div>
        <div ref={this.bottomWrapper} data-searchFocused={state.searchFocused} class="nav-button-wrapper bottom-wrapper">
          <button title="Invite a friend" onClick={this.openInvite}>{Icons.userPlus}</button>
          <button title="Zoom out&#013;Shortcut: -" onClick={this.zoomOut}>{Icons.zoomout}</button>
          <button title="Zoom in&#013;Shortcut: +" onClick={this.zoomIn}>{Icons.zoomin}</button>
          <button title="Toggle annotation visibility&#013;Shortcut: Alt + v" onClick={props.toggleAnnotations}>{props.annotationsVisible ? Icons.eyeOff : Icons.eye}</button>
          <button title="Add Pin" onClick={props.startPindrop}>{Icons.pin}</button>
          <SearchBar title="Search within PDF&#013;Shortcut: Alt + /" setSearch={props.setSearch} search={props.searchString} searchPredicate={this.searchPredicate} setFocus={this.setSearchFocus} />
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
    console.log(ev)
    console.log(member)
    const theRoomState = Client.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(spaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const typingKey = theChildRelation.getContent()[eventVersion].pageNumber
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
