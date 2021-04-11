import { h, render, Fragment, Component } from 'preact';
import './styles/navbar.css'

export default class Navbar extends Component {

constructor(props) {
  super(props);
  this.state = {value: props.page};

  this.handleClick = this.handleClick.bind(this);
  this.handleInput = this.handleInput.bind(this);
  this.handleFocus = this.handleFocus.bind(this);
  this.handleUnfocus = this.handleUnfocus.bind(this);
  this.handleSubmit = this.handleSubmit.bind(this);
  this.firstPage = this.firstPage.bind(this);
  this.prevPage = this.prevPage.bind(this);
  this.nextPage = this.nextPage.bind(this);
  this.lastPage = this.lastPage.bind(this);
}

handleInput(event) {
  this.setState({value: event.target.value});
}

handleFocus() {
  var v = document.getElementById('pages');
  { v.style.display == "none" ? v.style.display = "block" : v.style.display = "none" };
}

handleUnfocus() {
  this.setState({value: this.props.page});
}

handleSubmit(event) {
  event.preventDefault();
  {(parseInt(this.state.value) > 0 && parseInt(this.state.value) < this.props.total) ? this.props.loadPage(parseInt(this.state.value)) : alert("Out of range")};
}

firstPage() {
  this.props.loadPage(1);
  this.setState({value: 1});
}

prevPage() {
  this.props.loadPage(this.state.value - 1);
  this.setState({value: this.state.value - 1});
}

nextPage() {
  this.props.loadPage(this.state.value + 1);
  this.setState({value: this.state.value + 1});
}

lastPage() {
  this.props.loadPage(this.props.total);
  this.setState({value: this.props.total});
}

handleClick(p) {
  this.props.loadPage(parseInt(event.target.value));
  this.setState({value: parseInt(event.target.value)});
}

render(props,state) {
    return (
      <div id="navigation">
      <div id="pages" style="display: none;">
        <Pages total={props.total}
          handleClick={this.handleClick}/>
      </div>
      <div id="navbar">
      <div class="inner">{props.selected ? <label class="navbutton annact" type="button" onclick={props.addann}>Add Annotation</label> : <label class="navbutton anninact" type="button">Add Annotation</label>}</div>
      <div class="inner">{props.page > 1 ? <label class="navbutton arrowact" type="button" onclick={this.firstPage}>&laquo;</label> : <label class="navbutton arrowinact" type="button">&laquo;</label>}</div>
      <div class="inner">{props.page > 1 ? <label class="navbutton arrowact" type="button" onclick={this.prevPage}>&lsaquo;</label> : <label type="button" class="navbutton arrowinact">&lsaquo;</label>}</div>
      <div class="inner">
        <form onSubmit={this.handleSubmit}>
          <input class="page" type="text" value={this.state.value} onclick={this.handleFocus} onfocusout={this.handleUnfocus} onInput={this.handleInput} />
        </form>
      </div>
      <div class="inner"><span style="font-size: 1.5em;">/</span></div>
      <div class="inner"><input class="page" type="text" value={props.total}></input></div>
      <div class="inner">{props.total > props.page ? <label class="navbutton arrowact" type="button" onclick={this.nextPage}>&rsaquo;</label> : <label type="button" class="navbutton arrowinact">&rsaquo;</label>}</div>
      <div class="inner">{props.total > props.page ? <label class="navbutton arrowact" type="button" onclick={this.lastPage}>&raquo;</label> : <label type="button" class="navbutton arrowinact">&raquo;</label>}</div>
      <div class="inner">{(this.props.focus && ! this.props.selected) ? <label class="navbutton annact" type="button" onclick={this.props.closeann}>Remove Annotation</label> : <label class="navbutton anninact" type="button">Remove Annotation</label>}</div>
      </div>
      </div>
    )
  }
}

class Pages extends Component {
  render(props,state) {
    var pagenos = Array.from({length: props.total}, (_, index) => index + 1);
    const pages = pagenos.map((page) =>
      <input class="pglabel" type="button" value={page} onclick={props.handleClick}>{page}</input>
    );
    return (
      <Fragment>
        {pages}
      </Fragment>
    )
  }
}
