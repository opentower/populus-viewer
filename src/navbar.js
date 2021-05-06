import { h, createRef, Fragment, Component } from 'preact';
import * as Icons from './icons.js';
import * as Matrix from "matrix-js-sdk"
import UserColor from "./userColors.js"
import './styles/navbar.css';
import { spaceChild, eventVersion } from "./constants.js"

export default class Navbar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      value: props.page,
      pageViewVisible: false,
      moreOptionsVisible: false,
      typing: {},
      focused: false
    };
    this.handleTypingNotifications = this.handleTypingNotification.bind(this)
  }

  componentDidMount() {
    this.props.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentWillUnmount() {
    this.props.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  pageTotal = createRef()

  pageInput = createRef()

  handleTypingNotification = (event, member) => {
    const theRoomState = this.props.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(spaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const typingKey = theChildRelation.getContent()[eventVersion].pageNumber
        return {typing: { ...prevState.typing, [typingKey]: event.getContent().user_ids}}
      })
    }
  }

  handleInput = e => {
    if (/^[0-9]*$/.test(e.target.value)) this.setState({value: e.target.value})
    else this.setState({ value: "" })
  }

  handleFocus = _ => this.setState({ focused: true, value: "" })

  handleBlur = _ => this.setState({ focused: false, value: this.props.page })

  handleSubmit = e => {
    e.preventDefault();
    const currentPage = Number.isNaN(parseInt(this.state.value, 10)) ? 1 : parseInt(this.state.value, 10)
    if (currentPage > 0 && currentPage <= this.props.total) this.props.pushHistory({ pageFocused: currentPage })
    else alert("Out of range");
  }

  handleClick = _ => this.props.pushHistory({ pageFocused: parseInt(event.target.value, 10) })

  togglePageNav = _ => this.setState({pageViewVisible: !this.state.pageViewVisible})

  toggleMoreOptions = _ => {
    if (this.state.moreOptionsVisible) this.props.setNavHeight(75)
    else this.props.setNavHeight(150)
    this.setState({moreOptionsVisible: !this.state.moreOptionsVisible})
  }

  mainMenu = _ => {
    this.props.pushHistory({
      pdfFocused: null,
      pageFocused: null
    });
  }

  firstPage = _ => this.props.pushHistory({pageFocused: 1 })

  prevPage = _ => {
    if (this.props.page > 1) {
      this.props.pushHistory({pageFocused: this.props.page - 1}, _ => {
        this.props.container.current.scrollTop = this.props.container.current.scrollHeight
        // this works imperfectly when the page size changes, because
        // the change in sizes takes place after the PDF render, which
        // takes place after the page change
      })
    }
  }

  nextPage = _ => {
    this.props.pushHistory({ pageFocused: this.props.page + 1 }, _ => {
      this.props.container.current.scrollTop = 0
    })
  }

  lastPage = _ => this.props.pushHistory({ pageFocused: this.props.total})

  componentDidUpdate() {
    if (this.pageInput.current) this.pageInput.current.style.width = `${this.pageTotal.current.scrollWidth}px`
  }

  render(props, state) {
    if (props.pdfWidthPx) { // don't render until width is set
      return <nav id="page-nav">
        <div class={state.pageViewVisible ? null : "nav-hidden"} id="nav-pages">
          <Pages total={props.total}
            handleClick={this.handleClick}
            currentPageElement={this.currentPageElement}
            visibility={state.pageViewVisible}
            typing={state.typing}
            current={props.page} />
        </div>
        <div id="nav-button-wrapper">
          <button title="go to main menu" onclick={this.mainMenu}>{Icons.home}</button>
          <button title="add annotation" disabled={props.selected ? null : "disabled"} onclick={props.addann}>{Icons.addAnnotation}</button>
          <button title="go to first page" disabled={props.page > 1 ? null : "disabled"} onclick={this.firstPage}>{Icons.chevronsLeft}</button>
          <button title="go to previous page" disabled={props.page > 1 ? null : "disabled"} onclick={this.prevPage}>{Icons.chevronLeft}</button>
          <form onSubmit={this.handleSubmit}>
            <button onclick={this.togglePageNav} type="button" class={state.pageViewVisible ? "nav-toggled" : null} title="show page navigation">{Icons.page}</button>
            <input type="text"
              ref={this.pageInput}
              value={state.focused ? state.value : props.page}
              onblur={this.handleBlur}
              onfocus={this.handleFocus}
              oninput={this.handleInput} />
            <span>/</span>
            <span ref={this.pageTotal} id="nav-total-pages">{props.total}</span>
          </form>
          <button title="go to next page" disabled={props.total > props.page ? null : "disabled"} onclick={this.nextPage}>{Icons.chevronRight}</button>
          <button title="go to last page" disabled={props.total > props.page ? null : "disabled"} onclick={this.lastPage}>{Icons.chevronsRight}</button>
          <button title="remove annotation" disabled={props.focus && !props.selected ? null : "disabled"} onclick={props.closeann}>{Icons.removeAnnotation}</button>
          <button title="more options" onClick={this.toggleMoreOptions}>{Icons.moreVertical}</button>
        </div>
      </nav>
    }
  }
}

class Pages extends Component {
  componentDidUpdate() {
    this.currentPageElement.current.scrollIntoView({inline: "center"})
  }

  currentPageElement = createRef()

  render(props) {
    const pagenos = Array.from({length: props.total}, (_, index) => index + 1);
    const pages = pagenos.map(page => {
      let theClass, theUserColor
      if (props.typing[page] && props.typing[page][0]) {
        theClass = "typing"
        theUserColor = new UserColor(props.typing[page][0])
      }
      return <button value={page}
        key={page}
        class={theClass}
        style={theUserColor?.styleVariables}
        onclick={props.handleClick}>{page}</button>
    });
    pages[props.current - 1] = <button ref={this.currentPageElement} class="currentpage">{props.current}</button>
    return (
              <Fragment>
                  {pages}
              </Fragment>
    )
  }
}
