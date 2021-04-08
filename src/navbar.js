import { h, render, Fragment, Component } from 'preact';
import './styles/navbar.css'

export default class Navbar extends Component {

render(props,state) {
    return (
      <Fragment>
        <div class="inner">{this.props.selected ? <label class="navbutton annact" type="button" onclick={this.props.addann}>Add Annotation</label> : <label class="navbutton anninact" type="button">Add Annotation</label>}</div>
        <div class="inner">{this.props.page > 1 ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(this.props.page = 1)}>&laquo;</label> : <label class="navbutton arrowinact" type="button">&laquo;</label>}</div>
        <div class="inner">{this.props.page > 1 ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(this.props.page - 1)}>&lsaquo;</label> : <label type="button" class="navbutton arrowinact">&lsaquo;</label>}</div>
        <div class="inner"><input class="page" type="text" value={this.props.page}></input></div>
        <div class="inner">{this.props.total > this.props.page ? <label class="navbutton arrowact" type="button" onclick={this.props.nextPage}>&rsaquo;</label> : <label type="button" class="navbutton arrowinact">&rsaquo;</label>}</div>
        <div class="inner">{this.props.total > this.props.page ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(this.props.pageFocused = this.props.total)}>&raquo;</label> : <label type="button" class="navbutton arrowinact">&raquo;</label>}</div>
        <div class="inner">{(this.props.focus && ! this.props.selected) ? <label class="navbutton annact" type="button" onclick={this.props.closeann}>Remove Annotation</label> : <label class="navbutton anninact" type="button">Remove Annotation</label>}</div>
      </Fragment>
    )
  }
}
