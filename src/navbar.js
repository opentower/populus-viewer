import { h, createRef, render, Fragment, Component } from 'preact';
import * as Icons from './icons.js';
import * as Matrix from "matrix-js-sdk"
import './styles/navbar.css';
import { spaceChild, eventVersion }  from "./constants.js"

export default class Navbar extends Component {

    constructor(props) {
        super(props);
        this.state = {
            value : props.page,
            pageViewVisible : false,
        };
        this.handleTypingNotifications = this.handleTypingNotification.bind(this)
    }

    currentPage() {
        let val = parseInt(this.state.value)
        if (!Number.isNaN(val)) return val
        else return 1
    }

    componentDidMount() {
        this.props.client.on("RoomMember.typing", this.handleTypingNotification)
    }

    componentWillUnmount() {
        this.props.client.off("RoomMember.typing", this.handleTypingNotification)
    }

    handleTypingNotification = (event,member) => {
        const theRoomState = this.props.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const theChildRelation = theRoomState.getStateEvents(spaceChild, member.roomId)
        const typingKey = "typing-page-" + theChildRelation.getContent()[eventVersion].pageNumber
        if (theChildRelation) this.setState({ [typingKey]: event.getContent().user_ids })
    }

    handleInput = e => {
        if (/^[0-9]*$/.test(e.target.value)) this.setState({value: e.target.value})
        else this.setState({ value : "" })
    }

    handleFocus = _ => this.setState({ value : "" })

    handleBlur = _ => this.setState({ value : this.props.page })

    handleSubmit = e => {
        e.preventDefault();
        (this.currentPage() > 0 && this.currentPage() <= this.props.total)
            ? this.props.pushHistory({ pageFocused : this.currentPage() })
            : alert("Out of range");
    }

    handleClick = p => {
        this.props.pushHistory({ pageFocused : parseInt(event.target.value) });
        this.setState({value: parseInt(event.target.value)})
    }

    togglePageNav = _ => {
        this.setState({pageViewVisible: !this.state.pageViewVisible})
    }

    mainMenu = _ => {
        this.props.pushHistory({ 
            pdfFocused : null,
            pageFocused: null,
        });
    }

    firstPage = _ => {
        this.props.pushHistory({pageFocused : 1 });
        this.setState({value: 1})
    }

    prevPage = _ => {
        if (this.currentPage() > 1) {
            this.props.pushHistory({pageFocused : this.currentPage() - 1});
            this.setState({value: this.currentPage() - 1})
        } else {
            this.props.pushHistory({pageFocued : this.currentPage()});
            this.setState({value: this.currentPage()})
        }
    }

    nextPage = _ => {
        this.props.pushHistory({ pageFocused : this.currentPage() + 1 });
        this.setState({value: this.currentPage() + 1})
    }

    lastPage = _ => {
        this.props.pushHistory({ pageFocused : this.props.total});
        this.setState({value: this.props.total})
    }

    render(props,state) {
        if (props.pdfWidthPx) { // don't render until width is set
            return <nav id="page-nav">
                <div class={state.pageViewVisible ? null : "nav-hidden"} id="nav-pages">
                    <Pages total={props.total}
                        handleClick={this.handleClick}
                        currentPageElement={this.currentPageElement}
                        current={props.page}/>
                </div>
                <div id="nav-button-wrapper">
                    <button title="go to main menu" onclick={this.mainMenu}>{Icons.home}</button>
                    <button title="add annotation" disabled={props.selected ? null : "disabled"} onclick={props.addann}>{Icons.addAnnotation}</button>
                    <button title="go to first page" disabled={props.page > 1 ? null : "disabled"} onclick={this.firstPage}>{Icons.chevronsLeft}</button>
                    <button title="go to previous page" disabled={props.page > 1 ? null : "disabled"} onclick={this.prevPage}>{Icons.chevronLeft}</button>
                    <form onSubmit={this.handleSubmit}>
                        <button onclick={this.togglePageNav} type="button" class={state.pageViewVisible ? "nav-toggled" : null} title="show page navigation">{Icons.page}</button>
                        <input type="text" value={this.state.value} onblur={this.handleBlur} onfocus={this.handleFocus} oninput={this.handleInput} />
                        <span>/</span>
                        <span id="nav-total-pages">{props.total}</span>
                    </form>
                    <button title="go to next page" disabled={props.total > props.page ? null : "disabled"} onclick={this.nextPage}>{Icons.chevronRight}</button>
                    <button title="go to last page" disabled={props.total > props.page ? null : "disabled"} onclick={this.lastPage}>{Icons.chevronsRight}</button>
                    <button title="remove annotation" disabled={this.props.focus && !this.props.selected ? null : "disabled"} onclick={this.props.closeann}>{Icons.removeAnnotation}</button>
                    <button title="more options (inactive)" disabled>{Icons.moreVertical}</button>
                </div>
            </nav>
        }
    }
}

class Pages extends Component {

    currentPageElement = createRef()

    componentDidUpdate() { this.currentPageElement.current.scrollIntoView({inline : "center"}); }

    render(props,state) {
        var pagenos = Array.from({length: props.total}, (_, index) => index + 1);
        const pages = pagenos.map(page =>
            <button value={page} onclick={props.handleClick}>{page}</button>
        );
        pages[props.current - 1] = <button ref={this.currentPageElement} class="currentpage">{props.current}</button>
            return (
                <Fragment>
                    {pages}
                </Fragment>
            )
    }
}
