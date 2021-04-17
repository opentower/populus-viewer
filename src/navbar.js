import { h, render, Fragment, Component } from 'preact';
import * as Icons from './icons.js';
import './styles/navbar.css';

export default class Navbar extends Component {

    constructor(props) {
        super(props);
        this.state = {
            value : props.page,
            pageViewVisible : false,
        };
    }

    handleInput = e => this.setState({value: e.target.value});

    togglePageNav = _ => this.setState({pageViewVisible: !this.state.pageViewVisible})

    handleSubmit = e =>{
        e.preventDefault();
        (parseInt(this.state.value) > 0 && parseInt(this.state.value) <= this.props.total)
            ? this.props.loadPage(parseInt(this.state.value))
            : alert("Out of range");
    }

    firstPage = _ => {
        this.props.loadPage(1);
        this.setState({value: 1});
    }

    prevPage = _ => {
        this.props.loadPage(this.state.value - 1);
        this.setState({value: this.state.value - 1});
    }

    nextPage = _ => {
        this.props.loadPage(this.state.value + 1);
        this.setState({value: this.state.value + 1});
    }

    lastPage = _ => {
        this.props.loadPage(this.props.total);
        this.setState({value: this.props.total});
    }

    handleClick = p => {
        this.props.loadPage(parseInt(event.target.value));
        this.setState({value: parseInt(event.target.value)});
    }

    render(props,state) {
        if (props.pdfWidthPx) { // don't render until width is set
            return <nav id="page-nav">
                <div class={state.pageViewVisible ? null : "nav-hidden"} id="nav-pages">
                    <Pages total={props.total}
                        handleClick={this.handleClick}
                        current={props.page}/>
                </div>
                <div id="nav-button-wrapper">
                    <button title="add annotation" disabled={props.selected ? null : "disabled"} onclick={props.addann}>{Icons.addAnnotation}</button>
                    <button title="go to first page" disabled={props.page > 1 ? null : "disabled"} onclick={this.firstPage}>{Icons.chevronsLeft}</button>
                    <button title="go to previous page" disabled={props.page > 1 ? null : "disabled"} onclick={this.prevPage}>{Icons.chevronLeft}</button>
                    <form onSubmit={this.handleSubmit}>
                        <button onclick={this.togglePageNav} type="button" class={state.pageViewVisible ? "nav-toggled" : null} title="show page navigation">{Icons.page}</button>
                        <input type="text" value={this.state.value} onInput={this.handleInput} />
                        <span>/</span>
                        <span id="nav-total-pages">{props.total}</span>
                    </form>
                    <button title="go to next page" disabled={props.total > props.page ? null : "disabled"} onclick={this.nextPage}>{Icons.chevronRight}</button>
                    <button title="go to last page" disabled={props.total > props.page ? null : "disabled"} onclick={this.lastPage}>{Icons.chevronsRight}</button>
                    <button title="remove annotation" disabled={this.props.focus && !this.props.selected ? null : "disabled"} onclick={this.props.closeann}>{Icons.removeAnnotation}</button>
                </div>
            </nav>
        }
    }
}

class Pages extends Component {
  render(props,state) {
    var pagenos = Array.from({length: props.total}, (_, index) => index + 1);
    const pages = pagenos.map(page =>
      <button value={page} onclick={props.handleClick}>{page}</button>
    );
    s
    return (
      <Fragment>
        {pages}
      </Fragment>
    )
  }
}
