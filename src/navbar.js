import { h, render, Fragment, Component } from 'preact';
import './styles/navbar.css'

export default class Navbar extends Component {

render(props,state) {
    return (
      <Fragment>
        <div class="inner">{props.selected ? <label class="navbutton annact" type="button" onclick={props.addann}>Add Annotation</label> : <label class="navbutton anninact" type="button">Add Annotation</label>}</div>
        <div class="inner">{props.page > 1 ? <label class="navbutton arrowact" type="button" onclick={props.firstPage}>&laquo;</label> : <label class="navbutton arrowinact" type="button">&laquo;</label>}</div>
        <div class="inner">{props.page > 1 ? <label class="navbutton arrowact" type="button" onclick={props.prevPage}>&lsaquo;</label> : <label type="button" class="navbutton arrowinact">&lsaquo;</label>}</div>
        <div class="inner"><input class="page" type="text" value={this.props.page}></input></div>
        <div class="inner">{props.total > props.page ? <label class="navbutton arrowact" type="button" onclick={props.nextPage}>&rsaquo;</label> : <label type="button" class="navbutton arrowinact">&rsaquo;</label>}</div>
        <div class="inner">{props.total > props.page ? <label class="navbutton arrowact" type="button" onclick={props.lastPage}>&raquo;</label> : <label type="button" class="navbutton arrowinact">&raquo;</label>}</div>
        <div class="inner">{(this.props.focus && ! this.props.selected) ? <label class="navbutton annact" type="button" onclick={this.props.closeann}>Remove Annotation</label> : <label class="navbutton anninact" type="button">Remove Annotation</label>}</div>
      </Fragment>
    )
  }
}
